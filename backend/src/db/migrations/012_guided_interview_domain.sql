-- M9.1 introduces one explicit Phase-1 interview authority and durable,
-- version-pinned guided-intake state. Questionnaire definitions remain
-- source-controlled TypeScript; rows pin the exact reviewed release used.

CREATE TABLE interview_authorities (
  workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  authority text NOT NULL CHECK (authority IN ('legacy', 'guided')),
  questionnaire_id text,
  questionnaire_version text,
  selected_by text NOT NULL CHECK (char_length(selected_by) BETWEEN 1 AND 200),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, questionnaire_id, questionnaire_version),
  CHECK (
    (authority = 'legacy' AND questionnaire_id IS NULL AND questionnaire_version IS NULL)
    OR (
      authority = 'guided'
      AND questionnaire_id ~ '^[a-z0-9][a-z0-9_.-]{0,119}$'
      AND questionnaire_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'
    )
  )
);

CREATE TABLE interview_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  questionnaire_id text NOT NULL
    CHECK (questionnaire_id ~ '^[a-z0-9][a-z0-9_.-]{0,119}$'),
  questionnaire_version text NOT NULL
    CHECK (questionnaire_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'cancelled')),
  current_question_id text
    CHECK (current_question_id IS NULL OR current_question_id ~ '^[a-z0-9][a-z0-9_.-]{0,119}$'),
  current_question_version integer
    CHECK (current_question_version IS NULL OR current_question_version > 0),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, workspace_id),
  FOREIGN KEY (workspace_id, questionnaire_id, questionnaire_version)
    REFERENCES interview_authorities(
      workspace_id, questionnaire_id, questionnaire_version
    ) ON DELETE CASCADE,
  CHECK (
    (status = 'completed' AND completed_at IS NOT NULL)
    OR (status <> 'completed' AND completed_at IS NULL)
  ),
  CHECK (
    (current_question_id IS NULL AND current_question_version IS NULL)
    OR (current_question_id IS NOT NULL AND current_question_version IS NOT NULL)
  )
);

CREATE UNIQUE INDEX interview_sessions_one_active_workspace_idx
  ON interview_sessions (workspace_id)
  WHERE status = 'in_progress';

CREATE INDEX interview_sessions_workspace_updated_idx
  ON interview_sessions (workspace_id, updated_at DESC);

CREATE TABLE interview_option_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  question_id text NOT NULL
    CHECK (question_id ~ '^[a-z0-9][a-z0-9_.-]{0,119}$'),
  question_version integer NOT NULL CHECK (question_version > 0),
  origin text NOT NULL CHECK (origin IN ('curated', 'programmatic', 'model')),
  generator_provider text CHECK (
    generator_provider IS NULL OR char_length(generator_provider) BETWEEN 1 AND 120
  ),
  generator_model text CHECK (
    generator_model IS NULL OR char_length(generator_model) BETWEEN 1 AND 200
  ),
  prompt_version text CHECK (
    prompt_version IS NULL OR char_length(prompt_version) BETWEEN 1 AND 120
  ),
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  options jsonb NOT NULL CHECK (
    jsonb_typeof(options) = 'array'
    AND jsonb_array_length(options) BETWEEN 2 AND 12
    AND octet_length(options::text) <= 50000
  ),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'expired')),
  expires_at timestamptz,
  presented_at timestamptz,
  interaction_started_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (session_id, workspace_id)
    REFERENCES interview_sessions(id, workspace_id) ON DELETE CASCADE,
  UNIQUE (id, session_id, workspace_id),
  CHECK (
    (origin = 'model' AND generator_provider IS NOT NULL
      AND generator_model IS NOT NULL AND prompt_version IS NOT NULL
      AND expires_at IS NOT NULL)
    OR (origin <> 'model' AND generator_provider IS NULL
      AND generator_model IS NULL AND prompt_version IS NULL)
  ),
  CHECK (expires_at IS NULL OR expires_at > created_at),
  CHECK (interaction_started_at IS NULL OR presented_at IS NOT NULL)
);

CREATE UNIQUE INDEX interview_option_sets_one_active_question_idx
  ON interview_option_sets (session_id, question_id)
  WHERE status = 'active';

CREATE INDEX interview_option_sets_workspace_created_idx
  ON interview_option_sets (workspace_id, created_at DESC);

CREATE TABLE interview_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  question_id text NOT NULL
    CHECK (question_id ~ '^[a-z0-9][a-z0-9_.-]{0,119}$'),
  question_version integer NOT NULL CHECK (question_version > 0),
  option_set_id uuid NOT NULL,
  selected_option_ids text[] NOT NULL DEFAULT '{}',
  selected_options jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (
    jsonb_typeof(selected_options) = 'array'
    AND jsonb_array_length(selected_options) <= 5
    AND octet_length(selected_options::text) <= 10000
  ),
  custom_text text CHECK (
    custom_text IS NULL OR char_length(btrim(custom_text)) BETWEEN 1 AND 10000
  ),
  answer_source text NOT NULL CHECK (answer_source IN ('option', 'custom', 'combined')),
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 200),
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  session_version integer NOT NULL CHECK (session_version > 1),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded')),
  supersedes_answer_id uuid REFERENCES interview_answers(id) ON DELETE RESTRICT,
  actor text NOT NULL CHECK (char_length(actor) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz,
  FOREIGN KEY (session_id, workspace_id)
    REFERENCES interview_sessions(id, workspace_id) ON DELETE CASCADE,
  FOREIGN KEY (option_set_id, session_id, workspace_id)
    REFERENCES interview_option_sets(id, session_id, workspace_id) ON DELETE RESTRICT,
  UNIQUE (session_id, idempotency_key),
  UNIQUE (id, session_id, workspace_id),
  CHECK (
    cardinality(selected_option_ids) > 0 OR custom_text IS NOT NULL
  ),
  CHECK (cardinality(selected_option_ids) = jsonb_array_length(selected_options)),
  CHECK (
    (answer_source = 'option' AND cardinality(selected_option_ids) > 0 AND custom_text IS NULL)
    OR (answer_source = 'custom' AND cardinality(selected_option_ids) = 0 AND custom_text IS NOT NULL)
    OR (answer_source = 'combined' AND cardinality(selected_option_ids) > 0 AND custom_text IS NOT NULL)
  ),
  CHECK (
    (status = 'active' AND superseded_at IS NULL)
    OR (status = 'superseded' AND superseded_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX interview_answers_one_active_question_idx
  ON interview_answers (session_id, question_id)
  WHERE status = 'active';

CREATE INDEX interview_answers_workspace_created_idx
  ON interview_answers (workspace_id, created_at DESC);

CREATE INDEX interview_answers_session_created_idx
  ON interview_answers (session_id, created_at, id);
