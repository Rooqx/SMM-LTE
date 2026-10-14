CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  token_prefix text NOT NULL,
  scopes text[] NOT NULL DEFAULT '{}',
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS api_keys_organization_idx ON api_keys (organization_id);

ALTER TABLE workflow_runs
  ADD COLUMN IF NOT EXISTS output_status text,
  ADD COLUMN IF NOT EXISTS output_decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS output_decided_by text,
  ADD COLUMN IF NOT EXISTS output_decision_note text;

ALTER TABLE workflow_runs
  DROP CONSTRAINT IF EXISTS workflow_runs_output_status_check;

ALTER TABLE workflow_runs
  ADD CONSTRAINT workflow_runs_output_status_check
  CHECK (output_status IS NULL OR output_status IN ('pending', 'accepted', 'rejected'));

ALTER TABLE artifacts
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved';

ALTER TABLE artifacts
  DROP CONSTRAINT IF EXISTS artifacts_status_check;

ALTER TABLE artifacts
  ADD CONSTRAINT artifacts_status_check
  CHECK (status IN ('draft', 'approved', 'rejected'));

-- Existing artifacts predate staged model output and are treated as approved.
UPDATE artifacts SET status = 'approved' WHERE status IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS workflow_runs_one_active_per_workspace_idx
  ON workflow_runs (workspace_id)
  WHERE status IN ('queued', 'running', 'waiting_approval');

CREATE UNIQUE INDEX IF NOT EXISTS job_queue_one_active_run_job_idx
  ON job_queue ((payload->>'runId'))
  WHERE type = 'execute_workflow_run' AND status IN ('queued', 'running', 'failed');

CREATE INDEX IF NOT EXISTS workflow_runs_status_idx ON workflow_runs (status, updated_at);
