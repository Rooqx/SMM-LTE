/**
 * Fast synchronous interview application service (Milestone M9.2).
 *
 * Orchestrates version-pinned question progression, branching logic, idempotent answer
 * submissions, and instantaneous projection updates within p95 <= 500 ms SLA.
 *
 * Key Architectural Invariants:
 * 1. Synchronous Answer Path: Never blocks answer transitions on an LLM or background job.
 * 2. Backend Authority: Branching rules and progression are owned strictly by the backend.
 * 3. Idempotency & Optimistic Concurrency: Safe replay of in-flight clicks and version checks.
 * 4. Automatic intake packet compilation when all applicable questions are answered.
 */

import { randomUUID } from "node:crypto";
import type pg from "pg";
import { conflict, notFound } from "../domain/errors.js";
import {
  type InterviewAnswerRow,
  type InterviewOption,
  type InterviewOptionSetRow,
  type InterviewSessionRow,
  type InterviewStartResult,
  type InterviewState,
  InterviewStore,
} from "../db/interview-store.js";
import { PerformanceTracer } from "../observability/performance.js";
import {
  compileBrandIntake,
  getApplicableQuestions,
  type BrandIntakePacket,
} from "./compiler.js";
import {
  CURRENT_GUIDED_INTAKE_VERSION,
  getQuestionnaire,
  GUIDED_INTAKE_QUESTIONNAIRE_ID,
  type InterviewAnswerMode,
  type InterviewQuestionDefinition,
  type QuestionnaireDefinition,
} from "./definitions.js";

export type InterviewProgress = Readonly<{
  currentIndex: number;
  totalQuestions: number;
  completedCount: number;
  percentComplete: number;
}>;

export type QuestionPresentation = Readonly<{
  id: string;
  version: number;
  meaning: string;
  prompt: string;
  supportingText: string;
  examples: readonly string[];
  answerMode: InterviewAnswerMode;
  required: boolean;
  allowCustom: boolean;
  customTextRequired: boolean;
  minimumSelections: number;
  maximumSelections: number;
  allowSelectAll: boolean;
  activeOptionSet: Readonly<{
    id: string;
    origin: "curated" | "programmatic" | "model";
    options: readonly InterviewOption[];
  }>;
}>;

export type InterviewServiceState = Readonly<{
  authority: "guided";
  session: InterviewSessionRow;
  status: "in_progress" | "completed" | "cancelled";
  progress: InterviewProgress;
  currentQuestion: QuestionPresentation | null;
  intakePacket: BrandIntakePacket | null;
}>;

export type InterviewStartResponse =
  | { authority: "legacy"; session: null; resumed: true }
  | ({ authority: "guided" } & InterviewServiceState);

export interface OptionAssistantServiceLike {
  prefetchOptions(input: {
    organizationId: string;
    workspaceId: string;
    sessionId: string;
    questionnaireVersion: string;
    targetQuestionIds: readonly string[];
  }): Promise<boolean>;
}

/**
 * Fast, deterministic application service for M9 guided interviews.
 *
 * Owns deterministic branching, question progression, and intake compilation.
 * Answers are persisted idempotently and return the authoritative next question
 * synchronously within p95 <= 500 ms without waiting for any primary LLM or background job.
 */
export class InterviewService {
  constructor(
    readonly store: InterviewStore,
    readonly performance: PerformanceTracer,
    readonly optionAssistant?: OptionAssistantServiceLike,
    readonly guidedIntakeEnabled = true,
  ) {}

