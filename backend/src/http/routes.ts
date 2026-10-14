import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { principal, requireScope, requireService, requireUser } from "../auth/guards.js";
import { actorFor } from "../auth/principals.js";
import type { Container } from "../container.js";
import { assertExpectedMigration } from "../db/schema.js";
import { notFound } from "../domain/errors.js";
import { isTerminalProgressStage, type RunProgressEvent } from "../orchestration/progress.js";

const UuidParams = z.object({ id: z.string().uuid() });
const WorkspaceParams = z.object({ workspaceId: z.string().uuid() });
const RunEventsParams = z.object({
  workspaceId: z.string().uuid(),
  runId: z.string().uuid(),
});
const RunEventsQuery = z.object({
  lastEventId: z.string().regex(/^[1-9][0-9]{0,19}$/).optional(),
}).strict();
const QuestionParams = z.object({
  workspaceId: z.string().uuid(),
  questionId: z.string().uuid(),
});
const RunParams = z.object({ runId: z.string().uuid() });
const ArtifactParams = z.object({ artifactId: z.string().uuid() });
const FinalPostParams = z.object({ postId: z.string().uuid() });
const ExportJobParams = z.object({ jobId: z.string().uuid() });
const Slug = z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/);
const Timezone = z.string().trim().min(1).max(80).refine((value) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}, "Timezone must be a valid IANA time zone");

const WorkspaceBody = z.object({
  name: z.string().trim().min(1).max(160),
  slug: Slug,
  timezone: Timezone.default("UTC"),
});
const WorkspaceUpdateBody = z.object({
  expectedVersion: z.number().int().positive(),
  name: z.string().trim().min(1).max(160).optional(),
  timezone: Timezone.optional(),
}).strict().refine((value) => value.name !== undefined || value.timezone !== undefined, {
  message: "At least one workspace field is required",
});
const PageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().max(2_000).nullable().default(null),
}).strict();

const ContextBody = z.object({
  key: z.string().regex(/^(brand|strategy|calendar|social|analytics)\.[a-z0-9_.-]+$/),
  markdown: z.string().max(100_000).default(""),
  data: z.record(z.string(), z.unknown()).default({}),
});

const RunBody = z.object({
  skillName: z.string().min(1).max(80),
  input: z.record(z.string(), z.unknown()).default({}),
  completePhase: z.boolean().default(false),
  idempotencyKey: z.string().min(1).max(200).nullable().default(null),
}).superRefine((value, context) => {
  if (Buffer.byteLength(JSON.stringify(value.input), "utf8") > 200_000) {
    context.addIssue({ code: "custom", path: ["input"], message: "Input exceeds 200 KB" });
  }
});

const DecisionBody = z.object({
  note: z.string().max(2_000).nullable().default(null),
}).strict();
const RevisionBody = z.object({
  expectedReviewRevision: z.number().int().positive(),
  instructions: z.string().trim().min(1).max(10_000),
  idempotencyKey: z.string().min(1).max(200),
}).strict();
const ContinueBody = z.object({
  idempotencyKey: z.string().min(1).max(200),
}).strict();
const ExportBody = z.object({
  idempotencyKey: z.string().min(1).max(200),
}).strict();
const PreferencesBody = z.object({
  expectedVersion: z.number().int().positive(),
  timezone: Timezone,
  theme: z.enum(["dark", "light", "system"]),
  emailNotifications: z.boolean(),
  autopilotEnabled: z.boolean(),
  reviewRemindersEnabled: z.boolean(),
}).strict();
const PublicationBody = z.object({
  expectedVersion: z.number().int().positive(),
  status: z.enum(["not_scheduled", "scheduled", "published", "failed", "cancelled"]),
  idempotencyKey: z.string().min(1).max(200),
}).strict();
const AnswerBody = z.object({
  expectedVersion: z.number().int().positive(),
  answer: z.discriminatedUnion("type", [
    z.object({ type: z.literal("option"), optionId: z.string().min(1).max(80) }).strict(),
    z.object({ type: z.literal("custom"), text: z.string().min(1).max(10_000) }).strict(),
    z.object({
      type: z.literal("multiple"),
      optionIds: z.array(z.string().min(1).max(80)).max(20),
      text: z.string().trim().min(1).max(10_000).optional(),
    }).strict(),
  ]),
  idempotencyKey: z.string().min(1).max(200),
}).strict();

