import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";

const run = {
  id: "8ec34220-cb0b-4d24-9317-d0d959a50e98",
  workspace_id: "d7343021-237d-4b84-901a-3479c13ee0a2",
  phase: 1,
  skill_name: "voice-builder",
  status: "completed",
  approvals: [],
  artifacts: [],
  final_posts: [],
};

afterEach(() => vi.unstubAllGlobals());

describe("API client", () => {
  it.each(["approve", "reject"] as const)(
    "sends the %s decision as same-origin JSON",
    async (decision) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify(run), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      vi.stubGlobal("fetch", fetchMock);

      await api.decideRun(run.id, decision, "Reviewed");

      expect(fetchMock).toHaveBeenCalledWith(
        `/api/smm/v1/runs/${run.id}/${decision}`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ note: "Reviewed" }),
        }),
      );
    },
  );

  it("normalizes backend error envelopes", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              error: {
                code: "phase_changed",
                message: "Workspace phase changed.",
              },
            }),
            { status: 409, headers: { "x-request-id": "req-safe-123" } },
          ),
        ),
    );
    await expect(api.getRun(run.id)).rejects.toEqual(
      expect.objectContaining({
        code: "phase_changed",
        message: "Workspace phase changed.",
        status: 409,
        requestId: "req-safe-123",
      }),
    );
  });

  it("forwards abort signals without exposing request data", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [], nextCursor: null }), {
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    await api.listFinalPosts(run.workspace_id, undefined, {
      signal: controller.signal,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/smm/v1/workspaces/${run.workspace_id}/final-posts`,
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("sends continueWorkflow with idempotencyKey", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "8ec34220-cb0b-4d24-9317-d0d959a50e98",
          status: "queued",
          phase: 1,
        }),
        {
          status: 202,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await api.continueWorkflow("d7343021-237d-4b84-901a-3479c13ee0a2", "continue-key-1");
    expect(result.status).toBe("queued");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/smm/v1/workspaces/d7343021-237d-4b84-901a-3479c13ee0a2/continue",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ idempotencyKey: "continue-key-1" }),
      }),
    );
  });

  it("sends answerQuestion with expected version and answer choice", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          answer: {
            answerId: "ans-1",
            questionId: "c3d4e5f6-a1b2-4c3d-8e4f-5a6b7c8d9e0f",
            questionVersion: 1,
            replayed: false,
          },
          run: {
            id: "8ec34220-cb0b-4d24-9317-d0d959a50e98",
            status: "queued",
            phase: 1,
          },
        }),
        {
          status: 202,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await api.answerQuestion(
      "d7343021-237d-4b84-901a-3479c13ee0a2",
      "c3d4e5f6-a1b2-4c3d-8e4f-5a6b7c8d9e0f",
      {
        expectedVersion: 1,
        answer: { type: "option", optionId: "b2b_saas" },
        idempotencyKey: "ans-key-1",
      },
    );
    expect(result.run.phase).toBe(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/smm/v1/workspaces/d7343021-237d-4b84-901a-3479c13ee0a2/questions/c3d4e5f6-a1b2-4c3d-8e4f-5a6b7c8d9e0f/answer",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          expectedVersion: 1,
          answer: { type: "option", optionId: "b2b_saas" },
          idempotencyKey: "ans-key-1",
        }),
      }),
    );
  });

  it("starts a recurring content cycle through the same-origin proxy", async () => {
    const workspaceId = "d7343021-237d-4b84-901a-3479c13ee0a2";
    const response = {
      mode: "next_week",
      phase: 2,
      cycle: 3,
      week: 2,
      run: { id: run.id, status: "queued", phase: 2 },
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), {
      status: 202,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await api.startContentCycle(workspaceId, {
      mode: "next_week",
      weekStart: "2026-10-19",
      nothingChanged: true,
      idempotencyKey: "next-week-key",
    });

    expect(result).toMatchObject({ mode: "next_week", cycle: 3, week: 2 });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/smm/v1/workspaces/${workspaceId}/content-cycles`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          mode: "next_week",
          weekStart: "2026-10-19",
          nothingChanged: true,
          idempotencyKey: "next-week-key",
        }),
      }),
    );
  });

  it("sends reviseRun with expected revision and instructions", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "8ec34220-cb0b-4d24-9317-d0d959a50e98",
          status: "queued",
          phase: 2,
          reviewThreadId: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d",
          reviewRevision: 2,
          supersedesRunId: "b2c3d4e5-f6a1-4b2c-9d3e-4f5a6b7c8d9e",
        }),
        {
          status: 202,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await api.reviseRun("8ec34220-cb0b-4d24-9317-d0d959a50e98", {
      expectedReviewRevision: 1,
      instructions: "Adjust tone",
      idempotencyKey: "rev-1",
    });
    expect(result.reviewRevision).toBe(2);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/smm/v1/runs/8ec34220-cb0b-4d24-9317-d0d959a50e98/revise",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          expectedReviewRevision: 1,
          instructions: "Adjust tone",
          idempotencyKey: "rev-1",
        }),
      }),
    );
  });

  it("builds query parameters correctly for listFinalPosts", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [],
          nextCursor: null,
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await api.listFinalPosts("d7343021-237d-4b84-901a-3479c13ee0a2", {
      platform: "linkedin",
      week: 2,
      view: "grouped",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/smm/v1/workspaces/d7343021-237d-4b84-901a-3479c13ee0a2/final-posts?platform=linkedin&week=2&view=grouped",
      expect.anything(),
    );
  });

  it("handles getInterviewState returning state or null on 404", async () => {
    // 404 case
    const notFoundMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "Not found" } }), {
        status: 404,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", notFoundMock);

    const nullResult = await api.getInterviewState("d7343021-237d-4b84-901a-3479c13ee0a2");
    expect(nullResult).toBeNull();

    // 200 case
    const validInterview = {
      authority: "guided",
      session: {
        id: "7a26ea98-0c67-4bbd-986c-48600c3b0dfb",
        workspace_id: "d7343021-237d-4b84-901a-3479c13ee0a2",
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
        meaning: "Tone",
        prompt: "Prompt",
        supportingText: "Text",
        examples: [],
        answerMode: "single",
        required: true,
        allowCustom: true,
        customTextRequired: false,
        minimumSelections: 1,
        maximumSelections: 1,
        activeOptionSet: {
          id: "set-1",
          options: [{ id: "opt-1", label: "Option 1" }],
        },
      },
    };

    const successMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(validInterview), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", successMock);

    const successResult = await api.getInterviewState("d7343021-237d-4b84-901a-3479c13ee0a2");
    expect(successResult).toEqual(expect.objectContaining({ authority: "guided" }));
  });

  it("submits interview answer to POST v1/workspaces/:id/interview/answers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          answer: {
            id: "8ec34220-cb0b-4d24-9317-d0d959a50e98",
            session_id: "7a26ea98-0c67-4bbd-986c-48600c3b0dfb",
            question_id: "brand_voice",
            question_version: 1,
            option_set_id: "66666666-6666-4666-8666-666666666666",
            selected_option_ids: ["opt-1"],
            selected_options: [{ id: "opt-1", label: "Option 1" }],
            custom_text: null,
            answer_source: "option",
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
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await api.submitInterviewAnswer("d7343021-237d-4b84-901a-3479c13ee0a2", {
      sessionId: "7a26ea98-0c67-4bbd-986c-48600c3b0dfb",
      expectedSessionVersion: 1,
      questionId: "brand_voice",
      questionVersion: 1,
      optionSetId: "66666666-6666-4666-8666-666666666666",
      selectedOptionIds: ["opt-1"],
      idempotencyKey: "idem-1",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/smm/v1/workspaces/d7343021-237d-4b84-901a-3479c13ee0a2/interview/answers",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("sends option set presentation tracking", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "opt-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await api.markOptionSetPresented(
      "d7343021-237d-4b84-901a-3479c13ee0a2",
      "66666666-6666-4666-8666-666666666666",
      {
        sessionId: "7a26ea98-0c67-4bbd-986c-48600c3b0dfb",
        interactionStarted: true,
      },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/smm/v1/workspaces/d7343021-237d-4b84-901a-3479c13ee0a2/interview/options/66666666-6666-4666-8666-666666666666/present",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          sessionId: "7a26ea98-0c67-4bbd-986c-48600c3b0dfb",
          interactionStarted: true,
        }),
      }),
    );
  });
});
