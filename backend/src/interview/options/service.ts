import { createHash, randomUUID } from "node:crypto";
import type { InterviewAnswerRow, InterviewOptionSetRow } from "../../db/interview-store.js";
import { InterviewStore } from "../../db/interview-store.js";
import { type ClaimedJob, type JobQueue, PermanentJobError } from "../../db/jobs.js";
import { OperationalLogger } from "../../observability/logger.js";
import { PerformanceTracer } from "../../observability/performance.js";
import { getApplicableQuestions } from "../compiler.js";
import { getQuestionnaire } from "../definitions.js";
import type { OptionAssistantAdapter } from "./adapter.js";
import { computeOptionCacheKey, InterviewOptionCache } from "./cache.js";
import {
  ConfirmedAnswerSummarySchema,
  OPTION_PROMPT_VERSION,
  type OptionGenerationRequest,
  type SuggestionItem,
  type TargetQuestionDescriptor,
} from "./types.js";

function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function computeConfirmedAnswersHash(answers: readonly InterviewAnswerRow[]): string {
  const active = answers
    .filter((a) => a.status === "active")
    .map((a) => ({
      question_id: a.question_id,
      selected_option_ids: [...a.selected_option_ids].sort(),
      custom_text: a.custom_text ?? null,
    }))
    .sort((a, b) => a.question_id.localeCompare(b.question_id));

  return hashJson(active);
}

/**
 * OptionAssistantService coordinates background personalized suggestion generation.
 *
 * Guaranteed boundaries:
 * 1. AI suggestions are NEVER blocking: fallbacks always render immediately.
 * 2. Strict timeout and bounded output schemas prevent hanging requests.
 * 3. Never replaces options once the user has begun interacting.
 * 4. Content-free observability logs and tenant-scoped caching.
 */
export class OptionAssistantService {
  readonly #logger = new OperationalLogger("option_assistant");

  constructor(
    readonly store: InterviewStore,
    readonly cache: InterviewOptionCache,
    readonly adapter: OptionAssistantAdapter,
    readonly performance: PerformanceTracer,
    readonly queue: Pick<JobQueue, "enqueueInterviewOptions"> | null,
    readonly defaultTtlMs = 86_400_000, // 24 hours
    readonly providerTimeoutMs = 5_000,
    readonly inputCostMicrousdPerMillion = 0,
    readonly outputCostMicrousdPerMillion = 0,
  ) {}

  /**
   * Persists a low-priority prefetch intent without performing provider work.
   * A missing queue disables personalization safely; it never falls back to an
   * untracked in-process promise.
   */
  async prefetchOptions(input: {
    organizationId: string;
    workspaceId: string;
    sessionId: string;
    questionnaireVersion: string;
    targetQuestionIds: readonly string[];
  }): Promise<boolean> {
    if (input.targetQuestionIds.length === 0) return false;

    if (!this.queue) return false;

    const state = await this.store.getState({
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
    });
    if (!state || state.session.status !== "in_progress" ||
        state.session.questionnaire_version !== input.questionnaireVersion) return false;

    const questionnaire = getQuestionnaire(
      state.session.questionnaire_id,
      state.session.questionnaire_version,
    );
    const requestedIds = new Set(input.targetQuestionIds);
    const targetQuestionIds = getApplicableQuestions(questionnaire, state.answers)
      .map((question) => question.id)
      .filter((questionId) => requestedIds.has(questionId))
      .slice(0, 5);
    if (targetQuestionIds.length === 0) return false;

    const confirmedHash = computeConfirmedAnswersHash(state.answers);
    const targetBatchHash = hashJson(targetQuestionIds);
    const idempotencyKey =
      `opt:${input.sessionId}:${confirmedHash}:${targetBatchHash}`;
    try {
      return await this.queue.enqueueInterviewOptions({
        workspaceId: input.workspaceId,
        organizationId: input.organizationId,
        sessionId: input.sessionId,
        questionnaireVersion: input.questionnaireVersion,
        targetQuestionIds,
        confirmedAnswersHash: confirmedHash,
        idempotencyKey,
        correlationId: `opt:${input.sessionId}`,
      });
    } catch (error) {
      // Suggestions are optional. Capacity or transient database failure must
      // never make a reviewed fallback question unavailable to the user.
      this.#logger.warn({ error }, "Failed to enqueue option generation job");
      return false;
    }
  }

