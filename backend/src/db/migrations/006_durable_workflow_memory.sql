-- Durable application-owned workflow and conversation state. The LLM remains
-- stateless; these records are the recoverable source of truth.

CREATE TABLE workflow_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'completed', 'archived')),
  recipe_version text NOT NULL CHECK (char_length(recipe_version) BETWEEN 1 AND 120),
  current_phase_instance_id uuid,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, workspace_id)
);

CREATE TABLE phase_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_instance_id uuid NOT NULL,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  phase smallint NOT NULL CHECK (phase BETWEEN 1 AND 6),
  cycle integer NOT NULL DEFAULT 1 CHECK (cycle > 0),
  attempt integer NOT NULL DEFAULT 1 CHECK (attempt > 0),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'failed', 'cancelled')),
  recipe_version text NOT NULL CHECK (char_length(recipe_version) BETWEEN 1 AND 120),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (status = 'active' AND completed_at IS NULL)
    OR (status <> 'active' AND completed_at IS NOT NULL)
  ),
  FOREIGN KEY (workflow_instance_id, workspace_id)
    REFERENCES workflow_instances(id, workspace_id) ON DELETE CASCADE,
  UNIQUE (workflow_instance_id, cycle, phase, attempt),
  UNIQUE (id, workspace_id),
  UNIQUE (id, workflow_instance_id, workspace_id)
);

CREATE UNIQUE INDEX phase_instances_one_active_workflow_idx
  ON phase_instances (workflow_instance_id)
  WHERE status = 'active';

ALTER TABLE workflow_instances
  ADD CONSTRAINT workflow_instances_current_phase_fk
  FOREIGN KEY (current_phase_instance_id, id, workspace_id)
  REFERENCES phase_instances(id, workflow_instance_id, workspace_id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE orchestration_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_instance_id uuid NOT NULL,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  step_key text NOT NULL CHECK (step_key ~ '^[a-z0-9][a-z0-9_.-]{0,119}$'),
  ordinal integer NOT NULL CHECK (ordinal > 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending', 'running', 'waiting_input', 'waiting_approval',
      'completed', 'failed', 'cancelled'
    )),
  recipe_version text NOT NULL CHECK (char_length(recipe_version) BETWEEN 1 AND 120),
  skill_name text CHECK (skill_name IS NULL OR char_length(skill_name) BETWEEN 1 AND 120),
  bundle_version text
    CHECK (bundle_version IS NULL OR char_length(bundle_version) BETWEEN 1 AND 120),
  skill_version text
    CHECK (skill_version IS NULL OR char_length(skill_version) BETWEEN 1 AND 120),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 20),
  input jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (octet_length(input::text) <= 500000),
  output jsonb CHECK (output IS NULL OR octet_length(output::text) <= 1000000),
  error_code text CHECK (error_code IS NULL OR char_length(error_code) <= 120),
  error_message text CHECK (error_message IS NULL OR char_length(error_message) <= 4000),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (phase_instance_id, workspace_id)
    REFERENCES phase_instances(id, workspace_id) ON DELETE CASCADE,
  UNIQUE (id, workspace_id),
  UNIQUE (id, phase_instance_id, workspace_id),
  UNIQUE (phase_instance_id, ordinal),
  UNIQUE (phase_instance_id, step_key)
);

CREATE UNIQUE INDEX orchestration_steps_one_transition_idx
  ON orchestration_steps (workspace_id)
  WHERE status = 'running';

ALTER TABLE workflow_runs
  ADD COLUMN orchestration_step_id uuid,
  ADD CONSTRAINT workflow_runs_orchestration_step_fk
    FOREIGN KEY (orchestration_step_id, workspace_id)
    REFERENCES orchestration_steps(id, workspace_id) ON DELETE RESTRICT;

CREATE INDEX workflow_runs_orchestration_step_idx
  ON workflow_runs (orchestration_step_id)
  WHERE orchestration_step_id IS NOT NULL;

CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  workflow_instance_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  next_message_ordinal bigint NOT NULL DEFAULT 1 CHECK (next_message_ordinal > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workflow_instance_id, workspace_id)
    REFERENCES workflow_instances(id, workspace_id) ON DELETE CASCADE,
  UNIQUE (id, workspace_id)
);

CREATE UNIQUE INDEX conversations_one_active_workspace_idx
  ON conversations (workspace_id)
  WHERE status = 'active';

