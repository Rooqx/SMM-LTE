import { EventEmitter } from "node:events";
import type pg from "pg";
import { notFound, tooManyRequests } from "../domain/errors.js";

export const RUN_PROGRESS_STAGES = [
  "queued",
  "loading_context",
  "generating",
  "validating",
  "ready",
  "waiting_approval",
  "waiting_input",
  "failed",
  "cancelled",
] as const;

export type RunProgressStage = (typeof RUN_PROGRESS_STAGES)[number];

export function isRunProgressStage(value: unknown): value is RunProgressStage {
  return typeof value === "string" && (RUN_PROGRESS_STAGES as readonly string[]).includes(value);
}

export function isTerminalProgressStage(stage: RunProgressStage): boolean {
  return stage === "ready" || stage === "waiting_approval" || stage === "waiting_input" ||
    stage === "failed" || stage === "cancelled";
}

export type RunProgressEvent = {
  /** PostgreSQL bigint serialized as text to avoid JavaScript precision loss. */
  id: string;
  runId: string;
  workspaceId: string;
  phase: number;
  skillName: string;
  stage: RunProgressStage;
  occurredAt: string;
};

type RecordStageInput = {
  runId: string;
  workspaceId: string;
  phase: number;
  skillName: string;
  stage: RunProgressStage;
  occurredAt?: Date;
};

/**
 * Coarse, content-free run progress tracking and event delivery.
 *
 * Enforces bounded saturation limits, tenant isolation, and reconnection safety.
 * PostgreSQL remains authoritative for all transitions. In-memory events are a
 * post-commit fast path when this service owns the transaction; durable polling
 * covers caller-owned transactions and other processes.
 */
export class RunProgressService {
  readonly #pool: pg.Pool;
  readonly #emitter = new EventEmitter();
  readonly #maxActiveConnectionsPerOrg: number;
  readonly #activeConnectionsByOrg = new Map<string, number>();

  constructor(pool: pg.Pool, maxActiveConnectionsPerOrg = 20) {
    this.#pool = pool;
    this.#maxActiveConnectionsPerOrg = maxActiveConnectionsPerOrg;
    // Fastify / Node event emitter max listeners set conservatively high
    this.#emitter.setMaxListeners(1000);
  }

  /**
   * Enforces bounded per-process saturation for active SSE connections. The
   * deployment edge must enforce the corresponding cross-replica budget.
   */
  acquireConnection(organizationId: string): void {
    const current = this.#activeConnectionsByOrg.get(organizationId) ?? 0;
    if (current >= this.#maxActiveConnectionsPerOrg) {
      throw tooManyRequests(
        "sse_connection_limit_exceeded",
        `Active progress stream limit (${this.#maxActiveConnectionsPerOrg}) reached for organization`,
      );
    }
    this.#activeConnectionsByOrg.set(organizationId, current + 1);
  }

  releaseConnection(organizationId: string): void {
    const current = this.#activeConnectionsByOrg.get(organizationId) ?? 0;
    if (current <= 1) {
      this.#activeConnectionsByOrg.delete(organizationId);
    } else {
      this.#activeConnectionsByOrg.set(organizationId, current - 1);
    }
  }

  getActiveConnections(organizationId?: string): number {
    if (organizationId) {
      return this.#activeConnectionsByOrg.get(organizationId) ?? 0;
    }
    let total = 0;
    for (const count of this.#activeConnectionsByOrg.values()) {
      total += count;
    }
    return total;
  }

