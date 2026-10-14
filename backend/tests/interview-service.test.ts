import type pg from "pg";
import { describe, expect, it, vi } from "vitest";
import {
  type InterviewAnswerRow,
  type InterviewOptionSetRow,
  type InterviewSessionRow,
  type InterviewState,
  InterviewStore,
} from "../src/db/interview-store.js";
import {
  CURRENT_GUIDED_INTAKE_VERSION,
  getQuestionnaire,
  GUIDED_INTAKE_QUESTIONNAIRE_ID,
} from "../src/interview/definitions.js";
import { InterviewService } from "../src/interview/service.js";
import { MetricsService } from "../src/observability/metrics.js";
import { PerformanceTracer } from "../src/observability/performance.js";

function fakePool(): pg.Pool {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    connect: vi.fn(),
  } as unknown as pg.Pool;
}

class TestInterviewStore extends InterviewStore {
  session: InterviewSessionRow;
  answers: InterviewAnswerRow[] = [];
  optionSets: InterviewOptionSetRow[] = [];
  isLegacy = false;

  constructor() {
    super(fakePool());
    this.session = {
      id: "11111111-1111-1111-1111-111111111111",
      workspace_id: "22222222-2222-2222-2222-222222222222",
      questionnaire_id: GUIDED_INTAKE_QUESTIONNAIRE_ID,
      questionnaire_version: CURRENT_GUIDED_INTAKE_VERSION,
      status: "in_progress",
      current_question_id: "promotion_target",
      current_question_version: 1,
      version: 1,
      compiled_intake: null,
      started_at: new Date("2026-10-11T12:00:00Z"),
      completed_at: null,
      updated_at: new Date("2026-10-11T12:00:00Z"),
    };
  }

  override async startOrResume(input: {
    organizationId: string;
    workspaceId: string;
    actor: string;
    questionnaireId?: string;
    questionnaireVersion?: string;
  }) {
    if (this.isLegacy) {
      return { authority: "legacy" as const, session: null, resumed: true };
    }
    return { authority: "guided" as const, session: this.session, resumed: true };
  }

  override async getState(input: {
    organizationId: string;
    workspaceId: string;
    sessionId?: string;
  }): Promise<InterviewState | null> {
    if (this.isLegacy) return null;
    return {
      authority: "guided",
      session: { ...this.session },
      answers: [...this.answers],
      optionSets: [...this.optionSets],
    };
  }

  override async saveOptionSet(input: {
    organizationId: string;
    workspaceId: string;
    sessionId: string;
    questionId: string;
    questionVersion: number;
    origin: "curated" | "programmatic" | "model";
    options: any[];
    generator?: { provider: string; model: string; promptVersion: string };
    expiresAt?: Date;
  }): Promise<InterviewOptionSetRow> {
    const existing = this.optionSets.find((s) => s.question_id === input.questionId && s.status === "active");
    if (existing) return existing;

    const newSet: InterviewOptionSetRow = {
      id: `opt-set-${input.questionId}`,
      session_id: input.sessionId,
      workspace_id: input.workspaceId,
      question_id: input.questionId,
      question_version: input.questionVersion,
      origin: input.origin,
      generator_provider: input.generator?.provider ?? null,
      generator_model: input.generator?.model ?? null,
      prompt_version: input.generator?.promptVersion ?? null,
      content_hash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      options: input.options,
      status: "active",
      expires_at: input.expiresAt ?? null,
      presented_at: null,
      interaction_started_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    };
    this.optionSets.push(newSet);
    return newSet;
  }

