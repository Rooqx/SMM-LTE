CREATE TABLE IF NOT EXISTS account_memberships (
  user_id uuid PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'owner' CHECK (role = 'owner'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- An exact email callback may be observed more than once. Queue it once while
-- allowing a newly issued verification/reset token to create a new message.
CREATE UNIQUE INDEX IF NOT EXISTS job_queue_auth_email_dedupe_idx
  ON job_queue ((payload->>'idempotencyKey'))
  WHERE type = 'send_auth_email';

ALTER TABLE job_queue
  DROP CONSTRAINT IF EXISTS job_queue_auth_email_payload_check;

ALTER TABLE job_queue
  ADD CONSTRAINT job_queue_auth_email_payload_check
  CHECK (
    type <> 'send_auth_email'
    OR (
      payload->>'kind' IN ('email_verification', 'password_reset')
      AND payload->>'idempotencyKey' ~ '^[a-f0-9]{64}$'
      AND (
        (
          status NOT IN ('completed', 'dead')
          AND char_length(payload->>'recipient') BETWEEN 3 AND 320
          AND char_length(payload->>'subject') BETWEEN 1 AND 200
          AND char_length(payload->>'text') BETWEEN 1 AND 20000
        )
        OR (
          status IN ('completed', 'dead')
          AND payload ? 'disposedAt'
          AND NOT payload ?| ARRAY['recipient', 'subject', 'text']
        )
      )
    )
  );
