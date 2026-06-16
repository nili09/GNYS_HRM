/**
 * Write an entry to audit_log.
 * @param {import('better-sqlite3').Database} db
 * @param {{ actorId?: number, action: string, entity: string, entityId?: string|number, detail?: object }} opts
 */
export function audit(db, { actorId, action, entity, entityId, detail }) {
  db.prepare(
    `INSERT INTO audit_log(actor_id, action, entity, entity_id, detail)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    actorId ?? null,
    action,
    entity,
    entityId != null ? String(entityId) : null,
    detail ? JSON.stringify(detail) : null
  );
}