  override async saveAnswer(input: {
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
    nextQuestionId?: string | null;
    nextQuestionVersion?: number | null;
    status?: "in_progress" | "completed";
    completedAt?: Date | null;
    compiledIntake?: unknown | null;
  }) {
    const replay = this.answers.find((a) => a.idempotency_key === input.idempotencyKey);
    if (replay) {
      return { answer: replay, sessionVersion: replay.session_version, replayed: true };
    }

    // Mark previous answer for this question as superseded
    const existingIndex = this.answers.findIndex(
      (a) => a.question_id === input.questionId && a.status === "active",
    );
    let supersededId: string | null = null;
    if (existingIndex >= 0) {
      const prev = this.answers[existingIndex]!;
      this.answers[existingIndex] = { ...prev, status: "superseded", superseded_at: new Date() };
      supersededId = prev.id;
    }

    const optionSet = this.optionSets.find((s) => s.id === input.optionSetId);
    const selectedOptions = input.selectedOptionIds.map((id) => {
      const found = optionSet?.options.find((o) => o.id === id);
      return found ?? { id, label: id };
    });

    const newAnswer: InterviewAnswerRow = {
      id: `ans-${input.questionId}-${input.expectedSessionVersion}`,
      session_id: input.sessionId,
      workspace_id: input.workspaceId,
      question_id: input.questionId,
      question_version: input.questionVersion,
      option_set_id: input.optionSetId,
      selected_option_ids: [...input.selectedOptionIds],
      selected_options: selectedOptions,
      custom_text: input.customText ?? null,
      answer_source: input.selectedOptionIds.length > 0
        ? (input.customText === undefined ? "option" : "combined")
        : "custom",
      idempotency_key: input.idempotencyKey,
      request_hash: "hash",
      session_version: input.expectedSessionVersion + 1,
      status: "active",
      supersedes_answer_id: supersededId,
      actor: input.actor,
      created_at: new Date(),
      superseded_at: null,
    };
    this.answers.push(newAnswer);

    // Update session
    this.session.version += 1;
    if (input.nextQuestionId !== undefined) {
      this.session.current_question_id = input.nextQuestionId;
      this.session.current_question_version = input.nextQuestionVersion ?? null;
    }
    if (input.status) {
      this.session.status = input.status;
    }
    if (input.completedAt !== undefined) {
      this.session.completed_at = input.completedAt;
    }
    if (input.compiledIntake !== undefined) {
      this.session.compiled_intake = input.compiledIntake;
    }

    return {
      answer: newAnswer,
      sessionVersion: this.session.version,
      replayed: false,
    };
  }

  override async markOptionSetPresented(input: {
    organizationId: string;
    workspaceId: string;
    sessionId: string;
    optionSetId: string;
    interactionStarted: boolean;
  }) {
    const set = this.optionSets.find((s) => s.id === input.optionSetId);
    if (!set) throw new Error("Option set not found");
    set.presented_at = set.presented_at ?? new Date();
    if (input.interactionStarted) {
      set.interaction_started_at = set.interaction_started_at ?? new Date();
    }
    return set;
  }
}