  /**
   * Starts or resumes a guided interview session. Returns the current question
   * projection and progress immediately.
   */
  async startOrResume(input: {
    organizationId: string;
    workspaceId: string;
    actor: string;
    questionnaireId?: string;
    questionnaireVersion?: string;
    correlationId?: string;
  }): Promise<InterviewStartResponse> {
    const correlationId = input.correlationId ?? `interview:start:${randomUUID()}`;
    const started = await this.performance.measure(
      { stage: "database_read", correlationId, workspaceId: input.workspaceId },
      () => this.store.startOrResume({
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        actor: input.actor,
        allowNewGuidedInterview: this.guidedIntakeEnabled,
        ...(input.questionnaireId ? { questionnaireId: input.questionnaireId } : {}),
        ...(input.questionnaireVersion ? { questionnaireVersion: input.questionnaireVersion } : {}),
      }),
    );

    if (started.authority === "legacy") {
      return { authority: "legacy", session: null, resumed: true };
    }

    const state = await this.performance.measure(
      { stage: "database_read", correlationId, workspaceId: input.workspaceId },
      () => this.store.getState({
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        sessionId: started.session.id,
      }),
    );

    if (!state) {
      throw notFound("Interview session state");
    }

    const projected = await this.#projectState(state, input.organizationId, input.actor, correlationId);

    // Await only the small durable queue write, never provider/model work. This
    // guarantees that returning from the request cannot lose an accepted
    // prefetch intent during an immediate API-process restart.
    if (projected.status === "in_progress" && projected.currentQuestion && this.optionAssistant) {
      await this.optionAssistant.prefetchOptions({
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        sessionId: started.session.id,
        questionnaireVersion: started.session.questionnaire_version,
        targetQuestionIds: [projected.currentQuestion.id],
      });
    }

    return projected;
  }

  /**
   * Returns the current snapshot of an interview, including authoritative progress
   * and current question projection.
   */
  async getState(input: {
    organizationId: string;
    workspaceId: string;
    sessionId?: string;
    correlationId?: string;
  }): Promise<InterviewServiceState | null> {
    const correlationId = input.correlationId ?? `interview:get:${randomUUID()}`;
    const state = await this.performance.measure(
      { stage: "database_read", correlationId, workspaceId: input.workspaceId },
      () => this.store.getState(input),
    );

    if (!state) return null;
    return this.#projectState(state, input.organizationId, "system:read", correlationId);
  }

