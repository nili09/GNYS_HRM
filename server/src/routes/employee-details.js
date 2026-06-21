import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { audit } from "../utils/audit.js";
import { broadcast } from "../utils/sse.js";
import {
  EmergencyContactSchema, FamilyMemberSchema, NomineeSchema,
  EducationSchema, PrevEmployerSchema,
} from "@hrms/shared/schemas";

const router = Router();

const TABLES = {
  emergency_contacts: {
    table: "employee_emergency_contacts",
    schema: EmergencyContactSchema,
    cols: ["name", "phone", "relationship", "is_primary"],
  },
  family: {
    table: "employee_family",
    schema: FamilyMemberSchema,
    cols: ["name", "relationship", "dob", "is_dependent"],
  },
  nominees: {
    table: "employee_nominees",
    schema: NomineeSchema,
    cols: ["name", "relationship", "share_pct"],
  },
  education: {
    table: "employee_education",
    schema: EducationSchema,
    cols: ["degree", "institution", "year", "grade"],
  },
  prev_employers: {
    table: "employee_prev_employers",
    schema: PrevEmployerSchema,
    cols: ["company", "designation", "from_date", "to_date", "reason_leaving"],
  },
};

function canAccess(req, employeeId) {
  const isHR = ["HR", "ADMIN"].includes(req.user.role);
  const isSelf = req.user.id === employeeId;
  return isHR || isSelf;
}

// GET /api/employees/:id/details/:type
router.get("/:id/details/:type", requireAuth, (req, res) => {
  const employeeId = parseInt(req.params.id, 10);
  const cfg = TABLES[req.params.type];
  if (!cfg) return res.status(400).json({ error: "Unknown detail type" });
  if (!canAccess(req, employeeId)) return res.status(403).json({ error: "Forbidden" });

  const db = req.app.locals.db;
  const rows = db.prepare(
    `SELECT * FROM ${cfg.table} WHERE employee_id = ? ORDER BY id`
  ).all(employeeId);
  res.json(rows);
});

// POST /api/employees/:id/details/:type
router.post("/:id/details/:type", requireAuth, (req, res) => {
  const employeeId = parseInt(req.params.id, 10);
  const cfg = TABLES[req.params.type];
  if (!cfg) return res.status(400).json({ error: "Unknown detail type" });
  if (!canAccess(req, employeeId)) return res.status(403).json({ error: "Forbidden" });

  const parse = cfg.schema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.issues[0].message });
  }

  const db = req.app.locals.db;
  const d = parse.data;
  const placeholders = cfg.cols.map(() => "?").join(",");
  const result = db.prepare(
    `INSERT INTO ${cfg.table}(employee_id, ${cfg.cols.join(",")}) VALUES(?, ${placeholders})`
  ).run(employeeId, ...cfg.cols.map(c => d[c] ?? null));

  audit(db, {
    actorId: req.user.id,
    action: "EMPLOYEE_DETAIL_ADD",
    entity: cfg.table,
    entityId: Number(result.lastInsertRowid),
    detail: { employee_id: employeeId, type: req.params.type, self: req.user.id === employeeId },
  });
  broadcast({ type: "mutation", entity: "employees", id: employeeId });

  res.status(201).json({ id: Number(result.lastInsertRowid), ...d });
});

// DELETE /api/employees/:id/details/:type/:rowId
router.delete("/:id/details/:type/:rowId", requireAuth, (req, res) => {
  const employeeId = parseInt(req.params.id, 10);
  const rowId = parseInt(req.params.rowId, 10);
  const cfg = TABLES[req.params.type];
  if (!cfg) return res.status(400).json({ error: "Unknown detail type" });
  if (!canAccess(req, employeeId)) return res.status(403).json({ error: "Forbidden" });

  const db = req.app.locals.db;
  const row = db.prepare(
    `SELECT id FROM ${cfg.table} WHERE id = ? AND employee_id = ?`
  ).get(rowId, employeeId);
  if (!row) return res.status(404).json({ error: "Not found" });

  db.prepare(`DELETE FROM ${cfg.table} WHERE id = ?`).run(rowId);

  audit(db, {
    actorId: req.user.id,
    action: "EMPLOYEE_DETAIL_DELETE",
    entity: cfg.table,
    entityId: rowId,
    detail: { employee_id: employeeId, type: req.params.type, self: req.user.id === employeeId },
  });
  broadcast({ type: "mutation", entity: "employees", id: employeeId });

  res.json({ ok: true });
});

export default router;
