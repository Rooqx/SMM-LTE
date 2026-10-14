-- An answer snapshot may prefetch more than one distinct future-question batch.
-- Use the canonical application idempotency key (answers + ordered batch) so a
-- queued batch cannot suppress a later, different batch for the same session.

DROP INDEX IF EXISTS job_queue_interview_options_dedupe_idx;

CREATE UNIQUE INDEX job_queue_interview_options_dedupe_idx
  ON job_queue ((payload->>'sessionId'), (payload->>'idempotencyKey'))
  WHERE type = 'generate_interview_options'
    AND status IN ('queued', 'running', 'failed');

-- Tighten UUID syntax while this constraint is being versioned. Application
-- code still performs tenant/session/version authorization before admission.
ALTER TABLE job_queue
  DROP CONSTRAINT IF EXISTS job_queue_interview_options_payload_check;

ALTER TABLE job_queue
  ADD CONSTRAINT job_queue_interview_options_payload_check CHECK (
    type <> 'generate_interview_options'
    OR (
      payload->>'workspaceId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND payload->>'organizationId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND payload->>'sessionId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND payload->>'questionnaireVersion' ~ '^[0-9]+[.][0-9]+[.][0-9]+$'
      AND jsonb_typeof(payload->'targetQuestionIds') = 'array'
      AND jsonb_array_length(payload->'targetQuestionIds') BETWEEN 1 AND 5
      AND payload->>'confirmedAnswersHash' ~ '^[a-f0-9]{64}$'
      AND char_length(payload->>'idempotencyKey') BETWEEN 1 AND 200
    )
  );
