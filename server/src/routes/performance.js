import { Router } from "express";
import { requireAuth, requireHR, isManagerOf } from "../middleware/auth.js";
import {
  ReviewCycleCreateSchema, ReviewCyclePatchSchema,
  GoalCreateSchema, GoalPatchSchema,
  ReviewCreateSchema, ReviewPatchSchema,
  OneOnOneCreateSchema, OneOnOnePatchSchema,
} from "@hrms/shared/schemas";
import { broadcast } from "../utils/sse.js";
import { audit } from "../utils/audit.js";

const router = Router();

// ── Review Cycles ──────────────────────────────────────────────────────────

router.get("/review-cycles", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const { status, year } = req.query;
  let sql = "SELECT * FROM review_cycles WHERE 1=1";
  const params = [];
  if (status) { sql += " AND status = ?"; params.push(status.toUpperCase()); }
  if (year) { sql += " AND year = ?"; params.push(parseInt(year, 10)); }
  sql += " ORDER BY year DESC, created_at DESC";
  res.json(db.prepare(sql).all(...params));
});

router.post("/review-cycles", ...requireHR, (req, res) => {
  const parsed = ReviewCycleCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const db = req.app.locals.db;
  const d = parsed.data;
  if (d.start_date >= d.end_date) return res.status(400).json({ error: "start_date must be before end_date" });
  const result = db.prepare(
    "INSERT INTO review_cycles(name, year, quarter, start_date, end_date, status, created_by) VALUES(?,?,?,?,?,?,?)"
  ).run(d.name, d.year, d.quarter ?? null, d.start_date, d.end_date, d.status, req.user.id);
  const id = Number(result.lastInsertRowid);
  audit(db, { actorId: req.user.id, action: "CREATE", entity: "review_cycle", entityId: id, detail: d });
  broadcast({ type: "review_cycle", entity: "review_cycles" });
  res.status(201).json({ id, ...d, created_by: req.user.id });
});

