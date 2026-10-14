import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { AppError } from "../src/domain/errors.js";
import { migrate } from "../src/db/migrate.js";
import { createPool } from "../src/db/pool.js";
import { Store } from "../src/db/store.js";
import { initializeWorkspaceWorkflow, WorkflowStore } from "../src/db/workflow-store.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = describe.skipIf(!databaseUrl);
const migrationsDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/db/migrations",
);

integration("durable workflow memory", () => {
  let pool: pg.Pool;
  let store: Store;
  let workflows: WorkflowStore;
  const organizations: string[] = [];

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
    store = new Store(pool);
    workflows = new WorkflowStore(pool);
  }, 30_000);

  afterEach(async () => {
    if (organizations.length === 0) return;
    await pool.query("DELETE FROM organizations WHERE id = ANY($1::uuid[])", [organizations]);
    organizations.length = 0;
  });

  afterAll(async () => {
    await pool?.end();
  });

  async function createOrganization(label: string): Promise<string> {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const result = await pool.query(
      "INSERT INTO organizations(name, slug) VALUES ($1, $2) RETURNING id",
      [label, `${label.toLowerCase().replaceAll(" ", "-")}-${suffix}`],
    );
    const id = String(result.rows[0]?.id);
    organizations.push(id);
    return id;
  }

  async function createWorkspace(organizationId: string, label: string) {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    return store.createWorkspace({
      organizationId,
      name: label,
      slug: `${label.toLowerCase().replaceAll(" ", "-")}-${suffix}`,
      timezone: "Africa/Lagos",
      actor: `test:${organizationId}`,
    });
  }

  it("initializes exactly one phase-1 workflow and enforces ownership in the schema", async () => {
    const organizationA = await createOrganization("Workflow A");
    const organizationB = await createOrganization("Workflow B");
    const workspaceA = await createWorkspace(organizationA, "Brand A");
    const workspaceB = await createWorkspace(organizationB, "Brand B");

    const state = await workflows.getState(workspaceA.id, organizationA);
    expect(state).toMatchObject({
      workflowStatus: "active",
      workflowVersion: 1,
      recipeVersion: "1.0.0",
      phase: 1,
      cycle: 1,
      phaseStatus: "active",
      pendingQuestion: null,
    });
    expect(await workflows.getState(workspaceA.id, organizationB)).toBeNull();

    const counts = await pool.query(
      `SELECT
         (SELECT count(*) FROM workflow_instances WHERE workspace_id = $1)::integer AS workflows,
         (SELECT count(*) FROM phase_instances WHERE workspace_id = $1)::integer AS phases,
         (SELECT count(*) FROM conversations WHERE workspace_id = $1)::integer AS conversations`,
      [workspaceA.id],
    );
    expect(counts.rows[0]).toEqual({ workflows: 1, phases: 1, conversations: 1 });

    const rawWorkspace = await pool.query(
      `INSERT INTO workspaces(organization_id, name, slug, timezone)
       VALUES ($1, 'Concurrent Init', $2, 'UTC') RETURNING id`,
      [organizationA, `concurrent-init-${randomUUID().slice(0, 8)}`],
    );
    const rawWorkspaceId = String(rawWorkspace.rows[0]?.id);
    await Promise.all(Array.from({ length: 10 }, async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await initializeWorkspaceWorkflow(client, rawWorkspaceId);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }));
    const initialized = await pool.query(
      `SELECT
         (SELECT count(*) FROM workflow_instances WHERE workspace_id = $1)::integer AS workflows,
         (SELECT count(*) FROM phase_instances WHERE workspace_id = $1)::integer AS phases,
         (SELECT count(*) FROM conversations WHERE workspace_id = $1)::integer AS conversations`,
      [rawWorkspaceId],
    );
    expect(initialized.rows[0]).toEqual({ workflows: 1, phases: 1, conversations: 1 });

    const workflowB = await workflows.getState(workspaceB.id, organizationB);
    await expect(pool.query(
      `INSERT INTO conversations(workspace_id, workflow_instance_id, status)
       VALUES ($1, $2, 'closed')`,
      [workspaceA.id, workflowB!.workflowId],
    )).rejects.toMatchObject({ code: "23503" });
  });

  it("backfills pre-M2 workspaces and canonical context without losing history", async () => {
    const schema = `m2_upgrade_${randomUUID().replaceAll("-", "")}`;
    const client = await pool.connect();
    try {
      await client.query(`CREATE SCHEMA ${schema}`);
      await client.query(`SET search_path TO ${schema}, public`);
      for (const migration of [
        "001_initial.sql",
        "002_relax_organization_slug.sql",
        "003_security_and_reliability.sql",
        "004_better_auth.sql",
        "005_personal_accounts_and_auth_email.sql",
      ]) {
        await client.query(await readFile(path.join(migrationsDirectory, migration), "utf8"));
      }
      const organization = await client.query(
        "INSERT INTO organizations(name, slug) VALUES ('Legacy', 'legacy') RETURNING id",
      );
      const workspace = await client.query(
        `INSERT INTO workspaces(organization_id, name, slug, timezone, current_phase)
         VALUES ($1, 'Legacy Brand', 'legacy-brand', 'UTC', 2)
         RETURNING id`,
        [organization.rows[0]?.id],
      );
      await client.query(
        `INSERT INTO workspace_context(
           workspace_id, key, markdown, data, version, source
         ) VALUES ($1, 'brand.voice', 'Legacy voice', '{"tone":"legacy"}', 3, 'legacy')`,
        [workspace.rows[0]?.id],
      );

      await client.query(await readFile(path.join(migrationsDirectory, "006_durable_workflow_memory.sql"), "utf8"));
      const backfilled = await client.query(
        `SELECT workflow.recipe_version, phase.phase, conversation.status,
                context.version, context.current_revision_id,
                revision.revision, revision.markdown, revision.status AS revision_status
         FROM workflow_instances AS workflow
         JOIN phase_instances AS phase ON phase.id = workflow.current_phase_instance_id
         JOIN conversations AS conversation
           ON conversation.workflow_instance_id = workflow.id
          AND conversation.status = 'active'
         JOIN workspace_context AS context ON context.workspace_id = workflow.workspace_id
         JOIN workspace_context_revisions AS revision
           ON revision.id = context.current_revision_id
         WHERE workflow.workspace_id = $1`,
        [workspace.rows[0]?.id],
      );
      expect(backfilled.rows[0]).toMatchObject({
        recipe_version: "legacy-v1",
        phase: 2,
        status: "active",
        version: 3,
        revision: 3,
        markdown: "Legacy voice",
        revision_status: "approved",
      });
      expect(backfilled.rows[0]?.current_revision_id).toBeTruthy();
    } finally {
      await client.query("RESET search_path");
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      client.release();
    }
  }, 30_000);

  it("serializes concurrent message ordinals and validates summary source boundaries", async () => {
    const organizationId = await createOrganization("Messages");
    const workspace = await createWorkspace(organizationId, "Message Brand");

    const messages = await Promise.all(Array.from({ length: 20 }, (_, index) =>
      workflows.appendMessage({
        workspaceId: workspace.id,
        organizationId,
        role: index % 2 === 0 ? "user" : "assistant",
        kind: "message",
        content: `Message ${index + 1}`,
        data: { index },
        actor: index % 2 === 0 ? "user:test" : "system:test",
      })));
    expect(messages.map((message) => Number(message.ordinal)).sort((a, b) => a - b))
      .toEqual(Array.from({ length: 20 }, (_, index) => index + 1));

    const summary = await workflows.createConversationSummary({
      workspaceId: workspace.id,
      organizationId,
      fromOrdinal: 1,
      throughOrdinal: 20,
      content: "A bounded summary of the first twenty messages.",
      data: { reason: "test" },
      createdBy: "system:test",
    });
    expect(summary).toMatchObject({ version: 1, from_ordinal: "1", through_ordinal: "20" });

    for (const ordinal of [21, 22, 23]) {
      await workflows.appendMessage({
        workspaceId: workspace.id,
        organizationId,
        role: "user",
        kind: "message",
        content: `Message ${ordinal}`,
        actor: "user:test",
      });
    }
    const memory = await workflows.getConversationMemory({
      workspaceId: workspace.id,
      organizationId,
      maxMessages: 2,
    });
    expect(memory.summary).toMatchObject({ version: 1, throughOrdinal: 20 });
    expect(memory.messages.map((message) => Number(message.ordinal))).toEqual([22, 23]);

    await expect(workflows.createConversationSummary({
      workspaceId: workspace.id,
      organizationId,
      fromOrdinal: 1,
      throughOrdinal: 24,
      content: "This range has a missing source message.",
      createdBy: "system:test",
    })).rejects.toMatchObject({ code: "summary_source_missing" });
  });

  it("answers the exact pending question once with optimistic and idempotent semantics", async () => {
    const organizationA = await createOrganization("Questions A");
    const organizationB = await createOrganization("Questions B");
    const workspace = await createWorkspace(organizationA, "Question Brand");
    const question = await workflows.createPendingQuestion({
      workspaceId: workspace.id,
      organizationId: organizationA,
      questionKey: "onboarding.primary_goal",
      prompt: "What is your primary social media goal?",
      purpose: "Used to prioritize the content strategy.",
      options: [
        { id: "awareness", label: "Build awareness" },
        { id: "leads", label: "Generate leads" },
      ],
      allowCustom: true,
      actor: "system:orchestrator",
    });

    expect(await workflows.getPendingQuestion(workspace.id, organizationA))
      .toMatchObject({ id: question.id, version: 1, status: "pending" });
    expect(await workflows.getPendingQuestion(workspace.id, organizationB)).toBeNull();
    await expect(workflows.createPendingQuestion({
      workspaceId: workspace.id,
      organizationId: organizationA,
      questionKey: "onboarding.audience",
      prompt: "Who is the audience?",
      actor: "system:orchestrator",
    })).rejects.toMatchObject({ code: "question_already_pending" });

    const request = {
      workspaceId: workspace.id,
      organizationId: organizationA,
      questionId: question.id,
      expectedVersion: 1,
      answer: { type: "option", optionId: "leads" },
      actor: "user:owner",
      idempotencyKey: "question-answer-1",
    } as const;
    await expect(workflows.answerQuestion({ ...request, organizationId: organizationB }))
      .rejects.toBeInstanceOf(AppError);
    await expect(workflows.answerQuestion({
      ...request,
      answer: { type: "option", optionId: "not-an-option" },
      idempotencyKey: "invalid-option",
    })).rejects.toBeInstanceOf(TypeError);

    const first = await workflows.answerQuestion(request);
    expect(first).toMatchObject({ questionId: question.id, questionVersion: 2, replayed: false });
    const replay = await workflows.answerQuestion(request);
    expect(replay).toMatchObject({
      answerId: first.answerId,
      messageId: first.messageId,
      questionVersion: 2,
      replayed: true,
    });

    await expect(workflows.answerQuestion({
      ...request,
      answer: { type: "option", optionId: "awareness" },
    }))
      .rejects.toMatchObject({ code: "idempotency_key_reused" });
    await expect(workflows.answerQuestion({
      ...request,
      idempotencyKey: "question-answer-stale",
      expectedVersion: 1,
    })).rejects.toMatchObject({ code: "question_changed" });

    const raceQuestion = await workflows.createPendingQuestion({
      workspaceId: workspace.id,
      organizationId: organizationA,
      questionKey: "onboarding.audience",
      prompt: "Which audience should we prioritize?",
      options: [
        { id: "founders", label: "Founders" },
        { id: "marketers", label: "Marketers" },
      ],
      allowCustom: false,
      actor: "system:orchestrator",
    });
    const race = await Promise.allSettled([
      workflows.answerQuestion({
        workspaceId: workspace.id,
        organizationId: organizationA,
        questionId: raceQuestion.id,
        expectedVersion: 1,
        answer: { type: "option", optionId: "founders" },
        actor: "user:owner",
        idempotencyKey: "audience-founders",
      }),
      workflows.answerQuestion({
        workspaceId: workspace.id,
        organizationId: organizationA,
        questionId: raceQuestion.id,
        expectedVersion: 1,
        answer: { type: "option", optionId: "marketers" },
        actor: "user:owner",
        idempotencyKey: "audience-marketers",
      }),
    ]);
    expect(race.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(race.filter((result) => result.status === "rejected")).toHaveLength(1);

    const persisted = await pool.query(
      `SELECT
         (SELECT count(*) FROM question_answers WHERE question_id = $1)::integer AS answers,
         (SELECT count(*) FROM conversation_messages
          WHERE workspace_id = $2 AND kind = 'answer')::integer AS messages`,
      [question.id, workspace.id],
    );
    expect(persisted.rows[0]).toEqual({ answers: 1, messages: 2 });
  });

  it("accepts compatible multi-select answers and rejects invalid combinations", async () => {
    const organizationId = await createOrganization("Multi Answer");
    const workspace = await createWorkspace(organizationId, "Multi Brand");
    const question = await workflows.createPendingQuestion({
      workspaceId: workspace.id,
      organizationId,
      questionKey: "brand.goals",
      prompt: "Which goals matter?",
      options: [
        { id: "leads", label: "Generate leads" },
        { id: "trust", label: "Build trust" },
      ],
      selectionMode: "multiple",
      allowCustom: true,
      actor: "system:test",
    });
    const base = {
      workspaceId: workspace.id,
      organizationId,
      questionId: question.id,
      expectedVersion: 1,
      actor: "user:owner",
    };
    await expect(workflows.answerQuestion({
      ...base,
      answer: { type: "multiple", optionIds: ["leads", "leads"] },
      idempotencyKey: "duplicate-goal",
    })).rejects.toBeInstanceOf(TypeError);
    await expect(workflows.answerQuestion({
      ...base,
      answer: { type: "multiple", optionIds: ["unknown"] },
      idempotencyKey: "unknown-goal",
    })).rejects.toBeInstanceOf(TypeError);
    await expect(workflows.answerQuestion({
      ...base,
      answer: { type: "multiple", optionIds: [] },
      idempotencyKey: "empty-goal",
    })).rejects.toBeInstanceOf(TypeError);
    const accepted = await workflows.answerQuestion({
      ...base,
      answer: { type: "multiple", optionIds: ["leads", "trust"], text: "Educate customers" },
      idempotencyKey: "valid-goals",
    });
    expect(accepted.replayed).toBe(false);
    const message = await pool.query(
      "SELECT content FROM conversation_messages WHERE id = $1",
      [accepted.messageId],
    );
    expect(message.rows[0]?.content).toBe("Generate leads; Build trust; Educate customers");

    const exclusive = await workflows.createPendingQuestion({
      workspaceId: workspace.id,
      organizationId,
      questionKey: "brand.account_type",
      prompt: "What type of account is this?",
      options: [
        { id: "personal", label: "Personal" },
        { id: "company", label: "Company" },
      ],
      actor: "system:test",
    });
    await expect(workflows.answerQuestion({
      ...base,
      questionId: exclusive.id,
      answer: { type: "multiple", optionIds: ["personal", "company"] },
      idempotencyKey: "exclusive-goals",
    })).rejects.toBeInstanceOf(TypeError);
  });

  it("keeps immutable context history and loads the exact pinned revision", async () => {
    const organizationId = await createOrganization("Context");
    const workspace = await createWorkspace(organizationId, "Context Brand");

    const first = await store.upsertContext(workspace.id, organizationId, {
      key: "brand.voice",
      markdown: "Warm and concise.",
      data: { tone: "warm" },
      source: "test",
      actor: "user:owner",
    });
    const second = await store.upsertContext(workspace.id, organizationId, {
      key: "brand.voice",
      markdown: "Warm, concise, and practical.",
      data: { tone: "warm", practical: true },
      source: "test",
      actor: "user:owner",
    });
    expect([first.version, second.version]).toEqual([1, 2]);

    const concurrent = await Promise.all(Array.from({ length: 5 }, (_, index) =>
      store.upsertContext(workspace.id, organizationId, {
        key: "brand.voice",
        markdown: `Concurrent revision ${index + 1}`,
        data: { index },
        source: "test",
        actor: "user:owner",
      })));
    expect(concurrent.map((revision) => revision.version).sort((a, b) => a - b))
      .toEqual([3, 4, 5, 6, 7]);

    const history = await workflows.listContextHistory(
      workspace.id,
      organizationId,
      "brand.voice",
    );
    expect(history.map((revision) => revision.revision)).toEqual([7, 6, 5, 4, 3, 2, 1]);
    const ascending = [...history].reverse();
    for (let index = 1; index < ascending.length; index += 1) {
      expect(ascending[index]?.parent_revision_id).toBe(ascending[index - 1]?.id);
    }
    expect(history.find((revision) => revision.id === second.revision_id)).toMatchObject({
      parent_revision_id: first.revision_id,
      status: "approved",
    });
    expect(history.at(-1)).toMatchObject({
      id: first.revision_id,
      markdown: "Warm and concise.",
      parent_revision_id: null,
    });

    const pinned = await workflows.loadContextRevisionsForExecution(
      workspace.id,
      [first.revision_id],
    );
    expect(pinned).toHaveLength(1);
    expect(pinned[0]).toMatchObject({
      id: first.revision_id,
      revision: 1,
      markdown: "Warm and concise.",
    });
    expect(await workflows.listContextHistory(workspace.id, randomUUID(), "brand.voice"))
      .toEqual([]);
    await expect(workflows.loadContextRevisionsForExecution(randomUUID(), [first.revision_id]))
      .rejects.toBeInstanceOf(AppError);
  });
});
