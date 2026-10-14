import { describe, expect, it } from "vitest";
import type {
  FinalPost,
  PendingQuestion,
  Run,
  WorkflowState,
  Workspace,
} from "./contracts";
import { isRunAwaitingApproval, selectTodayState } from "./today-selector";

const mockWorkspace: Workspace = {
  id: "d7343021-237d-4b84-901a-3479c13ee0a2",
  name: "Novi Studio",
  slug: "novi-studio",
  timezone: "UTC",
  current_phase: 1,
  status: "active",
  version: 1,
  created_at: "2026-10-09T00:00:00Z",
  updated_at: "2026-10-09T00:00:00Z",
};

const mockWorkflow: WorkflowState = {
  activeRun: null,
  workflowId: "8ec34220-cb0b-4d24-9317-d0d959a50e98",
  workflowStatus: "active",
  workflowVersion: 1,
  recipeVersion: "1.0.0",
  phaseInstanceId: "f3c8008a-24a9-467f-a631-0428ef50a9dc",
  phase: 1,
  cycle: 1,
  phaseStatus: "active",
  conversationId: "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
  pendingQuestion: null,
};

describe("Today Presentation State Selector", () => {
  it("correctly identifies runs awaiting approval using real backend contracts", () => {
    expect(
      isRunAwaitingApproval({
        status: "waiting_approval",
        output_status: "pending",
      } as Run),
    ).toBe(true);
    expect(
      isRunAwaitingApproval({
        status: "waiting_approval",
        output_status: null,
      } as Run),
    ).toBe(true);
    expect(
      isRunAwaitingApproval({
        status: "review_pending",
      } as Run),
    ).toBe(true);
    expect(
      isRunAwaitingApproval({
        status: "completed",
        output_status: "pending",
      } as Run),
    ).toBe(true);
    expect(
      isRunAwaitingApproval({
        status: "completed",
        output_status: null,
      } as Run),
    ).toBe(false);
    expect(
      isRunAwaitingApproval({
        status: "running",
        output_status: null,
      } as Run),
    ).toBe(false);
    expect(
      isRunAwaitingApproval({
        status: "approved",
        output_status: "approved",
      } as Run),
    ).toBe(false);
  });

  it("selects needs_workspace when no workspace is provided", () => {
    const state = selectTodayState({});
    expect(state.kind).toBe("needs_workspace");
    expect(state.actions[0]?.action).toBe("create_workspace");
  });

  it("selects error state when an error occurs", () => {
    const error = new Error("Gateway timeout");
    const state = selectTodayState({ workspace: mockWorkspace, error });
    expect(state.kind).toBe("error");
    expect(state.heading).toContain("couldn’t reach your autopilot");
    expect(state.actions[0]?.action).toBe("retry");
  });

  it("selects welcome moment for fresh Phase 1 workspace without fake duration timers", () => {
    const state = selectTodayState({
      workspace: mockWorkspace,
      workflow: mockWorkflow,
    });
    expect(state.kind).toBe("welcome");
    expect(state.phaseNumber).toBe(1);
    expect(state.actions[0]?.action).toBe("continue");
    expect(state.actions[0]?.label).toBe("Start with one question");
    expect(state.statusBadge.timeLabel).toBeUndefined();
  });

  it("selects question moment when a pending question exists without fake duration timers", () => {
    const question: PendingQuestion = {
      id: "7b0d7718-4e31-4e7a-9a99-b1d5225d2b0e",
      workspace_id: mockWorkspace.id,
      workflow_instance_id: mockWorkflow.workflowId,
      phase_instance_id: mockWorkflow.phaseInstanceId,
      question_key: "persona",
      prompt: "Who is your primary buyer persona?",
      options: [
        { id: "opt-1", label: "Seed Founders", description: "B2B SaaS" },
        { id: "opt-2", label: "Enterprise VPs", description: "Fortune 500" },
      ],
      allow_custom: true,
      selection_mode: "single",
      purpose: "Targeting brand voice angles",
      status: "pending",
      version: 1,
      created_at: "2026-10-09T00:00:00Z",
    };
    const state = selectTodayState({
      workspace: mockWorkspace,
      workflow: mockWorkflow,
      pendingQuestion: question,
    });
    expect(state.kind).toBe("question");
    expect(state.heading).toBe("Who is your primary buyer persona?");
    expect(state.actions[0]?.action).toBe("answer");
    expect(state.payload?.question?.id).toBe(question.id);
    expect(state.statusBadge.timeLabel).toBeUndefined();
  });

  it("selects thinking moment when run is executing without raw internal skill names", () => {
    const run: Run = {
      id: "8ec34220-cb0b-4d24-9317-d0d959a50e98",
      workspace_id: mockWorkspace.id,
      phase: 1,
      skill_name: "internal_brand_identity_prompt_v3",
      status: "running",
      approvals: [],
      artifacts: [],
      final_posts: [],
      created_at: "2026-10-09T00:00:00Z",
      updated_at: "2026-10-09T00:00:00Z",
    };
    const state = selectTodayState({
      workspace: mockWorkspace,
      workflow: mockWorkflow,
      activeRun: run,
    });
    expect(state.kind).toBe("thinking");
    expect(state.statusBadge.text).toBe("Researching & writing");
    expect(state.timeline[0]?.description).not.toContain(
      "internal_brand_identity_prompt_v3",
    );
    expect(state.timeline[0]?.description).toContain("Know your brand");
  });

  it("keeps a failed run visible and offers a safe retry", () => {
    const run: Run = {
      id: "8ec34220-cb0b-4d24-9317-d0d959a50e98",
      workspace_id: mockWorkspace.id,
      phase: 1,
      skill_name: "social-media-context-sms",
      status: "failed",
      error_code: "EXECUTION_FAILED",
      error_message: "The run exceeded its duration limit",
      approvals: [],
      artifacts: [],
      final_posts: [],
    };

    const state = selectTodayState({
      workspace: mockWorkspace,
      workflow: mockWorkflow,
      activeRun: run,
    });

    expect(state.kind).toBe("error");
    expect(state.heading).toBe("I couldn’t finish that step.");
    expect(state.actions[0]).toMatchObject({
      action: "retry",
      label: "Try this step again",
    });
    expect(state.payload?.activeRun?.id).toBe(run.id);
  });

  it("selects review moment for Phase 1 output awaiting user decision using waiting_approval contract", () => {
    const run: Run = {
      id: "8ec34220-cb0b-4d24-9317-d0d959a50e98",
      workspace_id: mockWorkspace.id,
      phase: 1,
      skill_name: "brand-identity-v1",
      status: "waiting_approval",
      output_status: "pending",
      review_revision: 1,
      output: {
        message: "Brand foundation ready.",
        artifacts: [
          {
            kind: "brand_foundation",
            version: 1,
            brandName: "Novi Studio",
            voiceTone: ["Authentic", "Insightful"],
            pillars: ["Technology", "Simplicity"],
            targetAudience: "Technical Founders",
            positioningSummary: "Autonomous B2B marketing engine",
          },
        ],
        context_updates: [],
        next_action: "request_approval",
      },
      approvals: [],
      artifacts: [],
      final_posts: [],
      created_at: "2026-10-09T00:00:00Z",
      updated_at: "2026-10-09T00:00:00Z",
    };
    const state = selectTodayState({
      workspace: mockWorkspace,
      workflow: mockWorkflow,
      activeRun: run,
    });
    expect(state.kind).toBe("review");
    expect(state.actions.map((a) => a.action)).toEqual([
      "approve",
      "revise",
      "reject",
    ]);
    expect(state.payload?.reviewRunId).toBe(run.id);
  });

  it("renders the content inside a completed proposed artifact", () => {
    const run: Run = {
      id: "8ec34220-cb0b-4d24-9317-d0d959a50e98",
      workspace_id: mockWorkspace.id,
      phase: 1,
      skill_name: "brand-identity-v1",
      status: "completed",
      output_status: "pending",
      review_revision: 1,
      output: {
        message: "Brand foundation ready.",
        artifacts: [{
          kind: "brand-foundation",
          slug: "brand-foundation",
          title: "Brand foundation",
          content: "# Post Gen Flow Fixed\n\nClear, dependable social media management.",
          metadata: {},
        }],
        context_updates: [],
        next_action: "none",
      },
      approvals: [],
      artifacts: [],
      final_posts: [],
    };

    const state = selectTodayState({
      workspace: mockWorkspace,
      workflow: mockWorkflow,
      activeRun: run,
    });

    expect(state.kind).toBe("review");
    expect(state.payload?.markdownFallback).toContain("Clear, dependable");
  });

  it("selects calendar moment for Phase 2 review deliverable", () => {
    const run: Run = {
      id: "8ec34220-cb0b-4d24-9317-d0d959a50e98",
      workspace_id: mockWorkspace.id,
      phase: 2,
      skill_name: "monthly-strategy-v1",
      status: "waiting_approval",
      output_status: "pending",
      review_revision: 1,
      output: {
        message: "Calendar draft ready.",
        artifacts: [
          {
            kind: "content_calendar",
            version: 1,
            sprint: "Sprint 1",
            week: 1,
            totalPosts: 5,
            schedule: [
              {
                day: "MON",
                platform: "linkedin",
                topic: "Architecture",
                format: "Authority",
              },
            ],
          },
        ],
        context_updates: [],
        next_action: "request_approval",
      },
      approvals: [],
      artifacts: [],
      final_posts: [],
      created_at: "2026-10-09T00:00:00Z",
      updated_at: "2026-10-09T00:00:00Z",
    };
    const state = selectTodayState({
      workspace: { ...mockWorkspace, current_phase: 2 },
      workflow: { ...mockWorkflow, phase: 2 },
      activeRun: run,
    });
    expect(state.kind).toBe("calendar");
    expect(state.heading).toContain("content calendar is ready for review");
  });

  it("selects qc moment for Phase 4 quality-control scorecard review", () => {
    const run: Run = {
      id: "8ec34220-cb0b-4d24-9317-d0d959a50e98",
      workspace_id: mockWorkspace.id,
      phase: 4,
      skill_name: "qc-scanner-v1",
      status: "waiting_approval",
      output_status: "pending",
      review_revision: 1,
      output: {
        message: "QC Scorecard compiled.",
        artifacts: [
          {
            kind: "qc_scorecard",
            version: 1,
            passedCount: 8,
            failedCount: 1,
            warnings: ["Hashtag count on X exceeds 2"],
            recommendations: ["Trim hashtags for better reach"],
          },
        ],
        context_updates: [],
        next_action: "request_approval",
      },
      approvals: [],
      artifacts: [],
      final_posts: [],
      created_at: "2026-10-09T00:00:00Z",
      updated_at: "2026-10-09T00:00:00Z",
    };
    const state = selectTodayState({
      workspace: { ...mockWorkspace, current_phase: 4 },
      workflow: { ...mockWorkflow, phase: 4 },
      activeRun: run,
    });
    expect(state.kind).toBe("qc");
    expect(state.heading).toContain("quality & compliance scorecard is ready");
    expect(state.payload?.qcScorecard?.passedCount).toBe(8);
    expect(state.payload?.qcScorecard?.failedCount).toBe(1);
    expect(state.actions.map((a) => a.action)).toEqual([
      "approve",
      "revise",
      "reject",
    ]);
  });

  it("does not invent zero quality metrics for a markdown Phase 4 review", () => {
    const run: Run = {
      id: "8ec34220-cb0b-4d24-9317-d0d959a50e98",
      workspace_id: mockWorkspace.id,
      phase: 4,
      skill_name: "post-formatter",
      status: "completed",
      output_status: "pending",
      review_revision: 1,
      output: {
        message: "Final post batch ready.",
        artifacts: [
          {
            kind: "final-post-batch",
            slug: "final-post-batch-sprint-1",
            title: "Final post batch",
            content: "# Final Post Batch\n\nFive posts are ready.",
            metadata: {},
          },
        ],
        context_updates: [],
        next_action: "request_approval",
      },
      approvals: [],
      artifacts: [],
      final_posts: [],
    };

    const state = selectTodayState({
      workspace: { ...mockWorkspace, current_phase: 4 },
      workflow: { ...mockWorkflow, phase: 4 },
      activeRun: run,
    });

    expect(state.kind).toBe("qc");
    expect(state.payload?.qcScorecard).toBeUndefined();
    expect(state.timeline[0]?.description).toBe("Detailed review ready");
    expect(state.timeline[0]?.description).not.toContain("0 checks");
  });

  it("selects cycle_complete moment for Phase 6 next-cycle planning", () => {
    const state = selectTodayState({
      workspace: { ...mockWorkspace, current_phase: 6 },
      workflow: {
        ...mockWorkflow,
        phase: 6,
        cycle: 1,
        phaseStatus: "completed",
      },
    });
    expect(state.kind).toBe("cycle_complete");
    expect(state.heading).toContain("Cycle 1 complete. Ready for Cycle 2");
    expect(state.actions[0]?.label).toContain("Start Cycle 2 strategy");
  });

  it("selects approved moment when run is approved", () => {
    const run: Run = {
      id: "8ec34220-cb0b-4d24-9317-d0d959a50e98",
      workspace_id: mockWorkspace.id,
      phase: 1,
      skill_name: "brand-identity-v1",
      status: "approved",
      approvals: [],
      artifacts: [],
      final_posts: [],
      created_at: "2026-10-09T00:00:00Z",
      updated_at: "2026-10-09T00:00:00Z",
    };
    const state = selectTodayState({
      workspace: mockWorkspace,
      workflow: mockWorkflow,
      activeRun: run,
    });
    expect(state.kind).toBe("approved");
    expect(state.actions[0]?.action).toBe("continue");
    expect(state.actions[0]?.label).toContain("Start Phase 2");
  });

  it("selects production moment when in Phase 3 without active review", () => {
    const state = selectTodayState({
      workspace: { ...mockWorkspace, current_phase: 3 },
      workflow: { ...mockWorkflow, phase: 3 },
    });
    expect(state.kind).toBe("production");
    expect(state.actions[0]?.action).toBe("continue");
  });

  it("shows real scheduled progress rather than a generic production claim", () => {
    const state = selectTodayState({
      workspace: { ...mockWorkspace, current_phase: 3 },
      workflow: {
        ...mockWorkflow,
        phase: 3,
        contentPlan: {
          total: 2,
          drafted: 1,
          slots: [
            { key: "slot-1", localDate: "2026-10-19", platform: "linkedin", topic: "Idea", format: "post", drafted: true },
            { key: "slot-2", localDate: "2026-10-20", platform: "x", topic: "Idea", format: "thread", drafted: false },
          ],
        },
      },
    });
    expect(state.heading).toBe("1 of 2 posts drafted.");
    expect(state.actions[0]?.label).toBe("Continue drafting posts");
    expect(state.payload?.productionPlan?.slots).toHaveLength(2);
  });

  it("selects posts moment when final posts are delivered", () => {
    const posts: FinalPost[] = [
      {
        publication_version: 1,
        id: "7b0d7718-4e31-4e7a-9a99-b1d5225d2b0e",
        workspace_id: mockWorkspace.id,
        run_id: "8ec34220-cb0b-4d24-9317-d0d959a50e98",
        source_artifact_id: "8ec34220-cb0b-4d24-9317-d0d959a50e98",
        logical_id: "8ec34220-cb0b-4d24-9317-d0d959a50e98",
        revision: 1,
        logical_key: "post-1",
        sprint: "Sprint 1",
        week: 1,
        local_date: "2026-10-10",
        timezone: "UTC",
        platform: "linkedin",
        campaign: "Autonomous Scaling",
        topic: "Systems",
        pillar: "Technology",
        content_format: "post",
        title: "Why autonomous systems matter",
        content:
          "Here is why autonomous systems matter for marketing leaders...",
        status: "ready",
        publication_status: "ready",
        created_at: "2026-10-09T00:00:00Z",
      },
    ];
    const state = selectTodayState({
      workspace: { ...mockWorkspace, current_phase: 5 },
      workflow: { ...mockWorkflow, phase: 5 },
      finalPosts: posts,
    });
    expect(state.kind).toBe("posts");
    expect(state.heading).toContain("latest platform-native posts");
    expect(state.actions[0]?.action).toBe("copy_post");
  });

  it("does not let retained posts hide a completed Phase 6 cycle", () => {
    const post = {
      id: "7b0d7718-4e31-4e7a-9a99-b1d5225d2b0e",
      workspace_id: mockWorkspace.id,
      run_id: "8ec34220-cb0b-4d24-9317-d0d959a50e98",
      source_artifact_id: "8ec34220-cb0b-4d24-9317-d0d959a50e98",
      logical_id: "8ec34220-cb0b-4d24-9317-d0d959a50e98",
      revision: 1,
      logical_key: "post-1",
      sprint: "Sprint 1",
      week: 1,
      local_date: "2026-10-10",
      timezone: "UTC",
      platform: "linkedin",
      campaign: "Campaign",
      topic: "Systems",
      pillar: "Technology",
      content_format: "post",
      title: "A post",
      content: "Post content",
      status: "approved",
      publication_status: "ready",
    } satisfies FinalPost;
    const state = selectTodayState({
      workspace: { ...mockWorkspace, current_phase: 6 },
      workflow: {
        ...mockWorkflow,
        phase: 6,
        phaseStatus: "completed",
      },
      finalPosts: [post],
    });

    expect(state.kind).toBe("cycle_complete");
  });

  it("shows the backend current phase after an older run was approved", () => {
    const approvedPhaseOneRun: Run = {
      id: "8ec34220-cb0b-4d24-9317-d0d959a50e98",
      workspace_id: mockWorkspace.id,
      phase: 1,
      skill_name: "brand-identity-v1",
      status: "approved",
      approvals: [],
      artifacts: [],
      final_posts: [],
      created_at: "2026-10-09T00:00:00Z",
      updated_at: "2026-10-09T00:00:00Z",
    };
    const state = selectTodayState({
      workspace: { ...mockWorkspace, current_phase: 2 },
      workflow: { ...mockWorkflow, phase: 2 },
      activeRun: approvedPhaseOneRun,
    });

    expect(state.kind).toBe("welcome");
    expect(state.phaseNumber).toBe(2);
    expect(state.heading).toContain("plan");
  });

  it("does not claim Phase 6 is complete while it is still active", () => {
    const state = selectTodayState({
      workspace: { ...mockWorkspace, current_phase: 6 },
      workflow: { ...mockWorkflow, phase: 6, phaseStatus: "active" },
    });

    expect(state.kind).toBe("welcome");
    expect(state.actions[0]?.label).toBe("Review performance");
  });

  it("selects guided interview moment when active in Phase 1", () => {
    const state = selectTodayState({
      workspace: mockWorkspace,
      workflow: mockWorkflow,
      interview: {
        authority: "guided",
        session: {
          id: "11111111-1111-4111-8111-111111111111",
          workspace_id: mockWorkspace.id,
          questionnaire_id: "core-brand-intake",
          questionnaire_version: "1.0.0",
          status: "in_progress",
          version: 2,
          started_at: "2026-10-10T00:00:00Z",
          updated_at: "2026-10-10T00:00:00Z",
        },
        progress: {
          currentIndex: 2,
          totalQuestions: 5,
          completedCount: 1,
          percentComplete: 20,
        },
        currentQuestion: {
          id: "target_audience",
          version: 1,
          meaning: "Audience targeting",
          prompt: "Who are you primarily speaking to?",
          supportingText: "Describe your ideal customer or target niche.",
          examples: ["Tech founders", "Marketing directors"],
          answerMode: "single",
          required: true,
          allowCustom: true,
          customTextRequired: false,
          minimumSelections: 1,
          maximumSelections: 1,
          allowSelectAll: false,
          activeOptionSet: {
            id: "opt-1",
            origin: "curated",
            options: [
              { id: "b2b_tech", label: "B2B Tech leaders" },
              { id: "consumers", label: "Direct-to-consumer shoppers" },
            ],
          },
        },
      },
    });

    expect(state.kind).toBe("interview");
    expect(state.phaseNumber).toBe(1);
    expect(state.kicker).toContain("Question 2 of 5");
    expect(state.heading).toBe("Who are you primarily speaking to?");
    expect(state.actions[0]?.action).toBe("answer");
  });

  it("selects briefing complete welcome state when guided interview is completed", () => {
    const state = selectTodayState({
      workspace: mockWorkspace,
      workflow: mockWorkflow,
      interview: {
        authority: "guided",
        session: {
          id: "11111111-1111-4111-8111-111111111111",
          workspace_id: mockWorkspace.id,
          questionnaire_id: "core-brand-intake",
          questionnaire_version: "1.0.0",
          status: "completed",
          version: 6,
          started_at: "2026-10-10T00:00:00Z",
          updated_at: "2026-10-10T00:00:00Z",
        },
        progress: {
          currentIndex: 5,
          totalQuestions: 5,
          completedCount: 5,
          percentComplete: 100,
        },
        currentQuestion: null,
      },
    });

    expect(state.kind).toBe("welcome");
    expect(state.heading).toContain("Briefing complete");
    expect(state.actions[0]?.label).toBe("Synthesize brand foundation");
  });

  it("prioritizes active thinking run over guided interview", () => {
    const runningRun: Run = {
      id: "11111111-1111-4111-8111-111111111111",
      workspace_id: mockWorkspace.id,
      phase: 1,
      skill_name: "brand-foundations",
      status: "running",
      approvals: [],
      artifacts: [],
      final_posts: [],
    };
    const state = selectTodayState({
      workspace: mockWorkspace,
      workflow: mockWorkflow,
      activeRun: runningRun,
      interview: {
        authority: "guided",
        session: {
          id: "22222222-2222-4222-8222-222222222222",
          workspace_id: mockWorkspace.id,
          questionnaire_id: "core-brand-intake",
          questionnaire_version: "1.0.0",
          status: "in_progress",
          version: 1,
          started_at: "2026-10-10T00:00:00Z",
          updated_at: "2026-10-10T00:00:00Z",
        },
        currentQuestion: {
          id: "brand_voice",
          version: 1,
          meaning: "Brand voice",
          prompt: "What is your voice?",
          supportingText: "Describe tone",
          examples: [],
          answerMode: "single",
          required: true,
          allowCustom: true,
          customTextRequired: false,
          minimumSelections: 1,
          maximumSelections: 1,
          allowSelectAll: false,
          activeOptionSet: {
            id: "opt-2",
            origin: "curated",
            options: [{ id: "bold", label: "Bold & Direct" }],
          },
        },
      },
    });

    expect(state.kind).toBe("thinking");
    expect(state.phaseLabel).toBe("Agent working");
  });
});
