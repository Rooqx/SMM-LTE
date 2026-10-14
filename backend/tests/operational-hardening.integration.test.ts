import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { buildContainer, type Container } from "../src/container.js";
import { LeaseLostError, leaseFor } from "../src/db/jobs.js";
import { migrate } from "../src/db/migrate.js";
import { claimRunJob } from "./helpers/jobs.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const migrationsDirectory = path.join(repositoryRoot, "backend/src/db/migrations");
const integration = describe.skipIf(!databaseUrl);

integration("M6 operational hardening", () => {
  let container: Container;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.DATABASE_SSL = "false";
    process.env.NODE_ENV = "test";
    await migrate();
    const config = loadConfig({
      ...process.env,
      DATABASE_URL: databaseUrl,
      DATABASE_SSL: "false",
      SKILLS_ROOT: repositoryRoot,
      NODE_ENV: "test",
      LLM_PROVIDER: "mock",
      LOG_LEVEL: "silent",
      WORKER_LEASE_SECONDS: "60",
      WORKER_LEASE_RENEW_MS: "5000",
    });
    container = await buildContainer({ config });
  }, 30_000);

  afterEach(async () => {
    await container.pool.query("DELETE FROM job_queue");
    await container.pool.query("TRUNCATE organizations CASCADE");
  });

  afterAll(async () => {
    await container?.pool.end();
  });

  async function organizationAndWorkspace(label: string) {
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
      actor: "test:m6",
    });
    return { organizationId, workspace };
  }

  it("fences a stale worker after lease recovery and preserves correlation", async () => {
    const { organizationId, workspace } = await organizationAndWorkspace("Fence Brand");
    const run = await container.orchestration.enqueueNext({
      organizationId,
      actor: "test:m6",
      workspaceId: workspace.id,
      idempotencyKey: "m6-fence-run",
      correlationId: "m6-request:fence",
    });
    const first = await claimRunJob(container, run.id);
    await container.store.beginRun(run.id, leaseFor(first));

    await container.pool.query(
      "UPDATE job_queue SET lease_expires_at = now() - interval '1 second' WHERE id = $1",
      [first.id],
    );
    expect(await container.queue.recoverExpiredJobs()).toBe(1);
    const second = await claimRunJob(container, run.id);
    expect(second.lease_token).toBeGreaterThan(first.lease_token);
    await container.store.beginRun(run.id, leaseFor(second));

    await expect(container.store.createStep({
      runId: run.id,
      skillName: run.skill_name,
      promptSnapshot: {},
      payload: {},
      lease: leaseFor(first),
    })).rejects.toBeInstanceOf(LeaseLostError);

    const stepId = await container.store.createStep({
      runId: run.id,
      skillName: run.skill_name,
      promptSnapshot: {},
      payload: {},
      lease: leaseFor(second),
    });
    const trace = await container.pool.query(
      `SELECT run.correlation_id AS run_correlation,
              step.correlation_id AS step_correlation,
              job.correlation_id AS job_correlation
       FROM workflow_runs AS run
       JOIN workflow_steps AS step ON step.id = $2
       JOIN job_queue AS job ON job.id = $3
       WHERE run.id = $1`,
      [run.id, stepId, second.id],
    );
    expect(trace.rows[0]).toEqual({
      run_correlation: "m6-request:fence",
      step_correlation: "m6-request:fence",
      job_correlation: "m6-request:fence",
    });
    await container.queue.fail(second, new Error("test cleanup"), { permanent: true });
  });

  it("rejects account over-admission before creating another run", async () => {
    const { organizationId, workspace } = await organizationAndWorkspace("Admission One");
    const secondWorkspace = await container.store.createWorkspace({
      organizationId,
      name: "Admission Two",
      slug: "admission-two",
      timezone: "UTC",
      actor: "test:m6",
    });
    const originalLimit = container.config.QUEUE_MAX_ACTIVE_JOBS_PER_ORGANIZATION;
    Object.assign(container.config, { QUEUE_MAX_ACTIVE_JOBS_PER_ORGANIZATION: 1 });
    try {
      await container.orchestration.enqueueNext({
        organizationId,
        actor: "test:m6",
        workspaceId: workspace.id,
        idempotencyKey: "admission-first",
      });
      await expect(container.orchestration.enqueueNext({
        organizationId,
        actor: "test:m6",
        workspaceId: secondWorkspace.id,
        idempotencyKey: "admission-second",
      })).rejects.toMatchObject({ statusCode: 429, code: "organization_queue_limit" });
      expect((await container.pool.query(
        "SELECT count(*)::integer AS count FROM workflow_runs WHERE workspace_id = $1",
        [secondWorkspace.id],
      )).rows[0]?.count).toBe(0);
    } finally {
      Object.assign(container.config, {
        QUEUE_MAX_ACTIVE_JOBS_PER_ORGANIZATION: originalLimit,
      });
    }
  });

  it("claims fairly across accounts and exposes content-free operational metrics", async () => {
    const first = await organizationAndWorkspace("Fairness A One");
    const secondWorkspace = await container.store.createWorkspace({
      organizationId: first.organizationId,
      name: "Fairness A Two",
      slug: "fairness-a-two",
      timezone: "UTC",
      actor: "test:m6",
    });
    const other = await organizationAndWorkspace("Fairness B One");
    const runA1 = await container.orchestration.enqueueNext({
      organizationId: first.organizationId,
      actor: "test:m6",
      workspaceId: first.workspace.id,
      idempotencyKey: "fair-a-1",
    });
    await container.orchestration.enqueueNext({
      organizationId: first.organizationId,
      actor: "test:m6",
      workspaceId: secondWorkspace.id,
      idempotencyKey: "fair-a-2",
    });
    const runB = await container.orchestration.enqueueNext({
      organizationId: other.organizationId,
      actor: "test:m6",
      workspaceId: other.workspace.id,
      idempotencyKey: "fair-b-1",
    });

    const claimedA = await container.queue.claim(["execute_workflow_run"]);
    expect(claimedA?.payload.runId).toBe(runA1.id);
    const claimedB = await container.queue.claim(["execute_workflow_run"]);
    expect(claimedB?.payload.runId).toBe(runB.id);
    const metrics = await container.metrics.render();
    expect(metrics).toContain("smm_job_queue_total");
    expect(metrics).toContain("smm_queue_admission_rejections_total");
    expect(metrics).toContain("smm_database_pool_total");
    expect(metrics).not.toContain("Fairness A One");
    expect(metrics).not.toContain(first.organizationId);
  });

  it("deduplicates durable Obsidian export requests", async () => {
    const { organizationId, workspace } = await organizationAndWorkspace("Export Brand");
    const input = {
      workspaceId: workspace.id,
      organizationId,
      idempotencyKey: "export-review-1",
      correlationId: "m6-request:export",
      maxAttempts: 4,
      maxActiveJobs: 100,
    };
    const [first, replay] = await Promise.all([
      container.queue.enqueueObsidianExport(input),
      container.queue.enqueueObsidianExport(input),
    ]);
    expect(replay).toEqual(first);
    expect((await container.pool.query(
      "SELECT count(*)::integer AS count FROM job_queue WHERE type = 'export_obsidian'",
    )).rows[0]?.count).toBe(1);
  });

  it("rejects malformed workspace and context cursors before database casts", async () => {
    const { organizationId, workspace } = await organizationAndWorkspace("Cursor Brand");
    const malformedWorkspace = Buffer.from(JSON.stringify({
      createdAt: "not-an-instant",
      id: "not-a-uuid",
    })).toString("base64url");
    const malformedContext = Buffer.from(JSON.stringify({ key: "../invalid" }))
      .toString("base64url");

    await expect(container.store.listWorkspaces({
      organizationId,
      limit: 20,
      cursor: malformedWorkspace,
    })).rejects.toMatchObject({ statusCode: 400, code: "invalid_cursor" });
    await expect(container.store.listContextPage({
      workspaceId: workspace.id,
      organizationId,
      limit: 20,
      cursor: malformedContext,
    })).rejects.toMatchObject({ statusCode: 400, code: "invalid_cursor" });
  });

  it("does not revive a dead workflow job in an archived workspace", async () => {
    const { workspace } = await organizationAndWorkspace("Archived Retry Brand");
    const run = await container.pool.query(
      `INSERT INTO workflow_runs(workspace_id, phase, skill_name, status)
       VALUES ($1, 1, 'voice-builder', 'failed') RETURNING id`,
      [workspace.id],
    );
    const job = await container.pool.query(
      `INSERT INTO job_queue(type, payload, status, attempts, max_attempts)
       VALUES ('execute_workflow_run', jsonb_build_object('runId', $1::text), 'dead', 4, 4)
       RETURNING id`,
      [run.rows[0]?.id],
    );
    await container.pool.query("UPDATE workspaces SET status = 'archived' WHERE id = $1", [workspace.id]);

    await expect(container.queue.retryDead(String(job.rows[0]?.id)))
      .rejects.toMatchObject({ statusCode: 409, code: "workspace_not_retryable" });
    expect((await container.pool.query(
      "SELECT status FROM workflow_runs WHERE id = $1",
      [run.rows[0]?.id],
    )).rows[0]?.status).toBe("failed");
    expect((await container.pool.query(
      "SELECT status FROM job_queue WHERE id = $1",
      [job.rows[0]?.id],
    )).rows[0]?.status).toBe("dead");
  });

  it("upgrades a populated pre-M6 schema without losing active job identity", async () => {
    const schema = `m6_upgrade_${randomUUID().replaceAll("-", "")}`;
    const client = await container.pool.connect();
    try {
      await client.query(`CREATE SCHEMA ${schema}`);
      await client.query(`SET search_path TO ${schema}, public`);
      for (const migration of [
        "001_initial.sql",
        "002_relax_organization_slug.sql",
        "003_security_and_reliability.sql",
        "004_better_auth.sql",
        "005_personal_accounts_and_auth_email.sql",
        "006_durable_workflow_memory.sql",
        "007_typed_recipes_and_skill_bundles.sql",
        "008_release_pin_integrity.sql",
        "009_review_revisions_and_final_posts.sql",
      ]) {
        await client.query(await readFile(path.join(migrationsDirectory, migration), "utf8"));
      }
      const organization = await client.query(
        "INSERT INTO organizations(name, slug) VALUES ('M6 Legacy', 'm6-legacy') RETURNING id",
      );
      const workspace = await client.query(
        `INSERT INTO workspaces(organization_id, name, slug, status)
         VALUES ($1, 'M6 Legacy Brand', 'm6-legacy-brand', 'running') RETURNING id`,
        [organization.rows[0]?.id],
      );
      const run = await client.query(
        `INSERT INTO workflow_runs(workspace_id, phase, skill_name, status)
         VALUES ($1, 1, 'voice-builder', 'running') RETURNING id`,
        [workspace.rows[0]?.id],
      );
      await client.query(
        `INSERT INTO workflow_steps(run_id, ordinal, skill_name, status, prompt_snapshot)
         VALUES ($1, 1, 'voice-builder', 'running', '{}'::jsonb)`,
        [run.rows[0]?.id],
      );
      const job = await client.query(
        `INSERT INTO job_queue(type, payload, status, attempts, locked_at, locked_by)
         VALUES (
           'execute_workflow_run', jsonb_build_object('runId', $1::text),
           'running', 1, now(), 'legacy-worker'
         ) RETURNING id`,
        [run.rows[0]?.id],
      );

      await client.query(
        await readFile(path.join(migrationsDirectory, "010_operational_hardening.sql"), "utf8"),
      );
      const upgraded = await client.query(
        `SELECT job.lease_token, job.lease_expires_at, job.correlation_id AS job_correlation,
                run.correlation_id AS run_correlation, step.correlation_id AS step_correlation
         FROM job_queue AS job
         JOIN workflow_runs AS run ON run.id = $2
         JOIN workflow_steps AS step ON step.run_id = run.id
         WHERE job.id = $1`,
        [job.rows[0]?.id, run.rows[0]?.id],
      );
      expect(upgraded.rows[0]).toMatchObject({ lease_token: "1" });
      expect(upgraded.rows[0]?.lease_expires_at).toBeInstanceOf(Date);
      expect(upgraded.rows[0]?.job_correlation).toBeTruthy();
      expect(upgraded.rows[0]?.run_correlation).toBe(upgraded.rows[0]?.step_correlation);
    } finally {
      await client.query("RESET search_path");
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      client.release();
    }
  }, 30_000);
});
