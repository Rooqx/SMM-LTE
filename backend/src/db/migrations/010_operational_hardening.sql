-- M6 adds additive execution fencing, trace correlation, durable job events,
-- and model operational measurements. Deploy this migration before the new
-- API/workers and drain pre-M6 workers before allowing claims.

ALTER TABLE job_queue
  ADD COLUMN IF NOT EXISTS lease_token bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS correlation_id text;

ALTER TABLE workflow_runs
  ADD COLUMN IF NOT EXISTS execution_fence bigint,
  ADD COLUMN IF NOT EXISTS correlation_id text;

ALTER TABLE workflow_steps
  ADD COLUMN IF NOT EXISTS correlation_id text;

ALTER TABLE llm_usage
  ADD COLUMN IF NOT EXISTS duration_ms integer,
  ADD COLUMN IF NOT EXISTS estimated_cost_microusd bigint;

UPDATE workflow_runs
SET correlation_id = 'run:' || id::text
WHERE correlation_id IS NULL;

UPDATE workflow_steps AS step
SET correlation_id = run.correlation_id
FROM workflow_runs AS run
WHERE run.id = step.run_id
  AND step.correlation_id IS NULL;

UPDATE job_queue AS job
SET correlation_id = COALESCE(run.correlation_id, 'job:' || job.id::text),
    lease_token = GREATEST(job.lease_token, job.attempts),
    lease_expires_at = CASE
      WHEN job.status = 'running'
        THEN COALESCE(job.locked_at, now()) + interval '15 minutes'
      ELSE NULL
    END
FROM workflow_runs AS run
WHERE run.id = CASE
  WHEN job.payload->>'runId' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
    THEN (job.payload->>'runId')::uuid
  ELSE NULL
END;

UPDATE job_queue
SET correlation_id = 'job:' || id::text
WHERE correlation_id IS NULL;

-- Queue rows intentionally do not foreign-key to workflow runs because the
-- table also carries email/export work. Fence even an orphaned legacy running
-- row so the state constraint and operator recovery remain safe.
UPDATE job_queue
SET lease_token = GREATEST(lease_token, attempts, 1),
    locked_at = COALESCE(locked_at, now()),
    locked_by = COALESCE(locked_by, 'legacy-recovery'),
    lease_expires_at = COALESCE(lease_expires_at, COALESCE(locked_at, now()) + interval '15 minutes')
WHERE status = 'running';

UPDATE workflow_runs AS run
SET execution_fence = job.lease_token
FROM job_queue AS job
WHERE job.type = 'execute_workflow_run'
  AND job.status = 'running'
  AND run.id::text = job.payload->>'runId'
  AND run.status = 'running';

ALTER TABLE workflow_runs
  ALTER COLUMN correlation_id SET NOT NULL,
  ALTER COLUMN correlation_id SET DEFAULT ('run:' || gen_random_uuid()::text);

ALTER TABLE workflow_steps
  ALTER COLUMN correlation_id SET NOT NULL,
  ALTER COLUMN correlation_id SET DEFAULT ('step:' || gen_random_uuid()::text);

ALTER TABLE job_queue
  ALTER COLUMN correlation_id SET NOT NULL,
  ALTER COLUMN correlation_id SET DEFAULT ('job:' || gen_random_uuid()::text);

ALTER TABLE job_queue
  DROP CONSTRAINT IF EXISTS job_queue_lease_state_check;

ALTER TABLE job_queue
  ADD CONSTRAINT job_queue_lease_state_check CHECK (
    (
      status = 'running'
      AND locked_at IS NOT NULL
      AND locked_by IS NOT NULL
      AND lease_expires_at IS NOT NULL
      AND lease_token > 0
    )
    OR (
      status <> 'running'
      AND locked_at IS NULL
      AND locked_by IS NULL
      AND lease_expires_at IS NULL
    )
  );

ALTER TABLE llm_usage
  DROP CONSTRAINT IF EXISTS llm_usage_operational_values_check;

ALTER TABLE llm_usage
  ADD CONSTRAINT llm_usage_operational_values_check CHECK (
    (duration_ms IS NULL OR duration_ms >= 0)
    AND (estimated_cost_microusd IS NULL OR estimated_cost_microusd >= 0)
  );

ALTER TABLE job_queue
  DROP CONSTRAINT IF EXISTS job_queue_obsidian_export_payload_check;

ALTER TABLE job_queue
  ADD CONSTRAINT job_queue_obsidian_export_payload_check CHECK (
    type <> 'export_obsidian'
    OR (
      payload->>'workspaceId' ~ '^[0-9a-fA-F-]{36}$'
      AND payload->>'organizationId' ~ '^[0-9a-fA-F-]{36}$'
      AND char_length(payload->>'idempotencyKey') BETWEEN 1 AND 200
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS job_queue_obsidian_export_dedupe_idx
  ON job_queue ((payload->>'organizationId'), (payload->>'idempotencyKey'))
  WHERE type = 'export_obsidian';

CREATE INDEX IF NOT EXISTS job_queue_lease_expiry_idx
  ON job_queue (lease_expires_at, id)
  WHERE status = 'running';

CREATE INDEX IF NOT EXISTS job_queue_type_claim_idx
  ON job_queue (type, status, available_at, created_at, id)
  WHERE status IN ('queued', 'failed');

CREATE INDEX IF NOT EXISTS llm_usage_created_at_idx
  ON llm_usage (created_at, run_id);

CREATE TABLE IF NOT EXISTS job_attempt_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES job_queue(id) ON DELETE CASCADE,
  event text NOT NULL CHECK (
    event IN ('claimed', 'completed', 'retry_scheduled', 'dead', 'recovered', 'lease_lost')
  ),
  lease_token bigint NOT NULL CHECK (lease_token >= 0),
  worker_id text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_attempt_events_time_idx
  ON job_attempt_events (occurred_at DESC, event);

CREATE INDEX IF NOT EXISTS job_attempt_events_job_idx
  ON job_attempt_events (job_id, occurred_at DESC);