router.patch("/review-cycles/:id", ...requireHR, (req, res) => {
  const parsed = ReviewCyclePatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const db = req.app.locals.db;
  const cycleId = parseInt(req.params.id, 10);
  const existing = db.prepare("SELECT * FROM review_cycles WHERE id = ?").get(cycleId);
  if (!existing) return res.status(404).json({ error: "Cycle not found" });
  const fields = parsed.data;
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) { sets.push(`${k} = ?`); vals.push(v); }
  }
  if (sets.length === 0) return res.json(existing);
  vals.push(cycleId);
  db.prepare(`UPDATE review_cycles SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  audit(db, { actorId: req.user.id, action: "UPDATE", entity: "review_cycle", entityId: cycleId, detail: fields });
  broadcast({ type: "review_cycle", entity: "review_cycles" });
  res.json({ ...existing, ...fields });
});

// ── Goals ───────────────────────────────────────────────────────────────────

router.get("/goals", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const isHR = ["HR", "ADMIN"].includes(req.user.role);
  const { cycle_id, employee_id } = req.query;

  let sql = `SELECT g.*, e.name as employee_name, rc.name as cycle_name
             FROM goals g
             JOIN employees e ON g.employee_id = e.id
             JOIN review_cycles rc ON g.cycle_id = rc.id WHERE 1=1`;
  const params = [];

  if (!isHR) {
    if (employee_id) {
      const eid = parseInt(employee_id, 10);
      if (eid !== req.user.id && !isManagerOf(db, req.user.id, eid)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      sql += " AND g.employee_id = ?";
      params.push(eid);
    } else {
      const reportIds = db.prepare(
        "SELECT id FROM employees WHERE manager_id = ? AND status != 'EXITED'"
      ).all(req.user.id).map(r => r.id);
      const allowed = [req.user.id, ...reportIds];
      sql += ` AND g.employee_id IN (${allowed.map(() => "?").join(",")})`;
      params.push(...allowed);
    }
  } else if (employee_id) {
    sql += " AND g.employee_id = ?";
    params.push(parseInt(employee_id, 10));
  }

  if (cycle_id) { sql += " AND g.cycle_id = ?"; params.push(parseInt(cycle_id, 10)); }
  sql += " ORDER BY g.created_at DESC";
  res.json(db.prepare(sql).all(...params));
});

router.post("/goals", requireAuth, (req, res) => {
  const parsed = GoalCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const db = req.app.locals.db;
  const d = parsed.data;
  const isHR = ["HR", "ADMIN"].includes(req.user.role);
  if (d.employee_id !== req.user.id && !isHR) {
    return res.status(403).json({ error: "Employees can only create their own goals" });
  }
  const cycle = db.prepare("SELECT * FROM review_cycles WHERE id = ?").get(d.cycle_id);
  if (!cycle) return res.status(400).json({ error: "Cycle not found" });
  if (cycle.status !== "ACTIVE") return res.status(400).json({ error: "Cycle is not active" });

  const result = db.prepare(
    "INSERT INTO goals(employee_id, cycle_id, title, description, weight, target_value) VALUES(?,?,?,?,?,?)"
  ).run(d.employee_id, d.cycle_id, d.title, d.description || null, d.weight, d.target_value || null);
  const id = Number(result.lastInsertRowid);
  audit(db, { actorId: req.user.id, action: "CREATE", entity: "goal", entityId: id, detail: d });
  broadcast({ type: "goal", entity: "goals" });
  res.status(201).json({ id, ...d, status: "PENDING" });
});

router.patch("/goals/:id", requireAuth, (req, res) => {
  const parsed = GoalPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const db = req.app.locals.db;
  const goalId = parseInt(req.params.id, 10);
  const existing = db.prepare("SELECT * FROM goals WHERE id = ?").get(goalId);
  if (!existing) return res.status(404).json({ error: "Goal not found" });

  const isHR = ["HR", "ADMIN"].includes(req.user.role);
  const isOwner = existing.employee_id === req.user.id;
  const isMgr = isManagerOf(db, req.user.id, existing.employee_id);

  if (!isHR && !isOwner && !isMgr) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const fields = parsed.data;
  if (!isHR && !isMgr && fields.manager_rating !== undefined) {
    return res.status(403).json({ error: "Only managers can set manager_rating" });
  }
  if (!isHR && !isOwner && fields.self_rating !== undefined) {
    return res.status(403).json({ error: "Only the goal owner can set self_rating" });
  }

  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) { sets.push(`${k} = ?`); vals.push(v); }
  }
  if (sets.length === 0) return res.json(existing);
  sets.push("updated_at = datetime('now')");
  vals.push(goalId);
  db.prepare(`UPDATE goals SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  audit(db, { actorId: req.user.id, action: "UPDATE", entity: "goal", entityId: goalId, detail: fields });
  broadcast({ type: "goal", entity: "goals" });
  res.json({ ...existing, ...fields });
});

// ── Reviews ────────────────────────────────────────────────────────────────

router.get("/reviews", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const isHR = ["HR", "ADMIN"].includes(req.user.role);
  const { cycle_id, employee_id } = req.query;

  let sql = `SELECT r.*, e.name as employee_name, rv.name as reviewer_name, rc.name as cycle_name
             FROM reviews r
             JOIN employees e ON r.employee_id = e.id
             JOIN employees rv ON r.reviewer_id = rv.id
             JOIN review_cycles rc ON r.cycle_id = rc.id WHERE 1=1`;
  const params = [];

  if (!isHR) {
    sql += " AND (r.reviewer_id = ? OR r.employee_id = ?)";
    params.push(req.user.id, req.user.id);
  }
  if (cycle_id) { sql += " AND r.cycle_id = ?"; params.push(parseInt(cycle_id, 10)); }
  if (employee_id) { sql += " AND r.employee_id = ?"; params.push(parseInt(employee_id, 10)); }
  sql += " ORDER BY r.id DESC";
  res.json(db.prepare(sql).all(...params));
});

