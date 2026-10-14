-- M9.2 and M9.3 extend guided-intake persistence with compiled intake storage,
-- option-assistant caching, and bounded durable job queuing for option generation.

ALTER TABLE interview_sessions
  ADD COLUMN IF NOT EXISTS compiled_intake jsonb;

ALTER TABLE interview_sessions
  DROP CONSTRAINT IF EXISTS interview_sessions_compiled_intake_check;

ALTER TABLE interview_sessions
  ADD CONSTRAINT interview_sessions_compiled_intake_check CHECK (
    compiled_intake IS NULL OR (
      status = 'completed'
      AND jsonb_typeof(compiled_intake) = 'object'
      AND octet_length(compiled_intake::text) <= 500000
    )
  );

CREATE TABLE IF NOT EXISTS interview_option_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  cache_key text NOT NULL UNIQUE CHECK (cache_key ~ '^[a-f0-9]{64}$'),
  questionnaire_id text NOT NULL CHECK (questionnaire_id ~ '^[a-z0-9][a-z0-9_.-]{0,119}$'),
  questionnaire_version text NOT NULL CHECK (questionnaire_version ~ '^[0-9]+[.][0-9]+[.][0-9]+$'),
  confirmed_answers_hash text NOT NULL CHECK (confirmed_answers_hash ~ '^[a-f0-9]{64}$'),
  prompt_version text NOT NULL CHECK (char_length(prompt_version) BETWEEN 1 AND 120),
  generator_provider text NOT NULL CHECK (char_length(generator_provider) BETWEEN 1 AND 120),
  generator_model text NOT NULL CHECK (char_length(generator_model) BETWEEN 1 AND 200),
  suggestions jsonb NOT NULL CHECK (
    jsonb_typeof(suggestions) = 'object'
    AND octet_length(suggestions::text) <= 50000
  ),
  explanation text CHECK (
    explanation IS NULL OR char_length(btrim(explanation)) BETWEEN 1 AND 1000
  ),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS interview_option_cache_workspace_idx
  ON interview_option_cache (workspace_id, expires_at);

CREATE INDEX IF NOT EXISTS interview_option_cache_expires_idx
  ON interview_option_cache (expires_at);

ALTER TABLE job_queue
  DROP CONSTRAINT IF EXISTS job_queue_interview_options_payload_check;

ALTER TABLE job_queue
  ADD CONSTRAINT job_queue_interview_options_payload_check CHECK (
    type <> 'generate_interview_options'
    OR (
      payload->>'workspaceId' ~ '^[0-9a-fA-F-]{36}$'
      AND payload->>'organizationId' ~ '^[0-9a-fA-F-]{36}$'
      AND payload->>'sessionId' ~ '^[0-9a-fA-F-]{36}$'
      AND payload->>'confirmedAnswersHash' ~ '^[a-f0-9]{64}$'
      AND char_length(payload->>'idempotencyKey') BETWEEN 1 AND 200
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS job_queue_interview_options_dedupe_idx
  ON job_queue ((payload->>'sessionId'), (payload->>'confirmedAnswersHash'))
  WHERE type = 'generate_interview_options' AND status IN ('queued', 'running');
