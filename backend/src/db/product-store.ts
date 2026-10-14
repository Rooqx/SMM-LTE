import { createHash } from "node:crypto";
import type pg from "pg";
import { badRequest, conflict, notFound } from "../domain/errors.js";
import { writeAuditEvent } from "./audit.js";

type Page<T> = { items: T[]; nextCursor: string | null };

type TimeCursor = {
  createdAt: string;
  id: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function encodeCursor(cursor: TimeCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(value: string | null, idKind: "uuid" | "integer"): TimeCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as TimeCursor;
    const instant = typeof parsed.createdAt === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(parsed.createdAt) &&
      Number.isFinite(Date.parse(parsed.createdAt));
    const id = idKind === "uuid"
      ? UUID_PATTERN.test(parsed.id ?? "")
      : /^\d+$/.test(parsed.id ?? "");
    if (!instant || !id) throw new Error("invalid cursor");
    return parsed;
  } catch {
    throw badRequest("invalid_cursor", "The pagination cursor is invalid");
  }
}

function page<T extends { created_at: Date | string; id: string }>(
  rows: T[],
  limit: number,
): Page<T> {
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor: hasMore && last
      ? encodeCursor({ createdAt: new Date(last.created_at).toISOString(), id: String(last.id) })
      : null,
  };
}

export type AccountPreferences = {
  organization_id: string;
  user_id: string;
  timezone: string;
  theme: "dark" | "light" | "system";
  email_notifications: boolean;
  autopilot_enabled: boolean;
  review_reminders_enabled: boolean;
  version: number;
  created_at: Date;
  updated_at: Date;
};

/**
 * Product-facing reads and small owner commands that do not belong inside the
 * orchestration engine. Every query is explicitly organization scoped.
 */
export class ProductStore {
  constructor(readonly pool: pg.Pool) {}

