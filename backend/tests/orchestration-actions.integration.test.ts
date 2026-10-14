import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import type { LlmAction } from "../src/domain/schemas.js";
import { buildContainer, type Container } from "../src/container.js";
import { PermanentJobError } from "../src/db/jobs.js";
import { migrate } from "../src/db/migrate.js";
import type { LlmProvider } from "../src/llm/provider.js";
import { executeClaimedRun } from "./helpers/jobs.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const integration = describe.skipIf(!databaseUrl);

integration("controlled model actions", () => {
  let container: Container;
  let queuedActions: LlmAction[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.DATABASE_SSL = "false";
    process.env.NODE_ENV = "test";
    await migrate();
    const llm: LlmProvider = {
      async execute() {
        const action = queuedActions.shift();
        if (!action) throw new Error("The test provider has no queued action");
        return {
          action,
          provider: "test",
          model: "deterministic",
          providerResponseId: `response-${queuedActions.length}`,
          usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        };
      },
    };
    const config = loadConfig({
      ...process.env,
      DATABASE_URL: databaseUrl,
      DATABASE_SSL: "false",
      SKILLS_ROOT: repositoryRoot,
      NODE_ENV: "test",
      LLM_PROVIDER: "mock",
      LOG_LEVEL: "silent",
    });
    container = await buildContainer({ config, llm });
    await container.pool.query("TRUNCATE organizations CASCADE");
  }, 30_000);

  afterEach(async () => {
    queuedActions = [];
    await container.pool.query(
      `DELETE FROM job_queue
       WHERE type = 'execute_workflow_run'
         AND payload->>'runId' IN (SELECT id::text FROM workflow_runs)`,
    );
    await container.pool.query("TRUNCATE organizations CASCADE");
  });

  afterAll(async () => {
    await container?.pool.end();
  });

  async function createWorkspace(label: string) {
    const slug = label.toLowerCase().replaceAll(" ", "-");
    const organization = await container.pool.query(
      "INSERT INTO organizations(name, slug) VALUES ($1, $2) RETURNING id",
      [`${label} Org`, `${slug}-org`],
    );
    const organizationId = String(organization.rows[0]?.id);
    const workspace = await container.store.createWorkspace({
      organizationId,
      name: label,
      slug,
      timezone: "UTC",
      actor: "test:owner",
    });
    return { organizationId, workspace };
  }

  async function moveToPhase(
    workspaceId: string,
    phase: number,
    cycle = 1,
  ): Promise<void> {
    const client = await container.pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(
        `SELECT workflow.id AS workflow_id, workflow.current_phase_instance_id AS phase_instance_id
         FROM workflow_instances AS workflow
         WHERE workflow.workspace_id = $1
         FOR UPDATE`,
        [workspaceId],
      );
      const row = current.rows[0] as { workflow_id: string; phase_instance_id: string };
      await client.query(
        `UPDATE phase_instances
         SET status = 'completed', completed_at = now(), updated_at = now()
         WHERE id = $1`,
        [row.phase_instance_id],
      );
      const next = await client.query(
        `INSERT INTO phase_instances(
           workflow_instance_id, workspace_id, phase, cycle, recipe_version
         ) VALUES ($1, $2, $3, $4, '1.0.0') RETURNING id`,
        [row.workflow_id, workspaceId, phase, cycle],
      );
      await client.query(
        `UPDATE workflow_instances
         SET current_phase_instance_id = $2, updated_at = now()
         WHERE id = $1`,
        [row.workflow_id, next.rows[0]?.id],
      );
      await client.query(
        "UPDATE workspaces SET current_phase = $2, status = 'ready' WHERE id = $1",
        [workspaceId, phase],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  it("persists one adaptive question and blocks continue until it is answered", async () => {
    const { organizationId, workspace } = await createWorkspace("Question Action");
    await moveToPhase(workspace.id, 2);
    queuedActions = [{
      type: "ask_user",
      questionKey: "onboarding.primary_goal",
      prompt: "What should social media achieve first?",
      purpose: "Prioritize onboarding.",
      options: [
        { id: "leads", label: "Generate leads", description: "Prioritize enquiries." },
        { id: "awareness", label: "Build awareness", description: "Prioritize reach." },
      ],
      selectionMode: "multiple",
      allowCustom: true,
    }];
    const run = await container.orchestration.enqueue({
      organizationId,
      actor: "user:test-owner",
      workspaceId: workspace.id,
      skillName: "content-strategy-sms",
      payload: {},
      completePhase: false,
      idempotencyKey: "question-action-1",
    });

    await executeClaimedRun(container, run.id);

    const pending = await container.workflowStore.getPendingQuestion(workspace.id, organizationId);
    expect(pending).toMatchObject({ question_key: "onboarding.primary_goal", status: "pending" });
    expect(await container.store.getRun(run.id, organizationId)).toMatchObject({
      status: "completed",
      output_status: null,
    });
    await expect(container.orchestration.enqueueNext({
      organizationId,
      actor: "user:test-owner",
      workspaceId: workspace.id,
      idempotencyKey: "question-action-2",
    })).rejects.toMatchObject({ code: "answer_required" });

    const answerRequest = {
      organizationId,
      actor: "user:test-owner",
      workspaceId: workspace.id,
      questionId: pending!.id,
      expectedVersion: pending!.version,
      answer: { type: "option", optionId: "leads" },
      idempotencyKey: "question-answer-action-1",
    } as const;
    const resumed = await container.orchestration.answerQuestion(answerRequest);
    expect(resumed.answer).toMatchObject({ questionId: pending!.id, replayed: false });
    expect(resumed.run).toMatchObject({ status: "queued", phase: 2 });
    const replay = await container.orchestration.answerQuestion(answerRequest);
    expect(replay.answer).toMatchObject({ replayed: true });
    expect(replay.run.id).toBe(resumed.run.id);
    expect(await container.workflowStore.getPendingQuestion(workspace.id, organizationId)).toBeNull();
  });

  it("executes an allowlisted read tool and persists its exact result before resuming", async () => {
    const { organizationId, workspace } = await createWorkspace("Tool Action");
    await moveToPhase(workspace.id, 2);
    queuedActions = [
      {
        type: "request_tool",
        tool: "list_approved_artifacts",
        arguments: { limit: 5, kinds: ["post-draft"] },
      },
      {
        type: "propose_output",
        message: "Strategy ready for review.",
        artifacts: [{
          kind: "content-strategy",
          slug: "strategy-v1",
          title: "Content strategy",
          content: "A focused content strategy.",
          metadata: {},
        }],
        contextUpdates: [{
          key: "strategy.campaign_backlog",
          markdown: "Campaign backlog",
          data: {},
        }],
      },
    ];
    const run = await container.orchestration.enqueueNext({
      organizationId,
      actor: "user:test-owner",
      workspaceId: workspace.id,
      idempotencyKey: "tool-action-1",
    });

    await executeClaimedRun(container, run.id);

    const steps = await container.pool.query(
      "SELECT output FROM workflow_steps WHERE run_id = $1 ORDER BY ordinal",
      [run.id],
    );
    expect(steps.rows).toHaveLength(2);
    expect(steps.rows[0]?.output).toMatchObject({
      action: { type: "request_tool" },
      runtimeResult: {
        tool: "list_approved_artifacts",
        query: { limit: 5, kinds: ["post-draft"] },
        items: [],
      },
    });
    expect((await container.pool.query(
      "SELECT count(*)::integer AS count FROM llm_usage WHERE run_id = $1",
      [run.id],
    )).rows[0]?.count).toBe(2);
    const messages = await container.pool.query(
      `SELECT role, kind, data
       FROM conversation_messages
       WHERE workspace_id = $1
       ORDER BY ordinal`,
      [workspace.id],
    );
    expect(messages.rows).toEqual([
      expect.objectContaining({ role: "assistant", kind: "tool_request" }),
      expect.objectContaining({
        role: "tool",
        kind: "tool_result",
        data: expect.objectContaining({
          result: expect.objectContaining({ tool: "list_approved_artifacts", items: [] }),
        }),
      }),
      expect.objectContaining({ role: "assistant", kind: "action" }),
    ]);
  });

  it("runs only an allowlisted optional skill from the exact pinned bundle", async () => {
    const { organizationId, workspace } = await createWorkspace("Optional Action");
    await moveToPhase(workspace.id, 2);
    queuedActions = [
      {
        type: "request_optional_skill",
        skill: "marketing-plan",
        input: { instruction: "Stress-test the plan." },
      },
      { type: "complete_step", message: "The optional plan review is complete." },
      {
        type: "propose_output",
        message: "Strategy ready for review.",
        artifacts: [{
          kind: "content-strategy",
          slug: "strategy-v1",
          title: "Content strategy",
          content: "A focused content strategy.",
          metadata: {},
        }],
        contextUpdates: [],
      },
    ];
    const run = await container.orchestration.enqueueNext({
      organizationId,
      actor: "user:test-owner",
      workspaceId: workspace.id,
      idempotencyKey: "optional-action-1",
    });

    await executeClaimedRun(container, run.id);

    const steps = await container.pool.query(
      "SELECT skill_name FROM workflow_steps WHERE run_id = $1 ORDER BY ordinal",
      [run.id],
    );
    expect(steps.rows.map((row) => row.skill_name)).toEqual([
      "content-strategy-sms",
      "marketing-plan",
      "content-strategy-sms",
    ]);
    expect((await container.pool.query(
      "SELECT count(*)::integer AS count FROM llm_usage WHERE run_id = $1",
      [run.id],
    )).rows[0]?.count).toBe(3);
  });

  it("records the over-budget provider call before failing permanently", async () => {
    const { organizationId, workspace } = await createWorkspace("Budget Action");
    const originalLimit = container.config.MAX_MODEL_TOKENS_PER_RUN;
    Object.assign(container.config, { MAX_MODEL_TOKENS_PER_RUN: 1 });
    queuedActions = [{ type: "complete_step", message: "Done." }];
    const run = await container.orchestration.enqueue({
      organizationId,
      actor: "user:test-owner",
      workspaceId: workspace.id,
      skillName: "social-media-context-sms",
      payload: {},
      completePhase: false,
      idempotencyKey: "budget-action-1",
    });

    try {
      await expect(executeClaimedRun(container, run.id)).rejects.toBeInstanceOf(PermanentJobError);
      expect((await container.pool.query(
        "SELECT count(*)::integer AS count FROM llm_usage WHERE run_id = $1",
        [run.id],
      )).rows[0]?.count).toBe(1);
    } finally {
      Object.assign(container.config, { MAX_MODEL_TOKENS_PER_RUN: originalLimit });
    }
  });

  it("records a denied tool request and its provider usage without executing it", async () => {
    const { organizationId, workspace } = await createWorkspace("Denied Tool");
    queuedActions = [{
      type: "request_tool",
      tool: "list_approved_artifacts",
      arguments: { limit: 5, kinds: [] },
    }];
    const run = await container.orchestration.enqueue({
      organizationId,
      actor: "user:test-owner",
      workspaceId: workspace.id,
      skillName: "social-media-context-sms",
      payload: {},
      completePhase: false,
      idempotencyKey: "denied-tool-1",
    });

    await expect(executeClaimedRun(container, run.id)).rejects
      .toBeInstanceOf(PermanentJobError);

    expect((await container.pool.query(
      "SELECT count(*)::integer AS count FROM llm_usage WHERE run_id = $1",
      [run.id],
    )).rows[0]?.count).toBe(1);
    const messages = await container.pool.query(
      `SELECT role, kind, data
       FROM conversation_messages
       WHERE workspace_id = $1
       ORDER BY ordinal`,
      [workspace.id],
    );
    expect(messages.rows).toEqual([
      expect.objectContaining({ role: "assistant", kind: "tool_request" }),
      expect.objectContaining({
        role: "system",
        kind: "error",
        data: expect.objectContaining({
          result: expect.objectContaining({ rejected: true }),
        }),
      }),
    ]);
  });

  it("auto-advances phase 3 in both compatibility and durable workflow state", async () => {
    const { organizationId, workspace } = await createWorkspace("Automatic Transition");
    await moveToPhase(workspace.id, 3);
    queuedActions = [{
      type: "propose_output",
      message: "The production batch is complete.",
      artifacts: [{
        kind: "post-draft",
        slug: "batch-v1",
        title: "Post batch",
        content: "Platform-native drafts.",
        metadata: {},
      }],
      contextUpdates: [],
    }];
    const run = await container.orchestration.enqueue({
      organizationId,
      actor: "system:test",
      workspaceId: workspace.id,
      skillName: "post-writer-sms",
      payload: { content_slots: [{
        key: "cal-00000000000000000000000000000001-1",
        localDate: "2026-10-19", platform: "linkedin", topic: "A useful tip", format: "post",
      }] },
      completePhase: true,
      idempotencyKey: "automatic-transition-1",
    });

    await executeClaimedRun(container, run.id);

    expect(await container.store.getWorkspace(workspace.id, organizationId))
      .toMatchObject({ current_phase: 4, status: "ready" });
    expect(await container.workflowStore.getState(workspace.id, organizationId))
      .toMatchObject({ phase: 4, cycle: 1, phaseStatus: "active" });
  });

  it("writes every approved calendar slot before advancing and rejects a partial final batch", async () => {
    const { organizationId, workspace } = await createWorkspace("Scheduled Week");
    await moveToPhase(workspace.id, 3);
    await container.pool.query(
      `INSERT INTO artifacts(workspace_id, kind, slug, title, content, metadata, status)
       VALUES ($1, 'content-calendar', 'scheduled-week', 'Scheduled week', $2, '{}'::jsonb, 'approved')`,
      [workspace.id, `Week of October 21, 2026
| Day | Platform | Topic / Angle | Format |
| --- | --- | --- | --- |
| Monday | LinkedIn | Planning tip | Post |
| Tuesday | X | Quick tip | Thread |
| Wednesday | LinkedIn | Founder lesson | Post |
| Thursday | X | Common mistake | Post |`],
    );
    queuedActions = [{
      type: "propose_output", message: "Hooks ready", contextUpdates: [],
      artifacts: [{ kind: "hook-batch", slug: "hooks", title: "Hooks", content: "Four hooks", metadata: {} }],
    }];
    const hook = await container.orchestration.enqueue({
      organizationId, actor: "user:test-owner", workspaceId: workspace.id,
      skillName: "hook-writer-sms", payload: {}, completePhase: false,
      idempotencyKey: "scheduled-hooks",
    });
    await executeClaimedRun(container, hook.id);
    await container.orchestration.decide({
      organizationId, runId: hook.id, approved: true, actor: "user:test-owner", note: null,
    });

    const first = await container.orchestration.enqueueNext({
      organizationId, actor: "user:test-owner", workspaceId: workspace.id,
      idempotencyKey: "scheduled-first",
    });
    expect(first.input.content_slots).toHaveLength(3);
    expect(first.complete_phase).toBe(false);
    queuedActions = [{
      type: "propose_output", message: "Three drafts ready", contextUpdates: [],
      artifacts: [1, 2, 3].map((ordinal) => ({
        kind: "post-draft", slug: `draft-${ordinal}`, title: `Draft ${ordinal}`,
        content: `Scheduled post ${ordinal}`, metadata: {},
      })),
    }];
    await executeClaimedRun(container, first.id);
    expect(await container.store.getWorkspace(workspace.id, organizationId))
      .toMatchObject({ current_phase: 3, status: "running" });
    expect((await container.store.getCalendarWorklist(workspace.id, organizationId)).writtenKeys.size)
      .toBe(3);

    const queued = await container.pool.query(
      `SELECT id, input, complete_phase FROM workflow_runs
       WHERE workspace_id = $1 AND skill_name = 'post-writer-sms' AND status = 'queued'`,
      [workspace.id],
    );
    expect(queued.rows).toHaveLength(1);
    expect(queued.rows[0].input.content_slots).toHaveLength(1);
    expect(queued.rows[0].complete_phase).toBe(true);
    queuedActions = [{
      type: "propose_output", message: "Final draft ready", contextUpdates: [],
      artifacts: [{ kind: "post-draft", slug: "draft-4", title: "Draft 4",
        content: "Scheduled post 4", metadata: {} }],
    }];
    await executeClaimedRun(container, String(queued.rows[0].id));
    expect(await container.store.getWorkspace(workspace.id, organizationId))
      .toMatchObject({ current_phase: 4, status: "ready" });
    expect((await container.pool.query(
      `SELECT count(*)::integer AS count FROM artifacts
       WHERE workspace_id = $1 AND kind = 'post-draft' AND status = 'approved'`,
      [workspace.id],
    )).rows[0].count).toBe(4);

    const slots = (await container.store.getCalendarWorklist(workspace.id, organizationId)).slots;
    queuedActions = [{
      type: "request_approval", message: "One post is ready", contextUpdates: [],
      artifacts: [{ kind: "final-post-batch", slug: "incomplete-batch", title: "Incomplete",
        content: "One of four", metadata: {} }],
      finalPosts: [{ logicalKey: slots[0]!.key, sprint: "October week", week: 43,
        localDate: slots[0]!.localDate, platform: slots[0]!.platform,
        campaign: null, topic: slots[0]!.topic, pillar: null, format: "post",
        title: "Only one", content: "Only one post", pinnedComment: null, metadata: {} }],
    }];
    const formatter = await container.orchestration.enqueue({
      organizationId, actor: "user:test-owner", workspaceId: workspace.id,
      skillName: "post-formatter", payload: { content_slots: slots }, completePhase: true,
      idempotencyKey: "scheduled-incomplete-final",
    });
    const originalActions = container.config.MAX_MODEL_ACTIONS_PER_RUN;
    Object.assign(container.config, { MAX_MODEL_ACTIONS_PER_RUN: 1 });
    try {
      await expect(executeClaimedRun(container, formatter.id)).rejects
        .toThrow("calendar requires 4");
    } finally {
      Object.assign(container.config, { MAX_MODEL_ACTIONS_PER_RUN: originalActions });
    }
    expect((await container.pool.query(
      "SELECT count(*)::integer AS count FROM final_posts WHERE workspace_id = $1",
      [workspace.id],
    )).rows[0].count).toBe(0);
  });

  it("loops an approved phase 6 calibration to phase 2 in a new durable cycle", async () => {
    const { organizationId, workspace } = await createWorkspace("Approval Transition");
    await moveToPhase(workspace.id, 6);
    queuedActions = [{
      type: "request_approval",
      message: "Please approve the strategy calibration.",
      artifacts: [{
        kind: "strategy-calibration",
        slug: "calibration-v1",
        title: "Strategy calibration",
        content: "Prioritize the strongest content pattern.",
        metadata: {},
      }],
      contextUpdates: [{
        key: "analytics.performance_patterns",
        markdown: "A repeatable winning pattern.",
        data: {},
      }],
    }];
    const run = await container.orchestration.enqueue({
      organizationId,
      actor: "system:test",
      workspaceId: workspace.id,
      skillName: "content-pattern-analyzer-sms",
      payload: {},
      completePhase: true,
      idempotencyKey: "approval-transition-1",
    });
    await executeClaimedRun(container, run.id);
    expect(await container.store.getRun(run.id, organizationId))
      .toMatchObject({ status: "waiting_approval", output_status: "pending" });

    await container.orchestration.decide({
      organizationId,
      runId: run.id,
      approved: true,
      actor: "user:test-owner",
      note: "Approved for the next sprint.",
    });

    expect(await container.store.getWorkspace(workspace.id, organizationId))
      .toMatchObject({ current_phase: 2, status: "ready" });
    expect(await container.workflowStore.getState(workspace.id, organizationId))
      .toMatchObject({ phase: 2, cycle: 2, phaseStatus: "active" });
  });
});
