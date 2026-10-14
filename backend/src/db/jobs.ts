import { randomInt, randomUUID } from "node:crypto";
import type pg from "pg";
import { conflict, serviceUnavailable, tooManyRequests } from "../domain/errors.js";
import type { RunProgressService, RunProgressStage } from "../orchestration/progress.js";

const ACTIVE_JOB_STATUSES = ["queued", "failed", "running"] as const;

export type JobLease = {
  jobId: string;
  owner: string;
  token: number;
};

export type ClaimedJob = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  correlation_id: string;
  lease_owner: string;
  lease_token: number;
  lease_expires_at: Date;
};

export type QueueAdmissionPolicy = {
  maxActiveJobs: number;
  maxActiveJobsPerOrganization: number;
  maxOrganizationTokensPerDay: number;
  maxTokensPerRun: number;
  maxOrganizationCostMicrousdPerDay: number;
  maxEstimatedCostMicrousdPerRun: number;
};

export type InterviewOptionJobInput = {
  workspaceId: string;
  organizationId: string;
  sessionId: string;
  questionnaireVersion: string;
  targetQuestionIds: readonly string[];
  confirmedAnswersHash: string;
  idempotencyKey: string;
  correlationId: string;
};

export class PermanentJobError extends Error {
  override readonly name = "PermanentJobError";
}

/** Raised when another worker has reclaimed or cancelled a job attempt. */
export class LeaseLostError extends Error {
  override readonly name = "LeaseLostError";
}

export function leaseFor(job: ClaimedJob): JobLease {
  return { jobId: job.id, owner: job.lease_owner, token: job.lease_token };
}

/**
 * Serializes admission briefly so independently scaled API replicas cannot all
 * pass a stale queue-depth check. The lock is transaction-scoped and never
 * spans provider or model work.
 */
export async function enforceModelQueueAdmission(
  client: pg.PoolClient,
  organizationId: string,
  policy: QueueAdmissionPolicy,
): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtext('smm-queue-admission'))");
  const counts = await client.query(
    `SELECT
       count(*) FILTER (WHERE job.status = ANY($1::text[]))::integer AS global_active,
       count(*) FILTER (
         WHERE job.status = ANY($1::text[])
           AND COALESCE(
             workspace.organization_id::text,
             job.payload->>'organizationId'
           ) = $2::text
       )::integer AS organization_active
     FROM job_queue AS job
     LEFT JOIN workflow_runs AS run ON run.id::text = job.payload->>'runId'
     LEFT JOIN workspaces AS workspace ON workspace.id = run.workspace_id`,
    [ACTIVE_JOB_STATUSES, organizationId],
  );
  const globalActive = Number(counts.rows[0]?.global_active ?? 0);
  const organizationActive = Number(counts.rows[0]?.organization_active ?? 0);
  if (globalActive >= policy.maxActiveJobs) {
    throw serviceUnavailable(
      "queue_saturated",
      "The work queue is at capacity; retry after existing work has started",
    );
  }
  if (organizationActive >= policy.maxActiveJobsPerOrganization) {
    throw tooManyRequests(
      "organization_queue_limit",
      "This account already has the maximum number of active jobs",
    );
  }

  // Active runs reserve their full per-run token ceiling. This is intentionally
  // conservative: concurrent workers cannot over-admit an account merely
  // because usage rows have not been written yet.
  const usage = await client.query(
    `SELECT COALESCE(sum(COALESCE(
              usage.total_tokens,
              COALESCE(usage.input_tokens, 0) + COALESCE(usage.output_tokens, 0)
            )), 0)::bigint AS consumed,
            COALESCE(sum(usage.estimated_cost_microusd), 0)::bigint AS consumed_cost
     FROM llm_usage AS usage
     JOIN workflow_runs AS run ON run.id = usage.run_id
     JOIN workspaces AS workspace ON workspace.id = run.workspace_id
     WHERE workspace.organization_id = $1
       AND usage.created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`,
    [organizationId],
  );
  const consumed = Number(usage.rows[0]?.consumed ?? 0);
  const consumedCost = Number(usage.rows[0]?.consumed_cost ?? 0);
  const reserved = organizationActive * policy.maxTokensPerRun;
  if (consumed + reserved + policy.maxTokensPerRun > policy.maxOrganizationTokensPerDay) {
    throw tooManyRequests(
      "organization_daily_model_budget",
      "This account has reached its daily model-usage budget",
    );
  }
  const reservedCost = organizationActive * policy.maxEstimatedCostMicrousdPerRun;
  if (policy.maxEstimatedCostMicrousdPerRun > 0 &&
      consumedCost + reservedCost + policy.maxEstimatedCostMicrousdPerRun >
        policy.maxOrganizationCostMicrousdPerDay) {
    throw tooManyRequests(
      "organization_daily_spend_budget",
      "This account has reached its daily estimated model-spend budget",
    );
  }
}

