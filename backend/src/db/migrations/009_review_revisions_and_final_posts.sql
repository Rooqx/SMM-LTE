-- Exact review revisions, immutable artifact lineage, and structured final
-- posts. Existing runs/artifacts are backfilled as revision one so this stays
-- an additive, forward-only migration.

ALTER TABLE workflow_runs
  ADD COLUMN review_thread_id uuid,
  ADD COLUMN review_revision integer NOT NULL DEFAULT 1,
  ADD COLUMN supersedes_run_id uuid,
  ADD COLUMN revision_instructions text;

UPDATE workflow_runs SET review_thread_id = id WHERE review_thread_id IS NULL;

ALTER TABLE workflow_runs
  ALTER COLUMN review_thread_id SET NOT NULL,
  ALTER COLUMN review_thread_id SET DEFAULT gen_random_uuid(),
  ADD CONSTRAINT workflow_runs_review_revision_check
    CHECK (review_revision > 0),
  ADD CONSTRAINT workflow_runs_revision_instructions_check
    CHECK (revision_instructions IS NULL OR char_length(revision_instructions) BETWEEN 1 AND 10000),
  ADD CONSTRAINT workflow_runs_review_identity_unique
    UNIQUE (workspace_id, review_thread_id, review_revision),
  ADD CONSTRAINT workflow_runs_review_parent_identity_unique
    UNIQUE (id, workspace_id, review_thread_id),
  ADD CONSTRAINT workflow_runs_review_parent_fk
    FOREIGN KEY (supersedes_run_id, workspace_id, review_thread_id)
    REFERENCES workflow_runs(id, workspace_id, review_thread_id) ON DELETE RESTRICT,
  ADD CONSTRAINT workflow_runs_review_parent_not_self_check
    CHECK (supersedes_run_id IS NULL OR supersedes_run_id <> id);

CREATE INDEX workflow_runs_review_thread_idx
  ON workflow_runs (workspace_id, review_thread_id, review_revision DESC);

ALTER TABLE artifacts
  ADD COLUMN logical_id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN parent_revision_id uuid,
  ADD COLUMN revision_instructions text,
  ADD COLUMN created_by text NOT NULL DEFAULT 'system:legacy',
  ADD COLUMN decided_by text,
  ADD COLUMN decided_at timestamptz;

-- Historical (workspace, kind, slug) series already used `version` as their
-- revision number. Preserve those series and derive their parent links.
WITH lineage AS (
  SELECT id,
         first_value(id) OVER (
           PARTITION BY workspace_id, kind, slug ORDER BY version, created_at, id
         ) AS logical_id,
         lag(id) OVER (
           PARTITION BY workspace_id, kind, slug ORDER BY version, created_at, id
         ) AS parent_revision_id
  FROM artifacts
)
UPDATE artifacts AS artifact
SET logical_id = lineage.logical_id,
    parent_revision_id = lineage.parent_revision_id
FROM lineage
WHERE artifact.id = lineage.id;

ALTER TABLE artifacts
  ALTER COLUMN logical_id SET NOT NULL,
  DROP CONSTRAINT artifacts_status_check,
  ADD CONSTRAINT artifacts_status_check
    CHECK (status IN ('draft', 'approved', 'rejected', 'superseded')),
  ADD CONSTRAINT artifacts_revision_instructions_check
    CHECK (revision_instructions IS NULL OR char_length(revision_instructions) BETWEEN 1 AND 10000),
  ADD CONSTRAINT artifacts_logical_revision_unique
    UNIQUE (workspace_id, logical_id, version),
  ADD CONSTRAINT artifacts_id_workspace_unique
    UNIQUE (id, workspace_id),
  ADD CONSTRAINT artifacts_parent_identity_unique
    UNIQUE (id, workspace_id, logical_id),
  ADD CONSTRAINT artifacts_parent_revision_fk
    FOREIGN KEY (parent_revision_id, workspace_id, logical_id)
    REFERENCES artifacts(id, workspace_id, logical_id) ON DELETE RESTRICT,
  ADD CONSTRAINT artifacts_parent_not_self_check
    CHECK (parent_revision_id IS NULL OR parent_revision_id <> id);

