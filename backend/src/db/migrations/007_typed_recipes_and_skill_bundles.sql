-- Immutable, source-controlled recipe and skill release records. Runtime rows
-- reference exact versions so rolling deployments cannot reinterpret work.

CREATE TABLE recipe_versions (
  suite_id text NOT NULL CHECK (suite_id ~ '^[a-z0-9][a-z0-9_.-]{0,119}$'),
  suite_version text NOT NULL CHECK (char_length(suite_version) BETWEEN 1 AND 120),
  phase smallint NOT NULL CHECK (phase BETWEEN 1 AND 6),
  recipe_id text NOT NULL CHECK (recipe_id ~ '^[a-z0-9][a-z0-9_.-]{0,119}$'),
  definition_hash text NOT NULL CHECK (definition_hash ~ '^[a-f0-9]{64}$'),
  definition jsonb NOT NULL CHECK (octet_length(definition::text) <= 500000),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (suite_id, suite_version, phase),
  UNIQUE (suite_id, suite_version, phase, recipe_id)
);

CREATE TABLE skill_bundles (
  version text PRIMARY KEY CHECK (version ~ '^[a-f0-9]{64}$'),
  orchestrator_hash text NOT NULL CHECK (orchestrator_hash ~ '^[a-f0-9]{64}$'),
  bridge_hash text NOT NULL CHECK (bridge_hash ~ '^[a-f0-9]{64}$'),
  orchestrator_content text NOT NULL CHECK (char_length(orchestrator_content) <= 500000),
  bridge_content text NOT NULL CHECK (char_length(bridge_content) <= 500000),
  manifest jsonb NOT NULL CHECK (octet_length(manifest::text) <= 1000000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE skill_bundle_entries (
  bundle_version text NOT NULL REFERENCES skill_bundles(version) ON DELETE RESTRICT,
  skill_name text NOT NULL CHECK (skill_name ~ '^[a-z0-9-]{1,64}$'),
  phase smallint NOT NULL CHECK (phase BETWEEN 1 AND 6),
  relative_path text NOT NULL CHECK (char_length(relative_path) BETWEEN 1 AND 500),
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  content text NOT NULL CHECK (char_length(content) <= 500000),
  description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 4000),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (octet_length(metadata::text) <= 100000),
  PRIMARY KEY (bundle_version, skill_name),
  UNIQUE (bundle_version, skill_name, content_hash)
);

ALTER TABLE workflow_instances
  ADD COLUMN recipe_suite_id text NOT NULL DEFAULT 'smm-autopilot'
    CHECK (recipe_suite_id ~ '^[a-z0-9][a-z0-9_.-]{0,119}$');

UPDATE workflow_instances
SET recipe_version = '1.0.0', updated_at = now()
WHERE recipe_version = 'legacy-v1';

UPDATE phase_instances
SET recipe_version = '1.0.0', updated_at = now()
WHERE recipe_version = 'legacy-v1';

ALTER TABLE workflow_runs
  ADD COLUMN recipe_suite_id text,
  ADD COLUMN recipe_id text,
  ADD COLUMN recipe_version text,
  ADD COLUMN skill_bundle_version text,
  ADD COLUMN skill_content_hash text,
  ADD COLUMN orchestrator_hash text,
  ADD COLUMN bridge_hash text;

ALTER TABLE workflow_runs
  ADD CONSTRAINT workflow_runs_recipe_version_fk
    FOREIGN KEY (recipe_suite_id, recipe_version, phase, recipe_id)
    REFERENCES recipe_versions(suite_id, suite_version, phase, recipe_id) ON DELETE RESTRICT,
  ADD CONSTRAINT workflow_runs_skill_bundle_fk
    FOREIGN KEY (skill_bundle_version)
    REFERENCES skill_bundles(version) ON DELETE RESTRICT,
  ADD CONSTRAINT workflow_runs_skill_release_fk
    FOREIGN KEY (skill_bundle_version, skill_name, skill_content_hash)
    REFERENCES skill_bundle_entries(bundle_version, skill_name, content_hash) ON DELETE RESTRICT,
  ADD CONSTRAINT workflow_runs_skill_hash_check
    CHECK (skill_content_hash IS NULL OR skill_content_hash ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT workflow_runs_orchestrator_hash_check
    CHECK (orchestrator_hash IS NULL OR orchestrator_hash ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT workflow_runs_bridge_hash_check
    CHECK (bridge_hash IS NULL OR bridge_hash ~ '^[a-f0-9]{64}$');

ALTER TABLE workflow_runs
  ADD CONSTRAINT workflow_runs_id_workspace_unique UNIQUE (id, workspace_id);

CREATE TABLE workflow_run_context_revisions (
  run_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  revision_id uuid NOT NULL,
  context_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, revision_id),
  UNIQUE (run_id, context_key),
  FOREIGN KEY (run_id, workspace_id)
    REFERENCES workflow_runs(id, workspace_id) ON DELETE CASCADE,
  FOREIGN KEY (revision_id, workspace_id, context_key)
    REFERENCES workspace_context_revisions(id, workspace_id, key) ON DELETE RESTRICT
);

ALTER TABLE orchestration_steps
  ADD COLUMN recipe_id text,
  ADD COLUMN orchestrator_hash text,
  ADD COLUMN bridge_hash text;

CREATE INDEX workflow_runs_release_refs_idx
  ON workflow_runs (recipe_suite_id, recipe_version, skill_bundle_version)
  WHERE recipe_version IS NOT NULL;
