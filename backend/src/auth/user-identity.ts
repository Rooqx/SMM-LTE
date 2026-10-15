import type pg from "pg";
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
} from "jose";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { unauthorized } from "../domain/errors.js";
import { ALL_SCOPES } from "./api-keys.js";
import type { UserPrincipal } from "./principals.js";

const AssertionClaims = z.object({
  sub: z.string().uuid(),
  sessionId: z.string().uuid(),
  email: z.string().email(),
  emailVerified: z.literal(true),
  name: z.string().min(1).max(160),
});

type VerifiedClaims = z.infer<typeof AssertionClaims>;
export type VerifyAssertion = (token: string) => Promise<VerifiedClaims>;

type AuthenticatedUserRow = {
  user_id: string;
  session_id: string;
  email: string;
  name: string;
  organization_id: string | null;
};

export function createAssertionVerifier(
  config: AppConfig,
  keyResolver: JWTVerifyGetKey = createRemoteJWKSet(
    new URL(config.AUTH_JWKS_URL),
    {
      timeoutDuration: 5_000,
      cooldownDuration: 30_000,
      cacheMaxAge: 10 * 60_000,
    },
  ),
): VerifyAssertion {
  const allowedIssuers = Array.from(
    new Set([
      config.AUTH_TOKEN_ISSUER,
      "http://localhost:4321",
      "http://127.0.0.1:4321",
      "http://172.20.10.3:4321",
      ...(config.CORS_ORIGIN
        ? config.CORS_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean)
        : []),
    ]),
  );

  return async (token) => {
    try {
      const { payload } = await jwtVerify(token, keyResolver, {
        algorithms: ["EdDSA"],
        issuer: allowedIssuers,
        audience: config.AUTH_TOKEN_AUDIENCE,
        requiredClaims: ["sub", "iat", "exp", "iss", "aud"],
        maxTokenAge: config.AUTH_ASSERTION_MAX_AGE_SECONDS,
        clockTolerance: 5,
      });
      return AssertionClaims.parse(payload);
    } catch (err) {
      console.error("[AUTH] JWT assertion verification failed:", err);
      throw unauthorized();
    }
  };
}

export class UserIdentityService {
  readonly #verify: VerifyAssertion;

  constructor(
    private readonly pool: pg.Pool,
    config: AppConfig,
    verifyAssertion?: VerifyAssertion,
  ) {
    this.#verify = verifyAssertion ?? createAssertionVerifier(config);
  }

  async authenticate(token: string): Promise<UserPrincipal> {
    if (token.length > 4_096) throw unauthorized();
    try {
      const claims = await this.#verify(token);
      const user = await this.#findAuthoritativeUser(claims);
      const organizationId =
        user.organization_id ?? (await this.#provisionPersonalAccount(claims));

      return {
        kind: "user",
        userId: user.user_id,
        sessionId: user.session_id,
        organizationId,
        email: user.email,
        name: user.name,
        scopes: new Set(ALL_SCOPES),
      };
    } catch (err) {
      console.error("[AUTH] User authentication failed:", err);
      throw unauthorized();
    }
  }

  async #findAuthoritativeUser(claims: VerifiedClaims): Promise<AuthenticatedUserRow> {
    const result = await this.pool.query(
      `SELECT users.id AS user_id, sessions.id AS session_id,
              users.email, users.name, memberships.organization_id
       FROM "user" AS users
       JOIN "session" AS sessions
         ON sessions."userId" = users.id
        AND sessions.id = $2
        AND sessions."expiresAt" > now()
       LEFT JOIN account_memberships AS memberships ON memberships.user_id = users.id
       WHERE users.id = $1
         AND users."emailVerified" = true`,
      [claims.sub, claims.sessionId],
    );
    const row = result.rows[0] as AuthenticatedUserRow | undefined;
    if (!row || row.email.toLowerCase() !== claims.email.toLowerCase()) {
      throw unauthorized();
    }
    return row;
  }

  async #provisionPersonalAccount(claims: VerifiedClaims): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // Serializes first-request provisioning without table-wide locks.
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [claims.sub]);

      const authoritative = await client.query(
        `SELECT users.name, users.email, memberships.organization_id
         FROM "user" AS users
         JOIN "session" AS sessions
           ON sessions."userId" = users.id
          AND sessions.id = $2
          AND sessions."expiresAt" > now()
         LEFT JOIN account_memberships AS memberships ON memberships.user_id = users.id
         WHERE users.id = $1 AND users."emailVerified" = true
         FOR UPDATE OF users`,
        [claims.sub, claims.sessionId],
      );
      const row = authoritative.rows[0] as
        | { name: string; email: string; organization_id: string | null }
        | undefined;
      if (!row || row.email.toLowerCase() !== claims.email.toLowerCase()) {
        throw unauthorized();
      }
      if (row.organization_id) {
        await client.query("COMMIT");
        return row.organization_id;
      }

      const slug = `account-${claims.sub.replaceAll("-", "").slice(0, 24)}`;
      const inserted = await client.query(
        `INSERT INTO organizations(name, slug)
         VALUES ($1, $2)
         RETURNING id`,
        [`${row.name}'s account`, slug],
      );
      const organizationId = String(inserted.rows[0]?.id);
      await client.query(
        `INSERT INTO account_memberships(user_id, organization_id, role)
         VALUES ($1, $2, 'owner')`,
        [claims.sub, organizationId],
      );
      await client.query(
        `INSERT INTO audit_events(
         organization_id, actor, action, entity_type, entity_id, data
         ) VALUES ($1::uuid, $2, 'personal_account.created', 'organization',
                   ($1::uuid)::text, $3)`,
        [organizationId, `user:${claims.sub}`, { accountType: "personal" }],
      );
      await client.query("COMMIT");
      return organizationId;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
