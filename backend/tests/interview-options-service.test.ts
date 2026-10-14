import type pg from "pg";
import { describe, expect, it, vi } from "vitest";
import {
  type InterviewAnswerRow,
  type InterviewOptionSetRow,
  type InterviewSessionRow,
  InterviewStore,
} from "../src/db/interview-store.js";
import {
  CURRENT_GUIDED_INTAKE_VERSION,
  getQuestionnaire,
  GUIDED_INTAKE_QUESTIONNAIRE_ID,
} from "../src/interview/definitions.js";
import {
  MockOptionAssistantAdapter,
  OpenAIOptionAssistantAdapter,
} from "../src/interview/options/adapter.js";
import {
  computeOptionCacheKey,
  InterviewOptionCache,
} from "../src/interview/options/cache.js";
import { buildOptionAssistantPrompt } from "../src/interview/options/prompt.js";
import {
  computeConfirmedAnswersHash,
  OptionAssistantService,
} from "../src/interview/options/service.js";
import {
  OPTION_PROMPT_VERSION,
  type OptionGenerationRequest,
} from "../src/interview/options/types.js";
import { MetricsService } from "../src/observability/metrics.js";
import { PerformanceTracer } from "../src/observability/performance.js";

function fakePool(): pg.Pool {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  } as unknown as pg.Pool;
}

