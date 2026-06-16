/**
 * Leave management routes — spec §5.
 *
 * POST   /leaves                  Apply (self or on-behalf for HR/ADMIN)
 * GET    /leaves                  List (scoped by role)
 * GET    /leaves/pending          Pending for manager/HR
 * POST   /leaves/:id/approve      Approve
 * POST   /leaves/:id/reject       Reject
 * POST   /leaves/:id/cancel       Cancel
 * GET    /leave-balances           Balances
 * POST   /leave-adjustments        HR adjust
 * GET    /leave-types              List leave types
 * POST   /leave-types              Create (HR)
 * PATCH  /leave-types/:code        Update (HR)
 */
import { Router } from "express";
import { requireAuth, requireHR, isManagerOf } from "../middleware/auth.js";
import {
  LeaveApplySchema,
  LeaveApplyOnBehalfSchema,
  LeaveActSchema,
  LeaveAdjustmentSchema,
  LeaveTypeCreateSchema,
  LeaveTypePatchSchema,
} from "@hrms/shared/schemas";
import { countWorkingDays, findOverlap, leaveBalance } from "@hrms/shared/leave";
import { broadcast } from "../utils/sse.js";
import { audit } from "../utils/audit.js";

const router = Router();

// ── Helpers ─────────────────────────────────────────────────────────────────

function getSettings(db) {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'calendar'").get();
  if (row) return JSON.parse(row.value);
  return { weekOffs: [0], satOff: "none" };
}

function getHolidays(db) {
  return db.prepare("SELECT date, name FROM holidays").all();
}

function getLeaveTypes(db) {
  return db.prepare("SELECT * FROM leave_types").all();
}

function getEmployeeLeaves(db, employeeId) {
  return db.prepare("SELECT * FROM leaves WHERE employee_id = ?").all(employeeId);
}

function getAdjustments(db, employeeId) {
  return db.prepare("SELECT * FROM leave_adjustments WHERE employee_id = ?").all(employeeId);
}

function getEmployee(db, id) {
  return db.prepare("SELECT * FROM employees WHERE id = ?").get(id);
}

/**
 * Who should approve this leave?
 * - If the employee has a direct manager → manager
 * - Else → any HR/ADMIN
 * HR/ADMIN can always act on anyone.
 */
function canActOnLeave(db, actorId, actorRole, targetEmployeeId) {
  // HR/ADMIN can always act
  if (["HR", "ADMIN"].includes(actorRole)) return true;
  // Manager can act on direct reports
  return isManagerOf(db, actorId, targetEmployeeId);
}

// ── Leave Types CRUD ────────────────────────────────────────────────────────

router.get("/types", requireAuth, (req, res) => {
  const types = getLeaveTypes(req.app.locals.db);
  res.json(types);
});

router.post("/types", requireHR, (req, res) => {
  const parsed = LeaveTypeCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const db = req.app.locals.db;
  const { code, name, annual, paid, carry_fwd, max_carry } = parsed.data;
  // Check dup
  const existing = db.prepare("SELECT code FROM leave_types WHERE code = ?").get(code);
  if (existing) return res.status(409).json({ error: "Leave type code already exists" });
  db.prepare(
    "INSERT INTO leave_types(code, name, annual, paid, carry_fwd, max_carry) VALUES(?,?,?,?,?,?)"
  ).run(code, name, annual, paid, carry_fwd, max_carry);
  audit(db, { actorId: req.user.id, action: "CREATE", entity: "leave_type", entityId: code });
  broadcast({ type: "leave_type", entity: "leave_types" });
  res.status(201).json({ code, name, annual, paid, carry_fwd, max_carry });
});

router.patch("/types/:code", requireHR, (req, res) => {
  const parsed = LeaveTypePatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const db = req.app.locals.db;
  const existing = db.prepare("SELECT * FROM leave_types WHERE code = ?").get(req.params.code);
  if (!existing) return res.status(404).json({ error: "Leave type not found" });
  const fields = parsed.data;
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) {
      sets.push(`${k} = ?`);
      vals.push(v);
    }
  }
  if (sets.length === 0) return res.json(existing);
  vals.push(req.params.code);
  db.prepare(`UPDATE leave_types SET ${sets.join(", ")} WHERE code = ?`).run(...vals);
  audit(db, {
    actorId: req.user.id, action: "UPDATE", entity: "leave_type",
    entityId: req.params.code, detail: fields,
  });
  broadcast({ type: "leave_type", entity: "leave_types" });
  res.json({ ...existing, ...fields });
});