CREATE INDEX artifacts_workspace_lineage_idx
  ON artifacts (workspace_id, logical_id, version DESC);
CREATE INDEX artifacts_workspace_filter_idx
  ON artifacts (workspace_id, status, kind, created_at DESC, id DESC);

CREATE TABLE final_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  run_id uuid NOT NULL,
  source_artifact_id uuid,
  logical_id uuid NOT NULL DEFAULT gen_random_uuid(),
  parent_revision_id uuid,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  logical_key text NOT NULL CHECK (logical_key ~ '^[a-z0-9][a-z0-9_.-]{0,159}$'),
  sprint text NOT NULL CHECK (char_length(sprint) BETWEEN 1 AND 120),
  week integer NOT NULL CHECK (week BETWEEN 1 AND 53),
  local_date date NOT NULL,
  timezone text NOT NULL CHECK (char_length(timezone) BETWEEN 1 AND 80),
  platform text NOT NULL CHECK (platform ~ '^[a-z0-9][a-z0-9_.-]{0,39}$'),
  campaign text CHECK (campaign IS NULL OR char_length(campaign) <= 200),
  topic text NOT NULL CHECK (char_length(topic) BETWEEN 1 AND 240),
  pillar text CHECK (pillar IS NULL OR char_length(pillar) <= 160),
  content_format text NOT NULL CHECK (content_format ~ '^[a-z0-9][a-z0-9_.-]{0,79}$'),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 240),
  content text NOT NULL CHECK (char_length(content) <= 50000),
  pinned_comment text CHECK (pinned_comment IS NULL OR char_length(pinned_comment) <= 10000),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(metadata::text) <= 100000),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'rejected', 'superseded')),
  publication_status text NOT NULL DEFAULT 'not_scheduled'
    CHECK (publication_status IN ('not_scheduled', 'scheduled', 'published', 'failed', 'cancelled')),
  revision_instructions text
    CHECK (revision_instructions IS NULL OR char_length(revision_instructions) BETWEEN 1 AND 10000),
  created_by text NOT NULL CHECK (char_length(created_by) BETWEEN 1 AND 240),
  decided_by text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  search_document tsvector GENERATED ALWAYS AS (
    to_tsvector(
      'simple',
      coalesce(title, '') || ' ' || coalesce(topic, '') || ' ' ||
      coalesce(campaign, '') || ' ' || coalesce(pillar, '') || ' ' ||
      coalesce(content, '') || ' ' || coalesce(pinned_comment, '')
    )
  ) STORED,
  UNIQUE (id, workspace_id),
  UNIQUE (id, workspace_id, logical_id),
  UNIQUE (workspace_id, logical_id, revision),
  FOREIGN KEY (run_id, workspace_id)
    REFERENCES workflow_runs(id, workspace_id) ON DELETE RESTRICT,
  FOREIGN KEY (source_artifact_id, workspace_id)
    REFERENCES artifacts(id, workspace_id) ON DELETE RESTRICT,
  FOREIGN KEY (parent_revision_id, workspace_id, logical_id)
    REFERENCES final_posts(id, workspace_id, logical_id) ON DELETE RESTRICT,
  CHECK (parent_revision_id IS NULL OR parent_revision_id <> id)
);

CREATE INDEX final_posts_workspace_cursor_idx
  ON final_posts (workspace_id, local_date DESC, created_at DESC, id DESC);
CREATE INDEX final_posts_workspace_status_idx
  ON final_posts (workspace_id, status, local_date DESC, id DESC);
CREATE INDEX final_posts_workspace_platform_idx
  ON final_posts (workspace_id, platform, local_date DESC, id DESC);
CREATE INDEX final_posts_workspace_sprint_week_idx
  ON final_posts (workspace_id, sprint, week, local_date, platform);
CREATE INDEX final_posts_workspace_campaign_idx
  ON final_posts (workspace_id, campaign, local_date DESC)
  WHERE campaign IS NOT NULL;
CREATE INDEX final_posts_search_idx ON final_posts USING gin (search_document);