const InterviewStartBody = z.object({
  questionnaireId: z.string().min(1).max(120).optional(),
  questionnaireVersion: z.string().regex(/^\d+\.\d+\.\d+$/).optional(),
}).strict().default({});

const GuidedAnswerBody = z.object({
  sessionId: z.string().uuid(),
  expectedSessionVersion: z.number().int().positive(),
  questionId: z.string().min(1).max(120),
  questionVersion: z.number().int().positive(),
  optionSetId: z.string().uuid(),
  selectedOptionIds: z.array(z.string().min(1).max(120)).default([]),
  customText: z.string().trim().min(1).max(10_000).optional(),
  idempotencyKey: z.string().min(1).max(200),
}).strict();

const PresentOptionSetParams = z.object({
  workspaceId: z.string().uuid(),
  optionSetId: z.string().uuid(),
}).strict();

const PresentOptionSetBody = z.object({
  sessionId: z.string().uuid(),
  interactionStarted: z.boolean().default(false),
}).strict();

const PrefetchOptionsBody = z.object({
  sessionId: z.string().uuid(),
  questionnaireVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  targetQuestionIds: z.array(z.string().min(1).max(120)).min(1).max(5),
}).strict();

const ReviewStatus = z.enum(["draft", "approved", "rejected", "superseded"]);
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day;
}, "Date must be a real ISO calendar date");
const ContentCycleBody = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("next_week"),
    weekStart: IsoDate.optional(),
    changes: z.string().trim().max(4_000).optional(),
    nothingChanged: z.boolean().default(false),
    idempotencyKey: z.string().min(1).max(200),
  }).strict().refine((value) => value.nothingChanged || Boolean(value.changes), {
    path: ["changes"],
    message: "Describe what changed or confirm that nothing changed",
  }),
  z.object({
    mode: z.literal("extra_posts"),
    topic: z.string().trim().min(1).max(240),
    platforms: z.array(z.enum([
      "linkedin",
      "x",
      "instagram",
      "facebook",
      "tiktok",
      "youtube",
    ])).min(1).max(6).refine(
      (platforms) => new Set(platforms).size === platforms.length,
      "Platforms must not contain duplicates",
    ),
    quantity: z.number().int().min(1).max(15),
    publicationDate: IsoDate,
    instructions: z.string().trim().max(4_000).optional(),
    idempotencyKey: z.string().min(1).max(200),
  }).strict(),
  z.object({
    mode: z.literal("refresh_strategy"),
    changes: z.string().trim().min(1).max(4_000),
    idempotencyKey: z.string().min(1).max(200),
  }).strict(),
]);
const ArtifactQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().max(2_000).nullable().default(null),
  status: ReviewStatus.optional(),
  kind: z.string().min(1).max(80).optional(),
  logicalId: z.string().uuid().optional(),
  search: z.string().trim().min(1).max(200).optional(),
}).strict();
const FinalPostQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().max(2_000).nullable().default(null),
  status: ReviewStatus.optional(),
  platform: z.string().regex(/^[a-z0-9][a-z0-9_.-]{0,39}$/).optional(),
  sprint: z.string().min(1).max(120).optional(),
  week: z.coerce.number().int().min(1).max(53).optional(),
  campaign: z.string().min(1).max(200).optional(),
  dateFrom: IsoDate.optional(),
  dateTo: IsoDate.optional(),
  search: z.string().trim().min(1).max(200).optional(),
  view: z.enum(["flat", "grouped"]).default("flat"),
}).strict().superRefine((value, context) => {
  if (value.dateFrom && value.dateTo && value.dateFrom > value.dateTo) {
    context.addIssue({ code: "custom", path: ["dateTo"], message: "dateTo must not precede dateFrom" });
  }
});
const ActivityQuery = PageQuery.extend({
  workspaceId: z.string().uuid().optional(),
}).strict();
const ContextHistoryQuery = PageQuery.extend({
  key: z.string().regex(/^(brand|strategy|calendar|social|analytics)\.[a-z0-9_.-]+$/).optional(),
}).strict();

