import type pg from "pg";
import { badRequest } from "../domain/errors.js";

type Page<T> = { items: T[]; nextCursor: string | null };

type ContentCursor = {
  createdAt: string;
  id: string;
  localDate?: string;
};

function encodeCursor(value: ContentCursor): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day;
}

function decodeCursor(value: string | null): ContentCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as ContentCursor;
    const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(parsed.id ?? "");
    const validInstant = typeof parsed.createdAt === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(parsed.createdAt) &&
      Number.isFinite(Date.parse(parsed.createdAt));
    const validDate = parsed.localDate === undefined ||
      (typeof parsed.localDate === "string" && isIsoDate(parsed.localDate));
    if (!validId || !validInstant || !validDate) throw new Error("invalid cursor shape");
    return parsed;
  } catch {
    throw badRequest("invalid_cursor", "The pagination cursor is invalid");
  }
}

/** Account-scoped, read-only repository for artifact and final-post views. */
export class ContentStore {
  constructor(readonly pool: pg.Pool) {}

  async listArtifacts(input: {
    workspaceId: string;
    organizationId: string;
    limit: number;
    cursor: string | null;
    status?: string | undefined;
    kind?: string | undefined;
    logicalId?: string | undefined;
    search?: string | undefined;
  }): Promise<Page<Record<string, unknown>>> {
    const cursor = decodeCursor(input.cursor);
    const values: unknown[] = [input.workspaceId, input.organizationId];
    const conditions = ["artifact.workspace_id = $1", "workspace.organization_id = $2"];
    const add = (condition: (index: number) => string, value: unknown) => {
      values.push(value);
      conditions.push(condition(values.length));
    };
    if (input.status) add((index) => `artifact.status = $${index}`, input.status);
    if (input.kind) add((index) => `artifact.kind = $${index}`, input.kind);
    if (input.logicalId) add((index) => `artifact.logical_id = $${index}::uuid`, input.logicalId);
    if (input.search) add(
      (index) => `(artifact.title ILIKE '%' || $${index} || '%' OR artifact.content ILIKE '%' || $${index} || '%')`,
      input.search,
    );
    if (cursor) {
      values.push(cursor.createdAt, cursor.id);
      conditions.push(`(artifact.created_at, artifact.id) <
        ($${values.length - 1}::timestamptz, $${values.length}::uuid)`);
    }
    values.push(input.limit + 1);
    const result = await this.pool.query(
      `SELECT artifact.id, artifact.workspace_id, artifact.run_id, artifact.kind,
              artifact.slug, artifact.title, artifact.content, artifact.metadata,
              artifact.version, artifact.status, artifact.logical_id,
              artifact.parent_revision_id, artifact.revision_instructions,
              artifact.created_by, artifact.decided_by, artifact.decided_at,
              artifact.created_at, artifact.updated_at
       FROM artifacts AS artifact
       JOIN workspaces AS workspace ON workspace.id = artifact.workspace_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY artifact.created_at DESC, artifact.id DESC
       LIMIT $${values.length}`,
      values,
    );
    const hasMore = result.rows.length > input.limit;
    const items = result.rows.slice(0, input.limit) as Array<Record<string, unknown>>;
    const last = items.at(-1);
    return {
      items,
      nextCursor: hasMore && last
        ? encodeCursor({ createdAt: (last.created_at as Date).toISOString(), id: String(last.id) })
        : null,
    };
  }

  async getArtifact(id: string, organizationId: string): Promise<Record<string, unknown> | null> {
    const result = await this.pool.query(
      `SELECT artifact.id, artifact.workspace_id, artifact.run_id, artifact.kind,
              artifact.slug, artifact.title, artifact.content, artifact.metadata,
              artifact.version, artifact.status, artifact.logical_id,
              artifact.parent_revision_id, artifact.revision_instructions,
              artifact.created_by, artifact.decided_by, artifact.decided_at,
              artifact.created_at, artifact.updated_at
       FROM artifacts AS artifact
       JOIN workspaces AS workspace ON workspace.id = artifact.workspace_id
       WHERE artifact.id = $1 AND workspace.organization_id = $2`,
      [id, organizationId],
    );
    return (result.rows[0] as Record<string, unknown> | undefined) ?? null;
  }

