import type pg from "pg";

export type Queryable = Pick<pg.PoolClient, "query">;

/**
 * Writes an audit event inside the caller's transaction. Keeping audit writes
 * transaction-local prevents a successful state change from losing its audit
 * record (and prevents an audit record for a rolled-back state change).
 */
export async function writeAuditEvent(
  database: Queryable,
  event: {
    organizationId: string;
    workspaceId?: string;
    actor: string;
    action: string;
    entityType: string;
    entityId?: string;
    data?: Record<string, unknown>;
  },
): Promise<void> {
  await database.query(
    `INSERT INTO audit_events(
       organization_id, workspace_id, actor, action, entity_type, entity_id, data
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [event.organizationId, event.workspaceId ?? null, event.actor, event.action,
      event.entityType, event.entityId ?? null, event.data ?? {}],
  );
}
