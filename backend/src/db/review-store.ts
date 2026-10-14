import type pg from "pg";
import { conflict, notFound } from "../domain/errors.js";
import type { SkillExecutionResult } from "../domain/schemas.js";
import { writeAuditEvent } from "./audit.js";
import { enforceModelQueueAdmission, type QueueAdmissionPolicy } from "./jobs.js";
import type { RunRow } from "./store.js";

/** Owns human revision transitions; model execution remains in the run store. */
export class ReviewStore {
  constructor(readonly pool: pg.Pool) {}

  async requestRevision(input: {
    runId: string;
    organizationId: string;
    actor: string;
    instructions: string;
    expectedReviewRevision: number;
    idempotencyKey: string;
    maxAttempts: number;
    correlationId: string;
    admission: QueueAdmissionPolicy;
  }): Promise<RunRow> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const located = await client.query(
        `SELECT run.workspace_id
         FROM workflow_runs AS run
         JOIN workspaces ON workspaces.id = run.workspace_id
         WHERE run.id = $1 AND workspaces.organization_id = $2`,
        [input.runId, input.organizationId],
      );
      const workspaceId = located.rows[0]?.workspace_id as string | undefined;
      if (!workspaceId) throw notFound("Run");
      const owner = await client.query(
        `SELECT id FROM workspaces
         WHERE id = $1 AND organization_id = $2
         FOR UPDATE`,
        [workspaceId, input.organizationId],
      );
      if (!owner.rows[0]) throw notFound("Run");

      const replay = await client.query(
        `SELECT * FROM workflow_runs
         WHERE workspace_id = $1 AND idempotency_key = $2`,
        [workspaceId, input.idempotencyKey],
      );
      const replayed = replay.rows[0] as RunRow | undefined;
      if (replayed) {
        if (replayed.supersedes_run_id !== input.runId ||
            replayed.revision_instructions !== input.instructions) {
          throw conflict(
            "idempotency_key_reused",
            "The idempotency key was already used for a different revision request",
          );
        }
        await client.query("COMMIT");
        return replayed;
      }

      const target = await client.query(
        `SELECT * FROM workflow_runs
         WHERE id = $1 AND workspace_id = $2
         FOR UPDATE`,
        [input.runId, workspaceId],
      );
      const run = target.rows[0] as RunRow | undefined;
      if (!run) throw notFound("Run");
      if (run.review_revision !== input.expectedReviewRevision) {
        throw conflict("review_revision_changed", "The reviewed output revision changed");
      }
      if (!["completed", "waiting_approval"].includes(run.status) ||
          run.output_status !== "pending") {
        throw conflict("run_not_awaiting_decision", "Run output is not awaiting a decision");
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

      await enforceModelQueueAdmission(client, input.organizationId, input.admission);

      await client.query(
        `UPDATE artifacts
         SET status = 'rejected', revision_instructions = $2,
             decided_by = $3, decided_at = now(), updated_at = now()
         WHERE run_id = $1 AND status = 'draft'`,
        [run.id, input.instructions, input.actor],
      );
      await client.query(
        `UPDATE final_posts
         SET status = 'rejected', revision_instructions = $2,
             decided_by = $3, decided_at = now()
         WHERE run_id = $1 AND status = 'draft'`,
        [run.id, input.instructions, input.actor],
      );
      await client.query(
        `UPDATE approvals
         SET status = 'rejected', decided_at = now(), decided_by = $2, note = $3
         WHERE run_id = $1 AND status = 'pending'`,
        [run.id, input.actor, input.instructions],
      );
      await client.query(
        `UPDATE workflow_runs
         SET status = 'rejected', output_status = 'rejected',
             output_decided_at = now(), output_decided_by = $2,
             output_decision_note = $3, completed_at = COALESCE(completed_at, now()),
             updated_at = now()
         WHERE id = $1`,
        [run.id, input.actor, input.instructions],
      );

      const revisionPayload = {
        ...run.input,
        revision_request: {
          instructions: input.instructions,
          previousRunId: run.id,
          previousReviewRevision: run.review_revision,
        },
      };
      const inserted = await client.query(
        `INSERT INTO workflow_runs(
           workspace_id, phase, skill_name, complete_phase, input, idempotency_key,
           recipe_suite_id, recipe_id, recipe_version, skill_bundle_version,
           skill_content_hash, orchestrator_hash, bridge_hash,
           review_thread_id, review_revision, supersedes_run_id, revision_instructions,
           correlation_id
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
           $14, $15, $16, $17, $18
         ) RETURNING *`,
        [run.workspace_id, run.phase, run.skill_name, run.complete_phase,
          revisionPayload, input.idempotencyKey, run.recipe_suite_id, run.recipe_id,
          run.recipe_version, run.skill_bundle_version, run.skill_content_hash,
          run.orchestrator_hash, run.bridge_hash, run.review_thread_id,
          run.review_revision + 1, run.id, input.instructions, input.correlationId],
      );
      const revisionRun = inserted.rows[0] as RunRow;
      await client.query(
        `INSERT INTO workflow_run_context_revisions(
           run_id, workspace_id, revision_id, context_key
         )
         SELECT $1, workspace_id, revision_id, context_key
         FROM workflow_run_context_revisions
         WHERE run_id = $2`,
        [revisionRun.id, run.id],
      );
      await client.query(
        `INSERT INTO job_queue(type, payload, max_attempts, correlation_id)
         VALUES (
           'execute_workflow_run',
           jsonb_build_object('runId', $1::text, 'organizationId', $2::text),
           $3,
           $4
         )`,
        [revisionRun.id, input.organizationId, input.maxAttempts, input.correlationId],
      );
      await client.query(
        "UPDATE workspaces SET status = 'running', updated_at = now() WHERE id = $1",
        [run.workspace_id],
      );
      await writeAuditEvent(client, {
        organizationId: input.organizationId,
        workspaceId: run.workspace_id,
        actor: input.actor,
        action: "run.revision_requested",
        entityType: "workflow_run",
        entityId: revisionRun.id,
        data: {
          previousRunId: run.id,
          previousReviewRevision: run.review_revision,
          reviewRevision: revisionRun.review_revision,
        },
      });
      await client.query("COMMIT");
      return revisionRun;
    } catch (error) {
      await client.query("ROLLBACK");
      if ((error as { code?: string }).code === "23505") {
        throw conflict("revision_conflict", "Another workflow transition won this request");
      }
      throw error;
    } finally {
      client.release();
    }
  }

  /** Exact previous output is supplied as untrusted revision input to the model. */
  async getSourceForExecution(run: RunRow): Promise<Record<string, unknown> | null> {
    if (!run.supersedes_run_id) return null;
    const result = await this.pool.query(
      `SELECT id, review_revision, output
       FROM workflow_runs
       WHERE id = $1 AND workspace_id = $2 AND review_thread_id = $3`,
      [run.supersedes_run_id, run.workspace_id, run.review_thread_id],
    );
    const previous = result.rows[0] as
      | { id: string; review_revision: number; output: SkillExecutionResult | null }
      | undefined;
    if (!previous) throw conflict("revision_source_missing", "The previous review revision is unavailable");
    return {
      type: "previous_review_revision",
      runId: previous.id,
      reviewRevision: Number(previous.review_revision),
      instructions: run.revision_instructions,
      output: previous.output,
    };
  }
}
