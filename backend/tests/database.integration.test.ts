import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { ApiKeyService } from "../src/auth/api-keys.js";
import { loadConfig } from "../src/config.js";
import { buildContainer, type Container } from "../src/container.js";
import { migrate } from "../src/db/migrate.js";
import type { LlmProvider } from "../src/llm/provider.js";
import { leaseFor } from "../src/db/jobs.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const integration = describe.skipIf(!databaseUrl);

integration("database-backed API", () => {
  let container: Container;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.DATABASE_SSL = "false";
    process.env.SKILLS_ROOT = repositoryRoot;
    process.env.NODE_ENV = "test";
    await migrate();

    const llm: LlmProvider = {
      async execute() {
        return {
          action: {
            type: "propose_output",
            message: "Drafted and proposed a positioning update.",
            artifacts: [{
              kind: "voice-guide",
              slug: "brand-voice",
              title: "Brand voice",
              content: "A focused voice draft.",
              metadata: {},
            }],
            contextUpdates: [{
              key: "brand.voice",
              markdown: "Approved voice",
              data: { source: "integration-test" },
            }],
          },
          provider: "test",
          model: "deterministic",
          providerResponseId: "response-1",
          usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        };
      },
    };
    const config = loadConfig({
      ...process.env,
      DATABASE_URL: databaseUrl,
      SKILLS_ROOT: repositoryRoot,
      NODE_ENV: "test",
      LLM_PROVIDER: "mock",
      LOG_LEVEL: "silent",
      RATE_LIMIT_MAX: "1000",
    });
    container = await buildContainer({ config, llm });
    await container.pool.query("TRUNCATE organizations CASCADE");
    // Queue rows intentionally have no foreign key to run rows. Clear prior
    // test jobs so claim-order assertions do not depend on suite execution order.
    await container.pool.query("DELETE FROM job_queue WHERE type = 'execute_workflow_run'");
    app = await buildApp(container);
  }, 30_000);

  afterAll(async () => {
    await app?.close();
  });

  it("enforces tenant isolation, concurrency, idempotency, and staged output", async () => {
    const organizationA = await container.pool.query(
      "INSERT INTO organizations(name, slug) VALUES ('Org A', 'org-a') RETURNING id",
    );
    const organizationB = await container.pool.query(
      "INSERT INTO organizations(name, slug) VALUES ('Org B', 'org-b') RETURNING id",
    );
    const keys = new ApiKeyService(container.pool);
    const keyA = await keys.issue({ organizationId: String(organizationA.rows[0]?.id), name: "A" });
    const keyB = await keys.issue({ organizationId: String(organizationB.rows[0]?.id), name: "B" });
    const authA = { authorization: `Bearer ${keyA.token}` };
    const authB = { authorization: `Bearer ${keyB.token}` };

    expect((await app.inject({ method: "GET", url: "/v1/skills" })).statusCode).toBe(401);

    const created = await app.inject({
      method: "POST",
      url: "/v1/workspaces",
      headers: authA,
      payload: { name: "Brand A", slug: "brand-a", timezone: "Africa/Lagos" },
    });
    expect(created.statusCode).toBe(201);
    const workspaceId = created.json().id as string;

    const crossTenant = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}`,
      headers: authB,
    });
    expect(crossTenant.statusCode).toBe(404);

    const runRequest = {
      method: "POST" as const,
      url: `/v1/workspaces/${workspaceId}/runs`,
      headers: authA,
      payload: {
        skillName: "voice-builder",
        input: { samples: ["A concise sample"] },
        completePhase: false,
        idempotencyKey: "voice-1",
      },
    };
    const [first, concurrent] = await Promise.all([
      app.inject(runRequest),
      app.inject({ ...runRequest, payload: { ...runRequest.payload, idempotencyKey: "voice-2" } }),
    ]);
    expect([first.statusCode, concurrent.statusCode].sort()).toEqual([202, 409]);
    const accepted = first.statusCode === 202 ? first : concurrent;
    const acceptedRequest = first.statusCode === 202
      ? runRequest
      : { ...runRequest, payload: { ...runRequest.payload, idempotencyKey: "voice-2" } };
    const runId = accepted.json().id as string;

    const job = await container.queue.claim();
    expect(job).not.toBeNull();
    await container.orchestration.execute(runId, leaseFor(job!));
    await container.queue.complete(job!);

    const beforeApproval = await app.inject({
      method: "GET",
      url: `/v1/runs/${runId}`,
      headers: authA,
    });
    expect(beforeApproval.json()).toMatchObject({
      status: "completed",
      output_status: "pending",
      artifacts: [{ status: "draft" }],
    });
    const pendingContext = await container.pool.query(
      "SELECT 1 FROM workspace_context WHERE workspace_id = $1 AND key = 'brand.voice'",
      [workspaceId],
    );
    expect(pendingContext.rowCount).toBe(0);

    expect((await app.inject({
      method: "GET",
      url: `/v1/runs/${runId}`,
      headers: authB,
    })).statusCode).toBe(404);

    const serviceApproval = await app.inject({
      method: "POST",
      url: `/v1/runs/${runId}/approve`,
      headers: authA,
      payload: { note: "Reviewed" },
    });
    expect(serviceApproval.statusCode).toBe(403);

    const approved = await container.orchestration.decide({
      organizationId: String(organizationA.rows[0]?.id),
      runId,
      approved: true,
      actor: "user:integration-owner",
      note: "Reviewed",
    });
    expect(approved).toMatchObject({
      output_status: "accepted",
      artifacts: [{ status: "approved" }],
    });
    expect((await container.pool.query(
      "SELECT 1 FROM workspace_context WHERE workspace_id = $1 AND key = 'brand.voice'",
      [workspaceId],
    )).rowCount).toBe(1);

    const repeated = await app.inject(acceptedRequest);
    expect(repeated.statusCode).toBe(202);
    expect(repeated.json().id).toBe(runId);

    const mismatched = await app.inject({
      ...acceptedRequest,
      payload: { ...acceptedRequest.payload, input: { samples: ["Different"] } },
    });
    expect(mismatched.statusCode).toBe(409);

    const staleResponse = await app.inject({
      ...runRequest,
      payload: { ...runRequest.payload, idempotencyKey: "stale-final-attempt" },
    });
    expect(staleResponse.statusCode).toBe(202);
    const staleRunId = staleResponse.json().id as string;
    const staleJob = await container.queue.claim();
    expect(staleJob).not.toBeNull();
    await container.store.beginRun(staleRunId, leaseFor(staleJob!));
    await container.pool.query(
      `UPDATE job_queue
       SET attempts = max_attempts,
           locked_at = now() - interval '2 minutes',
           lease_expires_at = now() - interval '1 second'
       WHERE id = $1`,
      [staleJob!.id],
    );
    expect(await container.queue.recoverStaleJobs(1)).toBe(1);
    expect((await container.pool.query(
      "SELECT status FROM job_queue WHERE id = $1",
      [staleJob!.id],
    )).rows[0]?.status).toBe("dead");
    expect((await container.pool.query(
      "SELECT status FROM workflow_runs WHERE id = $1",
      [staleRunId],
    )).rows[0]?.status).toBe("failed");
    expect((await container.pool.query(
      "SELECT status FROM workspaces WHERE id = $1",
      [workspaceId],
    )).rows[0]?.status).toBe("ready");
  }, 30_000);
});