  /**
   * Synchronous, deterministic answer submission.
   *
   * Persists the answer idempotently, validates transitions against pinned branch rules,
   * updates interview progression, and returns the authoritative next question projection immediately.
   */
  async submitAnswer(input: {
    organizationId: string;
    workspaceId: string;
    sessionId: string;
    expectedSessionVersion: number;
    questionId: string;
    questionVersion: number;
    optionSetId: string;
    selectedOptionIds: readonly string[];
    customText?: string;
    idempotencyKey: string;
    actor: string;
    correlationId?: string;
  }): Promise<{
    answer: InterviewAnswerRow;
    sessionVersion: number;
    replayed: boolean;
    state: InterviewServiceState;
  }> {
    const correlationId = input.correlationId ?? `interview:answer:${randomUUID()}`;

    return this.performance.measure(
      { stage: "answer_transaction", correlationId, workspaceId: input.workspaceId },
      async () => {
        // Fetch current state under repeatable-read snapshot to validate applicable questions
        const currentState = await this.store.getState({
          organizationId: input.organizationId,
          workspaceId: input.workspaceId,
          sessionId: input.sessionId,
        });

        if (!currentState) throw notFound("Interview session");
        if (currentState.session.status !== "in_progress") {
          throw conflict("interview_not_active", "Answers cannot change after an interview ends");
        }

        const questionnaire = getQuestionnaire(
          currentState.session.questionnaire_id,
          currentState.session.questionnaire_version,
        );

        // Verify the target question is applicable
        const currentApplicable = getApplicableQuestions(questionnaire, currentState.answers);
        const targetDef = currentApplicable.find((q) => q.id === input.questionId);
        if (!targetDef) {
          throw conflict(
            "question_not_applicable",
            `Question '${input.questionId}' is not applicable in the current interview branch`,
          );
        }

        // Resolve selected option objects for branching evaluation and accurate intake compilation
        const targetOptionSet = currentState.optionSets.find((s) => s.id === input.optionSetId);
        const resolvedSelectedOptions = input.selectedOptionIds.map((id) => {
          const found = targetOptionSet?.options.find((opt) => opt.id === id) ??
            targetDef.fallbackOptions.find((opt) => opt.id === id);
          return found
            ? { id: found.id, label: found.label, ...(found.description ? { description: found.description } : {}) }
            : { id, label: id };
        });

        // Simulate new active answer list after applying this answer
        const simulatedAnswers = currentState.answers.filter((a) => a.question_id !== input.questionId);
        // Simulated answer row for branching evaluation and complete packet compilation
        const simulatedAnswer: InterviewAnswerRow = {
          id: "simulated",
          session_id: input.sessionId,
          workspace_id: input.workspaceId,
          question_id: input.questionId,
          question_version: input.questionVersion,
          option_set_id: input.optionSetId,
          selected_option_ids: [...input.selectedOptionIds],
          selected_options: resolvedSelectedOptions,
          custom_text: input.customText ?? null,
          answer_source: input.selectedOptionIds.length > 0
            ? (input.customText === undefined ? "option" : "combined")
            : "custom",
          idempotency_key: input.idempotencyKey,
          request_hash: "",
          session_version: input.expectedSessionVersion + 1,
          status: "active",
          supersedes_answer_id: null,
          actor: input.actor,
          created_at: new Date(),
          superseded_at: null,
        };
        simulatedAnswers.push(simulatedAnswer);

        // Recompute applicable questions and find next unanswered question
        const newApplicable = getApplicableQuestions(questionnaire, simulatedAnswers);
        const answeredIds = new Set(simulatedAnswers.map((a) => a.question_id));
        const nextQuestion = newApplicable.find((q) => !answeredIds.has(q.id));

        const isComplete = nextQuestion === undefined;
        let compiledIntake: BrandIntakePacket | null = null;
        if (isComplete) {
          // All applicable questions are answered: compile the brand intake packet
          compiledIntake = compileBrandIntake({
            questionnaireId: questionnaire.id,
            questionnaireVersion: questionnaire.version,
            answers: simulatedAnswers,
            optionSets: currentState.optionSets,
          });
        }

        // Atomically save answer and progress session in one database transaction
        const saved = await this.store.saveAnswer({
          organizationId: input.organizationId,
          workspaceId: input.workspaceId,
          sessionId: input.sessionId,
          expectedSessionVersion: input.expectedSessionVersion,
          questionId: input.questionId,
          questionVersion: input.questionVersion,
          optionSetId: input.optionSetId,
          selectedOptionIds: input.selectedOptionIds,
          ...(input.customText !== undefined ? { customText: input.customText } : {}),
          idempotencyKey: input.idempotencyKey,
          actor: input.actor,
          nextQuestionId: nextQuestion ? nextQuestion.id : null,
          nextQuestionVersion: nextQuestion ? nextQuestion.version : null,
          status: isComplete ? "completed" : "in_progress",
          completedAt: isComplete ? new Date() : null,
          ...(compiledIntake ? { compiledIntake } : {}),
        });

        // Read authoritative post-answer state
        const updatedState = await this.store.getState({
          organizationId: input.organizationId,
          workspaceId: input.workspaceId,
          sessionId: input.sessionId,
        });
        if (!updatedState) throw notFound("Interview session");

        const state = await this.#projectState(
          updatedState,
          input.organizationId,
          input.actor,
          correlationId,
        );

        // Persist the low-priority prefetch intent before returning. The worker
        // performs all provider work after this synchronous request completes.
        if (state.status === "in_progress" && state.currentQuestion && this.optionAssistant) {
          await this.optionAssistant.prefetchOptions({
            organizationId: input.organizationId,
            workspaceId: input.workspaceId,
            sessionId: input.sessionId,
            questionnaireVersion: currentState.session.questionnaire_version,
            targetQuestionIds: [state.currentQuestion.id],
          });
        }

        return {
          answer: saved.answer,
          sessionVersion: saved.sessionVersion,
          replayed: saved.replayed,
          state,
        };
      },
    );
  }

  /**
   * Idempotently marks an option set as presented or interaction started.
   */
  async markOptionSetPresented(input: {
    organizationId: string;
    workspaceId: string;
    sessionId: string;
    optionSetId: string;
    interactionStarted: boolean;
  }): Promise<InterviewOptionSetRow> {
    return this.store.markOptionSetPresented(input);
  }

  /**
   * Builds the projected client presentation from the authoritative database state.
   * If a current question does not yet have an active saved option set in PostgreSQL,
   * ensures a curated fallback option set is stored and returned immediately.
   */
  async #projectState(
    state: InterviewState,
    organizationId: string,
    actor: string,
    correlationId: string,
  ): Promise<InterviewServiceState> {
    const questionnaire = getQuestionnaire(
      state.session.questionnaire_id,
      state.session.questionnaire_version,
    );
    const applicableQuestions = getApplicableQuestions(questionnaire, state.answers);
    const answeredMap = new Map<string, InterviewAnswerRow>();
    for (const a of state.answers) {
      if (a.status === "active") answeredMap.set(a.question_id, a);
    }

    const completedCount = applicableQuestions.filter((q) => answeredMap.has(q.id)).length;
    const totalQuestions = applicableQuestions.length;
    const isCompleted = state.session.status === "completed" ||
      (completedCount === totalQuestions && totalQuestions > 0);

    if (isCompleted) {
      const intakePacket = (state.session.compiled_intake as BrandIntakePacket | null | undefined) ??
        compileBrandIntake({
          questionnaireId: questionnaire.id,
          questionnaireVersion: questionnaire.version,
          answers: state.answers,
          optionSets: state.optionSets,
        });

      return Object.freeze({
        authority: "guided",
        session: state.session,
        status: "completed",
        progress: Object.freeze({
          currentIndex: totalQuestions,
          totalQuestions,
          completedCount: totalQuestions,
          percentComplete: 100,
        }),
        currentQuestion: null,
        intakePacket,
      });
    }

    // Determine current question: first unanswered applicable question
    const currentQ = applicableQuestions.find((q) => !answeredMap.has(q.id)) ??
      applicableQuestions[0]!;
    const currentIndex = applicableQuestions.findIndex((q) => q.id === currentQ.id) + 1;
    const percentComplete = Math.round((completedCount / totalQuestions) * 100);

    // Look for active option set for current question
    let activeOptionSetRow = state.optionSets.find((set) =>
      set.question_id === currentQ.id &&
      set.status === "active" &&
      (set.expires_at === null || set.expires_at.getTime() > Date.now()),
    );

    // If no active option set exists yet, save curated fallback set immediately
    if (!activeOptionSetRow && state.session.status === "in_progress") {
      activeOptionSetRow = await this.performance.measure(
        { stage: "database_read", correlationId, workspaceId: state.session.workspace_id },
        () => this.store.saveOptionSet({
          organizationId,
          workspaceId: state.session.workspace_id,
          sessionId: state.session.id,
          questionId: currentQ.id,
          questionVersion: currentQ.version,
          origin: "curated",
          options: currentQ.fallbackOptions,
        }),
      );
    }

    const activeOptionSet = activeOptionSetRow
      ? {
          id: activeOptionSetRow.id,
          origin: activeOptionSetRow.origin,
          options: activeOptionSetRow.options,
        }
      : {
          id: `fallback-${currentQ.id}`,
          origin: "curated" as const,
          options: currentQ.fallbackOptions,
        };

    const currentQuestionPresentation: QuestionPresentation = Object.freeze({
      id: currentQ.id,
      version: currentQ.version,
      meaning: currentQ.meaning,
      prompt: currentQ.prompt,
      supportingText: currentQ.supportingText,
      examples: currentQ.examples,
      answerMode: currentQ.answerMode,
      required: currentQ.required,
      allowCustom: currentQ.allowCustom,
      customTextRequired: currentQ.customTextRequired,
      minimumSelections: currentQ.minimumSelections,
      maximumSelections: currentQ.maximumSelections,
      allowSelectAll: currentQ.allowSelectAll,
      activeOptionSet: Object.freeze({
        ...activeOptionSet,
        options: Object.freeze([...activeOptionSet.options]),
      }),
    });

    return Object.freeze({
      authority: "guided",
      session: state.session,
      status: state.session.status,
      progress: Object.freeze({
        currentIndex,
        totalQuestions,
        completedCount,
        percentComplete,
      }),
      currentQuestion: currentQuestionPresentation,
      intakePacket: null,
    });
  }
}
