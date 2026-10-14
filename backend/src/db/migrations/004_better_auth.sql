-- Matched against the schema created by Better Auth 1.7.7's PostgreSQL
-- adapter. Additional constraints and indexes preserve application invariants.

CREATE TABLE IF NOT EXISTS "user" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
  email text NOT NULL UNIQUE CHECK (char_length(email) BETWEEN 3 AND 320),
  "emailVerified" boolean NOT NULL DEFAULT false,
  image text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

-- PostgreSQL text uniqueness is case-sensitive; identities are not.
CREATE UNIQUE INDEX IF NOT EXISTS user_email_case_insensitive_idx
  ON "user" (lower(email));

CREATE TABLE IF NOT EXISTS "session" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "expiresAt" timestamptz NOT NULL,
  token text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "ipAddress" text,
  "userAgent" text,
  "userId" uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session" ("userId");
CREATE INDEX IF NOT EXISTS session_expires_at_idx ON "session" ("expiresAt");

CREATE TABLE IF NOT EXISTS account (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope text,
  password text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("providerId", "accountId")
);

CREATE INDEX IF NOT EXISTS "account_userId_idx" ON account ("userId");

CREATE TABLE IF NOT EXISTS verification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL,
  value text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS verification_identifier_idx
  ON verification (identifier);
CREATE INDEX IF NOT EXISTS verification_expires_at_idx
  ON verification ("expiresAt");

CREATE TABLE IF NOT EXISTS jwks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "publicKey" text NOT NULL,
  "privateKey" text NOT NULL,
  "createdAt" timestamptz NOT NULL,
  "expiresAt" timestamptz,
  alg text,
  crv text
);

CREATE TABLE IF NOT EXISTS "rateLimit" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  count integer NOT NULL CHECK (count >= 0),
  "lastRequest" bigint NOT NULL
);
