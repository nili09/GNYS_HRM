import { Router } from "express";
import { requireAuth, requireAdmin, requireHR } from "../middleware/auth.js";
import { audit } from "../utils/audit.js";
import { broadcast } from "../utils/sse.js";

const router = Router();

// GET /settings — HR can read, ADMIN can write
router.get("/", ...requireHR, (req, res) => {
  const db = req.app.locals.db;
  const rows = db.prepare("SELECT key, value FROM settings").all();
  const settings = {};
  for (const r of rows) {
    try {
      settings[r.key] = JSON.parse(r.value);
    } catch {
      settings[r.key] = r.value;
    }
  }
  res.json(settings);
});

// PUT /settings — ADMIN only
router.put("/", ...requireAdmin, (req, res) => {
  const db = req.app.locals.db;
  const updates = req.body;
  if (!updates || typeof updates !== "object") {
    return res.status(400).json({ error: "Body must be an object of key:value pairs" });
  }

  const upsert = db.prepare(
    "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
  );

  const applyAll = db.transaction((entries) => {
    for (const [key, val] of entries) {
      upsert.run(key, JSON.stringify(val));
    }
  });

  const entries = Object.entries(updates);
  applyAll(entries);

  audit(db, {
    actorId: req.user.id,
    action: "update",
    entity: "settings",
    detail: JSON.stringify({ keys: entries.map(([k]) => k) }),
  });

  broadcast({ type: "mutation", entity: "settings" });

  // Return updated settings
  const rows = db.prepare("SELECT key, value FROM settings").all();
  const settings = {};
  for (const r of rows) {
    try { settings[r.key] = JSON.parse(r.value); } catch { settings[r.key] = r.value; }
  }
  res.json(settings);
});

export default router;
