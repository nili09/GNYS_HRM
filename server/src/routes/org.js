/**
 * CRUD routes for departments, designations, locations.
 * HR/ADMIN only. Delete blocked when entity is referenced by an employee.
 */
import { Router } from "express";
import { requireHR } from "../middleware/auth.js";
import { audit } from "../utils/audit.js";
import { broadcast } from "../utils/sse.js";
import { DepartmentSchema } from "@hrms/shared/schemas";

function orgRouter(table, fkColumn) {
  const router = Router();

  /* GET — list all */
  router.get("/", requireHR, (req, res) => {
    const rows = req.app.locals.db.prepare(`SELECT * FROM ${table} ORDER BY name`).all();
    res.json(rows);
  });

  /* POST — create */
  router.post("/", requireHR, (req, res) => {
    const parse = DepartmentSchema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: parse.error.issues[0].message });
    const db = req.app.locals.db;
    const { name, active } = parse.data;
    const existing = db.prepare(`SELECT id FROM ${table} WHERE name = ?`).get(name);
    if (existing) return res.status(409).json({ error: "Name already exists" });
    const r = db.prepare(`INSERT INTO ${table}(name, active) VALUES(?, ?)`).run(name, active);
    audit(db, { actorId: req.user.id, action: "CREATE", entity: table, entityId: Number(r.lastInsertRowid), detail: { name } });
    broadcast({ type: "mutation", entity: table, id: Number(r.lastInsertRowid) });
    res.status(201).json({ id: Number(r.lastInsertRowid), name, active });
  });

  /* PATCH /:id — update */
  router.patch("/:id", requireHR, (req, res) => {
    const parse = DepartmentSchema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: parse.error.issues[0].message });
    const db = req.app.locals.db;
    const id = parseInt(req.params.id, 10);
    const row = db.prepare(`SELECT id FROM ${table} WHERE id = ?`).get(id);
    if (!row) return res.status(404).json({ error: "Not found" });
    const { name, active } = parse.data;
    // Check uniqueness if name changed
    const dup = db.prepare(`SELECT id FROM ${table} WHERE name = ? AND id != ?`).get(name, id);
    if (dup) return res.status(409).json({ error: "Name already exists" });
    db.prepare(`UPDATE ${table} SET name = ?, active = ? WHERE id = ?`).run(name, active, id);
    audit(db, { actorId: req.user.id, action: "UPDATE", entity: table, entityId: id, detail: { name } });
    broadcast({ type: "mutation", entity: table, id });
    res.json({ ok: true });
  });

  /* DELETE /:id — blocked if in use */
  router.delete("/:id", requireHR, (req, res) => {
    const db = req.app.locals.db;
    const id = parseInt(req.params.id, 10);
    const row = db.prepare(`SELECT id, name FROM ${table} WHERE id = ?`).get(id);
    if (!row) return res.status(404).json({ error: "Not found" });
    // Check if any employee references this
    const inUse = db.prepare(`SELECT id FROM employees WHERE ${fkColumn} = ? LIMIT 1`).get(id);
    if (inUse) {
      return res.status(409).json({ error: `Cannot delete — in use by at least one employee. Reassign them first.` });
    }
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
    audit(db, { actorId: req.user.id, action: "DELETE", entity: table, entityId: id, detail: { name: row.name } });
    broadcast({ type: "mutation", entity: table, id });
    res.json({ ok: true });
  });

  return router;
}

export const departmentsRouter  = orgRouter("departments",  "dept_id");
export const designationsRouter = orgRouter("designations", "desig_id");
export const locationsRouter    = orgRouter("locations",     "location_id");
