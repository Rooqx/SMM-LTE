import type { Queryable } from "./audit.js";

export type ContextRevisionRow = {
  id: string;
  workspace_id: string;
  key: string;
  revision: number;
  markdown: string;
  data: Record<string, unknown>;
  source: string;
  status: "proposed" | "approved" | "rejected" | "superseded";
  parent_revision_id: string | null;
  created_by: string;
  decided_by: string | null;
  decision_note: string | null;
  created_at: Date;
  decided_at: Date | null;
};

export type CurrentContextRow = {
  key: string;
  markdown: string;
  data: Record<string, unknown>;
  version: number;
  revision_id: string;
};

/**
 * Appends an approved immutable revision and advances the canonical pointer.
 * The workspace lock serializes first-write and update races for every key.
 * The caller remains responsible for account authorization before invoking
 * this internal helper.
 */
export async function appendApprovedContextRevision(
  database: Queryable,
  input: {
    workspaceId: string;
    key: string;
    markdown: string;
    data: Record<string, unknown>;
    source: string;
    actor: string;
    decisionNote?: string | null;
  },
): Promise<CurrentContextRow> {
  await database.query("SELECT id FROM workspaces WHERE id = $1 FOR UPDATE", [input.workspaceId]);
  const current = await database.query(
    `SELECT version, current_revision_id
     FROM workspace_context
     WHERE workspace_id = $1 AND key = $2
     FOR UPDATE`,
    [input.workspaceId, input.key],
  );
  const currentRow = current.rows[0] as
    | { version: number; current_revision_id: string }
    | undefined;
  const nextRevision = (currentRow?.version ?? 0) + 1;

  const inserted = await database.query(
    `INSERT INTO workspace_context_revisions(
       workspace_id, key, revision, markdown, data, source, status,
       parent_revision_id, created_by, decided_by, decision_note, decided_at
     ) VALUES ($1, $2, $3, $4, $5, $6, 'approved', $7, $8, $8, $9, now())
     RETURNING id`,
    [input.workspaceId, input.key, nextRevision, input.markdown, input.data,
      input.source, currentRow?.current_revision_id ?? null, input.actor,
      input.decisionNote ?? null],
  );
  const revisionId = String(inserted.rows[0]?.id);

  const canonical = await database.query(
    `INSERT INTO workspace_context(
       workspace_id, key, markdown, data, version, source, current_revision_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (workspace_id, key) DO UPDATE SET
       markdown = EXCLUDED.markdown,
       data = EXCLUDED.data,
       version = EXCLUDED.version,
       source = EXCLUDED.source,
       current_revision_id = EXCLUDED.current_revision_id,
       updated_at = now()
     RETURNING key, markdown, data, version, current_revision_id AS revision_id`,
    [input.workspaceId, input.key, input.markdown, input.data, nextRevision,
      input.source, revisionId],
  );
  return canonical.rows[0] as CurrentContextRow;
}