CREATE TABLE conversation_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  phase_instance_id uuid,
  orchestration_step_id uuid,
  ordinal bigint NOT NULL CHECK (ordinal > 0),
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'tool', 'system')),
  kind text NOT NULL CHECK (kind IN (
    'message', 'answer', 'action', 'tool_request', 'tool_result', 'error'
  )),
  content text NOT NULL DEFAULT '' CHECK (char_length(content) <= 100000),
  data jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (octet_length(data::text) <= 200000),
  actor text NOT NULL CHECK (char_length(actor) BETWEEN 1 AND 240),
  provider text CHECK (provider IS NULL OR char_length(provider) <= 200),
  model text CHECK (model IS NULL OR char_length(model) <= 200),
  input_tokens integer CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens integer CHECK (output_tokens IS NULL OR output_tokens >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (conversation_id, workspace_id)
    REFERENCES conversations(id, workspace_id) ON DELETE CASCADE,
  FOREIGN KEY (phase_instance_id, workspace_id)
    REFERENCES phase_instances(id, workspace_id) ON DELETE RESTRICT,
  FOREIGN KEY (orchestration_step_id, phase_instance_id, workspace_id)
    REFERENCES orchestration_steps(id, phase_instance_id, workspace_id) ON DELETE RESTRICT,
  UNIQUE (id, workspace_id),
  UNIQUE (conversation_id, ordinal),
  UNIQUE (workspace_id, ordinal),
  UNIQUE (id, conversation_id, ordinal)
);

CREATE INDEX conversation_messages_workspace_created_idx
  ON conversation_messages (workspace_id, created_at DESC, id DESC);

CREATE TABLE conversation_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  from_ordinal bigint NOT NULL CHECK (from_ordinal > 0),
  through_ordinal bigint NOT NULL CHECK (through_ordinal >= from_ordinal),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 100000),
  data jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (octet_length(data::text) <= 200000),
  created_by text NOT NULL CHECK (char_length(created_by) BETWEEN 1 AND 240),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (conversation_id, workspace_id)
    REFERENCES conversations(id, workspace_id) ON DELETE CASCADE,
  UNIQUE (conversation_id, version),
  UNIQUE (conversation_id, from_ordinal, through_ordinal)
);

CREATE TABLE pending_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  workflow_instance_id uuid NOT NULL,
  phase_instance_id uuid NOT NULL,
  orchestration_step_id uuid,
  question_key text NOT NULL CHECK (question_key ~ '^[a-z0-9][a-z0-9_.-]{0,119}$'),
  prompt text NOT NULL CHECK (char_length(prompt) BETWEEN 1 AND 10000),
  purpose text NOT NULL DEFAULT '' CHECK (char_length(purpose) <= 2000),
  options jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (
      jsonb_typeof(options) = 'array'
      AND jsonb_array_length(options) <= 20
      AND octet_length(options::text) <= 50000
    ),
  allow_custom boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'answered', 'cancelled', 'superseded')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'answered') = (answered_at IS NOT NULL)),
  FOREIGN KEY (workflow_instance_id, workspace_id)
    REFERENCES workflow_instances(id, workspace_id) ON DELETE CASCADE,
  FOREIGN KEY (phase_instance_id, workflow_instance_id, workspace_id)
    REFERENCES phase_instances(id, workflow_instance_id, workspace_id) ON DELETE CASCADE,
  FOREIGN KEY (orchestration_step_id, phase_instance_id, workspace_id)
    REFERENCES orchestration_steps(id, phase_instance_id, workspace_id) ON DELETE RESTRICT,
  UNIQUE (id, workspace_id)
);

CREATE UNIQUE INDEX pending_questions_one_workspace_idx
  ON pending_questions (workspace_id)
  WHERE status = 'pending';

CREATE TABLE question_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL UNIQUE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  message_id uuid NOT NULL,
  answer jsonb NOT NULL CHECK (octet_length(answer::text) <= 50000),
  actor text NOT NULL CHECK (char_length(actor) BETWEEN 1 AND 240),
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 200),
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (question_id, workspace_id)
    REFERENCES pending_questions(id, workspace_id) ON DELETE CASCADE,
  FOREIGN KEY (message_id, workspace_id)
    REFERENCES conversation_messages(id, workspace_id) ON DELETE RESTRICT,
  UNIQUE (workspace_id, idempotency_key)
);

