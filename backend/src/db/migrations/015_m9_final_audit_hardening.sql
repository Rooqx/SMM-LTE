-- M9.7 hardens progress-event ownership discovered during final reconciliation.
-- A progress row must reference the same workspace as its workflow run; two
-- independent foreign keys allowed an internally inconsistent cross-workspace
-- pair even though tenant-scoped reads would later hide it.

ALTER TABLE workflow_run_progress_events
  DROP CONSTRAINT IF EXISTS workflow_run_progress_events_run_id_fkey;

ALTER TABLE workflow_run_progress_events
  ADD CONSTRAINT workflow_run_progress_events_run_workspace_fk
    FOREIGN KEY (run_id, workspace_id)
    REFERENCES workflow_runs(id, workspace_id)
    ON DELETE CASCADE;

-- A retryable failed option job is still active work. Including it in the
-- partial unique index prevents a second equivalent job from being admitted
-- while the first is waiting for its retry window.
DROP INDEX IF EXISTS job_queue_interview_options_dedupe_idx;

CREATE UNIQUE INDEX job_queue_interview_options_dedupe_idx
  ON job_queue ((payload->>'sessionId'), (payload->>'confirmedAnswersHash'))
  WHERE type = 'generate_interview_options'
    AND status IN ('queued', 'running', 'failed');

ALTER TABLE job_queue
  DROP CONSTRAINT IF EXISTS job_queue_interview_options_payload_check;

ALTER TABLE job_queue
  ADD CONSTRAINT job_queue_interview_options_payload_check CHECK (
    type <> 'generate_interview_options'
    OR (
      payload->>'workspaceId' ~ '^[0-9a-fA-F-]{36}$'
      AND payload->>'organizationId' ~ '^[0-9a-fA-F-]{36}$'
      AND payload->>'sessionId' ~ '^[0-9a-fA-F-]{36}$'
      AND payload->>'questionnaireVersion' ~ '^[0-9]+[.][0-9]+[.][0-9]+$'
      AND jsonb_typeof(payload->'targetQuestionIds') = 'array'
      AND jsonb_array_length(payload->'targetQuestionIds') BETWEEN 1 AND 5
      AND payload->>'confirmedAnswersHash' ~ '^[a-f0-9]{64}$'
      AND char_length(payload->>'idempotencyKey') BETWEEN 1 AND 200
    )
  );