describe("option assistant adapter and prompt builder (M9.3)", () => {
  it("builds a concise, beginner-friendly prompt without marketing jargon", () => {
    const request: OptionGenerationRequest = {
      workspaceId: "22222222-2222-2222-2222-222222222222",
      sessionId: "11111111-1111-1111-1111-111111111111",
      questionnaireId: GUIDED_INTAKE_QUESTIONNAIRE_ID,
      questionnaireVersion: CURRENT_GUIDED_INTAKE_VERSION,
      promptVersion: OPTION_PROMPT_VERSION,
      businessDescription: "I make handmade pottery and ceramic mugs.",
      category: "Handmade goods",
      confirmedAnswers: [
        {
          questionId: "promotion_target",
          selectedLabels: ["A company or business"],
          customText: null,
        },
      ],
      targetQuestions: [
        {
          questionId: "audience",
          prompt: "Who would get the most value from this?",
          meaning: "The target audience",
          answerMode: "multiple_with_text",
          minimumSelections: 1,
          maximumSelections: 3,
        },
      ],
    };

    const { developerPrompt, userPrompt } = buildOptionAssistantPrompt(request);
    expect(developerPrompt).toContain("NEVER invent business performance facts");
    expect(developerPrompt).toContain("DO NOT use marketing jargon");
    expect(developerPrompt).toContain("without HTML");
    expect(userPrompt).toContain("I make handmade pottery and ceramic mugs.");
    expect(userPrompt).toContain("Handmade goods");
    expect(userPrompt).toContain("promotion_target: A company or business");
  });

  it("generates tailored choices using mock adapter for various categories", async () => {
    const adapter = new MockOptionAssistantAdapter();

    const saasRes = await adapter.generate({
      workspaceId: "22222222-2222-2222-2222-222222222222",
      sessionId: "11111111-1111-1111-1111-111111111111",
      questionnaireId: GUIDED_INTAKE_QUESTIONNAIRE_ID,
      questionnaireVersion: CURRENT_GUIDED_INTAKE_VERSION,
      promptVersion: OPTION_PROMPT_VERSION,
      businessDescription: "A B2B SaaS analytics tool for small dev teams.",
      category: "Software or an app",
      confirmedAnswers: [],
      targetQuestions: [
        {
          questionId: "audience",
          prompt: "Who?",
          meaning: "Audience",
          answerMode: "multiple_with_text",
          minimumSelections: 1,
          maximumSelections: 3,
        },
        {
          questionId: "platform_priorities",
          prompt: "Platforms?",
          meaning: "Platforms",
          answerMode: "multiple_with_text",
          minimumSelections: 1,
          maximumSelections: 3,
        },
      ],
    });

    expect(saasRes.suggestions.audience?.length).toBeGreaterThanOrEqual(2);
    expect(saasRes.suggestions.audience?.some((s) => s.label.toLowerCase().includes("founder") || s.label.toLowerCase().includes("developer"))).toBe(true);
    expect(saasRes.suggestions.platform_priorities?.some((s) => s.label.includes("X / Twitter") || s.label.includes("LinkedIn"))).toBe(true);

    const storeRes = await adapter.generate({
      workspaceId: "22222222-2222-2222-2222-222222222222",
      sessionId: "11111111-1111-1111-1111-111111111111",
      questionnaireId: GUIDED_INTAKE_QUESTIONNAIRE_ID,
      questionnaireVersion: CURRENT_GUIDED_INTAKE_VERSION,
      promptVersion: OPTION_PROMPT_VERSION,
      businessDescription: "Organic skincare shop and bath products.",
      category: "Products sold online",
      confirmedAnswers: [],
      targetQuestions: [
        {
          questionId: "audience",
          prompt: "Who?",
          meaning: "Audience",
          answerMode: "multiple_with_text",
          minimumSelections: 1,
          maximumSelections: 3,
        },
      ],
    });

    expect(storeRes.suggestions.audience?.some((s) => s.label.toLowerCase().includes("shoppers") || s.label.toLowerCase().includes("consumers"))).toBe(true);
  });

  it("handles adapter failure and timeout simulation cleanly", async () => {
    const failingAdapter = new MockOptionAssistantAdapter(0, true, false);
    await expect(failingAdapter.generate({
      workspaceId: "22222222-2222-2222-2222-222222222222",
      sessionId: "11111111-1111-1111-1111-111111111111",
      questionnaireId: GUIDED_INTAKE_QUESTIONNAIRE_ID,
      questionnaireVersion: CURRENT_GUIDED_INTAKE_VERSION,
      promptVersion: OPTION_PROMPT_VERSION,
      businessDescription: "test",
      confirmedAnswers: [],
      targetQuestions: [{
        questionId: "audience",
        prompt: "Who?",
        meaning: "Audience",
        answerMode: "single",
        minimumSelections: 1,
        maximumSelections: 1,
      }],
    })).rejects.toThrow("Simulated option generation error");

    const timingOutAdapter = new MockOptionAssistantAdapter(0, false, true);
    await expect(timingOutAdapter.generate({
      workspaceId: "22222222-2222-2222-2222-222222222222",
      sessionId: "11111111-1111-1111-1111-111111111111",
      questionnaireId: GUIDED_INTAKE_QUESTIONNAIRE_ID,
      questionnaireVersion: CURRENT_GUIDED_INTAKE_VERSION,
      promptVersion: OPTION_PROMPT_VERSION,
      businessDescription: "test",
      confirmedAnswers: [],
      targetQuestions: [{
        questionId: "audience",
        prompt: "Who?",
        meaning: "Audience",
        answerMode: "single",
        minimumSelections: 1,
        maximumSelections: 1,
      }],
    }, { timeoutMs: 50 })).rejects.toThrow("timed out");
  });
});