  async updateWorkspace(input: {
    workspaceId: string;
    organizationId: string;
    actor: string;
    expectedVersion: number;
    name?: string;
    timezone?: string;
  }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(
        `SELECT version FROM workspaces
         WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
        [input.workspaceId, input.organizationId],
      );
      if (!current.rows[0]) throw notFound("Workspace");
      if (Number(current.rows[0].version) !== input.expectedVersion) {
        throw conflict("workspace_changed", "The workspace changed before this update arrived");
      }
      const updated = await client.query(
        `UPDATE workspaces
         SET name = COALESCE($3, name), timezone = COALESCE($4, timezone),
             version = version + 1, updated_at = now()
         WHERE id = $1 AND organization_id = $2
         RETURNING *`,
        [input.workspaceId, input.organizationId, input.name ?? null, input.timezone ?? null],
      );
      await writeAuditEvent(client, {
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        actor: input.actor,
        action: "workspace.updated",
        entityType: "workspace",
        entityId: input.workspaceId,
        data: {
          fields: [input.name === undefined ? null : "name", input.timezone === undefined ? null : "timezone"]
            .filter(Boolean),
          version: Number(updated.rows[0]?.version),
        },
      });
      await client.query("COMMIT");
      return updated.rows[0] as Record<string, unknown>;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getPreferences(organizationId: string, userId: string): Promise<AccountPreferences> {
    await this.pool.query(
      `INSERT INTO account_preferences(organization_id, user_id)
       SELECT membership.organization_id, membership.user_id
       FROM account_memberships AS membership
       WHERE membership.organization_id = $1 AND membership.user_id = $2
       ON CONFLICT (organization_id) DO NOTHING`,
      [organizationId, userId],
    );
    const result = await this.pool.query(
      `SELECT * FROM account_preferences
       WHERE organization_id = $1 AND user_id = $2`,
      [organizationId, userId],
    );
    const preferences = result.rows[0] as AccountPreferences | undefined;
    if (!preferences) throw notFound("Account preferences");
    return preferences;
  }

  async updatePreferences(input: {
    organizationId: string;
    userId: string;
    actor: string;
    expectedVersion: number;
    timezone: string;
    theme: AccountPreferences["theme"];
    emailNotifications: boolean;
    autopilotEnabled: boolean;
    reviewRemindersEnabled: boolean;
  }): Promise<AccountPreferences> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO account_preferences(organization_id, user_id)
         SELECT membership.organization_id, membership.user_id
         FROM account_memberships AS membership
         WHERE membership.organization_id = $1 AND membership.user_id = $2
         ON CONFLICT (organization_id) DO NOTHING`,
        [input.organizationId, input.userId],
      );
      const result = await client.query(
        `UPDATE account_preferences
         SET timezone = $4, theme = $5, email_notifications = $6,
             autopilot_enabled = $7, review_reminders_enabled = $8,
             version = version + 1, updated_at = now()
         WHERE organization_id = $1 AND user_id = $2 AND version = $3
         RETURNING *`,
        [input.organizationId, input.userId, input.expectedVersion, input.timezone,
          input.theme, input.emailNotifications, input.autopilotEnabled,
          input.reviewRemindersEnabled],
      );
      const preferences = result.rows[0] as AccountPreferences | undefined;
      if (!preferences) {
        const exists = await client.query(
          `SELECT 1 FROM account_preferences
           WHERE organization_id = $1 AND user_id = $2`,
          [input.organizationId, input.userId],
        );
        if (!exists.rowCount) throw notFound("Account preferences");
        throw conflict("preferences_changed", "Preferences changed before this update arrived");
      }
      await writeAuditEvent(client, {
        organizationId: input.organizationId,
        actor: input.actor,
        action: "account_preferences.updated",
        entityType: "account_preferences",
        entityId: input.userId,
        data: { version: preferences.version },
      });
      await client.query("COMMIT");
      return preferences;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listRuns(input: {
    workspaceId: string;
    organizationId: string;
    limit: number;
    cursor: string | null;
  }): Promise<Page<Record<string, unknown>>> {
    const cursor = decodeCursor(input.cursor, "uuid");
    const result = await this.pool.query(
      `SELECT run.id, run.workspace_id, run.phase, run.skill_name, run.status,
              run.output_status, run.review_thread_id, run.review_revision,
              run.supersedes_run_id, run.error_code, run.created_at,
              run.started_at, run.completed_at, run.updated_at
       FROM workflow_runs AS run
       JOIN workspaces AS workspace ON workspace.id = run.workspace_id
       WHERE run.workspace_id = $1 AND workspace.organization_id = $2
         AND ($3::timestamptz IS NULL OR (run.created_at, run.id) < ($3, $4::uuid))
       ORDER BY run.created_at DESC, run.id DESC
       LIMIT $5`,
      [input.workspaceId, input.organizationId, cursor?.createdAt ?? null,
        cursor?.id ?? null, input.limit + 1],
    );
    return page(result.rows as Array<Record<string, unknown> & { id: string; created_at: Date }>, input.limit);
  }

  async listActivity(input: {
    organizationId: string;
    workspaceId?: string;
    limit: number;
    cursor: string | null;
  }): Promise<Page<Record<string, unknown>>> {
    const cursor = decodeCursor(input.cursor, "integer");
    const result = await this.pool.query(
      `SELECT id::text AS id, workspace_id, actor, action, entity_type,
              entity_id, data, created_at
       FROM audit_events
       WHERE organization_id = $1
         AND ($2::uuid IS NULL OR workspace_id = $2)
         AND ($3::timestamptz IS NULL OR (created_at, id) < ($3, $4::bigint))
       ORDER BY created_at DESC, id DESC
       LIMIT $5`,
      [input.organizationId, input.workspaceId ?? null, cursor?.createdAt ?? null,
        cursor?.id ?? null, input.limit + 1],
    );
    return page(result.rows as Array<Record<string, unknown> & { id: string; created_at: Date }>, input.limit);
  }

  async listContextHistory(input: {
    workspaceId: string;
    organizationId: string;
    key?: string;
    limit: number;
    cursor: string | null;
  }): Promise<Page<Record<string, unknown>>> {
    const cursor = decodeCursor(input.cursor, "uuid");
    const result = await this.pool.query(
      `SELECT revision.id, revision.workspace_id, revision.key,
              revision.revision, revision.markdown, revision.data,
              revision.source, revision.status, revision.parent_revision_id,
              revision.created_by, revision.decided_by, revision.decision_note,
              revision.created_at, revision.decided_at
       FROM workspace_context_revisions AS revision
       JOIN workspaces AS workspace ON workspace.id = revision.workspace_id
       WHERE revision.workspace_id = $1 AND workspace.organization_id = $2
         AND ($3::text IS NULL OR revision.key = $3)
         AND ($4::timestamptz IS NULL OR (revision.created_at, revision.id) < ($4, $5::uuid))
       ORDER BY revision.created_at DESC, revision.id DESC
       LIMIT $6`,
      [input.workspaceId, input.organizationId, input.key ?? null,
        cursor?.createdAt ?? null, cursor?.id ?? null, input.limit + 1],
    );
    return page(result.rows as Array<Record<string, unknown> & { id: string; created_at: Date }>, input.limit);
  }

  async listObsidianJobs(input: {
    organizationId: string;
    workspaceId?: string;
    limit: number;
    cursor: string | null;
  }): Promise<Page<Record<string, unknown>>> {
    const cursor = decodeCursor(input.cursor, "uuid");
    const result = await this.pool.query(
      `SELECT job.id, job.status, job.attempts, job.max_attempts,
              left(COALESCE(job.last_error, ''), 500) AS last_error,
              job.created_at, job.completed_at,
              job.payload->>'workspaceId' AS workspace_id
       FROM job_queue AS job
       WHERE job.type = 'export_obsidian'
         AND job.payload->>'organizationId' = $1
         AND ($2::text IS NULL OR job.payload->>'workspaceId' = $2)
         AND ($3::timestamptz IS NULL OR (job.created_at, job.id) < ($3, $4::uuid))
       ORDER BY job.created_at DESC, job.id DESC
       LIMIT $5`,
      [input.organizationId, input.workspaceId ?? null, cursor?.createdAt ?? null,
        cursor?.id ?? null, input.limit + 1],
    );
    return page(result.rows as Array<Record<string, unknown> & { id: string; created_at: Date }>, input.limit);
  }

  async getObsidianJob(id: string, organizationId: string) {
    const result = await this.pool.query(
      `SELECT id, status, attempts, max_attempts,
              left(COALESCE(last_error, ''), 500) AS last_error,
              created_at, completed_at, payload->>'workspaceId' AS workspace_id
       FROM job_queue
       WHERE id = $1 AND type = 'export_obsidian'
         AND payload->>'organizationId' = $2`,
      [id, organizationId],
    );
    return (result.rows[0] as Record<string, unknown> | undefined) ?? null;
  }

  async updatePublication(input: {
    postId: string;
    organizationId: string;
    actor: string;
    expectedVersion: number;
    status: "not_scheduled" | "scheduled" | "published" | "failed" | "cancelled";
    idempotencyKey: string;
  }) {
    const requestHash = createHash("sha256")
      .update(JSON.stringify({ postId: input.postId, expectedVersion: input.expectedVersion, status: input.status }))
      .digest("hex");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `${input.organizationId}:${input.idempotencyKey}`,
      ]);
      const receipt = await client.query(
        `SELECT command, request_hash, response FROM product_command_receipts
         WHERE organization_id = $1 AND idempotency_key = $2`,
        [input.organizationId, input.idempotencyKey],
      );
      if (receipt.rows[0]) {
        if (receipt.rows[0].command !== "final_post.publication" ||
            receipt.rows[0].request_hash !== requestHash) {
          throw conflict("idempotency_key_reused", "The idempotency key was used for a different command");
        }
        await client.query("COMMIT");
        return receipt.rows[0].response as Record<string, unknown>;
      }