describe("fast interview service (M9.2)", () => {
  function setup() {
    const store = new TestInterviewStore();
    const metrics = new MetricsService(fakePool());
    const performance = new PerformanceTracer(metrics, 1);
    const service = new InterviewService(store, performance);
    return { store, service };
  }

  it("starts or resumes guided interview and returns current question projection", async () => {
    const { service } = setup();
    const result = await service.startOrResume({
      organizationId: "33333333-3333-3333-3333-333333333333",
      workspaceId: "22222222-2222-2222-2222-222222222222",
      actor: "user:test",
    });

    expect(result.authority).toBe("guided");
    if (result.authority !== "guided") return;
    expect(result.status).toBe("in_progress");
    expect(result.currentQuestion).toMatchObject({
      id: "promotion_target",
      prompt: "What are we promoting?",
      activeOptionSet: expect.objectContaining({
        origin: "curated",
        options: expect.arrayContaining([expect.objectContaining({ id: "company_business" })]),
      }),
    });
    expect(result.progress).toEqual({
      currentIndex: 1,
      totalQuestions: expect.any(Number),
      completedCount: 0,
      percentComplete: 0,
    });
  });

  it("returns legacy authority for legacy workspaces without guided session", async () => {
    const { store, service } = setup();
    store.isLegacy = true;

    const result = await service.startOrResume({
      organizationId: "33333333-3333-3333-3333-333333333333",
      workspaceId: "22222222-2222-2222-2222-222222222222",
      actor: "user:test",
    });

    expect(result).toEqual({ authority: "legacy", session: null, resumed: true });
  });

  it("determines branch transitions: company_business skips client_approval", async () => {
    const { store, service } = setup();

    // Answer promotion_target with company_business
    const res1 = await service.submitAnswer({
      organizationId: "33333333-3333-3333-3333-333333333333",
      workspaceId: store.session.workspace_id,
      sessionId: store.session.id,
      expectedSessionVersion: 1,
      questionId: "promotion_target",
      questionVersion: 1,
      optionSetId: "opt-set-promotion_target",
      selectedOptionIds: ["company_business"],
      idempotencyKey: "ans-1",
      actor: "user:test",
    });

    expect(res1.replayed).toBe(false);
    expect(res1.sessionVersion).toBe(2);
    expect(res1.state.currentQuestion?.id).toBe("business_description");
    expect(res1.state.progress.completedCount).toBe(1);
  });

  it("determines branch transitions: client_business routes to client_approval", async () => {
    const { store, service } = setup();
    // Older in-progress sessions retain their branch and question order.
    store.session.questionnaire_version = "1.1.0";

    // Answer promotion_target with client_business
    const res1 = await service.submitAnswer({
      organizationId: "33333333-3333-3333-3333-333333333333",
      workspaceId: store.session.workspace_id,
      sessionId: store.session.id,
      expectedSessionVersion: 1,
      questionId: "promotion_target",
      questionVersion: 1,
      optionSetId: "opt-set-promotion_target",
      selectedOptionIds: ["client_business"],
      idempotencyKey: "ans-1",
      actor: "user:test",
    });

    expect(res1.replayed).toBe(false);
    expect(res1.state.currentQuestion?.id).toBe("client_approval");
  });

  it("preserves idempotency on duplicate answer submissions", async () => {
    const { store, service } = setup();

    const request = {
      organizationId: "33333333-3333-3333-3333-333333333333",
      workspaceId: store.session.workspace_id,
      sessionId: store.session.id,
      expectedSessionVersion: 1,
      questionId: "promotion_target",
      questionVersion: 1,
      optionSetId: "opt-set-promotion_target",
      selectedOptionIds: ["company_business"],
      idempotencyKey: "idem-same-click",
      actor: "user:test",
    };

    const first = await service.submitAnswer(request);
    const replay = await service.submitAnswer(request);

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.sessionVersion).toBe(first.sessionVersion);
    expect(replay.answer.id).toBe(first.answer.id);
  });

  it("completes interview and compiles BrandIntakePacket when all questions answered", async () => {
    const { store, service } = setup();
    const questionnaire = getQuestionnaire();

    // Start
    await service.startOrResume({
      organizationId: "33333333-3333-3333-3333-333333333333",
      workspaceId: store.session.workspace_id,
      actor: "user:test",
    });

    let currentVersion = 1;
    // Step through questions answering company_business
    const answersToSubmit = [
      { id: "promotion_target", selected: ["company_business"], text: undefined },
      { id: "business_description", selected: ["software_app"], text: "Cloud backup tool for small teams." },
      { id: "audience", selected: ["small_businesses"], text: undefined },
      { id: "customer_outcome", selected: ["save_time"], text: undefined },
    ];

    let lastResult: any;
    for (const item of answersToSubmit) {
      lastResult = await service.submitAnswer({
        organizationId: "33333333-3333-3333-3333-333333333333",
        workspaceId: store.session.workspace_id,
        sessionId: store.session.id,
        expectedSessionVersion: currentVersion,
        questionId: item.id,
        questionVersion: 1,
        optionSetId: `opt-set-${item.id}`,
        selectedOptionIds: item.selected,
        customText: item.text,
        idempotencyKey: `idem-${item.id}`,
        actor: "user:test",
      });
      currentVersion = lastResult.sessionVersion;
    }

    expect(lastResult.state.status).toBe("completed");
    expect(lastResult.state.currentQuestion).toBeNull();
    expect(lastResult.state.progress.percentComplete).toBe(100);
    expect(lastResult.state.intakePacket).not.toBeNull();
    expect(lastResult.state.intakePacket.status).toBe("complete");
    expect(lastResult.state.intakePacket.accountOffer.businessDescription).toEqual({
      category: { id: "software_app", label: "Software or an app" },
      descriptionText: "Cloud backup tool for small teams.",
    });
  });

  it("rejects answer for question that is not applicable in active branch", async () => {
    const { store, service } = setup();

    // promotion_target is answered as company_business (so client_approval is not applicable)
    await service.submitAnswer({
      organizationId: "33333333-3333-3333-3333-333333333333",
      workspaceId: store.session.workspace_id,
      sessionId: store.session.id,
      expectedSessionVersion: 1,
      questionId: "promotion_target",
      questionVersion: 1,
      optionSetId: "opt-set-promotion_target",
      selectedOptionIds: ["company_business"],
      idempotencyKey: "ans-1",
      actor: "user:test",
    });

    // Try submitting client_approval
    await expect(service.submitAnswer({
      organizationId: "33333333-3333-3333-3333-333333333333",
      workspaceId: store.session.workspace_id,
      sessionId: store.session.id,
      expectedSessionVersion: 2,
      questionId: "client_approval",
      questionVersion: 1,
      optionSetId: "opt-set-client_approval",
      selectedOptionIds: ["authorized"],
      idempotencyKey: "ans-invalid-branch",
      actor: "user:test",
    })).rejects.toMatchObject({ code: "question_not_applicable" });
  });
});