router.post("/reviews", ...requireHR, (req, res) => {
  const parsed = ReviewCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const db = req.app.locals.db;
  const d = parsed.data;
  const cycle = db.prepare("SELECT * FROM review_cycles WHERE id = ?").get(d.cycle_id);
  if (!cycle) return res.status(400).json({ error: "Cycle not found" });
  if (cycle.status !== "ACTIVE") return res.status(400).json({ error: "Cycle is not active" });
  const emp = db.prepare("SELECT id FROM employees WHERE id = ? AND status != 'EXITED'").get(d.employee_id);
  if (!emp) return res.status(400).json({ error: "Employee not found or inactive" });
  const reviewer = db.prepare("SELECT id FROM employees WHERE id = ? AND status != 'EXITED'").get(d.reviewer_id);
  if (!reviewer) return res.status(400).json({ error: "Reviewer not found or inactive" });

  const dup = db.prepare(
    "SELECT id FROM reviews WHERE employee_id = ? AND cycle_id = ? AND reviewer_id = ? AND relationship = ?"
  ).get(d.employee_id, d.cycle_id, d.reviewer_id, d.relationship);
  if (dup) return res.status(409).json({ error: "Review already exists for this reviewer/relationship/cycle" });

  const result = db.prepare(
    "INSERT INTO reviews(employee_id, cycle_id, reviewer_id, relationship) VALUES(?,?,?,?)"
  ).run(d.employee_id, d.cycle_id, d.reviewer_id, d.relationship);
  const id = Number(result.lastInsertRowid);
  audit(db, { actorId: req.user.id, action: "CREATE", entity: "review", entityId: id, detail: d });
  broadcast({ type: "review", entity: "reviews" });
  res.status(201).json({ id, ...d, status: "PENDING" });
});

router.patch("/reviews/:id", requireAuth, (req, res) => {
  const parsed = ReviewPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const db = req.app.locals.db;
  const revId = parseInt(req.params.id, 10);
  const existing = db.prepare("SELECT * FROM reviews WHERE id = ?").get(revId);
  if (!existing) return res.status(404).json({ error: "Review not found" });
  const isHR = ["HR", "ADMIN"].includes(req.user.role);
  const isReviewer = existing.reviewer_id === req.user.id;
  if (!isHR && !isReviewer) return res.status(403).json({ error: "Forbidden" });
  if (existing.status === "SUBMITTED" && !isHR) {
    return res.status(400).json({ error: "Review already submitted" });
  }

  const fields = parsed.data;
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) { sets.push(`${k} = ?`); vals.push(v); }
  }
  if (fields.status === "SUBMITTED" && existing.status !== "SUBMITTED") {
    sets.push("submitted_at = datetime('now')");
  }
  if (sets.length === 0) return res.json(existing);
  vals.push(revId);
  db.prepare(`UPDATE reviews SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  audit(db, { actorId: req.user.id, action: "UPDATE", entity: "review", entityId: revId, detail: fields });
  broadcast({ type: "review", entity: "reviews" });
  res.json({ ...existing, ...fields });
});

// ── 1-on-1s ────────────────────────────────────────────────────────────────

router.get("/one-on-ones", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const isHR = ["HR", "ADMIN"].includes(req.user.role);
  const { employee_id } = req.query;

  let sql = `SELECT o.*, e.name as employee_name, m.name as manager_name
             FROM one_on_ones o
             JOIN employees e ON o.employee_id = e.id
             JOIN employees m ON o.manager_id = m.id WHERE 1=1`;
  const params = [];

  if (!isHR) {
    sql += " AND (o.employee_id = ? OR o.manager_id = ?)";
    params.push(req.user.id, req.user.id);
  }
  if (employee_id) {
    sql += " AND o.employee_id = ?";
    params.push(parseInt(employee_id, 10));
  }
  sql += " ORDER BY o.date DESC";
  res.json(db.prepare(sql).all(...params));
});

router.post("/one-on-ones", requireAuth, (req, res) => {
  const parsed = OneOnOneCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const db = req.app.locals.db;
  const d = parsed.data;
  const isHR = ["HR", "ADMIN"].includes(req.user.role);
  const involved = d.employee_id === req.user.id || d.manager_id === req.user.id;
  if (!isHR && !involved) return res.status(403).json({ error: "Forbidden" });
  const emp = db.prepare("SELECT id FROM employees WHERE id = ?").get(d.employee_id);
  if (!emp) return res.status(400).json({ error: "Employee not found" });
  const mgr = db.prepare("SELECT id FROM employees WHERE id = ?").get(d.manager_id);
  if (!mgr) return res.status(400).json({ error: "Manager not found" });

  const result = db.prepare(
    "INSERT INTO one_on_ones(employee_id, manager_id, date, notes, action_items) VALUES(?,?,?,?,?)"
  ).run(d.employee_id, d.manager_id, d.date, d.notes || null, d.action_items || null);
  const id = Number(result.lastInsertRowid);
  audit(db, { actorId: req.user.id, action: "CREATE", entity: "one_on_one", entityId: id, detail: { employee_id: d.employee_id, manager_id: d.manager_id, date: d.date } });
  broadcast({ type: "one_on_one", entity: "one_on_ones" });
  res.status(201).json({ id, ...d });
});

router.patch("/one-on-ones/:id", requireAuth, (req, res) => {
  const parsed = OneOnOnePatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const db = req.app.locals.db;
  const oooId = parseInt(req.params.id, 10);
  const existing = db.prepare("SELECT * FROM one_on_ones WHERE id = ?").get(oooId);
  if (!existing) return res.status(404).json({ error: "1-on-1 not found" });
  const isHR = ["HR", "ADMIN"].includes(req.user.role);
  const involved = existing.employee_id === req.user.id || existing.manager_id === req.user.id;
  if (!isHR && !involved) return res.status(403).json({ error: "Forbidden" });

  const fields = parsed.data;
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) { sets.push(`${k} = ?`); vals.push(v); }
  }
  if (sets.length === 0) return res.json(existing);
  vals.push(oooId);
  db.prepare(`UPDATE one_on_ones SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  audit(db, { actorId: req.user.id, action: "UPDATE", entity: "one_on_one", entityId: oooId, detail: fields });
  broadcast({ type: "one_on_one", entity: "one_on_ones" });
  res.json({ ...existing, ...fields });
});