// ── Apply Leave ─────────────────────────────────────────────────────────────

router.post("/", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const isHR = ["HR", "ADMIN"].includes(req.user.role);

  // On-behalf: HR/ADMIN can specify employee_id
  let parsed;
  let employeeId;
  if (req.body.employee_id && req.body.employee_id !== req.user.id) {
    if (!isHR) return res.status(403).json({ error: "Only HR/ADMIN can apply on behalf" });
    parsed = LeaveApplyOnBehalfSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    employeeId = parsed.data.employee_id;
  } else {
    parsed = LeaveApplySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    employeeId = req.user.id;
  }

  const data = parsed.data;

  // Validate leave type exists
  const lt = db.prepare("SELECT * FROM leave_types WHERE code = ?").get(data.type);
  if (!lt) return res.status(400).json({ error: "Invalid leave type" });

  // Validate employee exists
  const emp = getEmployee(db, employeeId);
  if (!emp) return res.status(404).json({ error: "Employee not found" });

  // Date validation
  if (data.date_to < data.date_from)
    return res.status(400).json({ error: "'To' date is before 'From' date" });

  // Count working days
  const settings = getSettings(db);
  const holidays = getHolidays(db);
  const days = countWorkingDays(
    data.date_from, data.date_to,
    data.half_from, data.half_to,
    settings, holidays
  );
  if (days <= 0) return res.status(400).json({ error: "No working days in that range" });

  // Overlap detection
  const existingLeaves = getEmployeeLeaves(db, employeeId);
  const overlap = findOverlap(employeeId, data.date_from, data.date_to, existingLeaves);
  if (overlap)
    return res.status(409).json({ error: "Overlaps an existing pending/approved leave", overlapId: overlap.id });

  // Insert
  const result = db.prepare(
    `INSERT INTO leaves(employee_id, type, date_from, date_to, half_from, half_to, days, reason, status)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`
  ).run(
    employeeId, data.type, data.date_from, data.date_to,
    data.half_from, data.half_to, days, data.reason || null
  );

  const leaveId = Number(result.lastInsertRowid);
  audit(db, {
    actorId: req.user.id, action: "APPLY", entity: "leave", entityId: leaveId,
    detail: { employeeId, type: data.type, from: data.date_from, to: data.date_to, days },
  });
  broadcast({ type: "leave", entity: "leaves", id: leaveId });

  res.status(201).json({
    id: leaveId, employee_id: employeeId, type: data.type,
    date_from: data.date_from, date_to: data.date_to,
    half_from: data.half_from, half_to: data.half_to,
    days, reason: data.reason || null, status: "PENDING",
  });
});

// ── List leaves ─────────────────────────────────────────────────────────────

router.get("/pending", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const isHR = ["HR", "ADMIN"].includes(req.user.role);

  let leaves;
  if (isHR) {
    // HR sees all pending
    leaves = db.prepare(
      `SELECT l.*, e.name as employee_name, e.code as employee_code
       FROM leaves l JOIN employees e ON l.employee_id = e.id
       WHERE l.status = 'PENDING' ORDER BY l.applied_at DESC`
    ).all();
  } else {
    // Manager sees only direct reports' pending
    leaves = db.prepare(
      `SELECT l.*, e.name as employee_name, e.code as employee_code
       FROM leaves l JOIN employees e ON l.employee_id = e.id
       WHERE l.status = 'PENDING' AND e.manager_id = ?
       ORDER BY l.applied_at DESC`
    ).all(req.user.id);
  }
  res.json(leaves);
});

router.get("/", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const isHR = ["HR", "ADMIN"].includes(req.user.role);
  const { employee_id, status, year } = req.query;

  let sql = `SELECT l.*, e.name as employee_name, e.code as employee_code
             FROM leaves l JOIN employees e ON l.employee_id = e.id WHERE 1=1`;
  const params = [];

  if (employee_id) {
    // Specific employee — must be self, own report, or HR
    const targetId = parseInt(employee_id, 10);
    if (targetId !== req.user.id && !isHR && !isManagerOf(db, req.user.id, targetId)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    sql += " AND l.employee_id = ?";
    params.push(targetId);
  } else if (!isHR) {
    // Non-HR, non-specific: own leaves only
    sql += " AND l.employee_id = ?";
    params.push(req.user.id);
  }

  if (status) {
    sql += " AND l.status = ?";
    params.push(status.toUpperCase());
  }
  if (year) {
    sql += " AND l.date_from LIKE ?";
    params.push(`${year}-%`);
  }

  sql += " ORDER BY l.applied_at DESC";
  res.json(db.prepare(sql).all(...params));
});

