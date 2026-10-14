import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { UserIdentityService } from "../src/auth/user-identity.js";
import { loadConfig } from "../src/config.js";
import { buildContainer, type Container } from "../src/container.js";
import { migrate } from "../src/db/migrate.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const integration = describe.skipIf(!databaseUrl);

const userId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const claims = {
  sub: userId,
  sessionId,
  email: "verified-owner@example.com",
  emailVerified: true as const,
  name: "Verified Owner",
};

integration("database-backed user identity", () => {
  let container: Container;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let identities: UserIdentityService;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.SKILLS_ROOT = repositoryRoot;
    process.env.NODE_ENV = "test";
    await migrate();

    const config = loadConfig({
      ...process.env,
      DATABASE_URL: databaseUrl,
      SKILLS_ROOT: repositoryRoot,
      NODE_ENV: "test",
      LLM_PROVIDER: "mock",
      LOG_LEVEL: "silent",
      RATE_LIMIT_MAX: "1000",
    });
    container = await buildContainer({ config });
    await container.pool.query('TRUNCATE "user", organizations, job_queue CASCADE');
    await container.pool.query(
      `INSERT INTO "user"(id, name, email, "emailVerified")
       VALUES ($1, $2, $3, true)`,
      [userId, claims.name, claims.email],
    );
    await container.pool.query(
      `INSERT INTO "session"(id, "expiresAt", token, "userId")
       VALUES ($1, now() + interval '1 hour', 'integration-session-token', $2)`,
      [sessionId, userId],
    );
    identities = new UserIdentityService(container.pool, config, async () => claims);
    container.userIdentities = identities;
    app = await buildApp(container);
  }, 30_000);

  afterAll(async () => {
    await app?.close();
  });

  it("provisions exactly one personal owner account under concurrent retries", async () => {
    const principals = await Promise.all(
      Array.from({ length: 8 }, () => identities.authenticate("signed-assertion")),
    );
    expect(new Set(principals.map((principal) => principal.organizationId)).size).toBe(1);

    const result = await container.pool.query(
      `SELECT count(*)::int AS memberships,
              count(DISTINCT organization_id)::int AS organizations
       FROM account_memberships
       WHERE user_id = $1`,
      [userId],
    );
    expect(result.rows[0]).toEqual({ memberships: 1, organizations: 1 });
  });

  it("lets a user continue deterministically without exposing raw skill selection", async () => {
    expect((await app.inject({ method: "GET", url: "/ready" })).statusCode).toBe(200);
    const created = await app.inject({
      method: "POST",
      url: "/v1/workspaces",
      headers: { authorization: "Bearer signed-assertion" },
      payload: { name: "Guided Brand", slug: "guided-brand", timezone: "Africa/Lagos" },
    });
    expect(created.statusCode).toBe(201);
    const workspaceId = String(created.json().id);

    const continued = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/continue`,
      headers: { authorization: "Bearer signed-assertion" },
      payload: { idempotencyKey: "guided-first-step" },
    });
    expect(continued.statusCode).toBe(202);
    expect(continued.json()).toMatchObject({ status: "queued", phase: 1 });
    const runId = String(continued.json().id);
    expect((await container.pool.query(
      `SELECT skill_name, complete_phase, recipe_version, skill_bundle_version
       FROM workflow_runs WHERE id = $1`,
      [runId],
    )).rows[0]).toMatchObject({
      skill_name: "social-media-context-sms",
      complete_phase: false,
      recipe_version: "1.0.0",
      skill_bundle_version: container.registry.bundle().version,
    });

    const rawRun = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/runs`,
      headers: { authorization: "Bearer signed-assertion" },
      payload: {
        skillName: "voice-builder",
        input: {},
        completePhase: true,
        idempotencyKey: "browser-must-not-select-skills",
      },
    });
    expect(rawRun.statusCode).toBe(403);

    // This test does not start a worker; remove only its exact queued job so
    // concurrent integration files cannot claim it accidentally.
    await container.pool.query(
      "DELETE FROM job_queue WHERE type = 'execute_workflow_run' AND payload->>'runId' = $1",
      [runId],
    );
  });

  it("keeps user access account-scoped and rejects a revoked session", async () => {
    const otherOrganization = await container.pool.query(
      `INSERT INTO organizations(name, slug)
       VALUES ('Other account', 'other-account') RETURNING id`,
    );
    const workspace = await container.pool.query(
      `INSERT INTO workspaces(organization_id, name, slug)
       VALUES ($1, 'Other workspace', 'other-workspace') RETURNING id`,
      [otherOrganization.rows[0]?.id],
    );

    const isolated = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspace.rows[0]?.id}`,
      headers: { authorization: "Bearer signed-assertion" },
    });
    expect(isolated.statusCode).toBe(404);

    await container.pool.query('DELETE FROM "session" WHERE id = $1', [sessionId]);
    const revoked = await app.inject({
      method: "GET",
      url: "/v1/workspaces",
      headers: { authorization: "Bearer signed-assertion" },
    });
    expect(revoked.statusCode).toBe(401);
  });

  it("prioritizes auth mail and removes reset links after terminal delivery", async () => {
    await container.pool.query(
      `INSERT INTO job_queue(type, payload)
       VALUES ('execute_workflow_run', '{"runId":"33333333-3333-4333-8333-333333333333"}')`,
    );
    await container.pool.query(
      `INSERT INTO job_queue(type, payload, max_attempts)
       VALUES ('send_auth_email', $1, 6)`,
      [{
        kind: "password_reset",
        recipient: claims.email,
        subject: "Reset password",
        text: "https://app.example.test/reset-password?token=sensitive",
        idempotencyKey: "a".repeat(64),
      }],
    );

    const claimed = await container.queue.claim([
      "execute_workflow_run",
      "send_auth_email",
    ]);
    expect(claimed?.type).toBe("send_auth_email");
    await container.queue.complete(claimed!);

    const stored = await container.pool.query(
      "SELECT status, payload FROM job_queue WHERE id = $1",
      [claimed!.id],
    );
    expect(stored.rows[0]?.status).toBe("completed");
    expect(stored.rows[0]?.payload).toMatchObject({
      kind: "password_reset",
      idempotencyKey: "a".repeat(64),
    });
    expect(stored.rows[0]?.payload).not.toHaveProperty("recipient");
    expect(stored.rows[0]?.payload).not.toHaveProperty("text");
  });
});