// ── Performance Dashboard ──────────────────────────────────────────────────

router.get("/dashboard", ...requireHR, (req, res) => {
  const db = req.app.locals.db;
  const activeCycles = db.prepare("SELECT COUNT(*) as c FROM review_cycles WHERE status = 'ACTIVE'").get().c;
  const totalGoals = db.prepare(
    "SELECT COUNT(*) as c FROM goals g JOIN review_cycles rc ON g.cycle_id = rc.id WHERE rc.status = 'ACTIVE'"
  ).get().c;
  const pendingReviews = db.prepare(
    "SELECT COUNT(*) as c FROM reviews r JOIN review_cycles rc ON r.cycle_id = rc.id WHERE r.status = 'PENDING' AND rc.status = 'ACTIVE'"
  ).get().c;
  const avgByDept = db.prepare(
    `SELECT d.name as dept, ROUND(AVG(r.overall_rating), 1) as avg_rating, COUNT(*) as count
     FROM reviews r
     JOIN employees e ON r.employee_id = e.id
     JOIN departments d ON e.dept_id = d.id
     WHERE r.status = 'SUBMITTED' AND r.overall_rating IS NOT NULL
     GROUP BY d.id ORDER BY d.name`
  ).all();
  const completionRate = db.prepare(
    `SELECT rc.name as cycle_name,
     ROUND(100.0 * SUM(CASE WHEN r.status = 'SUBMITTED' THEN 1 ELSE 0 END) / MAX(COUNT(*), 1), 0) as pct
     FROM reviews r JOIN review_cycles rc ON r.cycle_id = rc.id
     WHERE rc.status = 'ACTIVE' GROUP BY rc.id`
  ).all();

  res.json({ activeCycles, totalGoals, pendingReviews, avgByDept, completionRate });
});

// ── Employee Performance Profile ───────────────────────────────────────────

router.get("/employee/:id", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const empId = parseInt(req.params.id, 10);
  const isHR = ["HR", "ADMIN"].includes(req.user.role);
  const isMgr = isManagerOf(db, req.user.id, empId);
  const isSelf = req.user.id === empId;
  if (!isHR && !isMgr && !isSelf) return res.status(403).json({ error: "Forbidden" });

  const goals = db.prepare(
    `SELECT g.*, rc.name as cycle_name FROM goals g
     JOIN review_cycles rc ON g.cycle_id = rc.id
     WHERE g.employee_id = ? ORDER BY rc.year DESC, g.created_at DESC`
  ).all(empId);
  const reviews = db.prepare(
    `SELECT r.*, rc.name as cycle_name, rv.name as reviewer_name FROM reviews r
     JOIN review_cycles rc ON r.cycle_id = rc.id
     JOIN employees rv ON r.reviewer_id = rv.id
     WHERE r.employee_id = ? ORDER BY rc.year DESC`
  ).all(empId);

  res.json({ goals, reviews });
});

export default router;
