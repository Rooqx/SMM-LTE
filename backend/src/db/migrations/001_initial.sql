CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  timezone text NOT NULL DEFAULT 'UTC',
  current_phase smallint NOT NULL DEFAULT 1 CHECK (current_phase BETWEEN 1 AND 6),
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'running', 'waiting_approval', 'paused', 'archived')),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);

CREATE TABLE IF NOT EXISTS workspace_context (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  key text NOT NULL CHECK (key ~ '^(brand|strategy|calendar|social|analytics)\.[a-z0-9_.-]+$'),
  markdown text NOT NULL DEFAULT '',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  source text NOT NULL DEFAULT 'runtime',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, key)
);

CREATE TABLE IF NOT EXISTS workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  phase smallint NOT NULL CHECK (phase BETWEEN 1 AND 6),
  skill_name text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'waiting_approval', 'completed', 'failed', 'cancelled', 'rejected')),
  complete_phase boolean NOT NULL DEFAULT false,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb,
  idempotency_key text,
  provider text,
  model text,
  provider_response_id text,
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS workflow_runs_workspace_created_idx
  ON workflow_runs (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  ordinal integer NOT NULL,
  skill_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  prompt_snapshot jsonb NOT NULL,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (run_id, ordinal)
);

CREATE TABLE IF NOT EXISTS approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  gate text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by text,
  note text,
  UNIQUE (run_id, gate)
);

CREATE TABLE IF NOT EXISTS artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  run_id uuid REFERENCES workflow_runs(id) ON DELETE SET NULL,
  kind text NOT NULL,
  slug text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, kind, slug, version)
);

CREATE TABLE IF NOT EXISTS job_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'dead')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 4,
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS job_queue_claim_idx
  ON job_queue (status, available_at, created_at)
  WHERE status IN ('queued', 'failed');

CREATE TABLE IF NOT EXISTS llm_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  provider text NOT NULL,
  model text NOT NULL,
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  provider_response_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS social_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('linkedin', 'x', 'instagram', 'facebook', 'tiktok', 'youtube')),
  external_account_id text NOT NULL,
  display_name text,
  credential_secret_ref text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, platform, external_account_id)
);

CREATE TABLE IF NOT EXISTS performance_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  social_account_id uuid REFERENCES social_accounts(id) ON DELETE SET NULL,
  external_content_id text NOT NULL,
  platform text NOT NULL,
  captured_at timestamptz NOT NULL,
  metrics jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, platform, external_content_id, captured_at)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id bigserial PRIMARY KEY,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL,
  actor text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_events_workspace_created_idx
  ON audit_events (workspace_id, created_at DESC);
