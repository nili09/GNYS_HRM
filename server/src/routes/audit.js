/**
 * GET /api/audit — ADMIN only, returns audit log entries.
 * Query params: entity, action, limit, offset for filtering.
 */
import { Router } from "express";
import { requireAdmin } from "../middleware/auth.js";

const router = Router();

router.get("/", requireAdmin, (req, res) => {
  const db = req.app.locals.db;
  const limit = Math.min(parseInt(req.query.limit, 10) || 200, 1000);
  const offset = parseInt(req.query.offset, 10) || 0;
  const { entity, action } = req.query;

  let where = "1=1";
  const params = [];
  if (entity) {
    where += " AND a.entity = ?";
    params.push(entity);
  }
  if (action) {
    where += " AND a.action = ?";
    params.push(action);
  }

  params.push(limit, offset);

  const rows = db.prepare(
    `SELECT a.*, e.name AS actor_name
     FROM audit_log a
     LEFT JOIN employees e ON a.actor_id = e.id
     WHERE ${where}
     ORDER BY a.id DESC
     LIMIT ? OFFSET ?`
  ).all(...params);

  const total = db.prepare(
    `SELECT COUNT(*) as c FROM audit_log a WHERE ${where.replace(/ AND a\./g, " AND a.")}`
  ).get(...params.slice(0, -2)).c;

  res.json({ rows, total });
});

export default router;
