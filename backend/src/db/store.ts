import type pg from "pg";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { badRequest, conflict, notFound } from "../domain/errors.js";
import type { LlmAction, LlmExecution, SkillExecutionResult } from "../domain/schemas.js";
import type { PhaseNumber } from "../domain/workflow.js";
import type { WorkspaceContext } from "../skills/prompt-compiler.js";
import { writeAuditEvent } from "./audit.js";
import { appendApprovedContextRevision } from "./context-revisions.js";
import {
  enforceModelQueueAdmission,
  LeaseLostError,
  type JobLease,
  type QueueAdmissionPolicy,
} from "./jobs.js";
import { initializeWorkspaceWorkflow } from "./workflow-store.js";
import type { RunProgressService } from "../orchestration/progress.js";
import { extraPostSlots, parseCalendarSlots, type CalendarSlot } from "../orchestration/calendar-slots.js";

export type WorkspaceRow = {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  timezone: string;
  current_phase: PhaseNumber;
  status: string;
  version: number;
  created_at: Date;
};

function encodeCursor(value: Record<string, string>): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeCursor(value: string | null, fields: readonly string[]): Record<string, string> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    const record = parsed as Record<string, unknown>;
    if (!fields.every((field) => typeof record[field] === "string")) throw new Error();
    return record as Record<string, string>;
  } catch {
    throw badRequest("invalid_cursor", "The pagination cursor is invalid");
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireWorkspaceCursor(
  cursor: Record<string, string> | null,
): { createdAt: string; id: string } | null {
  if (!cursor) return null;
  const validInstant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(cursor.createdAt!) &&
    Number.isFinite(Date.parse(cursor.createdAt!));
  if (!validInstant || !UUID_PATTERN.test(cursor.id!)) {
    throw badRequest("invalid_cursor", "The pagination cursor is invalid");
  }
  return { createdAt: cursor.createdAt!, id: cursor.id! };
}

function requireContextCursor(cursor: Record<string, string> | null): { key: string } | null {
  if (!cursor) return null;
  // Context keys are identifiers, not arbitrary SQL input. Keep malformed or
  // oversized values away from PostgreSQL even though the query is parameterized.
  if (!/^[a-z0-9][a-z0-9._:-]{0,199}$/i.test(cursor.key!)) {
    throw badRequest("invalid_cursor", "The pagination cursor is invalid");
  }
  return { key: cursor.key! };
}

export type RunRow = {
  id: string;
  workspace_id: string;
  phase: PhaseNumber;
  skill_name: string;
  status: string;
  output_status: "pending" | "accepted" | "rejected" | null;
  complete_phase: boolean;
  input: Record<string, unknown>;
  output: SkillExecutionResult | null;
  idempotency_key: string | null;
  recipe_suite_id: string | null;
  recipe_id: string | null;
  recipe_version: string | null;
  skill_bundle_version: string | null;
  skill_content_hash: string | null;
  orchestrator_hash: string | null;
  bridge_hash: string | null;
  review_thread_id: string;
  review_revision: number;
  supersedes_run_id: string | null;
  revision_instructions: string | null;
  execution_fence: number | null;
  correlation_id: string;
  progress_stage?: string;
  created_at: Date;
  updated_at: Date;
};

/**
 * Locks the queue attempt before the run. Recovery uses the same order. Once
 * this succeeds, a reclaimer cannot change the fence until this transaction
 * commits or rolls back.
 */
async function assertActiveRunLease(
  client: pg.PoolClient,
  runId: string,
  lease: JobLease,
): Promise<void> {
  const current = await client.query(
    `SELECT 1
     FROM job_queue AS job
     JOIN workflow_runs AS run ON run.id = $2
     WHERE job.id = $1
       AND job.type = 'execute_workflow_run'
       AND job.payload->>'runId' = $2::text
       AND job.status = 'running'
       AND job.locked_by = $3
       AND job.lease_token = $4
       AND job.lease_expires_at > now()
       AND run.status = 'running'
       AND run.execution_fence = $4
     FOR UPDATE OF job, run`,
    [lease.jobId, runId, lease.owner, lease.token],
  );
  if (!current.rowCount) {
    throw new LeaseLostError(`Run ${runId} is no longer owned by lease ${lease.token}`);
  }
}

/** Advances both compatibility and durable phase state inside the caller's transaction. */
async function advanceDurablePhase(
  client: pg.PoolClient,
  input: {
    workspaceId: string;
    fromPhase: PhaseNumber;
    toPhase: PhaseNumber;
    recipeVersion: string;
    incrementCycle?: boolean;
  },
): Promise<void> {
  const current = await client.query(
    `SELECT workflow.id AS workflow_id,
            workflow.current_phase_instance_id AS phase_instance_id,
            phase.phase,
            phase.cycle
     FROM workflow_instances AS workflow
     JOIN phase_instances AS phase
       ON phase.id = workflow.current_phase_instance_id
      AND phase.workflow_instance_id = workflow.id
      AND phase.workspace_id = workflow.workspace_id
     WHERE workflow.workspace_id = $1
       AND workflow.status = 'active'
       AND phase.status = 'active'
     FOR UPDATE OF workflow, phase`,
    [input.workspaceId],
  );
  const row = current.rows[0] as
    | { workflow_id: string; phase_instance_id: string; phase: number; cycle: number }
    | undefined;
  if (!row || Number(row.phase) !== input.fromPhase) {
    throw conflict("phase_changed", "Durable workflow phase changed during transition");
  }
  const completed = await client.query(
    `UPDATE phase_instances
     SET status = 'completed', completed_at = now(), version = version + 1, updated_at = now()
     WHERE id = $1 AND status = 'active'`,
    [row.phase_instance_id],
  );
  if (!completed.rowCount) throw conflict("phase_changed", "The phase instance is no longer active");

  const nextCycle = input.incrementCycle || (input.fromPhase === 6 && input.toPhase === 2)
    ? Number(row.cycle) + 1
    : Number(row.cycle);
  const inserted = await client.query(
    `INSERT INTO phase_instances(
       workflow_instance_id, workspace_id, phase, cycle, attempt, status, recipe_version
     ) VALUES ($1, $2, $3, $4, 1, 'active', $5)
     RETURNING id`,
    [row.workflow_id, input.workspaceId, input.toPhase, nextCycle, input.recipeVersion],
  );
  const nextPhaseInstanceId = String(inserted.rows[0]?.id);
  const workflow = await client.query(
    `UPDATE workflow_instances
     SET current_phase_instance_id = $2, recipe_version = $3,
         version = version + 1, updated_at = now()
     WHERE id = $1 AND current_phase_instance_id = $4 AND status = 'active'`,
    [row.workflow_id, nextPhaseInstanceId, input.recipeVersion, row.phase_instance_id],
  );
  if (!workflow.rowCount) throw conflict("phase_changed", "The workflow instance changed during transition");
  await client.query(
    `UPDATE pending_questions
     SET status = 'superseded', version = version + 1, updated_at = now()
     WHERE workspace_id = $1 AND phase_instance_id = $2 AND status = 'pending'`,
    [input.workspaceId, row.phase_instance_id],
  );
}

function conversationActionData(action: LlmAction): Record<string, unknown> {
  if (action.type === "propose_output" || action.type === "request_approval") {
    return {
      type: action.type,
      message: action.message,
      artifacts: action.artifacts.map(({ kind, slug, title }) => ({ kind, slug, title })),
      contextUpdates: action.contextUpdates.map(({ key }) => ({ key })),
      finalPostCount: action.finalPosts?.length ?? 0,
    };
  }
  return action;
}

function conversationActionContent(action: LlmAction): string {
  if (action.type === "ask_user") return action.prompt;
  if (action.type === "request_tool") return `Requested tool: ${action.tool}`;
  if (action.type === "request_optional_skill") {
    return `Requested optional skill: ${action.skill}`;
  }
  return action.message;
}

/** Appends compact model actions and exact bounded tool results to durable memory. */
async function appendConversationAction(
  client: pg.PoolClient,
  input: {
    runId: string;
    execution: LlmExecution;
    runtimeResult?: unknown;
  },
): Promise<void> {
  const workspace = await client.query(
    `SELECT workspaces.id
     FROM workflow_runs
     JOIN workspaces ON workspaces.id = workflow_runs.workspace_id
     WHERE workflow_runs.id = $1
     FOR UPDATE OF workspaces`,
    [input.runId],
  );
  if (!workspace.rows[0]) throw notFound("Run");
  const state = await client.query(
    `SELECT conversation.id AS conversation_id,
            conversation.next_message_ordinal,
            workflow.current_phase_instance_id AS phase_instance_id
     FROM workflow_runs AS run
     JOIN workflow_instances AS workflow ON workflow.workspace_id = run.workspace_id
     JOIN conversations AS conversation
       ON conversation.workflow_instance_id = workflow.id
      AND conversation.workspace_id = run.workspace_id
      AND conversation.status = 'active'
     WHERE run.id = $1
     FOR UPDATE OF conversation`,
    [input.runId],
  );
  const row = state.rows[0] as
    | { conversation_id: string; next_message_ordinal: string; phase_instance_id: string }
    | undefined;
  if (!row) throw notFound("Active conversation");
  const firstOrdinal = Number(row.next_message_ordinal);
  const action = input.execution.action;
  await client.query(
    `INSERT INTO conversation_messages(
       conversation_id, workspace_id, phase_instance_id, ordinal,
       role, kind, content, data, actor, provider, model,
       input_tokens, output_tokens
     ) VALUES ($1, $2, $3, $4, 'assistant', $5, $6, $7,
               'system:model', $8, $9, $10, $11)`,
    [row.conversation_id, workspace.rows[0].id, row.phase_instance_id, firstOrdinal,
      action.type === "request_tool" ? "tool_request" : "action",
      conversationActionContent(action),
      { runId: input.runId, action: conversationActionData(action) },
      input.execution.provider, input.execution.model,
      input.execution.usage.inputTokens, input.execution.usage.outputTokens],
  );
  let messageCount = 1;
  if (input.runtimeResult !== undefined) {
    const isToolResult = action.type === "request_tool" &&
      !(input.runtimeResult as { rejected?: unknown } | null)?.rejected;
    await client.query(
      `INSERT INTO conversation_messages(
         conversation_id, workspace_id, phase_instance_id, ordinal,
         role, kind, content, data, actor
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'system:runtime')`,
      [row.conversation_id, workspace.rows[0].id, row.phase_instance_id, firstOrdinal + 1,
        isToolResult ? "tool" : "system",
        isToolResult ? "tool_result" : "error",
        isToolResult ? `Result from tool: ${action.tool}` : "Model action rejected by runtime policy",
        { runId: input.runId, result: input.runtimeResult }],
    );
    messageCount += 1;
  }
  await client.query(
    `UPDATE conversations
     SET next_message_ordinal = next_message_ordinal + $2, updated_at = now()
     WHERE id = $1`,
    [row.conversation_id, messageCount],
  );
}

export class Store {
  constructor(
    readonly pool: pg.Pool,
    readonly runProgress: RunProgressService | null = null,
  ) {}

  async createWorkspace(input: {
    organizationId: string;
    name: string;
    slug: string;
    timezone: string;
    actor: string;
  }): Promise<WorkspaceRow> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `INSERT INTO workspaces(organization_id, name, slug, timezone)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [input.organizationId, input.name, input.slug, input.timezone],
      );
      const workspace = result.rows[0] as WorkspaceRow;
      await initializeWorkspaceWorkflow(client, workspace.id);
      await writeAuditEvent(client, {
        organizationId: input.organizationId,
        workspaceId: workspace.id,
        actor: input.actor,
        action: "workspace.created",
        entityType: "workspace",
        entityId: workspace.id,
      });
      await client.query("COMMIT");
      return workspace;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getWorkspace(id: string, organizationId: string): Promise<WorkspaceRow | null> {
    const result = await this.pool.query(
      "SELECT * FROM workspaces WHERE id = $1 AND organization_id = $2",
      [id, organizationId],
    );
    return (result.rows[0] as WorkspaceRow | undefined) ?? null;
  }

  /**
   * Starts an explicit recurring-content cycle without touching approved brand
   * memory. The command and phase transition share one transaction so a retry
   * can never create two cycles or lose the owner's temporary brief.
   */
  async startContentCycle(input: {
    workspaceId: string;
    organizationId: string;
    actor: string;
    mode: "next_week" | "extra_posts" | "refresh_strategy";
    brief: Record<string, unknown>;
    idempotencyKey: string;
    recipeVersion: string;
  }): Promise<{
    mode: "next_week" | "extra_posts" | "refresh_strategy";
    phase: PhaseNumber;
    cycle: number;
    week: number;
  }> {
    const targetPhase: PhaseNumber = input.mode === "extra_posts" ? 3 : 2;
    const requestHash = createHash("sha256")
      .update(JSON.stringify({ mode: input.mode, brief: input.brief }))
      .digest("hex");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `${input.organizationId}:${input.idempotencyKey}`,
      ]);
      const receipt = await client.query(
        `SELECT command, request_hash, response
         FROM product_command_receipts
         WHERE organization_id = $1 AND idempotency_key = $2`,
        [input.organizationId, input.idempotencyKey],
      );
      if (receipt.rows[0]) {
        if (receipt.rows[0].command !== "workspace.content_cycle" ||
            receipt.rows[0].request_hash !== requestHash) {
          throw conflict("idempotency_key_reused", "The idempotency key was used for another command");
        }
        await client.query("COMMIT");
        return receipt.rows[0].response as {
          mode: "next_week" | "extra_posts" | "refresh_strategy";
          phase: PhaseNumber;
          cycle: number;
          week: number;
        };
      }

      const state = await client.query(
        `SELECT workspace.current_phase, workspace.status,
                phase.cycle, workflow.recipe_version,
                EXISTS (
                  SELECT 1 FROM workspace_context AS context
                  WHERE context.workspace_id = workspace.id
                    AND context.key LIKE 'brand.%'
                ) AS has_brand_context,
                COALESCE((
                  SELECT max(post.week) FROM final_posts AS post
                  WHERE post.workspace_id = workspace.id
                    AND post.status = 'approved'
                ), 0) AS latest_week
         FROM workspaces AS workspace
         JOIN workflow_instances AS workflow ON workflow.workspace_id = workspace.id
         JOIN phase_instances AS phase ON phase.id = workflow.current_phase_instance_id
         WHERE workspace.id = $1 AND workspace.organization_id = $2
         FOR UPDATE OF workspace, workflow, phase`,
        [input.workspaceId, input.organizationId],
      );
      const row = state.rows[0] as Record<string, unknown> | undefined;
      if (!row) throw notFound("Workspace");
      if (row.status !== "ready") {
        throw conflict("workspace_busy", "Finish or review the current work before starting another batch");
      }
      if (!row.has_brand_context) {
        throw conflict("brand_context_required", "Complete and approve brand onboarding first");
      }

      const fromPhase = Number(row.current_phase) as PhaseNumber;
      if (fromPhase === 1) {
        throw conflict("onboarding_required", "Complete brand onboarding before creating recurring content");
      }
      const nextCycle = Number(row.cycle) + 1;
      const latestWeek = Number(row.latest_week);
      if ((input.mode === "next_week" || input.mode === "extra_posts") && latestWeek === 0) {
        throw conflict(
          "approved_posts_required",
          "Finish and approve the current content batch before starting another one",
        );
      }
      if ((input.mode === "next_week" || input.mode === "extra_posts") && fromPhase < 5) {
        throw conflict(
          "current_batch_incomplete",
          "Finish the current content workflow before starting another batch",
        );
      }
      const week = input.mode === "extra_posts"
        ? Math.max(1, latestWeek)
        : latestWeek + 1;
      const activeBrief = {
        mode: input.mode,
        cycle: nextCycle,
        week,
        ...input.brief,
      };
      await appendApprovedContextRevision(client, {
        workspaceId: input.workspaceId,
        key: "calendar.active_brief",
        markdown: "",
        data: activeBrief,
        source: "owner-command",
        actor: input.actor,
        decisionNote: `Started ${input.mode.replaceAll("_", " ")}`,
      });
      const updated = await client.query(
        `UPDATE workspaces
         SET current_phase = $3, status = 'ready', version = version + 1,
             updated_at = now()
         WHERE id = $1 AND organization_id = $2 AND status = 'ready'
         RETURNING id`,
        [input.workspaceId, input.organizationId, targetPhase],
      );
      if (!updated.rowCount) throw conflict("workspace_changed", "The workspace changed before the cycle started");
      await advanceDurablePhase(client, {
        workspaceId: input.workspaceId,
        fromPhase,
        toPhase: targetPhase,
        recipeVersion: input.recipeVersion,
        incrementCycle: true,
      });

      const response = { mode: input.mode, phase: targetPhase, cycle: nextCycle, week };
      await client.query(
        `INSERT INTO product_command_receipts(
           organization_id, idempotency_key, command, request_hash, response
         ) VALUES ($1, $2, 'workspace.content_cycle', $3, $4)`,
        [input.organizationId, input.idempotencyKey, requestHash, response],
      );
      await writeAuditEvent(client, {
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        actor: input.actor,
        action: "workspace.content_cycle_started",
        entityType: "workflow_instance",
        data: response,
      });
      await client.query("COMMIT");
      return response;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /** Worker-only ownership lookup for a run already resolved from the trusted queue. */
  async getOrganizationIdForWorkspace(workspaceId: string): Promise<string> {
    const result = await this.pool.query(
      "SELECT organization_id FROM workspaces WHERE id = $1",
      [workspaceId],
    );
    const organizationId = result.rows[0]?.organization_id as string | undefined;
    if (!organizationId) throw notFound("Workspace");
    return organizationId;
  }

  async listWorkspaces(input: {
    organizationId: string;
    limit: number;
    cursor: string | null;
  }): Promise<{ items: WorkspaceRow[]; nextCursor: string | null }> {
    const cursor = requireWorkspaceCursor(decodeCursor(input.cursor, ["createdAt", "id"]));
    const result = await this.pool.query(
      `SELECT * FROM workspaces
       WHERE organization_id = $1
         AND ($2::timestamptz IS NULL OR (created_at, id) < ($2::timestamptz, $3::uuid))
       ORDER BY created_at DESC, id DESC
       LIMIT $4`,
      [input.organizationId, cursor?.createdAt ?? null, cursor?.id ?? null, input.limit + 1],
    );
    const items = result.rows as WorkspaceRow[];
    const hasMore = items.length > input.limit;
    if (hasMore) items.pop();
    const last = items.at(-1);
    return {
      items,
      nextCursor: hasMore && last
        ? encodeCursor({ createdAt: new Date(last.created_at).toISOString(), id: last.id })
        : null,
    };
  }

  async listContextPage(input: {
    workspaceId: string;
    organizationId: string;
    limit: number;
    cursor: string | null;
  }): Promise<{ items: WorkspaceContext[]; nextCursor: string | null }> {
    const cursor = requireContextCursor(decodeCursor(input.cursor, ["key"]));
    const result = await this.pool.query(
      `SELECT context.key, context.markdown, context.data, context.version
       FROM workspace_context AS context
       JOIN workspaces ON workspaces.id = context.workspace_id
       WHERE context.workspace_id = $1
         AND workspaces.organization_id = $2
         AND ($3::text IS NULL OR context.key > $3)
       ORDER BY context.key
       LIMIT $4`,
      [input.workspaceId, input.organizationId, cursor?.key ?? null, input.limit + 1],
    );
    const items = result.rows as WorkspaceContext[];
    const hasMore = items.length > input.limit;
    if (hasMore) items.pop();
    const last = items.at(-1);
    return {
      items,
      nextCursor: hasMore && last ? encodeCursor({ key: last.key }) : null,
    };
  }

  async listContext(workspaceId: string, organizationId: string): Promise<WorkspaceContext[]> {
    const result = await this.pool.query(
      `SELECT context.key, context.markdown, context.data, context.version
       FROM workspace_context AS context
       JOIN workspaces ON workspaces.id = context.workspace_id
       WHERE context.workspace_id = $1 AND workspaces.organization_id = $2
       ORDER BY context.key`,
      [workspaceId, organizationId],
    );
    return result.rows as WorkspaceContext[];
  }

  /** Worker-only lookup. HTTP handlers must use the organization-scoped method above. */
  async listContextForExecution(workspaceId: string): Promise<WorkspaceContext[]> {
    const result = await this.pool.query(
      `SELECT key, markdown, data, version
       FROM workspace_context WHERE workspace_id = $1 ORDER BY key`,
      [workspaceId],
    );
    return result.rows as WorkspaceContext[];
  }

  /** Loads the immutable context snapshot captured when a run was enqueued. */
  async listPinnedContextForRun(runId: string): Promise<WorkspaceContext[]> {
    const result = await this.pool.query(
      `SELECT revision.key, revision.markdown, revision.data,
              revision.revision AS version
       FROM workflow_run_context_revisions AS pinned
       JOIN workspace_context_revisions AS revision
         ON revision.id = pinned.revision_id
        AND revision.workspace_id = pinned.workspace_id
        AND revision.key = pinned.context_key
       WHERE pinned.run_id = $1
       ORDER BY revision.key`,
      [runId],
    );
    return result.rows as WorkspaceContext[];
  }

  async listApprovedArtifacts(workspaceId: string, organizationId: string) {
    const result = await this.pool.query(
      `SELECT artifacts.id, artifacts.run_id, artifacts.kind, artifacts.slug,
              artifacts.title, artifacts.content, artifacts.metadata, artifacts.version
       FROM artifacts
       JOIN workspaces ON workspaces.id = artifacts.workspace_id
       WHERE artifacts.workspace_id = $1
         AND workspaces.organization_id = $2
         AND artifacts.status = 'approved'
       ORDER BY artifacts.created_at, artifacts.id`,
      [workspaceId, organizationId],
    );
    return result.rows as Array<{
      id: string;
      run_id: string | null;
      kind: string;
      slug: string;
      title: string;
      content: string;
      metadata: Record<string, unknown>;
      version: number;
    }>;
  }

  /** Bounded worker/tool lookup; full export uses the dedicated method above. */
  async listRecentApprovedArtifacts(input: {
    workspaceId: string;
    organizationId: string;
    limit: number;
    kinds: readonly string[];
  }) {
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 60) {
      throw new RangeError("Artifact tool limit must be between 1 and 60");
    }
    if (input.kinds.length > 10) throw new RangeError("Artifact tool accepts at most 10 kinds");
    const result = await this.pool.query(
      `SELECT artifacts.id, artifacts.kind, artifacts.slug, artifacts.title,
              artifacts.content, artifacts.metadata, artifacts.version,
              artifacts.created_at
       FROM artifacts
       JOIN workspaces ON workspaces.id = artifacts.workspace_id
       WHERE artifacts.workspace_id = $1
         AND workspaces.organization_id = $2
         AND artifacts.status = 'approved'
         AND (cardinality($3::text[]) = 0 OR artifacts.kind = ANY($3::text[]))
       ORDER BY artifacts.created_at DESC, artifacts.id DESC
       LIMIT $4`,
      [input.workspaceId, input.organizationId, input.kinds, input.limit],
    );
    return result.rows as Array<{
      id: string;
      kind: string;
      slug: string;
      title: string;
      content: string;
      metadata: Record<string, unknown>;
      version: number;
      created_at: Date;
    }>;
  }

  async upsertContext(
    workspaceId: string,
    organizationId: string,
    context: {
      key: string;
      markdown: string;
      data: Record<string, unknown>;
      source: string;
      actor: string;
    },
  ): Promise<WorkspaceContext & { revision_id: string }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const owner = await client.query(
        `SELECT id FROM workspaces
         WHERE id = $1 AND organization_id = $2
         FOR UPDATE`,
        [workspaceId, organizationId],
      );
      if (!owner.rows[0]) throw notFound("Workspace");
      const row = await appendApprovedContextRevision(client, {
        workspaceId,
        key: context.key,
        markdown: context.markdown,
        data: context.data,
        source: context.source,
        actor: context.actor,
      });
      await writeAuditEvent(client, {
        organizationId,
        workspaceId,
        actor: context.actor,
        action: "context.updated",
        entityType: "workspace_context",
        entityId: context.key,
        data: { version: row.version, source: context.source },
      });
      await client.query("COMMIT");
      return row;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async enqueueRun(input: {
    organizationId: string;
    actor: string;
    workspaceId: string;
    expectedPhase: PhaseNumber;
    skillName: string;
    completePhase: boolean;
    payload: Record<string, unknown>;
    idempotencyKey: string | null;
    maxAttempts: number;
    correlationId: string;
    admission: QueueAdmissionPolicy;
    release: {
      recipeSuiteId: string;
      recipeId: string;
      recipeVersion: string;
      skillBundleVersion: string;
      skillContentHash: string;
      orchestratorHash: string;
      bridgeHash: string;
    };
  }): Promise<RunRow> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const workspaceResult = await client.query(
        `SELECT * FROM workspaces
         WHERE id = $1 AND organization_id = $2
         FOR UPDATE`,
        [input.workspaceId, input.organizationId],
      );
      const workspace = workspaceResult.rows[0] as WorkspaceRow | undefined;
      if (!workspace) throw notFound("Workspace");
      if (input.idempotencyKey) {
        const existing = await client.query(
          `SELECT * FROM workflow_runs WHERE workspace_id = $1 AND idempotency_key = $2`,
          [input.workspaceId, input.idempotencyKey],
        );
        if (existing.rows[0]) {
          const prior = existing.rows[0] as RunRow;
          if (
            prior.skill_name !== input.skillName ||
            prior.complete_phase !== input.completePhase ||
            !isDeepStrictEqual(prior.input, input.payload)
          ) {
            throw conflict(
              "idempotency_key_reused",
              "The idempotency key was already used for a different request",
            );
          }
          await client.query("COMMIT");
          return prior;
        }
      }

      if (workspace.status === "archived") {
        throw conflict("workspace_archived", "Archived workspaces cannot start runs");
      }
      if (workspace.status !== "ready") {
        throw conflict("workspace_busy", "The workspace already has an active run or approval");
      }
      if (workspace.current_phase !== input.expectedPhase) {
        throw conflict("phase_changed", "The workspace phase changed before the run was queued");
      }

      await enforceModelQueueAdmission(client, input.organizationId, input.admission);

      const inserted = await client.query(
        `INSERT INTO workflow_runs(
           workspace_id, phase, skill_name, complete_phase, input, idempotency_key,
           recipe_suite_id, recipe_id, recipe_version, skill_bundle_version,
           skill_content_hash, orchestrator_hash, bridge_hash, correlation_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING *`,
        [input.workspaceId, input.expectedPhase, input.skillName, input.completePhase,
          input.payload, input.idempotencyKey, input.release.recipeSuiteId,
          input.release.recipeId, input.release.recipeVersion,
          input.release.skillBundleVersion, input.release.skillContentHash,
          input.release.orchestratorHash, input.release.bridgeHash, input.correlationId],
      );
      const run = inserted.rows[0] as RunRow;
      await client.query(
        `INSERT INTO workflow_run_context_revisions(
           run_id, workspace_id, revision_id, context_key
         )
         SELECT $1, workspace_id, current_revision_id, key
         FROM workspace_context
         WHERE workspace_id = $2`,
        [run.id, input.workspaceId],
      );
      await client.query(
        `INSERT INTO job_queue(type, payload, max_attempts, correlation_id)
         VALUES (
           'execute_workflow_run',
           jsonb_build_object('runId', $1::text, 'organizationId', $2::text),
           $3,
           $4
         )`,
        [run.id, input.organizationId, input.maxAttempts, input.correlationId],
      );
      await client.query(
        "UPDATE workspaces SET status = 'running', updated_at = now() WHERE id = $1",
        [input.workspaceId],
      );
      await writeAuditEvent(client, {
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        actor: input.actor,
        action: "run.queued",
        entityType: "workflow_run",
        entityId: run.id,
        data: { skillName: input.skillName, phase: input.expectedPhase },
      });
      if (this.runProgress) {
        await this.runProgress.recordStage(client, {
          runId: run.id,
          workspaceId: input.workspaceId,
          phase: input.expectedPhase,
          skillName: input.skillName,
          stage: "queued",
        });
      }
      await client.query("COMMIT");
      return run;
    } catch (error) {
      await client.query("ROLLBACK");
      if ((error as { code?: string }).code === "23505") {
        throw conflict("workspace_busy", "The workspace already has an active run");
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async getRun(id: string, organizationId: string) {
    const run = await this.pool.query(
      `SELECT workflow_runs.* FROM workflow_runs
       JOIN workspaces ON workspaces.id = workflow_runs.workspace_id
       WHERE workflow_runs.id = $1 AND workspaces.organization_id = $2`,
      [id, organizationId],
    );
    if (!run.rows[0]) return null;
    const [approvals, artifacts, finalPosts] = await Promise.all([
      this.pool.query("SELECT * FROM approvals WHERE run_id = $1 ORDER BY requested_at", [id]),
      this.pool.query("SELECT * FROM artifacts WHERE run_id = $1 ORDER BY created_at", [id]),
      this.pool.query(
        `SELECT id, workspace_id, run_id, source_artifact_id, logical_id,
                parent_revision_id, revision, logical_key, sprint, week,
                local_date::text AS local_date,
                extract(isodow from local_date)::integer AS day_of_week,
                timezone, platform, campaign, topic, pillar, content_format,
                title, content, pinned_comment, metadata, status,
                publication_status, publication_version, revision_instructions, created_by,
                decided_by, decided_at, created_at
         FROM final_posts WHERE run_id = $1 ORDER BY local_date, platform, id`,
        [id],
      ),
    ]);
    return {
      ...(run.rows[0] as RunRow),
      approvals: approvals.rows,
      artifacts: artifacts.rows,
      final_posts: finalPosts.rows,
    };
  }

  async listAcceptedSkills(
    workspaceId: string,
    organizationId: string,
    phase: PhaseNumber,
  ): Promise<Set<string>> {
    const result = await this.pool.query(
      `SELECT DISTINCT runs.skill_name
       FROM workflow_runs AS runs
       JOIN workspaces ON workspaces.id = runs.workspace_id
       JOIN workflow_instances AS workflow ON workflow.workspace_id = workspaces.id
       JOIN phase_instances AS phase_instance
         ON phase_instance.id = workflow.current_phase_instance_id
       WHERE runs.workspace_id = $1
         AND workspaces.organization_id = $2
         AND runs.phase = $3
         AND phase_instance.phase = $3
         AND runs.created_at >= phase_instance.started_at
         AND runs.status = 'completed'
         AND runs.output_status = 'accepted'`,
      [workspaceId, organizationId, phase],
    );
    return new Set(result.rows.map((row) => String(row.skill_name)));
  }

  /** The calendar is the source of truth; a writer run only covers its pinned slots. */
  async getCalendarWorklist(workspaceId: string, organizationId: string): Promise<{
    slots: CalendarSlot[];
    writtenKeys: Set<string>;
  }> {
    const activeBrief = await this.pool.query(
      `SELECT context.current_revision_id, context.data
       FROM workspace_context AS context
       JOIN workspaces ON workspaces.id = context.workspace_id
       WHERE context.workspace_id = $1 AND workspaces.organization_id = $2
         AND context.key = 'calendar.active_brief'`,
      [workspaceId, organizationId],
    );
    const brief = activeBrief.rows[0] as
      | { current_revision_id: string; data: Record<string, unknown> }
      | undefined;
    let slots: CalendarSlot[];
    if (brief?.data.mode === "extra_posts") {
      try {
        slots = extraPostSlots(brief.current_revision_id, brief.data);
      } catch (error) {
        throw conflict("content_brief_invalid", (error as Error).message);
      }
    } else {
      const calendar = await this.pool.query(
        `SELECT artifact.id, artifact.content FROM artifacts AS artifact
         JOIN workspaces ON workspaces.id = artifact.workspace_id
         WHERE artifact.workspace_id = $1 AND workspaces.organization_id = $2
           AND artifact.kind = 'content-calendar' AND artifact.status = 'approved'
         ORDER BY artifact.created_at DESC, artifact.id DESC LIMIT 1`,
        [workspaceId, organizationId],
      );
      const source = calendar.rows[0] as { id: string; content: string } | undefined;
      if (!source) throw conflict("calendar_required", "Approve a content calendar before writing posts");
      try {
        slots = parseCalendarSlots(source.id, source.content);
      } catch (error) {
        throw conflict("calendar_slots_invalid", `Approved calendar cannot be scheduled: ${(error as Error).message}`);
      }
    }
    const completed = await this.pool.query(
      `SELECT runs.input->'content_slots' AS slots
       FROM workflow_runs AS runs
       JOIN workspaces ON workspaces.id = runs.workspace_id
       JOIN workflow_instances AS workflow ON workflow.workspace_id = workspaces.id
       JOIN phase_instances AS phase_instance ON phase_instance.id = workflow.current_phase_instance_id
       WHERE runs.workspace_id = $1 AND workspaces.organization_id = $2
         AND phase_instance.phase = 3 AND runs.phase = 3
         AND runs.created_at >= phase_instance.started_at
         AND runs.skill_name = 'post-writer-sms' AND runs.status = 'completed'
         AND runs.output_status = 'accepted'`,
      [workspaceId, organizationId],
    );
    const writtenKeys = new Set<string>();
    for (const row of completed.rows as { slots: { key?: string }[] | null }[]) {
      for (const slot of Array.isArray(row.slots) ? row.slots : []) {
        if (typeof slot.key === "string") writtenKeys.add(slot.key);
      }
    }
    const scheduledKeys = new Set(slots.map((slot) => slot.key));
    return { slots, writtenKeys: new Set([...writtenKeys].filter((key) => scheduledKeys.has(key))) };
  }

  async beginRun(runId: string, lease: JobLease): Promise<
    { state: "started"; run: RunRow } | { state: "terminal" }
  > {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const currentLease = await client.query(
        `SELECT run.status
         FROM job_queue AS job
         JOIN workflow_runs AS run ON run.id = $2
         WHERE job.id = $1
           AND job.type = 'execute_workflow_run'
           AND job.payload->>'runId' = $2::text
           AND job.status = 'running'
           AND job.locked_by = $3
           AND job.lease_token = $4
           AND job.lease_expires_at > now()
         FOR UPDATE OF job, run`,
        [lease.jobId, runId, lease.owner, lease.token],
      );
      if (!currentLease.rows[0]) {
        throw new LeaseLostError(`Run ${runId} is no longer owned by lease ${lease.token}`);
      }
      const result = await client.query(
        `UPDATE workflow_runs
         SET status = 'running', execution_fence = $2,
             started_at = COALESCE(started_at, now()), updated_at = now()
         WHERE id = $1 AND status = 'queued' RETURNING *`,
        [runId, lease.token],
      );
      const run = result.rows[0] as RunRow | undefined;
      if (run) {
        if (this.runProgress) {
          await this.runProgress.recordStage(client, {
            runId,
            workspaceId: run.workspace_id,
            phase: run.phase,
            skillName: run.skill_name,
            stage: "loading_context",
          });
        }
        await client.query("COMMIT");
        return { state: "started", run };
      }

      const status = currentLease.rows[0]?.status as string | undefined;
      if (!status) throw notFound("Run");
      if (["completed", "waiting_approval", "rejected", "failed", "cancelled"].includes(status)) {
        await client.query("COMMIT");
        return { state: "terminal" };
      }
      throw conflict("run_not_ready", `Run cannot start from status '${status}'`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async createStep(input: {
    runId: string;
    skillName: string;
    promptSnapshot: Record<string, unknown>;
    payload: Record<string, unknown>;
    lease: JobLease;
  }): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await assertActiveRunLease(client, input.runId, input.lease);
      const result = await client.query(
        `INSERT INTO workflow_steps(
           run_id, ordinal, skill_name, status, prompt_snapshot, input, correlation_id
         )
         SELECT $1,
           COALESCE((SELECT MAX(ordinal) + 1 FROM workflow_steps WHERE run_id = $1), 1),
           $2, 'running', $3, $4, correlation_id
         FROM workflow_runs WHERE id = $1
         RETURNING id`,
        [input.runId, input.skillName, input.promptSnapshot, input.payload],
      );
      await client.query("COMMIT");
      return String(result.rows[0]?.id);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async finishIntermediateStep(input: {
    runId: string;
    stepId: string;
    execution: LlmExecution;
    runtimeResult?: unknown;
    lease: JobLease;
  }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await assertActiveRunLease(client, input.runId, input.lease);
      // Lock the workspace/conversation aggregate before child step rows. This
      // matches terminal commits and avoids inverse lock ordering.
      await appendConversationAction(client, input);
      const updated = await client.query(
        `UPDATE workflow_steps
         SET status = 'completed', output = $2, completed_at = now()
         WHERE id = $1 AND run_id = $3 AND status = 'running'
         RETURNING id`,
        [input.stepId, {
          action: input.execution.action,
          ...(input.runtimeResult === undefined ? {} : { runtimeResult: input.runtimeResult }),
        }, input.runId],
      );
      if (!updated.rowCount) throw conflict("step_changed", "The model step is no longer running");
      await client.query(
        `INSERT INTO llm_usage(
           run_id, provider, model, input_tokens, output_tokens, total_tokens,
           provider_response_id, duration_ms, estimated_cost_microusd
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [input.runId, input.execution.provider, input.execution.model,
          input.execution.usage.inputTokens, input.execution.usage.outputTokens,
          input.execution.usage.totalTokens, input.execution.providerResponseId,
          input.execution.durationMs ?? null, input.execution.estimatedCostMicrousd ?? null],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /** Commits an adaptive question and releases the workspace in one transaction. */
  async finishRunAwaitingInput(input: {
    run: RunRow;
    stepId: string;
    execution: LlmExecution;
    action: Extract<LlmAction, { type: "ask_user" }>;
    result: SkillExecutionResult;
    lease: JobLease;
  }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await assertActiveRunLease(client, input.run.id, input.lease);
      const state = await client.query(
        `SELECT workspaces.organization_id, workflow.id AS workflow_id,
                workflow.current_phase_instance_id AS phase_instance_id,
                conversation.id AS conversation_id,
                conversation.next_message_ordinal
         FROM workspaces
         JOIN workflow_instances AS workflow ON workflow.workspace_id = workspaces.id
         JOIN conversations AS conversation
           ON conversation.workflow_instance_id = workflow.id
          AND conversation.workspace_id = workspaces.id
          AND conversation.status = 'active'
         WHERE workspaces.id = $1
         FOR UPDATE OF workspaces, workflow, conversation`,
        [input.run.workspace_id],
      );
      const row = state.rows[0] as Record<string, unknown> | undefined;
      if (!row) throw notFound("Active workflow");
      const question = await client.query(
        `INSERT INTO pending_questions(
           workspace_id, workflow_instance_id, phase_instance_id,
           question_key, prompt, purpose, options, allow_custom, selection_mode
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [input.run.workspace_id, row.workflow_id, row.phase_instance_id,
          input.action.questionKey, input.action.prompt, input.action.purpose,
          JSON.stringify(input.action.options), input.action.allowCustom,
          input.action.selectionMode],
      );
      await client.query(
        `INSERT INTO conversation_messages(
           conversation_id, workspace_id, phase_instance_id, ordinal,
           role, kind, content, data, actor, provider, model,
           input_tokens, output_tokens
         ) VALUES ($1, $2, $3, $4, 'assistant', 'action', $5, $6,
                   'system:model', $7, $8, $9, $10)`,
        [row.conversation_id, input.run.workspace_id, row.phase_instance_id,
          row.next_message_ordinal, input.action.prompt,
          { runId: input.run.id, questionId: question.rows[0]?.id, action: input.action },
          input.execution.provider, input.execution.model,
          input.execution.usage.inputTokens, input.execution.usage.outputTokens],
      );
      await client.query(
        `UPDATE conversations
         SET next_message_ordinal = next_message_ordinal + 1, updated_at = now()
         WHERE id = $1`,
        [row.conversation_id],
      );
      const updatedStep = await client.query(
        `UPDATE workflow_steps
         SET status = 'completed', output = $2, completed_at = now()
         WHERE id = $1 AND run_id = $3 AND status = 'running'`,
        [input.stepId, { action: input.execution.action, result: input.result }, input.run.id],
      );
      if (!updatedStep.rowCount) throw conflict("step_changed", "The model step is no longer running");
      await client.query(
        `INSERT INTO llm_usage(
           run_id, provider, model, input_tokens, output_tokens, total_tokens,
           provider_response_id, duration_ms, estimated_cost_microusd
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [input.run.id, input.execution.provider, input.execution.model,
          input.execution.usage.inputTokens, input.execution.usage.outputTokens,
          input.execution.usage.totalTokens, input.execution.providerResponseId,
          input.execution.durationMs ?? null, input.execution.estimatedCostMicrousd ?? null],
      );
      const updatedRun = await client.query(
        `UPDATE workflow_runs
         SET status = 'completed', output_status = NULL, output = $2,
             provider = $3, model = $4, provider_response_id = $5,
             completed_at = now(), error_code = NULL, error_message = NULL,
             execution_fence = NULL, updated_at = now()
         WHERE id = $1 AND status = 'running'`,
        [input.run.id, input.result, input.execution.provider,
          input.execution.model, input.execution.providerResponseId],
      );
      if (!updatedRun.rowCount) throw conflict("run_changed", "The workflow run is no longer running");
      await client.query(
        "UPDATE workspaces SET status = 'ready', updated_at = now() WHERE id = $1",
        [input.run.workspace_id],
      );
      await writeAuditEvent(client, {
        organizationId: String(row.organization_id),
        workspaceId: input.run.workspace_id,
        actor: "system:worker",
        action: "run.awaiting_input",
        entityType: "workflow_run",
        entityId: input.run.id,
        data: { questionId: question.rows[0]?.id, questionKey: input.action.questionKey },
      });
      if (this.runProgress) {
        await this.runProgress.recordStage(client, {
          runId: input.run.id,
          workspaceId: input.run.workspace_id,
          phase: input.run.phase,
          skillName: input.run.skill_name,
          stage: "waiting_input",
        });
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      if ((error as { constraint?: string }).constraint === "pending_questions_one_workspace_idx") {
        throw conflict("question_already_pending", "The workspace already has a pending question");
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async finishRunBlocked(input: {
    run: RunRow;
    stepId: string;
    execution: LlmExecution;
    action: Extract<LlmAction, { type: "cannot_continue" }>;
    result: SkillExecutionResult;
    lease: JobLease;
  }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await assertActiveRunLease(client, input.run.id, input.lease);
      const owner = await client.query(
        "SELECT organization_id FROM workspaces WHERE id = $1 FOR UPDATE",
        [input.run.workspace_id],
      );
      if (!owner.rows[0]) throw notFound("Workspace");
      const updatedStep = await client.query(
        `UPDATE workflow_steps
         SET status = 'completed', output = $2, completed_at = now()
         WHERE id = $1 AND run_id = $3 AND status = 'running'`,
        [input.stepId, { action: input.execution.action, result: input.result }, input.run.id],
      );
      if (!updatedStep.rowCount) throw conflict("step_changed", "The model step is no longer running");
      await appendConversationAction(client, {
        runId: input.run.id,
        execution: input.execution,
      });
      await client.query(
        `INSERT INTO llm_usage(
           run_id, provider, model, input_tokens, output_tokens, total_tokens,
           provider_response_id, duration_ms, estimated_cost_microusd
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [input.run.id, input.execution.provider, input.execution.model,
          input.execution.usage.inputTokens, input.execution.usage.outputTokens,
          input.execution.usage.totalTokens, input.execution.providerResponseId,
          input.execution.durationMs ?? null, input.execution.estimatedCostMicrousd ?? null],
      );
      const updatedRun = await client.query(
        `UPDATE workflow_runs
         SET status = 'failed', output_status = NULL, output = $2,
             provider = $3, model = $4, provider_response_id = $5,
             error_code = $6, error_message = $7,
             completed_at = now(), execution_fence = NULL, updated_at = now()
         WHERE id = $1 AND status = 'running'`,
        [input.run.id, input.result, input.execution.provider,
          input.execution.model, input.execution.providerResponseId,
          `MODEL_${input.action.reason.toUpperCase()}`, input.action.message],
      );
      if (!updatedRun.rowCount) throw conflict("run_changed", "The workflow run is no longer running");
      await client.query(
        "UPDATE workspaces SET status = 'ready', updated_at = now() WHERE id = $1",
        [input.run.workspace_id],
      );
      await writeAuditEvent(client, {
        organizationId: String(owner.rows[0].organization_id),
        workspaceId: input.run.workspace_id,
        actor: "system:worker",
        action: "run.cannot_continue",
        entityType: "workflow_run",
        entityId: input.run.id,
        data: { reason: input.action.reason, missing: input.action.missing },
      });
      if (this.runProgress) {
        await this.runProgress.recordStage(client, {
          runId: input.run.id,
          workspaceId: input.run.workspace_id,
          phase: input.run.phase,
          skillName: input.run.skill_name,
          stage: "failed",
        });
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async finishRun(input: {
    run: RunRow;
    stepId: string;
    execution: LlmExecution;
    result: SkillExecutionResult;
    approvalGate: string | null;
    automaticNextPhase: PhaseNumber | null;
    nextRecipeVersion: string;
    lease: JobLease;
  }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await assertActiveRunLease(client, input.run.id, input.lease);
      const owner = await client.query(
        "SELECT organization_id, timezone FROM workspaces WHERE id = $1 FOR UPDATE",
        [input.run.workspace_id],
      );
      if (!owner.rows[0]) throw notFound("Workspace");
      const organizationId = String(owner.rows[0].organization_id);
      let finalPostArtifactId: string | null = null;
      for (const artifact of input.result.artifacts) {
        const prior = await client.query(
          `SELECT id, logical_id, version
           FROM artifacts
           WHERE workspace_id = $1 AND kind = $2 AND slug = $3
           ORDER BY version DESC, id DESC
           LIMIT 1`,
          [input.run.workspace_id, artifact.kind, artifact.slug],
        );
        const previous = prior.rows[0] as
          | { id: string; logical_id: string; version: number }
          | undefined;
        const inserted = await client.query(
          `INSERT INTO artifacts(
             workspace_id, run_id, kind, slug, title, content, metadata, version,
             status, logical_id, parent_revision_id, revision_instructions, created_by
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft',
                     COALESCE($9, gen_random_uuid()), $10, $11, 'system:worker')
           RETURNING id`,
          [input.run.workspace_id, input.run.id, artifact.kind, artifact.slug,
            artifact.title, artifact.content, artifact.metadata,
            previous ? Number(previous.version) + 1 : 1,
            previous?.logical_id ?? null, previous?.id ?? null,
            input.run.revision_instructions],
        );
        if (artifact.kind === "final-post-batch" && finalPostArtifactId === null) {
          finalPostArtifactId = String(inserted.rows[0]?.id);
        }
      }

      for (const post of input.result.final_posts ?? []) {
        const prior = await client.query(
          `SELECT id, logical_id, revision
           FROM final_posts
           WHERE workspace_id = $1 AND logical_key = $2 AND platform = $3
           ORDER BY revision DESC, id DESC
           LIMIT 1`,
          [input.run.workspace_id, post.logicalKey, post.platform],
        );
        const previous = prior.rows[0] as
          | { id: string; logical_id: string; revision: number }
          | undefined;
        await client.query(
          `INSERT INTO final_posts(
             workspace_id, run_id, source_artifact_id, logical_id,
             parent_revision_id, revision, logical_key, sprint, week,
             local_date, timezone, platform, campaign, topic, pillar,
             content_format, title, content, pinned_comment, metadata,
             revision_instructions, created_by
           ) VALUES (
             $1, $2, $3, COALESCE($4, gen_random_uuid()), $5, $6, $7, $8, $9,
             $10::date, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21,
             'system:worker'
           )`,
          [input.run.workspace_id, input.run.id, finalPostArtifactId,
            previous?.logical_id ?? null, previous?.id ?? null,
            previous ? Number(previous.revision) + 1 : 1,
            post.logicalKey, post.sprint, post.week, post.localDate,
            String(owner.rows[0].timezone), post.platform, post.campaign,
            post.topic, post.pillar, post.format, post.title, post.content,
            post.pinnedComment, post.metadata, input.run.revision_instructions],
        );
      }

      const updatedStep = await client.query(
        `UPDATE workflow_steps SET status = 'completed', output = $2, completed_at = now()
         WHERE id = $1 AND run_id = $3 AND status = 'running'`,
        [input.stepId, { action: input.execution.action, result: input.result }, input.run.id],
      );
      if (!updatedStep.rowCount) throw conflict("step_changed", "The model step is no longer running");
      await appendConversationAction(client, {
        runId: input.run.id,
        execution: input.execution,
      });
      await client.query(
        `INSERT INTO llm_usage(
           run_id, provider, model, input_tokens, output_tokens, total_tokens,
           provider_response_id, duration_ms, estimated_cost_microusd
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [input.run.id, input.execution.provider, input.execution.model,
          input.execution.usage.inputTokens, input.execution.usage.outputTokens,
          input.execution.usage.totalTokens, input.execution.providerResponseId,
          input.execution.durationMs ?? null, input.execution.estimatedCostMicrousd ?? null],
      );

      const waitingForApproval = input.run.complete_phase && input.approvalGate !== null;
      const automaticDraft = input.run.phase === 3 && input.run.skill_name === "post-writer-sms";
      if (automaticDraft) {
        // Drafts are intermediate production assets, not individual owner
        // approval gates. The owner reviews the complete final batch in Phase 4.
        await client.query(
          `UPDATE artifacts SET status = 'approved', decided_by = 'system:workflow',
             decided_at = now(), updated_at = now()
           WHERE run_id = $1 AND status = 'draft'`,
          [input.run.id],
        );
      }
      const updatedRun = await client.query(
        `UPDATE workflow_runs
         SET status = $2, output_status = $7, output = $3, provider = $4, model = $5,
             provider_response_id = $6,
             output_decided_at = CASE WHEN $7 = 'accepted' THEN now() ELSE NULL END,
             output_decided_by = CASE WHEN $7 = 'accepted' THEN 'system:workflow' ELSE NULL END,
             completed_at = CASE WHEN $2 = 'completed' THEN now() ELSE NULL END,
             error_code = NULL, error_message = NULL, execution_fence = NULL,
             updated_at = now()
         WHERE id = $1 AND status = 'running'`,
        [input.run.id, waitingForApproval ? "waiting_approval" : "completed",
          input.result, input.execution.provider, input.execution.model,
          input.execution.providerResponseId, automaticDraft ? "accepted" : "pending"],
      );
      if (!updatedRun.rowCount) throw conflict("run_changed", "The workflow run is no longer running");

      if (waitingForApproval) {
        await client.query(
          `INSERT INTO approvals(run_id, gate) VALUES ($1, $2)
           ON CONFLICT (run_id, gate) DO NOTHING`,
          [input.run.id, input.approvalGate],
        );
        await client.query(
          "UPDATE workspaces SET status = 'waiting_approval', updated_at = now() WHERE id = $1",
          [input.run.workspace_id],
        );
      } else if (input.automaticNextPhase !== null) {
        const advanced = await client.query(
          `UPDATE workspaces
           SET current_phase = $3, status = 'ready', version = version + 1, updated_at = now()
           WHERE id = $1 AND current_phase = $2 RETURNING id`,
          [input.run.workspace_id, input.run.phase, input.automaticNextPhase],
        );
        if (!advanced.rowCount) throw conflict("phase_changed", "Workspace phase changed during execution");
        await advanceDurablePhase(client, {
          workspaceId: input.run.workspace_id,
          fromPhase: input.run.phase,
          toPhase: input.automaticNextPhase,
          recipeVersion: input.nextRecipeVersion,
        });
      } else {
        await client.query(
          "UPDATE workspaces SET status = 'ready', updated_at = now() WHERE id = $1",
          [input.run.workspace_id],
        );
      }
      await writeAuditEvent(client, {
        organizationId,
        workspaceId: input.run.workspace_id,
        actor: "system:worker",
        action: waitingForApproval ? "run.awaiting_approval" : "run.completed",
        entityType: "workflow_run",
        entityId: input.run.id,
      });
      if (this.runProgress) {
        await this.runProgress.recordStage(client, {
          runId: input.run.id,
          workspaceId: input.run.workspace_id,
          phase: input.run.phase,
          skillName: input.run.skill_name,
          stage: waitingForApproval ? "waiting_approval" : "ready",
        });
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async decideRunOutput(input: {
    runId: string;
    organizationId: string;
    approved: boolean;
    actor: string;
    note: string | null;
    expectedPhase: PhaseNumber;
    nextPhase: PhaseNumber;
    nextRecipeVersion: string;
    expectedReviewRevision: number;
  }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const located = await client.query(
        `SELECT workflow_runs.workspace_id FROM workflow_runs
         JOIN workspaces ON workspaces.id = workflow_runs.workspace_id
         WHERE workflow_runs.id = $1 AND workspaces.organization_id = $2`,
        [input.runId, input.organizationId],
      );
      const workspaceId = located.rows[0]?.workspace_id as string | undefined;
      if (!workspaceId) throw notFound("Run");
      // Every workflow mutation locks workspace before child rows. A stable
      // lock order prevents approval, enqueue, and worker commits deadlocking.
      const owner = await client.query(
        `SELECT id FROM workspaces
         WHERE id = $1 AND organization_id = $2
         FOR UPDATE`,
        [workspaceId, input.organizationId],
      );
      if (!owner.rows[0]) throw notFound("Run");
      const result = await client.query(
        `SELECT * FROM workflow_runs
         WHERE id = $1 AND workspace_id = $2
         FOR UPDATE`,
        [input.runId, workspaceId],
      );
      const run = result.rows[0] as RunRow | undefined;
      if (!run) throw notFound("Run");
      if (!["completed", "waiting_approval"].includes(run.status) || run.output_status !== "pending") {
        throw conflict("run_not_awaiting_decision", "Run output is not awaiting a decision");
      }
      if (run.review_revision !== input.expectedReviewRevision) {
        throw conflict("review_revision_changed", "The reviewed output revision changed");
      }
      const newer = await client.query(
        `SELECT 1 FROM workflow_runs
         WHERE workspace_id = $1 AND review_thread_id = $2
           AND review_revision > $3
         LIMIT 1`,
        [run.workspace_id, run.review_thread_id, run.review_revision],
      );
      if (newer.rowCount) {
        throw conflict("review_revision_superseded", "A newer output revision is already available");
      }

      if (input.approved && run.phase === 2 && run.skill_name === "content-calendar-sms") {
        const calendar = await client.query(
          `SELECT id, content FROM artifacts WHERE run_id = $1 AND kind = 'content-calendar' AND status = 'draft'`,
          [run.id],
        );
        if (calendar.rows.length !== 1) {
          throw conflict("calendar_slots_invalid", "Calendar approval requires one dated content-calendar artifact");
        }
        try {
          parseCalendarSlots(String(calendar.rows[0].id), String(calendar.rows[0].content));
        } catch (error) {
          throw conflict("calendar_slots_invalid", `Calendar needs a dated day/platform/topic table: ${(error as Error).message}`);
        }
      }

      if (input.approved && run.output) {
        // Context promotion shares the decision transaction, so an approval
        // can never commit without the exact canonical revisions it promotes.
        for (const context of run.output.context_updates) {
          await appendApprovedContextRevision(client, {
            workspaceId: run.workspace_id,
            key: context.key,
            markdown: context.markdown,
            data: context.data,
            source: "llm-approved",
            actor: input.actor,
            decisionNote: input.note,
          });
        }
      }
      if (input.approved) {
        // A logical artifact/post has one current approved revision. Historical
        // approved rows remain immutable and become explicitly superseded.
        await client.query(
          `UPDATE artifacts AS prior
           SET status = 'superseded', updated_at = now()
           WHERE prior.workspace_id = $1 AND prior.status = 'approved'
             AND prior.logical_id IN (
               SELECT logical_id FROM artifacts WHERE run_id = $2 AND status = 'draft'
             )`,
          [run.workspace_id, run.id],
        );
        await client.query(
          `UPDATE final_posts AS prior
           SET status = 'superseded', decided_by = $3, decided_at = now()
           WHERE prior.workspace_id = $1 AND prior.status = 'approved'
             AND prior.logical_id IN (
               SELECT logical_id FROM final_posts WHERE run_id = $2 AND status = 'draft'
             )`,
          [run.workspace_id, run.id, input.actor],
        );
      }
      await client.query(
        `UPDATE artifacts
         SET status = $2, decided_by = $3, decided_at = now(), updated_at = now()
         WHERE run_id = $1 AND status = 'draft'`,
        [run.id, input.approved ? "approved" : "rejected", input.actor],
      );
      await client.query(
        `UPDATE final_posts
         SET status = $2, decided_by = $3, decided_at = now()
         WHERE run_id = $1 AND status = 'draft'`,
        [run.id, input.approved ? "approved" : "rejected", input.actor],
      );
      await client.query(
        `UPDATE workflow_runs
         SET output_status = $2, output_decided_at = now(), output_decided_by = $3,
             output_decision_note = $4,
             status = CASE WHEN status = 'waiting_approval' AND NOT $5 THEN 'rejected'
                           WHEN status = 'waiting_approval' THEN 'completed'
                           ELSE status END,
             progress_stage = CASE WHEN status = 'waiting_approval' AND NOT $5 THEN 'failed'
                                   WHEN status = 'waiting_approval' THEN 'ready'
                                   ELSE progress_stage END,
             completed_at = COALESCE(completed_at, now()), updated_at = now()
         WHERE id = $1`,
        [run.id, input.approved ? "accepted" : "rejected", input.actor,
          input.note, input.approved],
      );

      if (this.runProgress && run.status === "waiting_approval") {
        await this.runProgress.recordStage(client, {
          runId: run.id,
          workspaceId: run.workspace_id,
          phase: run.phase,
          skillName: run.skill_name,
          stage: input.approved ? "ready" : "failed",
        });
      }

      if (run.status === "waiting_approval") {
        const approval = await client.query(
          `UPDATE approvals
           SET status = $2, decided_at = now(), decided_by = $3, note = $4
           WHERE run_id = $1 AND status = 'pending' RETURNING id`,
          [run.id, input.approved ? "approved" : "rejected", input.actor, input.note],
        );
        if (!approval.rowCount) throw conflict("approval_missing", "No pending approval exists for this run");
        if (input.approved) {
          const advanced = await client.query(
            `UPDATE workspaces
             SET current_phase = $3, status = 'ready', version = version + 1, updated_at = now()
             WHERE id = $1 AND current_phase = $2 RETURNING id`,
            [run.workspace_id, input.expectedPhase, input.nextPhase],
          );
          if (!advanced.rowCount) throw conflict("phase_changed", "Workspace phase changed before approval");
          await advanceDurablePhase(client, {
            workspaceId: run.workspace_id,
            fromPhase: input.expectedPhase,
            toPhase: input.nextPhase,
            recipeVersion: input.nextRecipeVersion,
          });
        } else {
          await client.query(
            "UPDATE workspaces SET status = 'ready', updated_at = now() WHERE id = $1",
            [run.workspace_id],
          );
        }
      }

      await writeAuditEvent(client, {
        organizationId: input.organizationId,
        workspaceId: run.workspace_id,
        actor: input.actor,
        action: input.approved ? "run.output_accepted" : "run.output_rejected",
        entityType: "workflow_run",
        entityId: run.id,
        data: {
          phaseAdvanced: run.status === "waiting_approval" && input.approved,
          reviewRevision: run.review_revision,
        },
      });
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

}
