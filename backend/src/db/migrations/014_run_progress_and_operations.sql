-- M9.5 adds coarse, content-free run progress tracking, progress projection events,
-- and Server-Sent Events delivery support with reconnection and bounded polling fallback.

ALTER TABLE workflow_runs
  ADD COLUMN IF NOT EXISTS progress_stage text NOT NULL DEFAULT 'queued'
  CHECK (progress_stage IN (
    'queued',
    'loading_context',
    'generating',
    'validating',
    'ready',
    'waiting_approval',
    'waiting_input',
    'failed',
    'cancelled'
  ));

-- Backfill progress_stage for existing workflow_runs based on status
UPDATE workflow_runs
SET progress_stage = CASE
  WHEN status = 'queued' THEN 'queued'
  WHEN status = 'running' THEN 'loading_context'
  WHEN status = 'waiting_approval' THEN 'waiting_approval'
  WHEN status = 'completed' THEN 'ready'
  WHEN status = 'failed' OR status = 'rejected' THEN 'failed'
  WHEN status = 'cancelled' THEN 'cancelled'
  ELSE 'queued'
END
WHERE progress_stage = 'queued' AND status <> 'queued';

CREATE TABLE IF NOT EXISTS workflow_run_progress_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  phase smallint NOT NULL CHECK (phase BETWEEN 1 AND 6),
  skill_name text NOT NULL CHECK (char_length(skill_name) BETWEEN 1 AND 80),
  stage text NOT NULL CHECK (
    stage IN (
      'queued',
      'loading_context',
      'generating',
      'validating',
      'ready',
      'waiting_approval',
      'waiting_input',
      'failed',
      'cancelled'
    )
  ),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workflow_run_progress_events_run_id_idx
  ON workflow_run_progress_events (run_id, id ASC);

CREATE INDEX IF NOT EXISTS workflow_run_progress_events_workspace_id_idx
  ON workflow_run_progress_events (workspace_id, occurred_at DESC);