// ── Approve / Reject / Cancel ───────────────────────────────────────────────

router.post("/:id/approve", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const leaveId = parseInt(req.params.id, 10);
  const leave = db.prepare("SELECT * FROM leaves WHERE id = ?").get(leaveId);
  if (!leave) return res.status(404).json({ error: "Leave not found" });
  if (leave.status !== "PENDING") return res.status(400).json({ error: "Only PENDING leaves can be approved" });

  // RBAC: employee cannot approve own leave
  if (leave.employee_id === req.user.id)
    return res.status(403).json({ error: "Cannot approve your own leave" });

  // Must be manager of this employee, or HR/ADMIN
  if (!canActOnLeave(db, req.user.id, req.user.role, leave.employee_id))
    return res.status(403).json({ error: "Not authorized to act on this leave" });

  // Parse optional comment and confirmOverBalance
  const parsed = LeaveActSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { comment, confirmOverBalance } = parsed.data;

  // Over-balance check
  const lt = db.prepare("SELECT * FROM leave_types WHERE code = ?").get(leave.type);
  if (lt && lt.annual > 0) {
    const emp = getEmployee(db, leave.employee_id);
    const types = getLeaveTypes(db);
    const allLeaves = getEmployeeLeaves(db, leave.employee_id);
    const adjustments = getAdjustments(db, leave.employee_id);
    const year = parseInt(leave.date_from.slice(0, 4), 10);
    const bal = leaveBalance(leave.employee_id, year, emp.doj, types, allLeaves, adjustments);
    if (bal[leave.type] && leave.days > bal[leave.type].available) {
      if (!confirmOverBalance) {
        return res.status(409).json({
          error: "Over balance",
          available: bal[leave.type].available,
          requested: leave.days,
          requiresConfirm: true,
        });
      }
    }
  }

  db.prepare(
    "UPDATE leaves SET status = 'APPROVED', acted_by = ?, acted_at = datetime('now'), act_comment = ? WHERE id = ?"
  ).run(req.user.id, comment || null, leaveId);

  audit(db, {
    actorId: req.user.id, action: "APPROVE", entity: "leave", entityId: leaveId,
    detail: { employeeId: leave.employee_id, type: leave.type, days: leave.days },
  });
  broadcast({ type: "leave", entity: "leaves", id: leaveId });
  res.json({ ok: true, status: "APPROVED" });
});

router.post("/:id/reject", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const leaveId = parseInt(req.params.id, 10);
  const leave = db.prepare("SELECT * FROM leaves WHERE id = ?").get(leaveId);
  if (!leave) return res.status(404).json({ error: "Leave not found" });
  if (leave.status !== "PENDING") return res.status(400).json({ error: "Only PENDING leaves can be rejected" });

  if (leave.employee_id === req.user.id)
    return res.status(403).json({ error: "Cannot reject your own leave" });

  if (!canActOnLeave(db, req.user.id, req.user.role, leave.employee_id))
    return res.status(403).json({ error: "Not authorized to act on this leave" });

  const parsed = LeaveActSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { comment } = parsed.data;

  db.prepare(
    "UPDATE leaves SET status = 'REJECTED', acted_by = ?, acted_at = datetime('now'), act_comment = ? WHERE id = ?"
  ).run(req.user.id, comment || null, leaveId);

  audit(db, {
    actorId: req.user.id, action: "REJECT", entity: "leave", entityId: leaveId,
    detail: { employeeId: leave.employee_id, type: leave.type },
  });
  broadcast({ type: "leave", entity: "leaves", id: leaveId });
  res.json({ ok: true, status: "REJECTED" });
});

