import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { ApiKeyService } from "../src/auth/api-keys.js";
import { loadConfig } from "../src/config.js";
import { buildContainer, type Container } from "../src/container.js";
import { migrate } from "../src/db/migrate.js";
import type { LlmAction } from "../src/domain/schemas.js";
import type { LlmProvider, LlmRequest } from "../src/llm/provider.js";
import { executeClaimedRun } from "./helpers/jobs.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const integration = describe.skipIf(!databaseUrl);

integration("exact review revisions and structured final posts", () => {
  let container: Container;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let actions: LlmAction[] = [];
  let requests: LlmRequest[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.DATABASE_SSL = "false";
    process.env.NODE_ENV = "test";
    await migrate();
    const llm: LlmProvider = {
      async execute(request) {
        requests.push(request);
        const action = actions.shift();
        if (!action) throw new Error("No queued review test action");
        return {
          action,
          provider: "test",
          model: "review-test",
          providerResponseId: `review-${requests.length}`,
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
      RATE_LIMIT_MAX: "1000",
    });
    container = await buildContainer({ config, llm });
    app = await buildApp(container);
  }, 30_000);

  afterEach(async () => {
    actions = [];
    requests = [];
    await container.pool.query("DELETE FROM job_queue");
    await container.pool.query("TRUNCATE organizations CASCADE");
  });

  afterAll(async () => {
    await app?.close();
  });

  async function createWorkspace(label: string, timezone = "UTC") {
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
      timezone,
      actor: "user:test-owner",
    });
    return { organizationId, workspace };
  }

  async function moveToPhase(workspaceId: string, phase: number): Promise<void> {
    const client = await container.pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(
        `SELECT workflow.id AS workflow_id, workflow.current_phase_instance_id AS phase_instance_id
         FROM workflow_instances AS workflow
         WHERE workflow.workspace_id = $1 FOR UPDATE`,
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
         ) VALUES ($1, $2, $3, 1, '1.0.0') RETURNING id`,
        [row.workflow_id, workspaceId, phase],
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

  async function executeQueued(runId: string): Promise<void> {
    await executeClaimedRun(container, runId);
  }

  it("revises an exact output, preserves lineage, and promotes only the winning revision", async () => {
    const { organizationId, workspace } = await createWorkspace("Revision Brand");
    actions.push({
      type: "request_approval",
      message: "Review the first profile blueprint.",
      artifacts: [{
        kind: "profile-blueprint",
        slug: "profile-blueprint",
        title: "Profile blueprint",
        content: "Old profile blueprint",
        metadata: {},
      }],
      contextUpdates: [{
        key: "brand.profile_funnels",
        markdown: "Old profile context",
        data: { version: 1 },
      }],
    });
    const first = await container.orchestration.enqueue({
      organizationId,
      actor: "user:test-owner",
      workspaceId: workspace.id,
      skillName: "profile-optimizer",
      payload: {},
      completePhase: true,
      idempotencyKey: "profile-review-1",
    });
    await executeQueued(first.id);
    expect(first.review_revision).toBe(1);

    const revision = await container.orchestration.requestRevision({
      organizationId,
      actor: "user:test-owner",
      runId: first.id,
      expectedReviewRevision: 1,
      instructions: "Make the profile promise more specific.",
      idempotencyKey: "profile-revision-1",
    });
    expect(revision).toMatchObject({
      review_thread_id: first.review_thread_id,
      review_revision: 2,
      supersedes_run_id: first.id,
      revision_instructions: "Make the profile promise more specific.",
    });
    const replay = await container.orchestration.requestRevision({
      organizationId,
      actor: "user:test-owner",
      runId: first.id,
      expectedReviewRevision: 1,
      instructions: "Make the profile promise more specific.",
      idempotencyKey: "profile-revision-1",
    });
    expect(replay.id).toBe(revision.id);
    await expect(container.orchestration.decide({
      organizationId,
      actor: "user:test-owner",
      runId: first.id,
      approved: true,
      note: null,
    })).rejects.toMatchObject({ code: "run_not_awaiting_decision" });
    expect((await container.store.listContext(workspace.id, organizationId))).toEqual([]);

    actions.push({
      type: "request_approval",
      message: "Review the corrected profile blueprint.",
      artifacts: [{
        kind: "profile-blueprint",
        slug: "profile-blueprint",
        title: "Profile blueprint",
        content: "New specific profile blueprint",
        metadata: {},
      }],
      contextUpdates: [{
        key: "brand.profile_funnels",
        markdown: "New specific profile context",
        data: { version: 2 },
      }],
    });
    await executeQueued(revision.id);
    expect(requests.at(-1)?.userPrompt).toContain("Make the profile promise more specific.");
    expect(requests.at(-1)?.userPrompt).toContain("Old profile blueprint");

    const decisions = await Promise.allSettled([
      container.orchestration.decide({
        organizationId,
        actor: "user:test-owner",
        runId: revision.id,
        approved: true,
        note: "Approved correction",
      }),
      container.orchestration.decide({
        organizationId,
        actor: "user:test-owner",
        runId: revision.id,
        approved: true,
        note: "Duplicate click",
      }),
    ]);
    expect(decisions.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(decisions.filter((item) => item.status === "rejected")).toHaveLength(1);

    expect(await container.store.listContext(workspace.id, organizationId)).toEqual([
      expect.objectContaining({
        key: "brand.profile_funnels",
        markdown: "New specific profile context",
        version: 1,
      }),
    ]);
    const artifacts = await container.pool.query(
      `SELECT id, run_id, logical_id, parent_revision_id, version, status, revision_instructions
       FROM artifacts WHERE workspace_id = $1 ORDER BY version`,
      [workspace.id],
    );
    expect(artifacts.rows).toEqual([
      expect.objectContaining({
        run_id: first.id,
        version: 1,
        status: "rejected",
        revision_instructions: "Make the profile promise more specific.",
      }),
      expect.objectContaining({
        run_id: revision.id,
        parent_revision_id: artifacts.rows[0]?.id,
        version: 2,
        status: "approved",
      }),
    ]);
    expect(artifacts.rows[1]?.logical_id).toBe(artifacts.rows[0]?.logical_id);
  });

  it("stores, filters, groups, and cursor-paginates timezone-safe final posts", async () => {
    const { organizationId, workspace } = await createWorkspace(
      "Final Posts Brand",
      "America/New_York",
    );
    await moveToPhase(workspace.id, 4);
    actions.push({
      type: "request_approval",
      message: "Review final posts.",
      artifacts: [{
        kind: "final-post-batch",
        slug: "sprint-one-final-posts",
        title: "Sprint one final posts",
        content: "Structured posts are attached.",
        metadata: {},
      }],
      contextUpdates: [],
      finalPosts: [
        {
          logicalKey: "launch-linkedin-sunday",
          sprint: "Sprint 1",
          week: 1,
          localDate: "2026-03-08",
          platform: "linkedin",
          campaign: "launch",
          topic: "Launch lesson",
          pillar: "education",
          format: "text",
          title: "A launch lesson",
          content: "Copy-ready LinkedIn post.",
          pinnedComment: "What would you add?",
          metadata: {},
        },
        {
          logicalKey: "launch-x-saturday",
          sprint: "Sprint 1",
          week: 1,
          localDate: "2026-03-07",
          platform: "x",
          campaign: "launch",
          topic: "Launch note",
          pillar: null,
          format: "thread",
          title: "Launch thread",
          content: "Copy-ready X thread.",
          pinnedComment: null,
          metadata: {},
        },
      ],
    });
    const run = await container.orchestration.enqueue({
      organizationId,
      actor: "user:test-owner",
      workspaceId: workspace.id,
      skillName: "post-formatter",
      payload: {},
      completePhase: true,
      idempotencyKey: "final-posts-1",
    });
    await executeQueued(run.id);

    const firstPage = await container.contentStore.listFinalPosts({
      workspaceId: workspace.id,
      organizationId,
      limit: 1,
      cursor: null,
    });
    expect(firstPage.items[0]).toMatchObject({
      local_date: "2026-03-08",
      day_of_week: 7,
      timezone: "America/New_York",
    });
    expect(firstPage.nextCursor).toEqual(expect.any(String));

    const artifact = await container.pool.query(
      "SELECT id FROM artifacts WHERE run_id = $1 AND kind = 'final-post-batch'",
      [run.id],
    );
    await container.pool.query(
      `INSERT INTO final_posts(
         workspace_id, run_id, source_artifact_id, logical_key, sprint, week,
         local_date, timezone, platform, campaign, topic, content_format,
         title, content, created_by
       ) VALUES ($1, $2, $3, 'newer-insert', 'Sprint 1', 1, '2026-03-09',
                 'America/New_York', 'instagram', 'launch', 'Newer post',
                 'caption', 'Newer post', 'Newer copy', 'test:fixture')`,
      [workspace.id, run.id, artifact.rows[0]?.id],
    );
    const secondPage = await container.contentStore.listFinalPosts({
      workspaceId: workspace.id,
      organizationId,
      limit: 1,
      cursor: firstPage.nextCursor,
    });
    expect(secondPage.items[0]).toMatchObject({ local_date: "2026-03-07", platform: "x" });
    expect(secondPage.items[0]?.id).not.toBe(firstPage.items[0]?.id);
    await expect(container.contentStore.listFinalPosts({
      workspaceId: workspace.id,
      organizationId,
      limit: 1,
      cursor: "not-a-cursor",
    })).rejects.toMatchObject({ code: "invalid_cursor" });

    const revision = await container.orchestration.requestRevision({
      organizationId,
      actor: "user:test-owner",
      runId: run.id,
      expectedReviewRevision: 1,
      instructions: "Move the LinkedIn post to Tuesday and sharpen the hook.",
      idempotencyKey: "final-posts-revision-1",
    });
    actions.push({
      type: "request_approval",
      message: "Review corrected final posts.",
      artifacts: [{
        kind: "final-post-batch",
        slug: "sprint-one-final-posts",
        title: "Sprint one final posts",
        content: "Corrected structured posts are attached.",
        metadata: {},
      }],
      contextUpdates: [],
      finalPosts: [{
        logicalKey: "launch-linkedin-sunday",
        sprint: "Sprint 1",
        week: 1,
        localDate: "2026-03-10",
        platform: "linkedin",
        campaign: "launch",
        topic: "Sharper launch lesson",
        pillar: "education",
        format: "text",
        title: "A sharper launch lesson",
        content: "Revised copy-ready LinkedIn post.",
        pinnedComment: "What would you add?",
        metadata: {},
      }],
    });
    await executeQueued(revision.id);
    await container.orchestration.decide({
      organizationId,
      actor: "user:test-owner",
      runId: revision.id,
      approved: true,
      note: "Corrected final copy approved",
    });
    const filtered = await container.contentStore.listFinalPosts({
      workspaceId: workspace.id,
      organizationId,
      limit: 10,
      cursor: null,
      status: "approved",
      platform: "linkedin",
      campaign: "launch",
      dateFrom: "2026-03-10",
      dateTo: "2026-03-10",
      search: "copy-ready",
    });
    expect(filtered.items).toHaveLength(1);
    expect(filtered.items[0]).toMatchObject({
      title: "A sharper launch lesson",
      day_of_week: 2,
      publication_status: "not_scheduled",
    });
    const lineage = await container.pool.query(
      `SELECT id, logical_id, parent_revision_id, revision, local_date::text, status
       FROM final_posts
       WHERE workspace_id = $1 AND logical_key = 'launch-linkedin-sunday'
       ORDER BY revision`,
      [workspace.id],
    );
    expect(lineage.rows).toEqual([
      expect.objectContaining({ revision: 1, local_date: "2026-03-08", status: "rejected" }),
      expect.objectContaining({
        revision: 2,
        local_date: "2026-03-10",
        status: "approved",
        parent_revision_id: lineage.rows[0]?.id,
      }),
    ]);
    expect(lineage.rows[1]?.logical_id).toBe(lineage.rows[0]?.logical_id);

    const key = await new ApiKeyService(container.pool).issue({
      organizationId,
      name: "Final post reader",
      scopes: ["workspaces:read"],
    });
    const grouped = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspace.id}/final-posts?view=grouped&sprint=Sprint%201&status=approved`,
      headers: { authorization: `Bearer ${key.token}` },
    });
    expect(grouped.statusCode).toBe(200);
    expect(grouped.json()).toMatchObject({
      groups: [{ sprint: "Sprint 1", weeks: [{ week: 1 }] }],
    });
  }, 30_000);
});