CREATE TABLE workspace_context_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  key text NOT NULL CHECK (key ~ '^(brand|strategy|calendar|social|analytics)\.[a-z0-9_.-]+$'),
  revision integer NOT NULL CHECK (revision > 0),
  markdown text NOT NULL DEFAULT '' CHECK (char_length(markdown) <= 100000),
  data jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (octet_length(data::text) <= 200000),
  source text NOT NULL,
  status text NOT NULL CHECK (status IN ('proposed', 'approved', 'rejected', 'superseded')),
  parent_revision_id uuid,
  created_by text NOT NULL CHECK (char_length(created_by) BETWEEN 1 AND 240),
  decided_by text,
  decision_note text CHECK (decision_note IS NULL OR char_length(decision_note) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  CHECK (char_length(source) BETWEEN 1 AND 120),
  CHECK (
    (status = 'proposed' AND decided_by IS NULL AND decided_at IS NULL)
    OR (status <> 'proposed' AND decided_by IS NOT NULL AND decided_at IS NOT NULL)
  ),
  FOREIGN KEY (parent_revision_id, workspace_id, key)
    REFERENCES workspace_context_revisions(id, workspace_id, key) ON DELETE RESTRICT,
  UNIQUE (workspace_id, key, revision),
  UNIQUE (id, workspace_id, key)
);

CREATE INDEX workspace_context_revisions_history_idx
  ON workspace_context_revisions (workspace_id, key, revision DESC);

INSERT INTO workspace_context_revisions(
  workspace_id, key, revision, markdown, data, source, status,
  created_by, decided_by, created_at, decided_at
)
SELECT workspace_id, key, version, markdown, data, source, 'approved',
       'migration:006', 'migration:006', created_at, updated_at
FROM workspace_context;

ALTER TABLE workspace_context
  ADD COLUMN current_revision_id uuid;

UPDATE workspace_context AS context
SET current_revision_id = revision.id
FROM workspace_context_revisions AS revision
WHERE revision.workspace_id = context.workspace_id
  AND revision.key = context.key
  AND revision.revision = context.version;

ALTER TABLE workspace_context
  ALTER COLUMN current_revision_id SET NOT NULL,
  ADD CONSTRAINT workspace_context_current_revision_fk
    FOREIGN KEY (current_revision_id, workspace_id, key)
    REFERENCES workspace_context_revisions(id, workspace_id, key)
    DEFERRABLE INITIALLY DEFERRED;

-- Backfill durable phase-1 state for workspaces created before this migration.
INSERT INTO workflow_instances(workspace_id, recipe_version)
SELECT id, 'legacy-v1' FROM workspaces
ON CONFLICT (workspace_id) DO NOTHING;

INSERT INTO phase_instances(
  workflow_instance_id, workspace_id, phase, cycle, attempt,
  status, recipe_version
)
SELECT workflow.id, workflow.workspace_id, workspaces.current_phase, 1, 1,
       'active', workflow.recipe_version
FROM workflow_instances AS workflow
JOIN workspaces ON workspaces.id = workflow.workspace_id
WHERE workflow.current_phase_instance_id IS NULL;

UPDATE workflow_instances AS workflow
SET current_phase_instance_id = phase.id
FROM phase_instances AS phase
WHERE phase.workflow_instance_id = workflow.id
  AND phase.status = 'active'
  AND workflow.current_phase_instance_id IS NULL;

-- Existing rows created above fire the deferred cyclic workflow/phase FK.
-- Validate those events before altering the referenced table; PostgreSQL
-- otherwise rejects the ALTER when upgrading a database that has workspaces.
SET CONSTRAINTS workflow_instances_current_phase_fk IMMEDIATE;

ALTER TABLE workflow_instances
  ALTER COLUMN current_phase_instance_id SET NOT NULL;

INSERT INTO conversations(workspace_id, workflow_instance_id)
SELECT workspace_id, id FROM workflow_instances
ON CONFLICT (workspace_id) WHERE status = 'active' DO NOTHING;

CREATE INDEX workflow_instances_status_idx
  ON workflow_instances (status, updated_at);
CREATE INDEX phase_instances_workspace_created_idx
  ON phase_instances (workspace_id, created_at DESC);
CREATE INDEX pending_questions_workspace_created_idx
  ON pending_questions (workspace_id, created_at DESC);
