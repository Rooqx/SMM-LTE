-- Product-facing read models and versioned owner settings. This migration is
-- additive so the application can be deployed after the schema without
-- interrupting existing workers.

CREATE TABLE account_preferences (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL UNIQUE REFERENCES "user"(id) ON DELETE CASCADE,
  timezone text NOT NULL DEFAULT 'UTC' CHECK (char_length(timezone) BETWEEN 1 AND 80),
  theme text NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark', 'light', 'system')),
  email_notifications boolean NOT NULL DEFAULT false,
  autopilot_enabled boolean NOT NULL DEFAULT true,
  review_reminders_enabled boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE final_posts
  ADD COLUMN publication_version integer NOT NULL DEFAULT 1
    CHECK (publication_version > 0);

CREATE TABLE product_command_receipts (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 200),
  command text NOT NULL CHECK (char_length(command) BETWEEN 1 AND 120),
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  response jsonb NOT NULL CHECK (octet_length(response::text) <= 100000),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, idempotency_key)
);

CREATE INDEX audit_events_organization_created_idx
  ON audit_events (organization_id, created_at DESC, id DESC);

CREATE INDEX workflow_runs_workspace_history_idx
  ON workflow_runs (workspace_id, created_at DESC, id DESC);

CREATE INDEX job_queue_obsidian_history_idx
  ON job_queue ((payload->>'organizationId'), created_at DESC, id DESC)
  WHERE type = 'export_obsidian';
