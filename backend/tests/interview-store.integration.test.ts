import { randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { InterviewStore } from "../src/db/interview-store.js";
import { migrate } from "../src/db/migrate.js";
import { createPool } from "../src/db/pool.js";
import { Store } from "../src/db/store.js";
import { WorkflowStore } from "../src/db/workflow-store.js";
import { AppError } from "../src/domain/errors.js";
import { getQuestionnaire } from "../src/interview/definitions.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = describe.skipIf(!databaseUrl);

integration("guided interview persistence", () => {
  let pool: pg.Pool;
  let workspaces: Store;
  let interviews: InterviewStore;
  let workflows: WorkflowStore;
  const organizations: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.DATABASE_SSL = "false";
    process.env.NODE_ENV = "test";
    await migrate();
    pool = createPool(loadConfig({
      ...process.env,
      DATABASE_URL: databaseUrl,
      DATABASE_SSL: "false",
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
    }));
    workspaces = new Store(pool);
    interviews = new InterviewStore(pool);
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
    return workspaces.createWorkspace({
      organizationId,
      name: label,
      slug: `${label.toLowerCase().replaceAll(" ", "-")}-${suffix}`,
      timezone: "Africa/Lagos",
      actor: `test:${organizationId}`,
    });
  }

  it("selects one guided authority and resumes one pinned session under concurrency", async () => {
    const organizationId = await createOrganization("Guided Concurrency");
    const workspace = await createWorkspace(organizationId, "New Brand");
    const results = await Promise.all(Array.from({ length: 12 }, () =>
      interviews.startOrResume({
        organizationId,
        workspaceId: workspace.id,
        actor: "user:owner",
      })));
    expect(new Set(results.map((result) => result.session?.id))).toHaveLength(1);
    expect(results.filter((result) => result.resumed === false)).toHaveLength(1);
    expect(results.every((result) => result.authority === "guided")).toBe(true);

    const counts = await pool.query(
      `SELECT
         (SELECT count(*) FROM interview_authorities WHERE workspace_id = $1)::integer AS authorities,
         (SELECT count(*) FROM interview_sessions WHERE workspace_id = $1)::integer AS sessions`,
      [workspace.id],
    );
    expect(counts.rows[0]).toEqual({ authorities: 1, sessions: 1 });
  });

  it("pins legacy authority when Phase-1 history already exists and never dual-writes", async () => {
    const organizationId = await createOrganization("Legacy Interview");
    const workspace = await createWorkspace(organizationId, "Legacy Brand");
    await workflows.createPendingQuestion({
      workspaceId: workspace.id,
      organizationId,
      questionKey: "onboarding.goal",
      prompt: "What is the goal?",
      options: [{ id: "growth", label: "Growth" }, { id: "trust", label: "Trust" }],
      allowCustom: true,
      actor: "system:legacy",
    });

    const first = await interviews.startOrResume({
      organizationId,
      workspaceId: workspace.id,
      actor: "system:m9-rollout",
    });
    const replay = await interviews.startOrResume({
      organizationId,
      workspaceId: workspace.id,
      actor: "system:m9-rollout",
    });
    expect(first).toEqual({ authority: "legacy", session: null, resumed: true });
    expect(replay).toEqual(first);
    expect((await pool.query(
      "SELECT count(*)::integer AS count FROM interview_sessions WHERE workspace_id = $1",
      [workspace.id],
    )).rows[0]?.count).toBe(0);
  });

  it("preserves an older questionnaire pin across a newer caller deployment", async () => {
    const organizationId = await createOrganization("Mixed Versions");
    const workspace = await createWorkspace(organizationId, "Pinned Brand");
    const old = await interviews.startOrResume({
      organizationId,
      workspaceId: workspace.id,
      actor: "user:owner",
      questionnaireVersion: "0.9.0",
    });
    const resumed = await interviews.startOrResume({
      organizationId,
      workspaceId: workspace.id,
      actor: "user:owner",
      questionnaireVersion: "1.0.0",
    });
    expect(old.session?.questionnaire_version).toBe("0.9.0");
    expect(resumed.session?.id).toBe(old.session?.id);
    expect(resumed.session?.questionnaire_version).toBe("0.9.0");
    expect(resumed.resumed).toBe(true);
  });

  it("stores bounded option provenance and assigns canonical ids to model text", async () => {
    const organizationId = await createOrganization("Option Provenance");
    const workspace = await createWorkspace(organizationId, "Option Brand");
    const started = await interviews.startOrResume({
      organizationId,
      workspaceId: workspace.id,
      actor: "user:owner",
    });
    const session = started.session!;
    const question = getQuestionnaire().questions[0]!;
    const curated = await interviews.saveOptionSet({
      organizationId,
      workspaceId: workspace.id,
      sessionId: session.id,
      questionId: question.id,
      questionVersion: question.version,
      origin: "curated",
      options: question.fallbackOptions,
    });
    const presented = await interviews.markOptionSetPresented({
      organizationId,
      workspaceId: workspace.id,
      sessionId: session.id,
      optionSetId: curated.id,
      interactionStarted: false,
    });
    expect(presented.presented_at).toBeInstanceOf(Date);
    expect(presented.interaction_started_at).toBeNull();
    const model = await interviews.saveOptionSet({
      organizationId,
      workspaceId: workspace.id,
      sessionId: session.id,
      questionId: question.id,
      questionVersion: question.version,
      origin: "model",
      options: [{ label: "A specialized consultancy" }, { label: "A membership community" }],
      generator: { provider: "test", model: "small-model", promptVersion: "options-v1" },
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    expect(model.options.map((item) => item.id)).toEqual([
      expect.stringMatching(/^suggestion_1_[a-f0-9]{12}$/),
      expect.stringMatching(/^suggestion_2_[a-f0-9]{12}$/),
    ]);
    expect(model).toMatchObject({
      origin: "model",
      generator_provider: "test",
      generator_model: "small-model",
      prompt_version: "options-v1",
      content_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    await interviews.markOptionSetPresented({
      organizationId,
      workspaceId: workspace.id,
      sessionId: session.id,
      optionSetId: model.id,
      interactionStarted: true,
    });
    await expect(interviews.saveOptionSet({
      organizationId,
      workspaceId: workspace.id,
      sessionId: session.id,
      questionId: question.id,
      questionVersion: question.version,
      origin: "programmatic",
      options: question.fallbackOptions,
    })).rejects.toMatchObject({ code: "option_set_in_use" });
    await pool.query(
      `UPDATE interview_option_sets
       SET expires_at = created_at + interval '1 microsecond'
       WHERE id = $1`,
      [model.id],
    );
    const replacementAfterExpiry = await interviews.saveOptionSet({
      organizationId,
      workspaceId: workspace.id,
      sessionId: session.id,
      questionId: question.id,
      questionVersion: question.version,
      origin: "programmatic",
      options: question.fallbackOptions,
    });
    expect(replacementAfterExpiry.origin).toBe("programmatic");
    expect((await pool.query(
      "SELECT status FROM interview_option_sets WHERE id = $1",
      [model.id],
    )).rows[0]?.status).toBe("expired");
    expect((await pool.query(
      "SELECT status FROM interview_option_sets WHERE id = $1",
      [curated.id],
    )).rows[0]?.status).toBe("superseded");
  });

  it("keeps answers idempotent, tenant-scoped, optimistic, and supersession-safe", async () => {
    const organizationA = await createOrganization("Answer A");
    const organizationB = await createOrganization("Answer B");
    const workspace = await createWorkspace(organizationA, "Answer Brand");
    const started = await interviews.startOrResume({
      organizationId: organizationA,
      workspaceId: workspace.id,
      actor: "user:owner",
    });
    const session = started.session!;
    const question = getQuestionnaire().questions[0]!;
    const options = await interviews.saveOptionSet({
      organizationId: organizationA,
      workspaceId: workspace.id,
      sessionId: session.id,
      questionId: question.id,
      questionVersion: question.version,
      origin: "curated",
      options: question.fallbackOptions,
    });
    const request = {
      organizationId: organizationA,
      workspaceId: workspace.id,
      sessionId: session.id,
      expectedSessionVersion: 1,
      questionId: question.id,
      questionVersion: question.version,
      optionSetId: options.id,
      selectedOptionIds: ["company_business"],
      customText: "A family-owned food business.",
      idempotencyKey: "answer-promotion-target-1",
      actor: "user:owner",
    } as const;

    await expect(interviews.saveAnswer({ ...request, organizationId: organizationB }))
      .rejects.toBeInstanceOf(AppError);
    const { customText: _customText, ...requestWithoutCustomText } = request;
    await expect(interviews.saveAnswer({
      ...requestWithoutCustomText,
      selectedOptionIds: ["something_else"],
      idempotencyKey: "answer-missing-required-custom-text",
    })).rejects.toBeInstanceOf(TypeError);
    const first = await interviews.saveAnswer(request);
    const replay = await interviews.saveAnswer(request);
    expect(first).toMatchObject({ replayed: false, sessionVersion: 2 });
    expect(first.answer).toMatchObject({
      answer_source: "combined",
      selected_option_ids: ["company_business"],
      custom_text: "A family-owned food business.",
      session_version: 2,
    });
    expect(replay).toMatchObject({
      replayed: true,
      sessionVersion: 2,
      answer: { id: first.answer.id },
    });
    await expect(interviews.saveAnswer({
      ...request,
      selectedOptionIds: ["personal_brand"],
    })).rejects.toMatchObject({ code: "idempotency_key_reused" });

    const changed = await interviews.saveAnswer({
      ...request,
      expectedSessionVersion: 2,
      selectedOptionIds: [],
      customText: "A cooperative for independent food producers.",
      idempotencyKey: "answer-promotion-target-2",
    });
    expect(changed).toMatchObject({ replayed: false, sessionVersion: 3 });
    expect(changed.answer).toMatchObject({
      answer_source: "custom",
      supersedes_answer_id: first.answer.id,
    });
    const history = await interviews.listAnswerHistory({
      organizationId: organizationA,
      workspaceId: workspace.id,
      sessionId: session.id,
      questionId: question.id,
    });
    expect(history.map((answer) => answer.status)).toEqual(["superseded", "active"]);
    expect(await interviews.getState({
      organizationId: organizationB,
      workspaceId: workspace.id,
    })).toBeNull();
  });

  it("allows only one concurrent answer for one expected session version", async () => {
    const organizationId = await createOrganization("Answer Race");
    const workspace = await createWorkspace(organizationId, "Race Brand");
    const started = await interviews.startOrResume({
      organizationId,
      workspaceId: workspace.id,
      actor: "user:owner",
    });
    const session = started.session!;
    const question = getQuestionnaire().questions[0]!;
    const optionSet = await interviews.saveOptionSet({
      organizationId,
      workspaceId: workspace.id,
      sessionId: session.id,
      questionId: question.id,
      questionVersion: question.version,
      origin: "curated",
      options: question.fallbackOptions,
    });
    const common = {
      organizationId,
      workspaceId: workspace.id,
      sessionId: session.id,
      expectedSessionVersion: 1,
      questionId: question.id,
      questionVersion: question.version,
      optionSetId: optionSet.id,
      actor: "user:owner",
    } as const;
    const results = await Promise.allSettled([
      interviews.saveAnswer({
        ...common,
        selectedOptionIds: ["company_business"],
        idempotencyKey: "race-company",
      }),
      interviews.saveAnswer({
        ...common,
        selectedOptionIds: ["personal_brand"],
        idempotencyKey: "race-personal",
      }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });
});
