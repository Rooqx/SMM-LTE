import { randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { migrate } from "../src/db/migrate.js";
import { createPool } from "../src/db/pool.js";
import { ProductStore } from "../src/db/product-store.js";
import { Store } from "../src/db/store.js";
import { WorkflowStore } from "../src/db/workflow-store.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = describe.skipIf(!databaseUrl);

integration("product-facing backend contracts", () => {
  let pool: pg.Pool;
  let products: ProductStore;
  let store: Store;
  let workflows: WorkflowStore;
  const organizations: string[] = [];
  const users: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.DATABASE_SSL = "false";
    process.env.NODE_ENV = "test";
    await migrate();
    const config = loadConfig({
      ...process.env,
      DATABASE_URL: databaseUrl,
      DATABASE_SSL: "false",
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
    });
    pool = createPool(config);
    products = new ProductStore(pool);
    store = new Store(pool);
    workflows = new WorkflowStore(pool);
  }, 30_000);

  afterEach(async () => {
    if (organizations.length > 0) {
      await pool.query("DELETE FROM organizations WHERE id = ANY($1::uuid[])", [organizations]);
      organizations.length = 0;
    }
    if (users.length > 0) {
      await pool.query('DELETE FROM "user" WHERE id = ANY($1::uuid[])', [users]);
      users.length = 0;
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  async function fixture(label: string) {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
    const organization = await pool.query(
      "INSERT INTO organizations(name, slug) VALUES ($1, $2) RETURNING id",
      [label, `${label.toLowerCase().replaceAll(" ", "-")}-${suffix}`],
    );
    const organizationId = String(organization.rows[0]?.id);
    organizations.push(organizationId);
    const user = await pool.query(
      `INSERT INTO "user"(name, email, "emailVerified")
       VALUES ($1, $2, true) RETURNING id`,
      [`${label} Owner`, `${suffix}@example.test`],
    );
    const userId = String(user.rows[0]?.id);
    users.push(userId);
    await pool.query(
      `INSERT INTO account_memberships(user_id, organization_id, role)
       VALUES ($1, $2, 'owner')`,
      [userId, organizationId],
    );
    const workspace = await store.createWorkspace({
      organizationId,
      name: `${label} Workspace`,
      slug: `workspace-${suffix}`,
      timezone: "Africa/Lagos",
      actor: `user:${userId}`,
    });
    return { organizationId, userId, workspace };
  }

  it("discovers the active run and exposes bounded account-scoped history", async () => {
    const owner = await fixture("History");
    const outsider = await fixture("Outsider");
    const run = await pool.query(
      `INSERT INTO workflow_runs(workspace_id, phase, skill_name, status, correlation_id)
       VALUES ($1, 1, 'test-skill', 'queued', $2) RETURNING id`,
      [owner.workspace.id, randomUUID()],
    );

    const state = await workflows.getState(owner.workspace.id, owner.organizationId);
    expect(state?.activeRun).toMatchObject({
      id: String(run.rows[0]?.id),
      status: "queued",
      phase: 1,
    });
    expect((await workflows.getState(owner.workspace.id, outsider.organizationId))).toBeNull();

    const runs = await products.listRuns({
      workspaceId: owner.workspace.id,
      organizationId: owner.organizationId,
      limit: 1,
      cursor: null,
    });
    expect(runs.items).toHaveLength(1);
    expect(runs.items[0]?.id).toBe(run.rows[0]?.id);
    expect((await products.listRuns({
      workspaceId: owner.workspace.id,
      organizationId: outsider.organizationId,
      limit: 10,
      cursor: null,
    })).items).toEqual([]);

    const activity = await products.listActivity({
      organizationId: owner.organizationId,
      workspaceId: owner.workspace.id,
      limit: 10,
      cursor: null,
    });
    expect(activity.items.some((item) => item.action === "workspace.created")).toBe(true);
  });

  it("updates settings and workspaces with optimistic concurrency", async () => {
    const owner = await fixture("Settings");
    const initial = await products.getPreferences(owner.organizationId, owner.userId);
    expect(initial).toMatchObject({ version: 1, theme: "dark", autopilot_enabled: true });

    const updated = await products.updatePreferences({
      organizationId: owner.organizationId,
      userId: owner.userId,
      actor: `user:${owner.userId}`,
      expectedVersion: 1,
      timezone: "Europe/London",
      theme: "system",
      emailNotifications: true,
      autopilotEnabled: false,
      reviewRemindersEnabled: false,
    });
    expect(updated).toMatchObject({
      version: 2,
      timezone: "Europe/London",
      theme: "system",
      email_notifications: true,
      autopilot_enabled: false,
    });
    await expect(products.updatePreferences({
      organizationId: owner.organizationId,
      userId: owner.userId,
      actor: `user:${owner.userId}`,
      expectedVersion: 1,
      timezone: "UTC",
      theme: "dark",
      emailNotifications: false,
      autopilotEnabled: true,
      reviewRemindersEnabled: true,
    })).rejects.toMatchObject({ code: "preferences_changed", statusCode: 409 });

    const workspace = await products.updateWorkspace({
      workspaceId: owner.workspace.id,
      organizationId: owner.organizationId,
      actor: `user:${owner.userId}`,
      expectedVersion: owner.workspace.version,
      name: "Renamed Workspace",
      timezone: "UTC",
    });
    expect(workspace).toMatchObject({ name: "Renamed Workspace", timezone: "UTC", version: 2 });
    await expect(products.updateWorkspace({
      workspaceId: owner.workspace.id,
      organizationId: owner.organizationId,
      actor: `user:${owner.userId}`,
      expectedVersion: owner.workspace.version,
      name: "Stale Rename",
    })).rejects.toMatchObject({ code: "workspace_changed", statusCode: 409 });
  });

  it("starts an idempotent next-week cycle while preserving approved brand context", async () => {
    const owner = await fixture("Recurring");
    await store.upsertContext(owner.workspace.id, owner.organizationId, {
      key: "brand.voice",
      markdown: "Clear and practical",
      data: { tone: "clear" },
      source: "test",
      actor: `user:${owner.userId}`,
    });
    await pool.query(
      "UPDATE workspaces SET current_phase = 5, status = 'ready' WHERE id = $1",
      [owner.workspace.id],
    );
    await pool.query(
      `UPDATE phase_instances SET phase = 5
       WHERE id = (SELECT current_phase_instance_id FROM workflow_instances WHERE workspace_id = $1)`,
      [owner.workspace.id],
    );
    const completedRun = await pool.query(
      `INSERT INTO workflow_runs(
         workspace_id, phase, skill_name, status, output_status, correlation_id
       ) VALUES ($1, 5, 'test-final-posts', 'completed', 'accepted', $2) RETURNING id`,
      [owner.workspace.id, randomUUID()],
    );
    await pool.query(
      `INSERT INTO final_posts(
         workspace_id, run_id, logical_key, sprint, week, local_date,
         timezone, platform, topic, content_format, title, content,
         status, created_by
       ) VALUES (
         $1, $2, 'week-1-post-1', 'Sprint 1', 1, '2026-10-12',
         'Africa/Lagos', 'linkedin', 'Launch', 'text', 'Launch post',
         'Hello world', 'approved', $3
       )`,
      [owner.workspace.id, completedRun.rows[0]?.id, `user:${owner.userId}`],
    );

    const command = {
      workspaceId: owner.workspace.id,
      organizationId: owner.organizationId,
      actor: `user:${owner.userId}`,
      mode: "next_week" as const,
      brief: { nothingChanged: true, weekStart: "2026-10-19" },
      idempotencyKey: randomUUID(),
      recipeVersion: "1.0.0",
    };
    const first = await store.startContentCycle(command);
    const replay = await store.startContentCycle(command);
    expect(replay).toEqual(first);
    expect(first).toMatchObject({ mode: "next_week", phase: 2, cycle: 2, week: 2 });

    const state = await workflows.getState(owner.workspace.id, owner.organizationId);
    expect(state).toMatchObject({ phase: 2, cycle: 2, phaseStatus: "active" });
    const context = await store.listContextForExecution(owner.workspace.id);
    expect(context.find((item) => item.key === "brand.voice")?.data).toEqual({ tone: "clear" });
    expect(context.find((item) => item.key === "calendar.active_brief")?.data)
      .toMatchObject({ mode: "next_week", cycle: 2, week: 2, nothingChanged: true });
  });

  it("reads Brand/export history and applies idempotent publication transitions", async () => {
    const owner = await fixture("Content");
    await store.upsertContext(owner.workspace.id, owner.organizationId, {
      key: "brand.voice",
      markdown: "Clear and warm",
      data: { tone: "warm" },
      source: "test",
      actor: `user:${owner.userId}`,
    });
    const history = await products.listContextHistory({
      workspaceId: owner.workspace.id,
      organizationId: owner.organizationId,
      key: "brand.voice",
      limit: 10,
      cursor: null,
    });
    expect(history.items).toHaveLength(1);
    expect(history.items[0]).toMatchObject({ revision: 1, status: "approved" });

    const job = await pool.query(
      `INSERT INTO job_queue(type, payload, correlation_id)
       VALUES ('export_obsidian', jsonb_build_object(
         'workspaceId', $1::text, 'organizationId', $2::text,
         'idempotencyKey', $3::text
       ), $4) RETURNING id`,
      [owner.workspace.id, owner.organizationId, randomUUID(), randomUUID()],
    );
    const jobs = await products.listObsidianJobs({
      organizationId: owner.organizationId,
      workspaceId: owner.workspace.id,
      limit: 10,
      cursor: null,
    });
    expect(jobs.items[0]?.id).toBe(job.rows[0]?.id);
    expect(await products.getObsidianJob(String(job.rows[0]?.id), owner.organizationId))
      .toMatchObject({ status: "queued", workspace_id: owner.workspace.id });

    const run = await pool.query(
      `INSERT INTO workflow_runs(
         workspace_id, phase, skill_name, status, output_status, correlation_id
       ) VALUES ($1, 5, 'test-skill', 'completed', 'accepted', $2) RETURNING id`,
      [owner.workspace.id, randomUUID()],
    );
    const post = await pool.query(
      `INSERT INTO final_posts(
         workspace_id, run_id, logical_key, sprint, week, local_date,
         timezone, platform, topic, content_format, title, content,
         status, created_by
       ) VALUES (
         $1, $2, 'post-1', 'Sprint 1', 1, '2026-10-12',
         'Africa/Lagos', 'linkedin', 'Launch', 'text', 'Launch post',
         'Hello world', 'approved', $3
       ) RETURNING id`,
      [owner.workspace.id, run.rows[0]?.id, `user:${owner.userId}`],
    );
    const command = {
      postId: String(post.rows[0]?.id),
      organizationId: owner.organizationId,
      actor: `user:${owner.userId}`,
      expectedVersion: 1,
      status: "scheduled" as const,
      idempotencyKey: randomUUID(),
    };
    const first = await products.updatePublication(command);
    const replay = await products.updatePublication(command);
    expect(first).toEqual(replay);
    expect(first).toMatchObject({ publication_status: "scheduled", publication_version: 2 });

    const confirmation = await products.updatePublication({
      ...command,
      expectedVersion: 2,
      idempotencyKey: randomUUID(),
    });
    expect(confirmation).toMatchObject({
      publication_status: "scheduled",
      publication_version: 2,
    });
    const confirmationAudit = await pool.query(
      `SELECT action, data FROM audit_events
       WHERE organization_id = $1 AND entity_id = $2
       ORDER BY id DESC LIMIT 1`,
      [owner.organizationId, String(post.rows[0]?.id)],
    );
    expect(confirmationAudit.rows[0]).toMatchObject({
      action: "final_post.publication_confirmed",
      data: expect.objectContaining({ changed: false, version: 2 }),
    });

    await expect(products.updatePublication({
      ...command,
      expectedVersion: 2,
      status: "published",
    })).rejects.toMatchObject({ code: "idempotency_key_reused", statusCode: 409 });
  });
});