  /**
   * Generates bounded options for target questions and writes them to PostgreSQL.
   * If suggestions are cached, reuses them. If the adapter fails or times out,
   * falls back cleanly without interrupting the interview.
   */
  async generateAndSaveOptions(input: {
    organizationId: string;
    workspaceId: string;
    sessionId: string;
    targetQuestionIds: readonly string[];
    correlationId?: string;
  }): Promise<void> {
    const correlationId = input.correlationId ?? `opt:gen:${randomUUID()}`;

    const state = await this.store.getState({
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
    });

    if (!state || state.session.status !== "in_progress") return;

    // Look for confirmed business description
    const descAnswer = state.answers.find(
      (a) => a.question_id === "business_description" && a.status === "active",
    );
    if (!descAnswer) {
      // Prior to answering business description, early questions use reviewed curated choices
      return;
    }

    const businessText = descAnswer.custom_text ?? descAnswer.selected_options[0]?.label ?? "";
    const category = descAnswer.selected_options[0]?.label;

    const questionnaire = getQuestionnaire(
      state.session.questionnaire_id,
      state.session.questionnaire_version,
    );
    const requestedIds = new Set(input.targetQuestionIds);
    const applicableQuestions = getApplicableQuestions(questionnaire, state.answers)
      .filter((question) => requestedIds.has(question.id))
      .slice(0, 5);

    // Filter target questions: only questions that are applicable and not yet interacted with
    const targetDescriptors: TargetQuestionDescriptor[] = [];
    for (const qDef of applicableQuestions) {
      const qId = qDef.id;

      // If active option set already exists and has interaction started, do not replace
      const existing = state.optionSets.find((s) => s.question_id === qId && s.status === "active");
      if (existing?.interaction_started_at) continue;

      targetDescriptors.push({
        questionId: qDef.id,
        prompt: qDef.prompt,
        meaning: qDef.meaning,
        answerMode: qDef.answerMode,
        minimumSelections: qDef.minimumSelections,
        maximumSelections: qDef.maximumSelections,
      });
    }

    if (targetDescriptors.length === 0) return;

    const confirmedHash = computeConfirmedAnswersHash(state.answers);
    const confirmedSummaries = state.answers
      .filter((a) => a.status === "active")
      .map((a) => ({
        questionId: a.question_id,
        selectedLabels: a.selected_options.map((o) => o.label),
        customText: a.custom_text,
      }));

    const cacheKey = computeOptionCacheKey({
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      questionnaireVersion: state.session.questionnaire_version,
      confirmedAnswersHash: confirmedHash,
      targetQuestionIds: targetDescriptors.map((target) => target.questionId),
      promptVersion: OPTION_PROMPT_VERSION,
      generatorProvider: this.adapter.providerName,
      generatorModel: this.adapter.modelName,
    });

    const cached = await this.cache.get(cacheKey);
    let suggestionsMap: Record<string, SuggestionItem[]>;
    let explanation: string | undefined;

    if (cached) {
      suggestionsMap = cached.suggestions as Record<string, SuggestionItem[]>;
      explanation = cached.explanation ?? undefined;
      this.performance.metrics.recordOptionAssistant({
        provider: this.adapter.providerName,
        model: this.adapter.modelName,
        outcome: "cache_hit",
      });
    } else {
      const request: OptionGenerationRequest = {
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        questionnaireId: questionnaire.id,
        questionnaireVersion: questionnaire.version,
        promptVersion: OPTION_PROMPT_VERSION,
        businessDescription: businessText,
        ...(category ? { category } : {}),
        confirmedAnswers: confirmedSummaries,
        targetQuestions: targetDescriptors,
      };

      try {
        const response = await this.performance.measure(
          { stage: "provider_call", correlationId, workspaceId: input.workspaceId },
          () => this.adapter.generate(request, { timeoutMs: this.providerTimeoutMs }),
        );
        suggestionsMap = response.suggestions;
        explanation = response.explanation;
        const inputTokens = response.usage.inputTokens ?? 0;
        const outputTokens = response.usage.outputTokens ?? 0;
        const hasPricing = this.inputCostMicrousdPerMillion > 0 ||
          this.outputCostMicrousdPerMillion > 0;
        const estimatedCostMicrousd = hasPricing
          ? Math.ceil(
              (inputTokens * this.inputCostMicrousdPerMillion +
                outputTokens * this.outputCostMicrousdPerMillion) / 1_000_000,
            )
          : null;
        this.performance.metrics.recordOptionAssistant({
          provider: this.adapter.providerName,
          model: this.adapter.modelName,
          outcome: "generated",
          inputTokens,
          outputTokens,
          estimatedCostMicrousd,
        });

        // Persist to cache
        await this.cache.set({
          cacheKey,
          workspaceId: input.workspaceId,
          organizationId: input.organizationId,
          questionnaireId: questionnaire.id,
          questionnaireVersion: questionnaire.version,
          confirmedAnswersHash: confirmedHash,
          promptVersion: OPTION_PROMPT_VERSION,
          generatorProvider: this.adapter.providerName,
          generatorModel: this.adapter.modelName,
          suggestions: suggestionsMap,
          explanation: explanation ?? null,
          expiresAt: new Date(Date.now() + this.defaultTtlMs),
        });
      } catch (error) {
        // Safe graceful fallback: do not re-throw
        this.performance.metrics.recordOptionAssistant({
          provider: this.adapter.providerName,
          model: this.adapter.modelName,
          outcome: "fallback",
        });
        this.#logger.warn({
          error,
          workspaceId: input.workspaceId,
          correlationId,
        }, "Option assistant failed; using reviewed curated fallbacks");
        return;
      }
    }

    // Persist option sets for each target question
    const expiresAt = new Date(Date.now() + this.defaultTtlMs);
    for (const target of targetDescriptors) {
      const suggestions = suggestionsMap[target.questionId];
      if (!suggestions || suggestions.length < 2) continue;

      const qDef = questionnaire.questions.find((q) => q.id === target.questionId);
      if (!qDef) continue;

      try {
        const modelOptions = suggestions.map((s) => ({
          label: s.label,
          ...(s.description ? { description: s.description } : {}),
        }));

        await this.store.saveOptionSet({
          organizationId: input.organizationId,
          workspaceId: input.workspaceId,
          sessionId: input.sessionId,
          questionId: target.questionId,
          questionVersion: qDef.version,
          origin: "model",
          options: modelOptions,
          generator: {
            provider: this.adapter.providerName,
            model: this.adapter.modelName,
            promptVersion: OPTION_PROMPT_VERSION,
          },
          expiresAt,
        });
      } catch (saveError: unknown) {
        // If option set was already answered or interaction started, ignore conflict safely
        if (saveError && typeof saveError === "object" && "code" in saveError &&
            (saveError.code === "option_set_in_use" || saveError.code === "question_already_answered")) {
          continue;
        }
        this.#logger.warn({ saveError, questionId: target.questionId }, "Failed to save model option set");
      }
    }
  }

  /**
   * Worker handler for `generate_interview_options` queue jobs.
   */
  async processJob(job: ClaimedJob): Promise<void> {
    const workspaceId = job.payload.workspaceId as string | undefined;
    const organizationId = job.payload.organizationId as string | undefined;
    const sessionId = job.payload.sessionId as string | undefined;
    const targetQuestionIds = job.payload.targetQuestionIds as string[] | undefined;

    if (!workspaceId || !organizationId || !sessionId || !Array.isArray(targetQuestionIds)) {
      throw new PermanentJobError("Invalid generate_interview_options job payload");
    }

    await this.generateAndSaveOptions({
      organizationId,
      workspaceId,
      sessionId,
      targetQuestionIds,
      correlationId: job.correlation_id,
    });
  }
}
