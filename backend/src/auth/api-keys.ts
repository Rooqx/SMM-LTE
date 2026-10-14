import { createHash, randomBytes } from "node:crypto";
import type pg from "pg";
import { unauthorized } from "../domain/errors.js";
import type { ServicePrincipal } from "./principals.js";

export const API_KEY_PREFIX = "smm_";

export const ALL_SCOPES = [
  "skills:read",
  "workspaces:read",
  "workspaces:write",
  "runs:execute",
  "runs:approve",
  "exports:write",
] as const;

export type Scope = (typeof ALL_SCOPES)[number];

export type IssuedApiKey = {
  id: string;
  token: string;
  tokenPrefix: string;
};

export function hashApiKey(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function generateApiKey(): { token: string; tokenHash: string; tokenPrefix: string } {
  const token = `${API_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
  return {
    token,
    tokenHash: hashApiKey(token),
    tokenPrefix: token.slice(0, 12),
  };
}

export class ApiKeyService {
  constructor(private readonly pool: pg.Pool) {}

  async authenticate(token: string): Promise<ServicePrincipal> {
    if (!token.startsWith(API_KEY_PREFIX) || token.length < 32 || token.length > 100) {
      throw unauthorized();
    }

    const result = await this.pool.query(
      `SELECT id, organization_id, name, scopes
       FROM api_keys
       WHERE token_hash = $1
         AND revoked_at IS NULL
         AND (expires_at IS NULL OR expires_at > now())`,
      [hashApiKey(token)],
    );
    const row = result.rows[0] as
      | { id: string; organization_id: string; name: string; scopes: string[] }
      | undefined;
    if (!row) throw unauthorized();

    // Avoid a write on every authenticated request while keeping useful last-use data.
    void this.pool.query(
      `UPDATE api_keys SET last_used_at = now()
       WHERE id = $1 AND (last_used_at IS NULL OR last_used_at < now() - interval '5 minutes')`,
      [row.id],
    ).catch(() => undefined);

    return {
      kind: "service",
      keyId: row.id,
      organizationId: row.organization_id,
      name: row.name,
      scopes: new Set(row.scopes.filter((scope): scope is Scope =>
        ALL_SCOPES.includes(scope as Scope))),
    };
  }

  async issue(input: {
    organizationId: string;
    name: string;
    scopes?: readonly string[];
    actor?: string;
  }): Promise<IssuedApiKey> {
    const generated = generateApiKey();
    const scopes = input.scopes ?? ALL_SCOPES;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `INSERT INTO api_keys(organization_id, name, token_hash, token_prefix, scopes)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [input.organizationId, input.name, generated.tokenHash, generated.tokenPrefix, scopes],
      );
      const id = String(result.rows[0]?.id);
      await client.query(
        `INSERT INTO audit_events(
           organization_id, actor, action, entity_type, entity_id, data
         ) VALUES ($1, $2, 'api_key.created', 'api_key', $3, $4)`,
        [
          input.organizationId,
          input.actor ?? "system:bootstrap",
          id,
          { name: input.name, tokenPrefix: generated.tokenPrefix, scopes },
        ],
      );
      await client.query("COMMIT");
      return { id, token: generated.token, tokenPrefix: generated.tokenPrefix };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