async function recordEvent(
  client: pg.PoolClient,
  input: {
    jobId: string;
    event: "claimed" | "completed" | "retry_scheduled" | "dead" | "recovered" | "lease_lost";
    leaseToken: number;
    workerId: string | null;
    data?: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO job_attempt_events(job_id, event, lease_token, worker_id, data)
     VALUES ($1, $2, $3, $4, $5)`,
    [input.jobId, input.event, input.leaseToken, input.workerId, input.data ?? {}],
  );
}

export class JobQueue {
  constructor(
    readonly pool: pg.Pool,
    readonly workerId: string,
    readonly leaseSeconds = 180,
    readonly maxConcurrentPerOrganization = 2,
    readonly runProgress: RunProgressService | null = null,
    readonly maxActiveJobs = 10_000,
    readonly maxActiveJobsPerOrganization = 20,
  ) {}

  /**
   * Durably admits a low-priority option-assistant job.
   *
   * This is intentionally queue-owned: callers cannot bypass global/account
   * capacity checks or create an untracked provider promise in an API process.
   * The active-job lock makes capacity and de-duplication safe across replicas.
   */
  async enqueueInterviewOptions(input: InterviewOptionJobInput): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext('smm-queue-admission'))");

      const session = await client.query(
        `SELECT 1
         FROM interview_sessions AS session
         JOIN workspaces AS workspace ON workspace.id = session.workspace_id
         WHERE session.id = $1
           AND session.workspace_id = $2
           AND workspace.organization_id = $3
           AND session.questionnaire_version = $4
           AND session.status = 'in_progress'`,
        [input.sessionId, input.workspaceId, input.organizationId, input.questionnaireVersion],
      );
      if (!session.rowCount) {
        await client.query("COMMIT");
        return false;
      }

      const replay = await client.query(
        `SELECT 1 FROM job_queue
         WHERE type = 'generate_interview_options'
           AND payload->>'sessionId' = $1
           AND payload->>'idempotencyKey' = $2
           AND status IN ('queued', 'running', 'failed')`,
        [input.sessionId, input.idempotencyKey],
      );
      if (replay.rowCount) {
        await client.query("COMMIT");
        return true;
      }

      const depth = await client.query(
        `SELECT
           count(*) FILTER (WHERE job.status = ANY($1::text[]))::integer AS global_active,
           count(*) FILTER (
             WHERE job.status = ANY($1::text[])
               AND COALESCE(
                 workspace.organization_id::text,
                 job.payload->>'organizationId'
               ) = $2
           )::integer AS organization_active
         FROM job_queue AS job
         LEFT JOIN workflow_runs AS run ON run.id::text = job.payload->>'runId'
         LEFT JOIN workspaces AS workspace ON workspace.id = run.workspace_id`,
        [ACTIVE_JOB_STATUSES, input.organizationId],
      );
      if (Number(depth.rows[0]?.global_active ?? 0) >= this.maxActiveJobs) {
        throw serviceUnavailable("queue_saturated", "The work queue is at capacity; retry later");
      }
      if (Number(depth.rows[0]?.organization_active ?? 0) >=
          this.maxActiveJobsPerOrganization) {
        throw tooManyRequests(
          "organization_queue_limit",
          "This account already has the maximum number of active jobs",
        );
      }

      await client.query(
        `INSERT INTO job_queue(type, payload, max_attempts, correlation_id)
         VALUES (
           'generate_interview_options',
           jsonb_build_object(
             'workspaceId', $1::text,
             'organizationId', $2::text,
             'sessionId', $3::text,
             'questionnaireVersion', $4::text,
             'targetQuestionIds', $5::jsonb,
             'confirmedAnswersHash', $6::text,
             'idempotencyKey', $7::text
           ),
           2,
           $8
         )`,
        [input.workspaceId, input.organizationId, input.sessionId,
          input.questionnaireVersion, JSON.stringify(input.targetQuestionIds),
          input.confirmedAnswersHash, input.idempotencyKey, input.correlationId],
      );
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      // A concurrent equivalent admission is a successful de-duplication.
      if ((error as { constraint?: string }).constraint ===
          "job_queue_interview_options_dedupe_idx") {
        return true;
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async claim(
    allowedTypes: readonly string[] = ["execute_workflow_run"],
  ): Promise<ClaimedJob | null> {
    if (allowedTypes.length === 0) return null;
    const client = await this.pool.connect();
    let discardClient = false;
    try {
      await client.query("BEGIN");
      const leaseOwner = `${this.workerId}:${randomUUID()}`;
      const selected = await client.query(
        `WITH candidate AS (
           SELECT job.id
           FROM job_queue AS job
           LEFT JOIN workflow_runs AS run ON run.id::text = job.payload->>'runId'
           LEFT JOIN workspaces AS workspace ON workspace.id = run.workspace_id
           WHERE job.status IN ('queued', 'failed')
             AND job.type = ANY($1::text[])
             AND job.available_at <= now()
             AND job.attempts < job.max_attempts
             AND (
               COALESCE(workspace.organization_id::text, job.payload->>'organizationId') IS NULL
               OR (
                 SELECT count(*)
                 FROM job_queue AS active_job
                 LEFT JOIN workflow_runs AS active_run
                   ON active_run.id::text = active_job.payload->>'runId'
                 LEFT JOIN workspaces AS active_workspace
                   ON active_workspace.id = active_run.workspace_id
                 WHERE active_job.status = 'running'
                   AND COALESCE(
                     active_workspace.organization_id::text,
                     active_job.payload->>'organizationId'
                   ) = COALESCE(
                     workspace.organization_id::text,
                     job.payload->>'organizationId'
                   )
               ) < $4
             )
           ORDER BY
             CASE job.type
               WHEN 'send_auth_email' THEN 0
               WHEN 'execute_workflow_run' THEN 1
               WHEN 'export_obsidian' THEN 2
               WHEN 'generate_interview_options' THEN 3
               ELSE 4
             END,
             (
               SELECT count(*)
               FROM job_queue AS running_job
               LEFT JOIN workflow_runs AS running_run
                 ON running_run.id::text = running_job.payload->>'runId'
               LEFT JOIN workspaces AS running_workspace
                 ON running_workspace.id = running_run.workspace_id
               WHERE running_job.status = 'running'
                 AND COALESCE(
                   running_workspace.organization_id::text,
                   running_job.payload->>'organizationId'
                 ) IS NOT DISTINCT FROM COALESCE(
                   workspace.organization_id::text,
                   job.payload->>'organizationId'
                 )
             ),
             job.created_at,
             job.id
           FOR UPDATE OF job SKIP LOCKED
           LIMIT 1
         )
         UPDATE job_queue AS job
         SET status = 'running',
             attempts = job.attempts + 1,
             locked_at = now(),
             locked_by = $2,
             lease_token = job.lease_token + 1,
             lease_expires_at = now() + ($3 * interval '1 second')
         FROM candidate
         WHERE job.id = candidate.id
         RETURNING job.*`,
        [allowedTypes, leaseOwner, this.leaseSeconds, this.maxConcurrentPerOrganization],
      );
      const row = selected.rows[0] as Record<string, unknown> | undefined;
      if (!row) {
        await client.query("COMMIT");
        return null;
      }
      const job: ClaimedJob = {
        id: String(row.id),
        type: String(row.type),
        payload: row.payload as Record<string, unknown>,
        attempts: Number(row.attempts),
        max_attempts: Number(row.max_attempts),
        correlation_id: String(row.correlation_id),
        lease_owner: String(row.locked_by),
        lease_token: Number(row.lease_token),
        lease_expires_at: new Date(String(row.lease_expires_at)),
      };
      await recordEvent(client, {
        jobId: job.id,
        event: "claimed",
        leaseToken: job.lease_token,
        workerId: this.workerId,
        data: { attempt: job.attempts, type: job.type },
      });
      await client.query("COMMIT");
      return job;
    } catch (error) {
      discardClient = true;
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release(discardClient);
    }
  }

  async renew(job: ClaimedJob): Promise<void> {
    const renewed = await this.pool.query(
      `UPDATE job_queue
       SET locked_at = now(), lease_expires_at = now() + ($4 * interval '1 second')
       WHERE id = $1 AND status = 'running' AND locked_by = $2 AND lease_token = $3
         AND lease_expires_at > now()
       RETURNING lease_expires_at`,
      [job.id, job.lease_owner, job.lease_token, this.leaseSeconds],
    );
    if (!renewed.rowCount) {
      throw new LeaseLostError(`Lease ${job.lease_token} for job ${job.id} is no longer current`);
    }
    job.lease_expires_at = new Date(String(renewed.rows[0]?.lease_expires_at));
  }

  async complete(job: Pick<ClaimedJob, "id" | "type" | "lease_owner" | "lease_token">): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query(
        `UPDATE job_queue
         SET status = 'completed', completed_at = now(),
             locked_at = NULL, locked_by = NULL, lease_expires_at = NULL,
             payload = CASE WHEN type = 'send_auth_email'
               THEN jsonb_build_object(
                 'kind', payload->>'kind',
                 'idempotencyKey', payload->>'idempotencyKey',
                 'disposedAt', now()
               )
               ELSE payload
             END
         WHERE id = $1 AND type = $2 AND status = 'running'
           AND locked_by = $3 AND lease_token = $4 AND lease_expires_at > now()
         RETURNING id`,
        [job.id, job.type, job.lease_owner, job.lease_token],
      );
      if (!updated.rowCount) {
        throw new LeaseLostError(`Job ${job.id} cannot be completed by a stale lease`);
      }
      await recordEvent(client, {
        jobId: job.id,
        event: "completed",
        leaseToken: job.lease_token,
        workerId: this.workerId,
      });
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof LeaseLostError) {
        await recordEvent(client, {
          jobId: job.id,
          event: "lease_lost",
          leaseToken: job.lease_token,
          workerId: this.workerId,
          data: { operation: "complete" },
        }).catch(() => undefined);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async fail(
    job: ClaimedJob,
    error: unknown,
    options: { permanent?: boolean } = {},
  ): Promise<{ dead: boolean }> {
    const message = error instanceof Error ? error.message : String(error);
    const dead = options.permanent === true || job.attempts >= job.max_attempts;
    const baseDelaySeconds = Math.min(300, 2 ** Math.max(0, job.attempts - 1));
    const delaySeconds = baseDelaySeconds + randomInt(0, Math.max(1, Math.ceil(baseDelaySeconds / 4)));
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query(
        `UPDATE job_queue
         SET status = $2, last_error = $3,
             available_at = now() + ($4 * interval '1 second'),
             locked_at = NULL, locked_by = NULL, lease_expires_at = NULL,
             payload = CASE WHEN $2 = 'dead' AND type = 'send_auth_email'
               THEN jsonb_build_object(
                 'kind', payload->>'kind',
                 'idempotencyKey', payload->>'idempotencyKey',
                 'disposedAt', now()
               )
               ELSE payload
             END
         WHERE id = $1 AND status = 'running'
           AND locked_by = $5 AND lease_token = $6 AND lease_expires_at > now()
         RETURNING id`,
        [job.id, dead ? "dead" : "failed", message.slice(0, 4000), delaySeconds,
          job.lease_owner, job.lease_token],
      );
      if (!updated.rowCount) {
        throw new LeaseLostError(`Job ${job.id} cannot be failed by a stale lease`);
      }
      await recordEvent(client, {
        jobId: job.id,
        event: dead ? "dead" : "retry_scheduled",
        leaseToken: job.lease_token,
        workerId: this.workerId,
        data: { delaySeconds, errorName: error instanceof Error ? error.name : "Error" },
      });

      const runId = job.payload.runId;
      if (typeof runId === "string") {
        await client.query(
          `UPDATE workflow_steps SET status = 'failed', error_message = $2, completed_at = now()
           WHERE run_id = $1 AND status = 'running'`,
          [runId, message.slice(0, 4000)],
        );
        const updatedRun = await client.query(
          `UPDATE workflow_runs
           SET status = $2, error_code = $3, error_message = $4,
               progress_stage = CASE WHEN $2 = 'failed' THEN 'failed' ELSE 'queued' END,
               completed_at = CASE WHEN $2 = 'failed' THEN now() ELSE completed_at END,
               execution_fence = NULL, updated_at = now()
           WHERE id = $1 AND status = 'running' AND execution_fence = $5
           RETURNING id, workspace_id, phase, skill_name, progress_stage`,
          [runId, dead ? "failed" : "queued", dead ? "EXECUTION_FAILED" : "RETRY_PENDING",
            message.slice(0, 4000), job.lease_token],
        );
        if (updatedRun.rows[0] && this.runProgress) {
          const row = updatedRun.rows[0] as {
            id: string;
            workspace_id: string;
            phase: number;
            skill_name: string;
            progress_stage: RunProgressStage;
          };
          await this.runProgress.recordStage(client, {
            runId: row.id,
            workspaceId: row.workspace_id,
            phase: row.phase,
            skillName: row.skill_name,
            stage: row.progress_stage,
          });
        }
        if (dead) {
          await client.query(
            `UPDATE workspaces SET status = 'ready', updated_at = now()
             WHERE id = (SELECT workspace_id FROM workflow_runs WHERE id = $1)
               AND status = 'running'`,
            [runId],
          );
        }
      }
      await client.query("COMMIT");
      return { dead };
    } catch (failure) {
      await client.query("ROLLBACK");
      if (failure instanceof LeaseLostError) {
        await recordEvent(client, {
          jobId: job.id,
          event: "lease_lost",
          leaseToken: job.lease_token,
          workerId: this.workerId,
          data: { operation: "fail" },
        }).catch(() => undefined);
      }
      throw failure;
    } finally {
      client.release();
    }
  }

  /** Recovers a bounded batch so maintenance cannot monopolize queue locks. */
  async recoverExpiredJobs(limit = 100): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const selected = await client.query(
        `SELECT job.id, job.type, job.payload, job.attempts, job.max_attempts,
                job.lease_token, job.locked_by, run.status AS run_status
         FROM job_queue AS job
         LEFT JOIN workflow_runs AS run ON run.id::text = job.payload->>'runId'
         WHERE job.status = 'running' AND job.lease_expires_at <= now()
         ORDER BY job.lease_expires_at, job.id
         FOR UPDATE OF job SKIP LOCKED
         LIMIT $1`,
        [limit],
      );
      for (const row of selected.rows as Array<Record<string, unknown>>) {
        const jobId = String(row.id);
        const token = Number(row.lease_token);
        const runId = (row.payload as Record<string, unknown>).runId;
        const runStatus = typeof row.run_status === "string" ? row.run_status : null;
        const terminalRun = runStatus !== null &&
          ["completed", "waiting_approval", "rejected", "failed", "cancelled"].includes(runStatus);
        const exhausted = Number(row.attempts) >= Number(row.max_attempts);
        const nextStatus = terminalRun ? "completed" : exhausted ? "dead" : "failed";

        await client.query(
          `UPDATE job_queue
           SET status = $2,
               completed_at = CASE WHEN $2 = 'completed' THEN now() ELSE completed_at END,
               locked_at = NULL, locked_by = NULL, lease_expires_at = NULL,
               lease_token = lease_token + 1,
               last_error = CASE
                 WHEN $2 = 'completed' THEN 'Recovered terminal run after lease expiry'
                 ELSE 'Recovered expired worker lease'
               END,
               available_at = CASE WHEN $2 = 'failed' THEN now() ELSE available_at END,
               payload = CASE
                 WHEN $2 = 'dead' AND type = 'send_auth_email'
                 THEN jsonb_build_object(
                   'kind', payload->>'kind',
                   'idempotencyKey', payload->>'idempotencyKey',
                   'disposedAt', now()
                 )
                 ELSE payload
               END
           WHERE id = $1`,
          [jobId, nextStatus],
        );
        await recordEvent(client, {
          jobId,
          event: terminalRun ? "completed" : exhausted ? "dead" : "recovered",
          leaseToken: token,
          workerId: typeof row.locked_by === "string" ? row.locked_by : null,
          data: { nextStatus },
        });

        if (typeof runId === "string" && !terminalRun) {
          await client.query(
            `UPDATE workflow_steps SET status = 'failed',
               error_message = 'Recovered expired worker lease', completed_at = now()
             WHERE run_id = $1 AND status = 'running'`,
            [runId],
          );
          const updatedRun = await client.query(
            `UPDATE workflow_runs
             SET status = $2,
                 error_code = $3,
                 error_message = $4,
                 progress_stage = CASE WHEN $2 = 'failed' THEN 'failed' ELSE 'queued' END,
                 completed_at = CASE WHEN $2 = 'failed' THEN now() ELSE completed_at END,
                 execution_fence = NULL,
                 updated_at = now()
             WHERE id = $1 AND status = 'running' AND execution_fence = $5
             RETURNING id, workspace_id, phase, skill_name, progress_stage`,
            [runId, exhausted ? "failed" : "queued",
              exhausted ? "STALE_WORKER_EXHAUSTED" : "STALE_WORKER_RECOVERED",
              exhausted
                ? "Worker lease expired on the final attempt"
                : "Recovered expired worker lease",
              token],
          );
          if (updatedRun.rows[0] && this.runProgress) {
            const row = updatedRun.rows[0] as {
              id: string;
              workspace_id: string;
              phase: number;
              skill_name: string;
              progress_stage: RunProgressStage;
            };
            await this.runProgress.recordStage(client, {
              runId: row.id,
              workspaceId: row.workspace_id,
              phase: row.phase,
              skillName: row.skill_name,
              stage: row.progress_stage,
            });
          }
          if (exhausted) {
            await client.query(
              `UPDATE workspaces SET status = 'ready', updated_at = now()
               WHERE id = (SELECT workspace_id FROM workflow_runs WHERE id = $1)
                 AND status = 'running'`,
              [runId],
            );
          }
        }
      }
      await client.query("COMMIT");
      return selected.rowCount ?? 0;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /** Backward-compatible operator hook; lease expiry is authoritative in M6. */
  async recoverStaleJobs(_maxLockAgeMinutes = 15): Promise<number> {
    return this.recoverExpiredJobs();
  }

  async enqueueObsidianExport(input: {
    workspaceId: string;
    organizationId: string;
    idempotencyKey: string;
    correlationId: string;
    maxAttempts: number;
    maxActiveJobs: number;
  }): Promise<{ id: string; status: string }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const workspace = await client.query(
        "SELECT 1 FROM workspaces WHERE id = $1 AND organization_id = $2",
        [input.workspaceId, input.organizationId],
      );
      if (!workspace.rowCount) throw conflict("workspace_not_found", "Workspace was not found");
      // Serialize replay detection with admission and insertion. Without this
      // ordering, concurrent first requests could both miss the row and make
      // the second caller observe a unique-index error instead of a replay.
      await client.query("SELECT pg_advisory_xact_lock(hashtext('smm-queue-admission'))");
      const replay = await client.query(
        `SELECT id, status FROM job_queue
         WHERE type = 'export_obsidian'
           AND payload->>'organizationId' = $1
           AND payload->>'idempotencyKey' = $2`,
        [input.organizationId, input.idempotencyKey],
      );
      if (replay.rows[0]) {
        await client.query("COMMIT");
        return { id: String(replay.rows[0].id), status: String(replay.rows[0].status) };
      }
      const depth = await client.query(
        "SELECT count(*)::integer AS count FROM job_queue WHERE status = ANY($1::text[])",
        [ACTIVE_JOB_STATUSES],
      );
      if (Number(depth.rows[0]?.count ?? 0) >= input.maxActiveJobs) {
        throw serviceUnavailable("queue_saturated", "The work queue is at capacity; retry later");
      }
      const inserted = await client.query(
        `INSERT INTO job_queue(type, payload, max_attempts, correlation_id)
         VALUES (
           'export_obsidian',
           jsonb_build_object(
             'workspaceId', $1::text,
             'organizationId', $2::text,
             'idempotencyKey', $3::text
           ),
           $4,
           $5
         )
         RETURNING id, status`,
        [input.workspaceId, input.organizationId, input.idempotencyKey,
          input.maxAttempts, input.correlationId],
      );
      await client.query("COMMIT");
      return { id: String(inserted.rows[0]?.id), status: String(inserted.rows[0]?.status) };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listDead(limit = 50): Promise<Array<Record<string, unknown>>> {
    const result = await this.pool.query(
      `SELECT id, type, attempts, max_attempts, correlation_id,
              left(COALESCE(last_error, ''), 500) AS last_error, created_at
       FROM job_queue
       WHERE status = 'dead'
       ORDER BY created_at, id
       LIMIT $1`,
      [Math.max(1, Math.min(limit, 100))],
    );
    return result.rows;
  }

  async retryDead(jobId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const job = await client.query(
        "SELECT * FROM job_queue WHERE id = $1 AND status = 'dead' FOR UPDATE",
        [jobId],
      );
      const row = job.rows[0] as Record<string, unknown> | undefined;
      if (!row) throw conflict("dead_job_changed", "The dead job no longer exists in dead state");
      if (row.type === "send_auth_email") {
        throw conflict(
          "email_payload_disposed",
          "Terminal authentication email payloads are intentionally disposed and cannot be retried",
        );
      }
      const runId = (row.payload as Record<string, unknown>).runId;
      if (typeof runId === "string") {
        // Lock both records before changing either one. This prevents an
        // operator retry from reviving work in an archived/busy workspace or
        // leaving the run and workspace in contradictory states.
        const run = await client.query(
          `SELECT run.id, run.workspace_id, run.status AS run_status,
                  workspace.status AS workspace_status
           FROM workflow_runs AS run
           JOIN workspaces AS workspace ON workspace.id = run.workspace_id
           WHERE run.id = $1
           FOR UPDATE OF run, workspace`,
          [runId],
        );
        if (run.rows[0]?.run_status !== "failed") {
          throw conflict("run_not_retryable", "The workflow run is no longer retryable");
        }
        if (run.rows[0]?.workspace_status !== "ready") {
          throw conflict(
            "workspace_not_retryable",
            "The workspace must be ready before its failed run can be retried",
          );
        }
        const updatedRun = await client.query(
          `UPDATE workflow_runs
           SET status = 'queued', progress_stage = 'queued', completed_at = NULL, error_code = 'OPERATOR_RETRY',
               error_message = NULL, execution_fence = NULL, updated_at = now()
           WHERE id = $1
           RETURNING id, workspace_id, phase, skill_name`,
          [runId],
        );
        if (updatedRun.rows[0] && this.runProgress) {
          const row = updatedRun.rows[0] as {
            id: string;
            workspace_id: string;
            phase: number;
            skill_name: string;
          };
          await this.runProgress.recordStage(client, {
            runId: row.id,
            workspaceId: row.workspace_id,
            phase: row.phase,
            skillName: row.skill_name,
            stage: "queued",
          });
        }
        await client.query(
          "UPDATE workspaces SET status = 'running', updated_at = now() WHERE id = $1",
          [run.rows[0]?.workspace_id],
        );
      }
      await client.query(
        `UPDATE job_queue
         SET status = 'failed', attempts = 0, available_at = now(),
             last_error = 'Manually retried by operator', lease_token = lease_token + 1,
             locked_at = NULL, locked_by = NULL, lease_expires_at = NULL,
             completed_at = NULL
         WHERE id = $1`,
        [jobId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