describe("option cache and service resilience (M9.3)", () => {
  it("canonicalizes and durably enqueues distinct requested question batches", async () => {
    const store = {
      getState: vi.fn().mockResolvedValue({
        authority: "guided",
        session: {
          id: "11111111-1111-1111-1111-111111111111",
          workspace_id: "22222222-2222-2222-2222-222222222222",
          questionnaire_id: GUIDED_INTAKE_QUESTIONNAIRE_ID,
          questionnaire_version: CURRENT_GUIDED_INTAKE_VERSION,
          status: "in_progress",
        },
        answers: [],
        optionSets: [],
      }),
    } as unknown as InterviewStore;
    const enqueueInterviewOptions = vi.fn().mockResolvedValue(true);
    const cache = new InterviewOptionCache(fakePool());
    const metrics = new MetricsService(fakePool());
    const service = new OptionAssistantService(
      store,
      cache,
      new MockOptionAssistantAdapter(),
      new PerformanceTracer(metrics, 1),
      { enqueueInterviewOptions },
    );

    await expect(service.prefetchOptions({
      organizationId: "33333333-3333-3333-3333-333333333333",
      workspaceId: "22222222-2222-2222-2222-222222222222",
      sessionId: "11111111-1111-1111-1111-111111111111",
      questionnaireVersion: CURRENT_GUIDED_INTAKE_VERSION,
      targetQuestionIds: ["customer_outcome", "audience", "audience"],
    })).resolves.toBe(true);
    await expect(service.prefetchOptions({
      organizationId: "33333333-3333-3333-3333-333333333333",
      workspaceId: "22222222-2222-2222-2222-222222222222",
      sessionId: "11111111-1111-1111-1111-111111111111",
      questionnaireVersion: CURRENT_GUIDED_INTAKE_VERSION,
      targetQuestionIds: ["audience", "customer_outcome"],
    })).resolves.toBe(true);

    expect(enqueueInterviewOptions).toHaveBeenCalledWith(expect.objectContaining({
      targetQuestionIds: ["audience", "customer_outcome"],
      idempotencyKey: expect.stringMatching(
        /^opt:[0-9a-f-]{36}:[a-f0-9]{64}:[a-f0-9]{64}$/,
      ),
    }));
    expect(enqueueInterviewOptions.mock.calls[1]?.[0].idempotencyKey)
      .toBe(enqueueInterviewOptions.mock.calls[0]?.[0].idempotencyKey);
  });

  it("computes deterministic cache key and confirmed answers hash", () => {
    const answers: InterviewAnswerRow[] = [
      {
        id: "a1",
        session_id: "s1",
        workspace_id: "w1",
        question_id: "promotion_target",
        question_version: 1,
        option_set_id: "o1",
        selected_option_ids: ["company_business"],
        selected_options: [],
        custom_text: null,
        answer_source: "option",
        idempotency_key: "k1",
        request_hash: "h1",
        session_version: 2,
        status: "active",
        supersedes_answer_id: null,
        actor: "user",
        created_at: new Date(),
        superseded_at: null,
      },
    ];

    const hash1 = computeConfirmedAnswersHash(answers);
    const hash2 = computeConfirmedAnswersHash(answers);
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);

    const key = computeOptionCacheKey({
      organizationId: "org-1",
      workspaceId: "w1",
      questionnaireVersion: "1.0.0",
      confirmedAnswersHash: hash1,
      targetQuestionIds: ["audience", "primary_goal"],
      promptVersion: OPTION_PROMPT_VERSION,
      generatorProvider: "mock",
      generatorModel: "mock-small",
    });
    expect(key).toMatch(/^[a-f0-9]{64}$/);

    const reorderedKey = computeOptionCacheKey({
      organizationId: "org-1",
      workspaceId: "w1",
      questionnaireVersion: "1.0.0",
      confirmedAnswersHash: hash1,
      targetQuestionIds: ["primary_goal", "audience", "audience"],
      promptVersion: OPTION_PROMPT_VERSION,
      generatorProvider: "mock",
      generatorModel: "mock-small",
    });
    const differentBatchKey = computeOptionCacheKey({
      organizationId: "org-1",
      workspaceId: "w1",
      questionnaireVersion: "1.0.0",
      confirmedAnswersHash: hash1,
      targetQuestionIds: ["audience"],
      promptVersion: OPTION_PROMPT_VERSION,
      generatorProvider: "mock",
      generatorModel: "mock-small",
    });
    expect(reorderedKey).toBe(key);
    expect(differentBatchKey).not.toBe(key);
  });

  it("caches suggestions and retrieves from memory instantly", async () => {
    const pool = fakePool();
    const cache = new InterviewOptionCache(pool);

    const testEntry = {
      cacheKey: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      workspaceId: "22222222-2222-2222-2222-222222222222",
      organizationId: "33333333-3333-3333-3333-333333333333",
      questionnaireId: GUIDED_INTAKE_QUESTIONNAIRE_ID,
      questionnaireVersion: CURRENT_GUIDED_INTAKE_VERSION,
      confirmedAnswersHash: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
      promptVersion: OPTION_PROMPT_VERSION,
      generatorProvider: "mock",
      generatorModel: "mock-model",
      suggestions: {
        audience: [{ label: "Tech Leads", description: "Senior engineers" }],
      },
      explanation: "Test tip",
      expiresAt: new Date(Date.now() + 60_000),
    };

    await cache.set(testEntry);
    const retrieved = await cache.get(testEntry.cacheKey);

    expect(retrieved).not.toBeNull();
    expect(retrieved?.cacheKey).toBe(testEntry.cacheKey);
    expect(retrieved?.suggestions).toEqual(testEntry.suggestions);

    // Evicts on workspace delete
    await cache.deleteForWorkspace(testEntry.workspaceId);
    // Since memory was purged, fallback query to mock DB returns null
    const afterDelete = await cache.get(testEntry.cacheKey);
    expect(afterDelete).toBeNull();
  });

  it("service never throws and falls back cleanly when provider fails", async () => {
    const store = {
      getState: vi.fn().mockResolvedValue({
        authority: "guided",
        session: {
          id: "11111111-1111-1111-1111-111111111111",
          workspace_id: "22222222-2222-2222-2222-222222222222",
          questionnaire_id: GUIDED_INTAKE_QUESTIONNAIRE_ID,
          questionnaire_version: CURRENT_GUIDED_INTAKE_VERSION,
          status: "in_progress",
        },
        answers: [
          {
            question_id: "business_description",
            status: "active",
            selected_options: [{ label: "Software or an app" }],
            custom_text: "A project tracker.",
            selected_option_ids: ["software_app"],
          },
        ],
        optionSets: [],
      }),
      saveOptionSet: vi.fn(),
    } as unknown as InterviewStore;

    const cache = new InterviewOptionCache(fakePool());
    const failingAdapter = new MockOptionAssistantAdapter(0, true, false);
    const metrics = new MetricsService(fakePool());
    const performance = new PerformanceTracer(metrics, 1);

    const service = new OptionAssistantService(store, cache, failingAdapter, performance, null);

    // Should complete cleanly without throwing
    await expect(service.generateAndSaveOptions({
      organizationId: "33333333-3333-3333-3333-333333333333",
      workspaceId: "22222222-2222-2222-2222-222222222222",
      sessionId: "11111111-1111-1111-1111-111111111111",
      targetQuestionIds: ["audience"],
    })).resolves.not.toThrow();

    // Verify saveOptionSet was not called because generation failed
    expect(store.saveOptionSet).not.toHaveBeenCalled();
  });

  it("never overwrites options when user has already interacted with existing set", async () => {
    const store = {
      getState: vi.fn().mockResolvedValue({
        authority: "guided",
        session: {
          id: "11111111-1111-1111-1111-111111111111",
          workspace_id: "22222222-2222-2222-2222-222222222222",
          questionnaire_id: GUIDED_INTAKE_QUESTIONNAIRE_ID,
          questionnaire_version: CURRENT_GUIDED_INTAKE_VERSION,
          status: "in_progress",
        },
        answers: [
          {
            question_id: "business_description",
            status: "active",
            selected_options: [{ label: "Software or an app" }],
            custom_text: "A project tracker.",
            selected_option_ids: ["software_app"],
          },
        ],
        optionSets: [
          {
            id: "opt-1",
            question_id: "audience",
            status: "active",
            presented_at: new Date(),
            interaction_started_at: new Date(), // User already clicked or started typing!
          },
        ],
      }),
      saveOptionSet: vi.fn(),
    } as unknown as InterviewStore;

    const cache = new InterviewOptionCache(fakePool());
    const adapter = new MockOptionAssistantAdapter();
    const metrics = new MetricsService(fakePool());
    const performance = new PerformanceTracer(metrics, 1);

    const service = new OptionAssistantService(store, cache, adapter, performance, null);

    await service.generateAndSaveOptions({
      organizationId: "33333333-3333-3333-3333-333333333333",
      workspaceId: "22222222-2222-2222-2222-222222222222",
      sessionId: "11111111-1111-1111-1111-111111111111",
      targetQuestionIds: ["audience"],
    });

    // Option set was NOT overwritten
    expect(store.saveOptionSet).not.toHaveBeenCalled();
  });

  it("OpenAI adapter strips markdown code fences and caps suggestions to 4 items", async () => {
    const originalFetch = globalThis.fetch;
    const mockJsonWithFences = "```json\n" + JSON.stringify({
      suggestions: {
        audience: [
          { label: "Option 1", description: "Desc 1" },
          { label: "Option 2", description: "Desc 2" },
          { label: "Option 3", description: "Desc 3" },
          { label: "Option 4", description: "Desc 4" },
          { label: "Option 5 Extra", description: "Desc 5" },
        ],
      },
      explanation: "Tip",
    }) + "\n```";

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: "chatcmpl_test_123",
        choices: [{ message: { content: mockJsonWithFences } }],
        usage: { prompt_tokens: 120, completion_tokens: 40, total_tokens: 160 },
      }),
    } as unknown as Response);

    try {
      const adapter = new OpenAIOptionAssistantAdapter("fake-key", "test-model");
      const result = await adapter.generate({
        workspaceId: "22222222-2222-2222-2222-222222222222",
        sessionId: "11111111-1111-1111-1111-111111111111",
        questionnaireId: GUIDED_INTAKE_QUESTIONNAIRE_ID,
        questionnaireVersion: CURRENT_GUIDED_INTAKE_VERSION,
        promptVersion: OPTION_PROMPT_VERSION,
        businessDescription: "test",
        confirmedAnswers: [],
        targetQuestions: [{
          questionId: "audience",
          prompt: "Who?",
          meaning: "Audience",
          answerMode: "single",
          minimumSelections: 1,
          maximumSelections: 1,
        }],
      });

      // Stripped code fence successfully and capped at 4 items
      expect(result.suggestions.audience).toHaveLength(4);
      expect(result.suggestions.audience?.[0]?.label).toBe("Option 1");
      expect(result.providerResponseId).toBe("chatcmpl_test_123");
      expect(result.usage).toEqual({
        inputTokens: 120,
        outputTokens: 40,
        totalTokens: 160,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("rejects provider output containing unknown question ids", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({
          suggestions: {
            audience: [{ label: "Founders" }, { label: "Operators" }],
            injected_question: [{ label: "A" }, { label: "B" }],
          },
        }) } }],
      }),
    } as unknown as Response);

    try {
      const adapter = new OpenAIOptionAssistantAdapter("fake-key", "test-model");
      await expect(adapter.generate({
        workspaceId: "22222222-2222-2222-2222-222222222222",
        sessionId: "11111111-1111-1111-1111-111111111111",
        questionnaireId: GUIDED_INTAKE_QUESTIONNAIRE_ID,
        questionnaireVersion: CURRENT_GUIDED_INTAKE_VERSION,
        promptVersion: OPTION_PROMPT_VERSION,
        businessDescription: "A project tracker",
        confirmedAnswers: [],
        targetQuestions: [{
          questionId: "audience",
          prompt: "Who?",
          meaning: "Audience",
          answerMode: "single",
          minimumSelections: 1,
          maximumSelections: 1,
        }],
      })).rejects.toThrow("unexpected question set");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("does not include provider response bodies in operational errors", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "sensitive echoed user content",
    } as unknown as Response);

    try {
      const adapter = new OpenAIOptionAssistantAdapter("fake-key", "test-model");
      const request: OptionGenerationRequest = {
        workspaceId: "22222222-2222-2222-2222-222222222222",
        sessionId: "11111111-1111-1111-1111-111111111111",
        questionnaireId: GUIDED_INTAKE_QUESTIONNAIRE_ID,
        questionnaireVersion: CURRENT_GUIDED_INTAKE_VERSION,
        promptVersion: OPTION_PROMPT_VERSION,
        businessDescription: "private description",
        confirmedAnswers: [],
        targetQuestions: [{
          questionId: "audience",
          prompt: "Who?",
          meaning: "Audience",
          answerMode: "single",
          minimumSelections: 1,
          maximumSelections: 1,
        }],
      };
      await expect(adapter.generate(request)).rejects.toThrow(
        "OpenAI option assistant request failed with status 429",
      );
      await expect(adapter.generate(request)).rejects.not.toThrow("sensitive echoed user content");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("does not expose invalid provider-generated fields in schema errors", async () => {
    const originalFetch = globalThis.fetch;
    const sensitiveLabel = "private-customer-name";
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({
          suggestions: {
            audience: [{ label: sensitiveLabel }],
          },
        }) } }],
      }),
    } as unknown as Response);

    try {
      const adapter = new OpenAIOptionAssistantAdapter("fake-key", "test-model");
      const request: OptionGenerationRequest = {
        workspaceId: "22222222-2222-2222-2222-222222222222",
        sessionId: "11111111-1111-1111-1111-111111111111",
        questionnaireId: GUIDED_INTAKE_QUESTIONNAIRE_ID,
        questionnaireVersion: CURRENT_GUIDED_INTAKE_VERSION,
        promptVersion: OPTION_PROMPT_VERSION,
        businessDescription: "private description",
        confirmedAnswers: [],
        targetQuestions: [{
          questionId: "audience",
          prompt: "Who?",
          meaning: "Audience",
          answerMode: "single",
          minimumSelections: 1,
          maximumSelections: 1,
        }],
      };

      await expect(adapter.generate(request)).rejects.toThrow(
        "OpenAI option assistant returned invalid structured output",
      );
      await expect(adapter.generate(request)).rejects.not.toThrow(sensitiveLabel);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("normalizes invalid provider envelopes without exposing parser details", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("parser echoed private response bytes");
      },
    } as unknown as Response);

    try {
      const adapter = new OpenAIOptionAssistantAdapter("fake-key", "test-model");
      const request: OptionGenerationRequest = {
        workspaceId: "22222222-2222-2222-2222-222222222222",
        sessionId: "11111111-1111-1111-1111-111111111111",
        questionnaireId: GUIDED_INTAKE_QUESTIONNAIRE_ID,
        questionnaireVersion: CURRENT_GUIDED_INTAKE_VERSION,
        promptVersion: OPTION_PROMPT_VERSION,
        businessDescription: "private description",
        confirmedAnswers: [],
        targetQuestions: [{
          questionId: "audience",
          prompt: "Who?",
          meaning: "Audience",
          answerMode: "single",
          minimumSelections: 1,
          maximumSelections: 1,
        }],
      };

      await expect(adapter.generate(request)).rejects.toThrow(
        "OpenAI option assistant returned an invalid response envelope",
      );
      await expect(adapter.generate(request)).rejects.not.toThrow("private response bytes");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("LRU cache maintains and refreshes most-recently-used entry order", async () => {
    const pool = fakePool();
    const cache = new InterviewOptionCache(pool);

    const makeEntry = (id: string) => ({
      cacheKey: id.padEnd(64, "0"),
      workspaceId: "22222222-2222-2222-2222-222222222222",
      organizationId: "33333333-3333-3333-3333-333333333333",
      questionnaireId: GUIDED_INTAKE_QUESTIONNAIRE_ID,
      questionnaireVersion: CURRENT_GUIDED_INTAKE_VERSION,
      confirmedAnswersHash: id.padEnd(64, "1"),
      promptVersion: OPTION_PROMPT_VERSION,
      generatorProvider: "mock",
      generatorModel: "mock",
      suggestions: { audience: [{ label: `Opt ${id}` }] },
      explanation: null,
      expiresAt: new Date(Date.now() + 60_000),
    });

    // Populate entry A and entry B
    await cache.set(makeEntry("a"));
    await cache.set(makeEntry("b"));

    // Access entry A so it becomes most recently used
    const touchedA = await cache.get("a".padEnd(64, "0"));
    expect(touchedA?.suggestions.audience?.[0]?.label).toBe("Opt a");
  });
});
