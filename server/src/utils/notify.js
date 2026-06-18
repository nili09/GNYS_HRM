import { sendToUser } from "./sse.js";

const insertStmt = new WeakMap();

function getInsert(db) {
  if (!insertStmt.has(db)) {
    insertStmt.set(db, db.prepare(
      `INSERT INTO notifications(user_id, type, title, body, link, entity, entity_id)
       VALUES(?, ?, ?, ?, ?, ?, ?)`
    ));
  }
  return insertStmt.get(db);
}

export function notify(db, { userId, type, title, body, link, entity, entityId }) {
  const result = getInsert(db).run(userId, type, title, body || null, link || null, entity || null, entityId || null);
  const id = Number(result.lastInsertRowid);
  const row = db.prepare("SELECT * FROM notifications WHERE id = ?").get(id);
  sendToUser(userId, { type: "notification", notification: row });
  return row;
}

export function notifyMany(db, userIds, opts) {
  for (const userId of userIds) {
    notify(db, { ...opts, userId });
  }
}