  /**
   * Persists a coarse, content-free stage observation.
   *
   * Pool calls own their transaction and publish only after COMMIT. Calls made
   * with a caller-owned PoolClient deliberately do not publish before that
   * caller commits; cross-process SSE polling discovers the committed event.
   */
  async recordStage(
    clientOrPool: pg.Pool | pg.PoolClient,
    input: RecordStageInput,
  ): Promise<RunProgressEvent> {
    // `pg.Client` and `pg.PoolClient` also expose `connect()`, so checking for
    // that method misclassifies an already-checked-out client as a pool and
    // attempts to connect it a second time. Only checked-out pool clients own
    // `release()`, which makes it the reliable discriminator here.
    if (
      typeof (clientOrPool as pg.PoolClient).release === "function" ||
      typeof (clientOrPool as pg.Pool).connect !== "function"
    ) {
      return this.#persistStage(clientOrPool as pg.PoolClient, input);
    }

    const client = await (clientOrPool as pg.Pool).connect();
    try {
      await client.query("BEGIN");
      const event = await this.#persistStage(client, input);
      await client.query("COMMIT");
      this.#emitter.emit(`run:${input.runId}`, event);
      return event;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async #persistStage(
    client: Pick<pg.PoolClient, "query">,
    input: RecordStageInput,
  ): Promise<RunProgressEvent> {
    const result = await client.query(
      `INSERT INTO workflow_run_progress_events(
         run_id, workspace_id, phase, skill_name, stage, occurred_at
       ) VALUES ($1, $2, $3, $4, $5, COALESCE($6, now()))
       RETURNING id, run_id, workspace_id, phase, skill_name, stage, occurred_at`,
      [
        input.runId,
        input.workspaceId,
        input.phase,
        input.skillName,
        input.stage,
        input.occurredAt ?? null,
      ],
    );

    const row = result.rows[0] as {
      id: string | number;
      run_id: string;
      workspace_id: string;
      phase: number;
      skill_name: string;
      stage: RunProgressStage;
      occurred_at: Date;
    };

    const event: RunProgressEvent = {
      id: String(row.id),
      runId: row.run_id,
      workspaceId: row.workspace_id,
      phase: Number(row.phase),
      skillName: row.skill_name,
      stage: row.stage,
      occurredAt: row.occurred_at.toISOString(),
    };

    // Update workflow_runs.progress_stage in the same transaction or client context
    const updated = await client.query(
      `UPDATE workflow_runs
       SET progress_stage = $2, updated_at = now()
       WHERE id = $1 AND workspace_id = $3`,
      [input.runId, input.stage, input.workspaceId],
    );
    if (!updated.rowCount) {
      throw notFound("Run");
    }

    return event;
  }

  /**
   * Subscribes to real-time progress events for a run.
   * Returns an unsubscribe function to remove the listener.
   */
  subscribe(runId: string, listener: (event: RunProgressEvent) => void): () => void {
    const channel = `run:${runId}`;
    this.#emitter.on(channel, listener);
    return () => {
      this.#emitter.off(channel, listener);
    };
  }

  /**
   * Retrieves durable progress events for a run within the authorized organization.
   * If afterEventId is provided, returns only events with id > afterEventId (for reconnect).
   */
  async listEventsForRun(input: {
    runId: string;
    workspaceId: string;
    organizationId: string;
    afterEventId?: string;
    limit?: number;
  }): Promise<RunProgressEvent[]> {
    const limit = Math.max(1, Math.min(input.limit ?? 200, 500));
    const result = await this.#pool.query(
      `SELECT page.id, page.run_id, page.workspace_id, page.phase,
              page.skill_name, page.stage, page.occurred_at
       FROM (
         SELECT events.id, events.run_id, events.workspace_id, events.phase,
                events.skill_name, events.stage, events.occurred_at
         FROM workflow_run_progress_events AS events
         JOIN workspaces ON workspaces.id = events.workspace_id
         WHERE events.run_id = $1
           AND events.workspace_id = $2
           AND workspaces.organization_id = $3
           AND ($4::bigint IS NULL OR events.id > $4::bigint)
         ORDER BY events.id ${input.afterEventId === undefined ? "DESC" : "ASC"}
         LIMIT $5
       ) AS page
       ORDER BY page.id ASC`,
      [input.runId, input.workspaceId, input.organizationId, input.afterEventId ?? null, limit],
    );

    return result.rows.map((row) => ({
      id: String(row.id),
      runId: String(row.run_id),
      workspaceId: String(row.workspace_id),
      phase: Number(row.phase),
      skillName: String(row.skill_name),
      stage: row.stage as RunProgressStage,
      occurredAt: (row.occurred_at as Date).toISOString(),
    }));
  }

  /**
   * Gets the authoritative current state of a run for initial SSE frame projection.
   */
  async getCurrentRunState(input: {
    runId: string;
    workspaceId: string;
    organizationId: string;
  }): Promise<{
    runId: string;
    workspaceId: string;
    phase: number;
    skillName: string;
    status: string;
    progressStage: RunProgressStage;
    isTerminal: boolean;
  }> {
    const result = await this.#pool.query(
      `SELECT runs.id, runs.workspace_id, runs.phase, runs.skill_name,
              runs.status, runs.progress_stage
       FROM workflow_runs AS runs
       JOIN workspaces ON workspaces.id = runs.workspace_id
       WHERE runs.id = $1
         AND runs.workspace_id = $2
         AND workspaces.organization_id = $3`,
      [input.runId, input.workspaceId, input.organizationId],
    );

    const row = result.rows[0];
    if (!row) throw notFound("Run");

    const stage = (isRunProgressStage(row.progress_stage) ? row.progress_stage : "queued") as RunProgressStage;
    return {
      runId: String(row.id),
      workspaceId: String(row.workspace_id),
      phase: Number(row.phase),
      skillName: String(row.skill_name),
      status: String(row.status),
      progressStage: stage,
      isTerminal: isTerminalProgressStage(stage),
    };
  }
}
