import { describe, expect, it } from "vitest";
import {
  answerChoiceSchema,
  answerQuestionPayloadSchema,
  authSessionStateSchema,
  finalPostSchema,
  guidedInterviewStateSchema,
  interviewStateSchema,
  revisionPayloadSchema,
  revisionResponseSchema,
  runProgressEventSchema,
  runSchema,
  structuredPresentationDataSchema,
  submitGuidedAnswerBodySchema,
  submitGuidedAnswerResponseSchema,
  userPreferencesSchema,
  workflowStateSchema,
  workspaceSchema,
} from "./contracts";
import { isRunActive, titleCase } from "./utils";

describe("API contracts", () => {
  it("rejects malformed workspace responses", () => {
    expect(
      workspaceSchema.safeParse({ id: "not-a-uuid", current_phase: 99 })
        .success,
    ).toBe(false);
  });

  it("fills run collections when the enqueue response omits them", () => {
    const run = runSchema.parse({
      id: "8ec34220-cb0b-4d24-9317-d0d959a50e98",
      workspace_id: "d7343021-237d-4b84-901a-3479c13ee0a2",
      phase: 1,
      skill_name: "voice-builder",
      status: "queued",
    });
    expect(run.artifacts).toEqual([]);
    expect(run.approvals).toEqual([]);
    expect(run.final_posts).toEqual([]);
  });

  it("rejects malformed structured model output", () => {
    expect(
      runSchema.safeParse({
        id: "8ec34220-cb0b-4d24-9317-d0d959a50e98",
        workspace_id: "d7343021-237d-4b84-901a-3479c13ee0a2",
        phase: 1,
        skill_name: "voice-builder",
        status: "completed",
        output: { message: "Missing required orchestration fields" },
      }).success,
    ).toBe(false);
  });

  it("validates workflow state with pending adaptive question", () => {
    const state = {
      workflowId: "8ec34220-cb0b-4d24-9317-d0d959a50e98",
      workflowStatus: "active",
      workflowVersion: 1,
      recipeVersion: "1.0.0",
      phaseInstanceId: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d",
      phase: 1,
      cycle: 1,
      phaseStatus: "active",
      conversationId: "b2c3d4e5-f6a1-4b2c-9d3e-4f5a6b7c8d9e",
      pendingQuestion: {
        id: "c3d4e5f6-a1b2-4c3d-8e4f-5a6b7c8d9e0f",
        workspace_id: "d7343021-237d-4b84-901a-3479c13ee0a2",
        workflow_instance_id: "8ec34220-cb0b-4d24-9317-d0d959a50e98",
        phase_instance_id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d",
        question_key: "brand.target_audience",
        prompt: "Who is your primary customer?",
        purpose: "Helps tailor content tone and hooks.",
        options: [
          { id: "b2b_saas", label: "B2B SaaS Founders", description: "Early stage tech" },
          { id: "dtc", label: "DTC Brands" },
        ],
        allow_custom: true,
        status: "pending",
        version: 1,
      },
    };
    const parsed = workflowStateSchema.safeParse(state);
    expect(parsed.success).toBe(true);
  });

  it("validates option and custom answer payloads", () => {
    const optionChoice = answerChoiceSchema.safeParse({
      type: "option",
      optionId: "b2b_saas",
    });
    expect(optionChoice.success).toBe(true);

    const customChoice = answerChoiceSchema.safeParse({
      type: "custom",
      text: "Seed-stage fintech developers building in public",
    });
    expect(customChoice.success).toBe(true);

    expect(answerChoiceSchema.safeParse({
      type: "multiple",
      optionIds: ["leads", "trust"],
      text: "Educate customers",
    }).success).toBe(true);

    const payload = answerQuestionPayloadSchema.safeParse({
      expectedVersion: 1,
      answer: { type: "custom", text: "Enterprise CIOs" },
      idempotencyKey: "test-idempotency-key",
    });
    expect(payload.success).toBe(true);
  });

  it("validates revision payload and response schemas", () => {
    const payload = revisionPayloadSchema.safeParse({
      expectedReviewRevision: 2,
      instructions: "Make the tone more punchy and add LinkedIn hooks",
      idempotencyKey: "rev-key-123",
    });
    expect(payload.success).toBe(true);

    const response = revisionResponseSchema.safeParse({
      id: "8ec34220-cb0b-4d24-9317-d0d959a50e98",
      status: "queued",
      phase: 2,
      reviewThreadId: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d",
      reviewRevision: 3,
      supersedesRunId: "b2c3d4e5-f6a1-4b2c-9d3e-4f5a6b7c8d9e",
    });
    expect(response.success).toBe(true);
  });

  it("validates final post schema with all required fields", () => {
    const post = {
      id: "8ec34220-cb0b-4d24-9317-d0d959a50e98",
      workspace_id: "d7343021-237d-4b84-901a-3479c13ee0a2",
      run_id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d",
      source_artifact_id: "b2c3d4e5-f6a1-4b2c-9d3e-4f5a6b7c8d9e",
      logical_id: "c3d4e5f6-a1b2-4c3d-8e4f-5a6b7c8d9e0f",
      revision: 1,
      logical_key: "sprint-1.week-1.day-1.linkedin",
      sprint: "Sprint 1",
      week: 1,
      local_date: "2026-10-12",
      timezone: "UTC",
      platform: "linkedin",
      campaign: "Launch",
      topic: "Autonomous SMM",
      pillar: "Product Education",
      content_format: "post",
      title: "Why your agency needs an autopilot manager",
      content: "Here are 3 reasons why autopilot systems change everything...",
      status: "approved",
      publication_status: "ready",
    };
    expect(finalPostSchema.safeParse(post).success).toBe(true);
  });

  it("validates structured presentation card data", () => {
    const brandFoundation = {
      kind: "brand_foundation",
      version: 1,
      brandName: "Acme Cloud",
      voiceTone: ["Authoritative", "Bold", "Concise"],
      pillars: ["Infrastructure", "Reliability", "Cost Savings"],
      targetAudience: "DevOps and Platform Engineers",
      positioningSummary: "The simplest cloud deployment engine.",
    };
    expect(structuredPresentationDataSchema.safeParse(brandFoundation).success).toBe(true);

    const calendar = {
      kind: "content_calendar",
      version: 1,
      sprint: "Sprint 1",
      week: 1,
      totalPosts: 5,
      schedule: [
        {
          day: "Monday",
          platform: "linkedin",
          topic: "Architecture deep dive",
          format: "carousel",
        },
      ],
    };
    expect(structuredPresentationDataSchema.safeParse(calendar).success).toBe(true);
  });

  it("validates auth session state schema", () => {
    const validSession = {
      user: {
        id: "usr_123",
        email: "founder@example.com",
        name: "Founder",
        emailVerified: true,
      },
      session: {
        id: "sess_456",
        userId: "usr_123",
        token: "tok_abc",
        expiresAt: "2026-11-01T00:00:00.000Z",
      },
    };
    expect(authSessionStateSchema.safeParse(validSession).success).toBe(true);

    const unauthenticated = {
      user: null,
      session: null,
    };
    expect(authSessionStateSchema.safeParse(unauthenticated).success).toBe(true);
  });

  it("validates user preferences schema with sensible defaults", () => {
    const defaultPrefs = userPreferencesSchema.parse({});
    expect(defaultPrefs.timezone).toBe("UTC");
    expect(defaultPrefs.theme).toBe("dark");
    expect(defaultPrefs.autopilotEnabled).toBe(true);
    expect(defaultPrefs.reviewRemindersEnabled).toBe(true);

    const customPrefs = userPreferencesSchema.parse({
      timezone: "America/New_York",
      theme: "light",
      autopilotEnabled: false,
    });
    expect(customPrefs.timezone).toBe("America/New_York");
    expect(customPrefs.theme).toBe("light");
    expect(customPrefs.autopilotEnabled).toBe(false);
  });

  it("validates guided interview state schema matching backend projection", () => {
    const validGuidedState = {
      authority: "guided",
      session: {
        id: "7a26ea98-0c67-4bbd-986c-48600c3b0dfb",
        workspace_id: "2443a6db-ae8e-4a4e-bf23-f3f2ff11a913",
        questionnaire_id: "core-brand-intake",
        questionnaire_version: "1.0.0",
        status: "in_progress",
        version: 1,
        started_at: "2026-10-10T00:00:00.000Z",
        updated_at: "2026-10-10T00:00:00.000Z",
      },
      status: "in_progress",
      progress: {
        currentIndex: 1,
        totalQuestions: 5,
        completedCount: 0,
        percentComplete: 0,
      },
      currentQuestion: {
        id: "brand_voice",
        version: 1,
        meaning: "Tone and personality",
        prompt: "How should your brand communicate?",
        supportingText: "Pick your tone style.",
        examples: ["Bold", "Analytical"],
        answerMode: "single",
        required: true,
        allowCustom: true,
        customTextRequired: false,
        minimumSelections: 1,
        maximumSelections: 1,
        activeOptionSet: {
          id: "set-voice-1",
          origin: "curated",
          options: [
            { id: "bold_direct", label: "Bold & Direct" },
          ],
        },
      },
      intakePacket: null,
    };

    const parsed = guidedInterviewStateSchema.safeParse(validGuidedState);
    expect(parsed.success).toBe(true);

    const unionParsed = interviewStateSchema.safeParse(validGuidedState);
    expect(unionParsed.success).toBe(true);

    const legacyState = {
      authority: "legacy",
      session: null,
      resumed: true,
    };
    expect(interviewStateSchema.safeParse(legacyState).success).toBe(true);
  });

  it("validates submit guided answer body and response schemas", () => {
    const validBody = {
      sessionId: "7a26ea98-0c67-4bbd-986c-48600c3b0dfb",
      expectedSessionVersion: 1,
      questionId: "brand_voice",
      questionVersion: 1,
      optionSetId: "66666666-6666-4666-8666-666666666666",
      selectedOptionIds: ["bold_direct"],
      customText: "Direct and decisive",
      idempotencyKey: "idem-key-123",
    };
    expect(submitGuidedAnswerBodySchema.safeParse(validBody).success).toBe(true);

    const validResponse = {
      answer: {
        id: "8ec34220-cb0b-4d24-9317-d0d959a50e98",
        session_id: "7a26ea98-0c67-4bbd-986c-48600c3b0dfb",
        question_id: "brand_voice",
        question_version: 1,
        option_set_id: "66666666-6666-4666-8666-666666666666",
        selected_option_ids: ["bold_direct"],
        selected_options: [{ id: "bold_direct", label: "Bold & Direct" }],
        custom_text: "Direct and decisive",
        answer_source: "combined",
        status: "active",
        created_at: "2026-10-10T00:00:00.000Z",
      },
      sessionVersion: 2,
      replayed: false,
      state: {
        authority: "legacy",
        session: null,
        resumed: true,
      },
    };
    expect(submitGuidedAnswerResponseSchema.safeParse(validResponse).success).toBe(true);
  });

  it("validates real-time Server-Sent Events progress schema", () => {
    const validEvent = {
      id: "1",
      runId: "8ec34220-cb0b-4d24-9317-d0d959a50e98",
      workspaceId: "2443a6db-ae8e-4a4e-bf23-f3f2ff11a913",
      phase: 1,
      skillName: "brand-foundations",
      stage: "loading_context",
      occurredAt: "2026-10-10T00:00:00.000Z",
    };
    expect(runProgressEventSchema.safeParse(validEvent).success).toBe(true);

    const invalidStage = {
      ...validEvent,
      stage: "hacking_mainframe",
    };
    expect(runProgressEventSchema.safeParse(invalidStage).success).toBe(false);
  });
});

describe("presentation helpers", () => {
  it("polls only non-terminal runs", () => {
    expect(isRunActive("queued")).toBe(true);
    expect(isRunActive("running")).toBe(true);
    expect(isRunActive("completed")).toBe(false);
  });

  it("turns machine names into readable labels", () => {
    expect(titleCase("creative-production")).toBe("Creative Production");
  });
});