function publicRun(run: Record<string, unknown>) {
  const fields = [
    "id", "workspace_id", "phase", "skill_name", "status", "output_status",
    "complete_phase", "output", "review_thread_id", "review_revision",
    "supersedes_run_id", "revision_instructions", "output_decided_at",
    "output_decided_by", "output_decision_note", "progress_stage", "created_at", "updated_at",
    "approvals", "artifacts", "final_posts",
  ] as const;
  return Object.fromEntries(fields.flatMap((field) =>
    run[field] === undefined ? [] : [[field, run[field]]],
  ));
}

function groupPosts(items: Array<Record<string, unknown>>) {
  const sprints = new Map<string, Map<number, Map<string, Record<string, unknown>[]>>>();
  for (const item of items) {
    const sprint = String(item.sprint);
    const week = Number(item.week);
    const date = String(item.local_date);
    const weeks = sprints.get(sprint) ?? new Map();
    sprints.set(sprint, weeks);
    const days = weeks.get(week) ?? new Map();
    weeks.set(week, days);
    const posts = days.get(date) ?? [];
    days.set(date, posts);
    posts.push(item);
  }
  return [...sprints].map(([sprint, weeks]) => ({
    sprint,
    weeks: [...weeks].map(([week, days]) => ({
      week,
      days: [...days].map(([date, posts]) => ({ date, posts })),
    })),
  }));
}

