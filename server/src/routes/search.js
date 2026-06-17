import { Router } from "express";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { search, reindexAll } from "../utils/search.js";

const router = Router();

router.get("/", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const { q, entity, limit } = req.query;

  if (!q || !q.trim()) return res.json([]);

  const results = search(db, q, {
    entity: entity || null,
    limit: limit ? Math.min(parseInt(limit, 10), 50) : 20,
    userId: req.user.id,
    userRole: req.user.role,
  });

  res.json(results);
});

router.post("/reindex", ...requireAdmin, (req, res) => {
  const db = req.app.locals.db;
  reindexAll(db);
  res.json({ ok: true });
});

export default router;