      const current = await client.query(
        `SELECT post.id, post.workspace_id, post.status, post.publication_status,
                post.publication_version
         FROM final_posts AS post
         JOIN workspaces AS workspace ON workspace.id = post.workspace_id
         WHERE post.id = $1 AND workspace.organization_id = $2
         FOR UPDATE OF post`,
        [input.postId, input.organizationId],
      );
      const post = current.rows[0] as Record<string, unknown> | undefined;
      if (!post) throw notFound("Final post");
      if (post.status !== "approved") {
        throw conflict("post_not_approved", "Only an approved post can change publication state");
      }
      if (Number(post.publication_version) !== input.expectedVersion) {
        throw conflict("publication_changed", "Publication state changed before this command arrived");
      }
      const transitions: Record<string, readonly string[]> = {
        not_scheduled: ["scheduled"],
        scheduled: ["published", "failed", "cancelled"],
        failed: ["scheduled", "cancelled"],
        cancelled: ["scheduled"],
        published: [],
      };
      if (post.publication_status !== input.status &&
          !transitions[String(post.publication_status)]?.includes(input.status)) {
        throw conflict("invalid_publication_transition", "That publication state transition is not allowed");
      }
      const changed = post.publication_status !== input.status;
      const updated = changed
        ? (await client.query(
            `UPDATE final_posts
             SET publication_status = $3, publication_version = publication_version + 1
             WHERE id = $1 AND workspace_id = $2
             RETURNING id, workspace_id, publication_status, publication_version`,
            [input.postId, post.workspace_id, input.status],
          )).rows[0] as Record<string, unknown>
        : post;
      const response = {
        id: String(updated.id),
        workspace_id: String(updated.workspace_id),
        publication_status: String(updated.publication_status),
        publication_version: Number(updated.publication_version),
      };
      await client.query(
        `INSERT INTO product_command_receipts(
           organization_id, idempotency_key, command, request_hash, response
         ) VALUES ($1, $2, 'final_post.publication', $3, $4)`,
        [input.organizationId, input.idempotencyKey, requestHash, response],
      );
      await writeAuditEvent(client, {
        organizationId: input.organizationId,
        workspaceId: String(post.workspace_id),
        actor: input.actor,
        action: changed
          ? "final_post.publication_changed"
          : "final_post.publication_confirmed",
        entityType: "final_post",
        entityId: input.postId,
        data: {
          changed,
          status: response.publication_status,
          version: response.publication_version,
        },
      });
      await client.query("COMMIT");
      return response;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
