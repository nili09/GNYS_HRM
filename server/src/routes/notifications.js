import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30));
  const offset = (page - 1) * limit;

  const total = db.prepare("SELECT COUNT(*) as c FROM notifications WHERE user_id = ?").get(req.user.id).c;
  const rows = db.prepare(
    `SELECT * FROM notifications WHERE user_id = ?
     ORDER BY read ASC, created_at DESC
     LIMIT ? OFFSET ?`
  ).all(req.user.id, limit, offset);
  res.json({ total, page, limit, rows });
});

router.get("/unread-count", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const { c } = db.prepare("SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND read = 0").get(req.user.id);
  res.json({ count: c });
});

router.post("/:id/read", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const notifId = parseInt(req.params.id, 10);
  const notif = db.prepare("SELECT * FROM notifications WHERE id = ? AND user_id = ?").get(notifId, req.user.id);
  if (!notif) return res.status(404).json({ error: "Notification not found" });
  db.prepare("UPDATE notifications SET read = 1 WHERE id = ?").run(notifId);
  res.json({ ok: true });
});

router.post("/read-all", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const { changes } = db.prepare("UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0").run(req.user.id);
  res.json({ ok: true, marked: changes });
});

export default router;