  async listFinalPosts(input: {
    workspaceId: string;
    organizationId: string;
    limit: number;
    cursor: string | null;
    status?: string | undefined;
    platform?: string | undefined;
    sprint?: string | undefined;
    week?: number | undefined;
    campaign?: string | undefined;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    search?: string | undefined;
  }): Promise<Page<Record<string, unknown>>> {
    const cursor = decodeCursor(input.cursor);
    if (cursor && !cursor.localDate) throw badRequest("invalid_cursor", "The post cursor is invalid");
    const values: unknown[] = [input.workspaceId, input.organizationId];
    const conditions = ["post.workspace_id = $1", "workspace.organization_id = $2"];
    const add = (condition: (index: number) => string, value: unknown) => {
      values.push(value);
      conditions.push(condition(values.length));
    };
    if (input.status) add((index) => `post.status = $${index}`, input.status);
    if (input.platform) add((index) => `post.platform = $${index}`, input.platform);
    if (input.sprint) add((index) => `post.sprint = $${index}`, input.sprint);
    if (input.week !== undefined) add((index) => `post.week = $${index}`, input.week);
    if (input.campaign) add((index) => `post.campaign = $${index}`, input.campaign);
    if (input.dateFrom) add((index) => `post.local_date >= $${index}::date`, input.dateFrom);
    if (input.dateTo) add((index) => `post.local_date <= $${index}::date`, input.dateTo);
    if (input.search) add(
      (index) => `post.search_document @@ websearch_to_tsquery('simple', $${index})`,
      input.search,
    );
    if (cursor) {
      values.push(cursor.localDate, cursor.createdAt, cursor.id);
      conditions.push(`(post.local_date, post.created_at, post.id) <
        ($${values.length - 2}::date, $${values.length - 1}::timestamptz, $${values.length}::uuid)`);
    }
    values.push(input.limit + 1);
    const result = await this.pool.query(
      `SELECT post.id, post.workspace_id, post.run_id, post.source_artifact_id,
              post.logical_id, post.parent_revision_id, post.revision,
              post.logical_key, post.sprint, post.week, post.local_date::text AS local_date,
              extract(isodow from post.local_date)::integer AS day_of_week,
              post.timezone, post.platform, post.campaign, post.topic, post.pillar,
              post.content_format, post.title, post.content, post.pinned_comment,
              post.metadata, post.status, post.publication_status,
              post.publication_version,
              post.revision_instructions, post.created_by, post.decided_by,
              post.decided_at, post.created_at
       FROM final_posts AS post
       JOIN workspaces AS workspace ON workspace.id = post.workspace_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY post.local_date DESC, post.created_at DESC, post.id DESC
       LIMIT $${values.length}`,
      values,
    );
    const hasMore = result.rows.length > input.limit;
    const items = result.rows.slice(0, input.limit) as Array<Record<string, unknown>>;
    const last = items.at(-1);
    return {
      items,
      nextCursor: hasMore && last
        ? encodeCursor({
            localDate: String(last.local_date),
            createdAt: (last.created_at as Date).toISOString(),
            id: String(last.id),
          })
        : null,
    };
  }

  async getFinalPost(id: string, organizationId: string): Promise<Record<string, unknown> | null> {
    const result = await this.pool.query(
      `SELECT post.id, post.workspace_id, post.run_id, post.source_artifact_id,
              post.logical_id, post.parent_revision_id, post.revision,
              post.logical_key, post.sprint, post.week, post.local_date::text AS local_date,
              extract(isodow from post.local_date)::integer AS day_of_week,
              post.timezone, post.platform, post.campaign, post.topic, post.pillar,
              post.content_format, post.title, post.content, post.pinned_comment,
              post.metadata, post.status, post.publication_status,
              post.publication_version,
              post.revision_instructions, post.created_by, post.decided_by,
              post.decided_at, post.created_at
       FROM final_posts AS post
       JOIN workspaces AS workspace ON workspace.id = post.workspace_id
       WHERE post.id = $1 AND workspace.organization_id = $2`,
      [id, organizationId],
    );
    return (result.rows[0] as Record<string, unknown> | undefined) ?? null;
  }
}