export async function registerRoutes(app: FastifyInstance, container: Container): Promise<void> {
  app.get("/health", async () => ({ status: "ok" }));
  app.get("/ready", async () => {
    await container.pool.query("SELECT 1");
    await assertExpectedMigration(container.pool);
    await container.releases.assertAvailable(container.registry.bundle(), container.recipes);
    return {
      status: "ready",
      features: { guidedIntake: container.config.GUIDED_INTAKE_ENABLED },
    };
  });

  app.get("/v1/skills", { preHandler: requireScope("skills:read") }, async () =>
    container.registry.list().map(({ content, absolutePath, ...skill }) => skill),
  );

  app.post(
    "/v1/workspaces",
    { preHandler: requireScope("workspaces:write") },
    async (request, reply) => {
      const caller = principal(request);
      const body = WorkspaceBody.parse(request.body);
      const workspace = await container.store.createWorkspace({
        ...body,
        organizationId: caller.organizationId,
        actor: actorFor(caller),
      });
      await reply.code(201).send(workspace);
    },
  );

  app.get(
    "/v1/workspaces",
    { preHandler: requireScope("workspaces:read") },
    async (request) => {
      const caller = principal(request);
      const query = PageQuery.parse(request.query);
      const page = await container.store.listWorkspaces({
        organizationId: caller.organizationId,
        ...query,
      });
      return { workspaces: page.items, nextCursor: page.nextCursor };
    },
  );

  app.patch(
    "/v1/workspaces/:id",
    { preHandler: [requireScope("workspaces:write"), requireUser] },
    async (request) => {
      const caller = principal(request);
      const { id } = UuidParams.parse(request.params);
      const body = WorkspaceUpdateBody.parse(request.body);
      return container.productStore.updateWorkspace({
        workspaceId: id,
        organizationId: caller.organizationId,
        actor: actorFor(caller),
        expectedVersion: body.expectedVersion,
        ...(body.name === undefined ? {} : { name: body.name }),
        ...(body.timezone === undefined ? {} : { timezone: body.timezone }),
      });
    },
  );

  app.get(
    "/v1/account/preferences",
    { preHandler: [requireScope("workspaces:read"), requireUser] },
    async (request) => {
      const caller = principal(request);
      if (caller.kind !== "user") throw notFound("Account preferences");
      return container.productStore.getPreferences(caller.organizationId, caller.userId);
    },
  );

  app.put(
    "/v1/account/preferences",
    { preHandler: [requireScope("workspaces:write"), requireUser] },
    async (request) => {
      const caller = principal(request);
      if (caller.kind !== "user") throw notFound("Account preferences");
      const body = PreferencesBody.parse(request.body);
      return container.productStore.updatePreferences({
        organizationId: caller.organizationId,
        userId: caller.userId,
        actor: actorFor(caller),
        ...body,
      });
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/continue",
    { preHandler: [requireScope("runs:execute"), requireUser] },
    async (request, reply) => {
      const caller = principal(request);
      const { workspaceId } = WorkspaceParams.parse(request.params);
      const body = ContinueBody.parse(request.body);
      const run = await container.orchestration.enqueueNext({
        organizationId: caller.organizationId,
        actor: actorFor(caller),
        workspaceId,
        idempotencyKey: body.idempotencyKey,
        correlationId: request.id,
      });
      await reply.code(202).send({ id: run.id, status: run.status, phase: run.phase });
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/content-cycles",
    { preHandler: [requireScope("runs:execute"), requireUser] },
    async (request, reply) => {
      const caller = principal(request);
      const { workspaceId } = WorkspaceParams.parse(request.params);
      const body = ContentCycleBody.parse(request.body);
      const targetPhase = body.mode === "extra_posts" ? 3 : 2;
      const { idempotencyKey, mode, ...brief } = body;
      const cycle = await container.store.startContentCycle({
        workspaceId,
        organizationId: caller.organizationId,
        actor: actorFor(caller),
        mode,
        brief,
        idempotencyKey,
        recipeVersion: container.recipes.get(targetPhase).version,
      });
      const run = await container.orchestration.enqueueNext({
        organizationId: caller.organizationId,
        actor: actorFor(caller),
        workspaceId,
        idempotencyKey: `${idempotencyKey}:first-run`,
        correlationId: request.id,
      });
      await reply.code(202).send({
        ...cycle,
        run: { id: run.id, status: run.status, phase: run.phase },
      });
    },
  );

  app.get(
    "/v1/workspaces/:workspaceId/workflow",
    { preHandler: [requireScope("workspaces:read"), requireUser] },
    async (request) => {
      const caller = principal(request);
      const { workspaceId } = WorkspaceParams.parse(request.params);
      const state = await container.workflowStore.getState(workspaceId, caller.organizationId);
      if (!state) throw notFound("Workflow");
      if (state.phase !== 3) return state;
      const worklist = await container.store.getCalendarWorklist(workspaceId, caller.organizationId);
      return {
        ...state,
        contentPlan: {
          total: worklist.slots.length,
          drafted: worklist.writtenKeys.size,
          slots: worklist.slots.map((slot) => ({
            ...slot, drafted: worklist.writtenKeys.has(slot.key),
          })),
        },
      };
    },
  );

  app.get(
    "/v1/workspaces/:workspaceId/runs",
    { preHandler: [requireScope("workspaces:read"), requireUser] },
    async (request) => {
      const caller = principal(request);
      const { workspaceId } = WorkspaceParams.parse(request.params);
      const query = PageQuery.parse(request.query);
      return container.productStore.listRuns({
        workspaceId,
        organizationId: caller.organizationId,
        ...query,
      });
    },
  );

  app.get(
    "/v1/activity",
    { preHandler: [requireScope("workspaces:read"), requireUser] },
    async (request) => {
      const caller = principal(request);
      const query = ActivityQuery.parse(request.query);
      return container.productStore.listActivity({
        organizationId: caller.organizationId,
        limit: query.limit,
        cursor: query.cursor,
        ...(query.workspaceId === undefined ? {} : { workspaceId: query.workspaceId }),
      });
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/questions/:questionId/answer",
    { preHandler: [requireScope("runs:execute"), requireUser] },
    async (request, reply) => {
      const caller = principal(request);
      const { workspaceId, questionId } = QuestionParams.parse(request.params);
      const body = AnswerBody.parse(request.body);
      const result = await container.orchestration.answerQuestion({
        organizationId: caller.organizationId,
        actor: actorFor(caller),
        workspaceId,
        questionId,
        correlationId: request.id,
        ...body,
      });
      await reply.code(202).send(result);
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/interview/start",
    { preHandler: [requireScope("workspaces:write"), requireUser] },
    async (request, reply) => {
      const caller = principal(request);
      const { workspaceId } = WorkspaceParams.parse(request.params);
      const body = InterviewStartBody.parse(request.body ?? {});
      const result = await container.interview.startOrResume({
        organizationId: caller.organizationId,
        workspaceId,
        actor: actorFor(caller),
        correlationId: request.id,
        ...(body.questionnaireId ? { questionnaireId: body.questionnaireId } : {}),
        ...(body.questionnaireVersion ? { questionnaireVersion: body.questionnaireVersion } : {}),
      });
      await reply.code(200).send(result);
    },
  );

  app.get(
    "/v1/workspaces/:workspaceId/interview",
    { preHandler: [requireScope("workspaces:read"), requireUser] },
    async (request) => {
      const caller = principal(request);
      const { workspaceId } = WorkspaceParams.parse(request.params);
      const state = await container.interview.getState({
        organizationId: caller.organizationId,
        workspaceId,
        correlationId: request.id,
      });
      if (!state) throw notFound("Interview");
      return state;
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/interview/answers",
    { preHandler: [requireScope("workspaces:write"), requireUser] },
    async (request) => {
      const caller = principal(request);
      const { workspaceId } = WorkspaceParams.parse(request.params);
      const body = GuidedAnswerBody.parse(request.body);
      return container.interview.submitAnswer({
        organizationId: caller.organizationId,
        workspaceId,
        actor: actorFor(caller),
        correlationId: request.id,
        sessionId: body.sessionId,
        expectedSessionVersion: body.expectedSessionVersion,
        questionId: body.questionId,
        questionVersion: body.questionVersion,
        optionSetId: body.optionSetId,
        selectedOptionIds: body.selectedOptionIds,
        ...(body.customText !== undefined ? { customText: body.customText } : {}),
        idempotencyKey: body.idempotencyKey,
      });
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/interview/options/:optionSetId/present",
    { preHandler: [requireScope("workspaces:write"), requireUser] },
    async (request) => {
      const caller = principal(request);
      const { workspaceId, optionSetId } = PresentOptionSetParams.parse(request.params);
      const body = PresentOptionSetBody.parse(request.body);
      return container.interview.markOptionSetPresented({
        organizationId: caller.organizationId,
        workspaceId,
        sessionId: body.sessionId,
        optionSetId,
        interactionStarted: body.interactionStarted,
      });
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/interview/options/prefetch",
    { preHandler: [requireScope("workspaces:write"), requireUser] },
    async (request, reply) => {
      const caller = principal(request);
      const { workspaceId } = WorkspaceParams.parse(request.params);
      const body = PrefetchOptionsBody.parse(request.body);
      const queued = await container.optionAssistant.prefetchOptions({
        organizationId: caller.organizationId,
        workspaceId,
        sessionId: body.sessionId,
        questionnaireVersion: body.questionnaireVersion,
        targetQuestionIds: body.targetQuestionIds,
      });
      await reply.code(202).send({ status: queued ? "queued" : "fallback" });
    },
  );

  app.get(
    "/v1/workspaces/:id",
    { preHandler: requireScope("workspaces:read") },
    async (request) => {
      const caller = principal(request);
      const { id } = UuidParams.parse(request.params);
      const workspace = await container.store.getWorkspace(id, caller.organizationId);
      if (!workspace) throw notFound("Workspace");
      return workspace;
    },
  );

  app.get(
    "/v1/workspaces/:workspaceId/context",
    { preHandler: requireScope("workspaces:read") },
    async (request) => {
      const caller = principal(request);
      const { workspaceId } = WorkspaceParams.parse(request.params);
      const workspace = await container.store.getWorkspace(workspaceId, caller.organizationId);
      if (!workspace) throw notFound("Workspace");
      const query = PageQuery.parse(request.query);
      const page = await container.store.listContextPage({
        workspaceId,
        organizationId: caller.organizationId,
        ...query,
      });
      return { context: page.items, nextCursor: page.nextCursor };
    },
  );

  app.get(
    "/v1/workspaces/:workspaceId/context/history",
    { preHandler: [requireScope("workspaces:read"), requireUser] },
    async (request) => {
      const caller = principal(request);
      const { workspaceId } = WorkspaceParams.parse(request.params);
      const query = ContextHistoryQuery.parse(request.query);
      return container.productStore.listContextHistory({
        workspaceId,
        organizationId: caller.organizationId,
        limit: query.limit,
        cursor: query.cursor,
        ...(query.key === undefined ? {} : { key: query.key }),
      });
    },
  );

  app.put(
    "/v1/workspaces/:workspaceId/context",
    { preHandler: requireScope("workspaces:write") },
    async (request) => {
      const caller = principal(request);
      const { workspaceId } = WorkspaceParams.parse(request.params);
      const body = ContextBody.parse(request.body);
      return container.store.upsertContext(workspaceId, caller.organizationId, {
        ...body,
        source: "api",
        actor: actorFor(caller),
      });
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/runs",
    { preHandler: [requireScope("runs:execute"), requireService] },
    async (request, reply) => {
      const caller = principal(request);
      const { workspaceId } = WorkspaceParams.parse(request.params);
      const body = RunBody.parse(request.body);
      const run = await container.orchestration.enqueue({
        organizationId: caller.organizationId,
        actor: actorFor(caller),
        workspaceId,
        skillName: body.skillName,
        payload: body.input,
        completePhase: body.completePhase,
        idempotencyKey: body.idempotencyKey,
        correlationId: request.id,
      });
      await reply.code(202).send(publicRun(run as unknown as Record<string, unknown>));
    },
  );

  app.get(
    "/v1/runs/:runId",
    { preHandler: requireScope("workspaces:read") },
    async (request) => {
      const caller = principal(request);
      const { runId } = RunParams.parse(request.params);
      const run = await container.store.getRun(runId, caller.organizationId);
      if (!run) throw notFound("Run");
      return publicRun(run as unknown as Record<string, unknown>);
    },
  );

  const handleRunEventsStream = async (
    workspaceId: string,
    runId: string,
    organizationId: string,
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    const query = RunEventsQuery.parse(request.query ?? {});

    const run = await container.runProgress.getCurrentRunState({
      runId,
      workspaceId,
      organizationId,
    });

    const lastEventHeader = request.headers["last-event-id"];
    const headerId = typeof lastEventHeader === "string" && /^[1-9][0-9]{0,19}$/.test(lastEventHeader)
      ? lastEventHeader
      : undefined;
    const afterEventId = headerId ?? query.lastEventId;

    // Finish all fallible setup reads before hijacking Fastify's response so a
    // database error can still use the normal JSON error boundary.
    const historical = await container.runProgress.listEventsForRun({
      runId,
      workspaceId,
      organizationId,
      ...(afterEventId !== undefined ? { afterEventId } : {}),
    });

    container.runProgress.acquireConnection(organizationId);
    container.metrics.recordSseConnectionOpened();

    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("X-Accel-Buffering", "no");
    reply.raw.flushHeaders();
    reply.hijack();

    let highestSeenId = afterEventId ?? "0";
    let closed = false;
    let isPolling = false;

    let unsubscribe = () => {};
    let keepaliveTimer: NodeJS.Timeout | undefined;
    let pollTimer: NodeJS.Timeout | undefined;

    const cleanup = () => {
      if (closed) return;
      closed = true;
      if (keepaliveTimer) clearInterval(keepaliveTimer);
      if (pollTimer) clearInterval(pollTimer);
      unsubscribe();
      container.runProgress.releaseConnection(organizationId);
      container.metrics.recordSseConnectionClosed();
    };

    request.raw.on("close", cleanup);

    const sendEvent = (event: RunProgressEvent) => {
      if (closed || reply.raw.writableEnded || reply.raw.destroyed) return;
      if (BigInt(event.id) <= BigInt(highestSeenId)) return;
      highestSeenId = event.id;
      container.metrics.recordSseEventEmitted();
      const payload = JSON.stringify({
        runId: event.runId,
        workspaceId: event.workspaceId,
        phase: event.phase,
        skillName: event.skillName,
        stage: event.stage,
        occurredAt: event.occurredAt,
      });
      try {
        reply.raw.write(`id: ${event.id}\nevent: progress\ndata: ${payload}\n\n`);
      } catch {
        cleanup();
        return;
      }
      if (isTerminalProgressStage(event.stage)) {
        cleanup();
        reply.raw.end();
      }
    };

    try {
      for (const event of historical) {
        sendEvent(event);
      }

      if (closed || run.isTerminal) {
        if (!closed) {
          cleanup();
          reply.raw.end();
        }
        return;
      }

      unsubscribe = container.runProgress.subscribe(runId, (event) => {
        sendEvent(event);
      });

      keepaliveTimer = setInterval(() => {
        if (closed || reply.raw.writableEnded || reply.raw.destroyed) return;
        try {
          reply.raw.write(": keepalive\n\n");
        } catch {
          cleanup();
        }
      }, 15_000);
      keepaliveTimer.unref();

      pollTimer = setInterval(async () => {
        if (closed || isPolling) return;
        isPolling = true;
        try {
          const fresh = await container.runProgress.listEventsForRun({
            runId,
            workspaceId,
            organizationId,
            afterEventId: highestSeenId,
          });
          for (const ev of fresh) {
            sendEvent(ev);
          }
        } catch {
          // ignore transient poll error
        } finally {
          isPolling = false;
        }
      }, 1500);
      pollTimer.unref();
    } catch (error) {
      cleanup();
      throw error;
    }
  };

  app.get(
    "/v1/workspaces/:workspaceId/runs/:runId/events",
    { preHandler: [requireScope("workspaces:read"), requireUser] },
    async (request, reply) => {
      const caller = principal(request);
      const { workspaceId, runId } = RunEventsParams.parse(request.params);
      await handleRunEventsStream(workspaceId, runId, caller.organizationId, request, reply);
    },
  );

  app.get(
    "/v1/runs/:runId/events",
    { preHandler: [requireScope("workspaces:read"), requireUser] },
    async (request, reply) => {
      const caller = principal(request);
      const { runId } = RunParams.parse(request.params);
      const run = await container.store.getRun(runId, caller.organizationId);
      if (!run) throw notFound("Run");
      await handleRunEventsStream(run.workspace_id, runId, caller.organizationId, request, reply);
    },
  );

  for (const [route, approved] of [["approve", true], ["reject", false]] as const) {
    app.post(
      `/v1/runs/:runId/${route}`,
      { preHandler: [requireScope("runs:approve"), requireUser] },
      async (request) => {
        const caller = principal(request);
        const { runId } = RunParams.parse(request.params);
        const body = DecisionBody.parse(request.body);
        const run = await container.orchestration.decide({
          organizationId: caller.organizationId,
          runId,
          approved,
          actor: actorFor(caller),
          note: body.note,
        });
        if (!run) throw notFound("Run");
        return publicRun(run as unknown as Record<string, unknown>);
      },
    );
  }

  app.post(
    "/v1/runs/:runId/revise",
    { preHandler: [requireScope("runs:approve"), requireUser] },
    async (request, reply) => {
      const caller = principal(request);
      const { runId } = RunParams.parse(request.params);
      const body = RevisionBody.parse(request.body);
      const run = await container.orchestration.requestRevision({
        organizationId: caller.organizationId,
        actor: actorFor(caller),
        runId,
        correlationId: request.id,
        ...body,
      });
      await reply.code(202).send({
        id: run.id,
        status: run.status,
        phase: run.phase,
        reviewThreadId: run.review_thread_id,
        reviewRevision: run.review_revision,
        supersedesRunId: run.supersedes_run_id,
      });
    },
  );

  app.get(
    "/v1/workspaces/:workspaceId/artifacts",
    { preHandler: requireScope("workspaces:read") },
    async (request) => {
      const caller = principal(request);
      const { workspaceId } = WorkspaceParams.parse(request.params);
      const query = ArtifactQuery.parse(request.query);
      return container.contentStore.listArtifacts({
        workspaceId,
        organizationId: caller.organizationId,
        ...query,
      });
    },
  );

  app.get(
    "/v1/artifacts/:artifactId",
    { preHandler: requireScope("workspaces:read") },
    async (request) => {
      const caller = principal(request);
      const { artifactId } = ArtifactParams.parse(request.params);
      const artifact = await container.contentStore.getArtifact(artifactId, caller.organizationId);
      if (!artifact) throw notFound("Artifact");
      return artifact;
    },
  );

  app.get(
    "/v1/workspaces/:workspaceId/final-posts",
    { preHandler: requireScope("workspaces:read") },
    async (request) => {
      const caller = principal(request);
      const { workspaceId } = WorkspaceParams.parse(request.params);
      const { view, ...query } = FinalPostQuery.parse(request.query);
      const page = await container.contentStore.listFinalPosts({
        workspaceId,
        organizationId: caller.organizationId,
        ...query,
      });
      return view === "grouped" ? { ...page, groups: groupPosts(page.items) } : page;
    },
  );

  app.get(
    "/v1/final-posts/:postId",
    { preHandler: requireScope("workspaces:read") },
    async (request) => {
      const caller = principal(request);
      const { postId } = FinalPostParams.parse(request.params);
      const post = await container.contentStore.getFinalPost(postId, caller.organizationId);
      if (!post) throw notFound("Final post");
      return post;
    },
  );

  app.post(
    "/v1/final-posts/:postId/publication",
    { preHandler: [requireScope("runs:approve"), requireUser] },
    async (request) => {
      const caller = principal(request);
      const { postId } = FinalPostParams.parse(request.params);
      const body = PublicationBody.parse(request.body);
      return container.productStore.updatePublication({
        postId,
        organizationId: caller.organizationId,
        actor: actorFor(caller),
        expectedVersion: body.expectedVersion,
        status: body.status,
        idempotencyKey: body.idempotencyKey,
      });
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/exports/obsidian",
    { preHandler: requireScope("exports:write") },
    async (request, reply) => {
      const caller = principal(request);
      const { workspaceId } = WorkspaceParams.parse(request.params);
      if (!container.obsidian) {
        return reply.code(503).send({
          error: { code: "export_unavailable", message: "Obsidian export is not configured" },
        });
      }
      // Compatibility endpoint for the existing client. Hosted deployments
      // should prefer the durable job endpoint below.
      return container.obsidian.exportWorkspace(workspaceId, caller.organizationId);
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/exports/obsidian/jobs",
    { preHandler: requireScope("exports:write") },
    async (request, reply) => {
      const caller = principal(request);
      const { workspaceId } = WorkspaceParams.parse(request.params);
      const body = ExportBody.parse(request.body);
      const job = await container.queue.enqueueObsidianExport({
        workspaceId,
        organizationId: caller.organizationId,
        idempotencyKey: body.idempotencyKey,
        correlationId: request.id,
        maxAttempts: container.config.WORKER_MAX_ATTEMPTS,
        maxActiveJobs: container.config.QUEUE_MAX_ACTIVE_JOBS,
      });
      return reply.code(202).send(job);
    },
  );

  app.get(
    "/v1/workspaces/:workspaceId/exports/obsidian/jobs",
    { preHandler: [requireScope("workspaces:read"), requireUser] },
    async (request) => {
      const caller = principal(request);
      const { workspaceId } = WorkspaceParams.parse(request.params);
      const query = PageQuery.parse(request.query);
      return container.productStore.listObsidianJobs({
        workspaceId,
        organizationId: caller.organizationId,
        ...query,
      });
    },
  );

  app.get(
    "/v1/exports/obsidian/jobs/:jobId",
    { preHandler: [requireScope("workspaces:read"), requireUser] },
    async (request) => {
      const caller = principal(request);
      const { jobId } = ExportJobParams.parse(request.params);
      const job = await container.productStore.getObsidianJob(jobId, caller.organizationId);
      if (!job) throw notFound("Obsidian export job");
      return job;
    },
  );
}