router.post("/:id/cancel", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const leaveId = parseInt(req.params.id, 10);
  const leave = db.prepare("SELECT * FROM leaves WHERE id = ?").get(leaveId);
  if (!leave) return res.status(404).json({ error: "Leave not found" });

  const isHR = ["HR", "ADMIN"].includes(req.user.role);
  const isSelf = leave.employee_id === req.user.id;

  // Cancellation rules per spec:
  // PENDING: self or HR can cancel
  // APPROVED: HR can always cancel; employee can cancel only if date_from is in the future
  if (leave.status === "PENDING") {
    if (!isSelf && !isHR) return res.status(403).json({ error: "Forbidden" });
  } else if (leave.status === "APPROVED") {
    if (isHR) {
      // HR can always cancel approved
    } else if (isSelf) {
      // Employee can cancel only if date_from is in the future
      const today = new Date().toISOString().slice(0, 10);
      if (leave.date_from <= today) {
        return res.status(400).json({ error: "Cannot cancel: leave has already started" });
      }
    } else {
      return res.status(403).json({ error: "Forbidden" });
    }
  } else {
    return res.status(400).json({ error: `Cannot cancel a ${leave.status} leave` });
  }

  db.prepare(
    "UPDATE leaves SET status = 'CANCELLED', acted_by = ?, acted_at = datetime('now') WHERE id = ?"
  ).run(req.user.id, leaveId);

  audit(db, {
    actorId: req.user.id, action: "CANCEL", entity: "leave", entityId: leaveId,
    detail: { employeeId: leave.employee_id, type: leave.type },
  });
  broadcast({ type: "leave", entity: "leaves", id: leaveId });
  res.json({ ok: true, status: "CANCELLED" });
});

// ── Balances ────────────────────────────────────────────────────────────────

router.get("/balances", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const isHR = ["HR", "ADMIN"].includes(req.user.role);
  const year = parseInt(req.query.year || new Date().getFullYear(), 10);
  const targetId = req.query.employeeId ? parseInt(req.query.employeeId, 10) : null;

  // RBAC
  if (targetId && targetId !== req.user.id && !isHR && !isManagerOf(db, req.user.id, targetId))
    return res.status(403).json({ error: "Forbidden" });

  const types = getLeaveTypes(db);

  if (targetId) {
    const emp = getEmployee(db, targetId);
    if (!emp) return res.status(404).json({ error: "Employee not found" });
    const leaves = getEmployeeLeaves(db, targetId);
    const adjustments = getAdjustments(db, targetId);
    const bal = leaveBalance(targetId, year, emp.doj, types, leaves, adjustments);
    return res.json({ employeeId: targetId, year, balances: bal });
  }

  // All employees (HR only for full list; else just self)
  let employees;
  if (isHR) {
    employees = db.prepare("SELECT id, doj FROM employees WHERE status IN ('ACTIVE','NOTICE')").all();
  } else {
    employees = db.prepare("SELECT id, doj FROM employees WHERE id = ?").all(req.user.id);
  }

  const results = employees.map((emp) => {
    const leaves = getEmployeeLeaves(db, emp.id);
    const adjustments = getAdjustments(db, emp.id);
    return {
      employeeId: emp.id,
      year,
      balances: leaveBalance(emp.id, year, emp.doj, types, leaves, adjustments),
    };
  });

  res.json(results);
});

// ── Adjustments ─────────────────────────────────────────────────────────────

router.post("/adjustments", requireHR, (req, res) => {
  const parsed = LeaveAdjustmentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const db = req.app.locals.db;
  const { employee_id, year, type, delta, note } = parsed.data;

  // Validate employee
  const emp = getEmployee(db, employee_id);
  if (!emp) return res.status(404).json({ error: "Employee not found" });
  // Validate leave type
  const lt = db.prepare("SELECT code FROM leave_types WHERE code = ?").get(type);
  if (!lt) return res.status(400).json({ error: "Invalid leave type" });

  const result = db.prepare(
    "INSERT INTO leave_adjustments(employee_id, year, type, delta, note, created_by) VALUES(?,?,?,?,?,?)"
  ).run(employee_id, year, type, delta, note || null, req.user.id);

  audit(db, {
    actorId: req.user.id, action: "ADJUST", entity: "leave_adjustment",
    entityId: Number(result.lastInsertRowid),
    detail: { employee_id, year, type, delta, note },
  });
  broadcast({ type: "leave_adjustment", entity: "leave_adjustments" });
  res.status(201).json({ id: Number(result.lastInsertRowid), ...parsed.data, created_by: req.user.id });
});

// ── Pending count (for notification badge) ──────────────────────────────────

router.get("/pending-count", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const isHR = ["HR", "ADMIN"].includes(req.user.role);

  let count;
  if (isHR) {
    count = db.prepare("SELECT COUNT(*) as c FROM leaves WHERE status = 'PENDING'").get().c;
  } else {
    count = db.prepare(
      `SELECT COUNT(*) as c FROM leaves l
       JOIN employees e ON l.employee_id = e.id
       WHERE l.status = 'PENDING' AND e.manager_id = ?`
    ).all(req.user.id)[0].c;
  }
  res.json({ count });
});

export default router;
