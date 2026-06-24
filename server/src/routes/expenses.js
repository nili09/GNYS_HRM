import { Router } from "express";
import { requireAuth, requireHR, isManagerOf } from "../middleware/auth.js";
import {
  ExpensePolicyCreateSchema,
  ExpensePolicyPatchSchema,
  ExpenseCategoryCreateSchema,
  ExpenseCategoryPatchSchema,
  ExpenseCreateSchema,
  ExpenseActSchema,
  ExpenseSettleSchema,
  AdvanceRequestCreateSchema,
  AdvanceActSchema,
} from "@hrms/shared/schemas";
import { broadcast } from "../utils/sse.js";
import { audit } from "../utils/audit.js";
import { notify, notifyMany } from "../utils/notify.js";
import { indexEntity } from "../utils/search.js";

const router = Router();

function canActOnExpense(db, actorId, actorRole, targetEmployeeId) {
  if (["HR", "ADMIN"].includes(actorRole)) return true;
  return isManagerOf(db, actorId, targetEmployeeId);
}

// ── Expense Policies CRUD ──────────────────────────────────────────────────

router.get("/policies", requireAuth, (req, res) => {
  const rows = req.app.locals.db.prepare("SELECT * FROM expense_policies ORDER BY name").all();
  res.json(rows);
});

router.post("/policies", ...requireHR, (req, res) => {
  const parsed = ExpensePolicyCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const db = req.app.locals.db;
  const d = parsed.data;
  const existing = db.prepare("SELECT id FROM expense_policies WHERE name = ?").get(d.name);
  if (existing) return res.status(409).json({ error: "Policy name already exists" });
  const result = db.prepare(
    "INSERT INTO expense_policies(name, per_diem_limit, requires_receipt, active) VALUES(?,?,?,?)"
  ).run(d.name, d.per_diem_limit ?? null, d.requires_receipt, d.active);
  const id = Number(result.lastInsertRowid);
  audit(db, { actorId: req.user.id, action: "CREATE", entity: "expense_policy", entityId: id, detail: d });
  broadcast({ type: "expense_policy", entity: "expense_policies" });
  res.status(201).json({ id, ...d });
});

router.patch("/policies/:id", ...requireHR, (req, res) => {
  const parsed = ExpensePolicyPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const db = req.app.locals.db;
  const policyId = parseInt(req.params.id, 10);
  const existing = db.prepare("SELECT * FROM expense_policies WHERE id = ?").get(policyId);
  if (!existing) return res.status(404).json({ error: "Policy not found" });
  const fields = parsed.data;
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) { sets.push(`${k} = ?`); vals.push(v); }
  }
  if (sets.length === 0) return res.json(existing);
  vals.push(policyId);
  db.prepare(`UPDATE expense_policies SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  audit(db, { actorId: req.user.id, action: "UPDATE", entity: "expense_policy", entityId: policyId, detail: fields });
  broadcast({ type: "expense_policy", entity: "expense_policies" });
  res.json({ ...existing, ...fields });
});

// ── Expense Categories CRUD ────────────────────────────────────────────────

router.get("/categories", requireAuth, (req, res) => {
  const rows = req.app.locals.db.prepare(
    `SELECT c.*, p.name as policy_name FROM expense_categories c
     LEFT JOIN expense_policies p ON c.policy_id = p.id ORDER BY c.name`
  ).all();
  res.json(rows);
});

router.post("/categories", ...requireHR, (req, res) => {
  const parsed = ExpenseCategoryCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const db = req.app.locals.db;
  const d = parsed.data;
  const existing = db.prepare("SELECT id FROM expense_categories WHERE name = ?").get(d.name);
  if (existing) return res.status(409).json({ error: "Category name already exists" });
  if (d.policy_id) {
    const policy = db.prepare("SELECT id FROM expense_policies WHERE id = ?").get(d.policy_id);
    if (!policy) return res.status(400).json({ error: "Policy not found" });
  }
  const result = db.prepare(
    "INSERT INTO expense_categories(name, policy_id, active) VALUES(?,?,?)"
  ).run(d.name, d.policy_id ?? null, d.active);
  const id = Number(result.lastInsertRowid);
  audit(db, { actorId: req.user.id, action: "CREATE", entity: "expense_category", entityId: id, detail: d });
  broadcast({ type: "expense_category", entity: "expense_categories" });
  res.status(201).json({ id, ...d });
});

router.patch("/categories/:id", ...requireHR, (req, res) => {
  const parsed = ExpenseCategoryPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const db = req.app.locals.db;
  const catId = parseInt(req.params.id, 10);
  const existing = db.prepare("SELECT * FROM expense_categories WHERE id = ?").get(catId);
  if (!existing) return res.status(404).json({ error: "Category not found" });
  const fields = parsed.data;
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) { sets.push(`${k} = ?`); vals.push(v); }
  }
  if (sets.length === 0) return res.json(existing);
  vals.push(catId);
  db.prepare(`UPDATE expense_categories SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  audit(db, { actorId: req.user.id, action: "UPDATE", entity: "expense_category", entityId: catId, detail: fields });
  broadcast({ type: "expense_category", entity: "expense_categories" });
  res.json({ ...existing, ...fields });
});

// ── Expenses CRUD ──────────────────────────────────────────────────────────

router.post("/", requireAuth, (req, res) => {
  const parsed = ExpenseCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const db = req.app.locals.db;
  const d = parsed.data;
  const cat = db.prepare("SELECT * FROM expense_categories WHERE id = ?").get(d.category_id);
  if (!cat) return res.status(400).json({ error: "Category not found" });
  if (!cat.active) return res.status(400).json({ error: "Category is inactive" });

  if (cat.policy_id) {
    const policy = db.prepare("SELECT * FROM expense_policies WHERE id = ?").get(cat.policy_id);
    if (policy && policy.per_diem_limit && d.amount > policy.per_diem_limit) {
      return res.status(400).json({ error: `Amount exceeds per-diem limit of ${policy.per_diem_limit}` });
    }
  }

  const result = db.prepare(
    `INSERT INTO expenses(employee_id, category_id, amount, date, description, receipt_filename)
     VALUES(?,?,?,?,?,?)`
  ).run(req.user.id, d.category_id, d.amount, d.date, d.description || null, d.receipt_filename || null);
  const id = Number(result.lastInsertRowid);
  audit(db, { actorId: req.user.id, action: "CREATE", entity: "expense", entityId: id, detail: d });
  broadcast({ type: "expense", entity: "expenses", id });
  indexEntity(db, "expense", id, `${cat.name} — ${d.amount}`, d.description || "",
    { status: "PENDING", employee_id: req.user.id });

  // Manager and HR get different links because their approval UIs are on separate routes.
  const submitter = db.prepare("SELECT name, manager_id FROM employees WHERE id = ?").get(req.user.id);
  const notifBase = {
    type: "expense_submitted", title: "New expense claim",
    body: `${submitter?.name || "Employee"} submitted ₹${d.amount} expense (${cat.name})`,
    entity: "expense", entityId: id,
  };
  const expNotifiedIds = new Set();
  if (submitter?.manager_id && submitter.manager_id !== req.user.id) {
    notify(db, { ...notifBase, userId: submitter.manager_id, link: "/team/expenses" });
    expNotifiedIds.add(submitter.manager_id);
  }
  const hrIds = db.prepare("SELECT id FROM employees WHERE role IN ('HR','ADMIN') AND status = 'ACTIVE'").all();
  for (const h of hrIds) {
    if (h.id !== req.user.id && !expNotifiedIds.has(h.id)) {
      notify(db, { ...notifBase, userId: h.id, link: "/hr/expenses" });
    }
  }

  res.status(201).json({ id, employee_id: req.user.id, status: "PENDING", ...d });
});

router.get("/", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const isHR = ["HR", "ADMIN"].includes(req.user.role);
  const { employee_id, status, month } = req.query;

  let sql = `SELECT x.*, e.name as employee_name, e.code as employee_code,
             c.name as category_name
             FROM expenses x
             JOIN employees e ON x.employee_id = e.id
             JOIN expense_categories c ON x.category_id = c.id WHERE 1=1`;
  const params = [];

  if (employee_id) {
    const targetId = parseInt(employee_id, 10);
    if (targetId !== req.user.id && !isHR && !isManagerOf(db, req.user.id, targetId)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    sql += " AND x.employee_id = ?";
    params.push(targetId);
  } else if (!isHR) {
    sql += " AND x.employee_id = ?";
    params.push(req.user.id);
  }

  if (status) {
    const statuses = (Array.isArray(status) ? status : [status]).map(s => s.toUpperCase());
    sql += ` AND x.status IN (${statuses.map(() => "?").join(",")})`;
    params.push(...statuses);
  }
  if (month) { sql += " AND x.date LIKE ?"; params.push(`${month}-%`); }

  sql += " ORDER BY x.applied_at DESC";
  res.json(db.prepare(sql).all(...params));
});

router.get("/pending", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const isHR = ["HR", "ADMIN"].includes(req.user.role);
  let rows;
  if (isHR) {
    rows = db.prepare(
      `SELECT x.*, e.name as employee_name, e.code as employee_code, c.name as category_name
       FROM expenses x JOIN employees e ON x.employee_id = e.id
       JOIN expense_categories c ON x.category_id = c.id
       WHERE x.status = 'PENDING' ORDER BY x.applied_at DESC`
    ).all();
  } else {
    rows = db.prepare(
      `SELECT x.*, e.name as employee_name, e.code as employee_code, c.name as category_name
       FROM expenses x JOIN employees e ON x.employee_id = e.id
       JOIN expense_categories c ON x.category_id = c.id
       WHERE x.status = 'PENDING' AND e.manager_id = ?
       ORDER BY x.applied_at DESC`
    ).all(req.user.id);
  }
  res.json(rows);
});

router.get("/pending-count", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const isHR = ["HR", "ADMIN"].includes(req.user.role);
  let count;
  if (isHR) {
    count = db.prepare("SELECT COUNT(*) as c FROM expenses WHERE status = 'PENDING'").get().c;
  } else {
    count = db.prepare(
      `SELECT COUNT(*) as c FROM expenses x
       JOIN employees e ON x.employee_id = e.id
       WHERE x.status = 'PENDING' AND e.manager_id = ?`
    ).get(req.user.id).c;
  }
  res.json({ count });
});

// ── Approve / Reject / Settle ──────────────────────────────────────────────

router.post("/:id/approve", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const expId = parseInt(req.params.id, 10);
  const exp = db.prepare("SELECT * FROM expenses WHERE id = ?").get(expId);
  if (!exp) return res.status(404).json({ error: "Expense not found" });
  if (exp.status !== "PENDING") return res.status(400).json({ error: "Only PENDING expenses can be approved" });
  if (exp.employee_id === req.user.id) return res.status(403).json({ error: "Cannot approve your own expense" });
  if (!canActOnExpense(db, req.user.id, req.user.role, exp.employee_id))
    return res.status(403).json({ error: "Not authorized" });
  const parsed = ExpenseActSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  db.prepare(
    "UPDATE expenses SET status = 'APPROVED', acted_by = ?, acted_at = datetime('now'), act_comment = ? WHERE id = ?"
  ).run(req.user.id, parsed.data.comment || null, expId);
  audit(db, { actorId: req.user.id, action: "APPROVE", entity: "expense", entityId: expId });
  broadcast({ type: "expense", entity: "expenses", id: expId });
  notify(db, {
    userId: exp.employee_id, type: "expense_approved", title: "Expense approved",
    body: `Your ₹${exp.amount} expense was approved`,
    link: "/expenses", entity: "expense", entityId: expId,
  });
  res.json({ ok: true, status: "APPROVED" });
});

router.post("/:id/reject", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const expId = parseInt(req.params.id, 10);
  const exp = db.prepare("SELECT * FROM expenses WHERE id = ?").get(expId);
  if (!exp) return res.status(404).json({ error: "Expense not found" });
  if (exp.status !== "PENDING") return res.status(400).json({ error: "Only PENDING expenses can be rejected" });
  if (exp.employee_id === req.user.id) return res.status(403).json({ error: "Cannot reject your own expense" });
  if (!canActOnExpense(db, req.user.id, req.user.role, exp.employee_id))
    return res.status(403).json({ error: "Not authorized" });
  const parsed = ExpenseActSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  db.prepare(
    "UPDATE expenses SET status = 'REJECTED', acted_by = ?, acted_at = datetime('now'), act_comment = ? WHERE id = ?"
  ).run(req.user.id, parsed.data.comment || null, expId);
  audit(db, { actorId: req.user.id, action: "REJECT", entity: "expense", entityId: expId });
  broadcast({ type: "expense", entity: "expenses", id: expId });
  notify(db, {
    userId: exp.employee_id, type: "expense_rejected", title: "Expense rejected",
    body: `Your ₹${exp.amount} expense was rejected`,
    link: "/expenses", entity: "expense", entityId: expId,
  });
  res.json({ ok: true, status: "REJECTED" });
});

router.post("/:id/settle", ...requireHR, (req, res) => {
  const db = req.app.locals.db;
  const expId = parseInt(req.params.id, 10);
  const exp = db.prepare("SELECT * FROM expenses WHERE id = ?").get(expId);
  if (!exp) return res.status(404).json({ error: "Expense not found" });
  if (exp.status !== "APPROVED") return res.status(400).json({ error: "Only APPROVED expenses can be settled" });
  const parsed = ExpenseSettleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  db.prepare(
    "UPDATE expenses SET status = 'SETTLED', settled_in_month = ?, acted_by = ?, acted_at = datetime('now') WHERE id = ?"
  ).run(parsed.data.settled_in_month, req.user.id, expId);
  audit(db, { actorId: req.user.id, action: "SETTLE", entity: "expense", entityId: expId, detail: parsed.data });
  broadcast({ type: "expense", entity: "expenses", id: expId });
  notify(db, {
    userId: exp.employee_id, type: "expense_settled", title: "Expense reimbursed",
    body: `Your ₹${exp.amount} expense has been settled`,
    link: "/expenses", entity: "expense", entityId: expId,
  });
  res.json({ ok: true, status: "SETTLED" });
});

// ── Advance Requests ───────────────────────────────────────────────────────

router.get("/advances", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const isHR = ["HR", "ADMIN"].includes(req.user.role);
  const { employee_id, status } = req.query;

  let sql = `SELECT a.*, e.name as employee_name, e.code as employee_code
             FROM advance_requests a JOIN employees e ON a.employee_id = e.id WHERE 1=1`;
  const params = [];

  if (employee_id) {
    const targetId = parseInt(employee_id, 10);
    if (targetId !== req.user.id && !isHR && !isManagerOf(db, req.user.id, targetId))
      return res.status(403).json({ error: "Forbidden" });
    sql += " AND a.employee_id = ?";
    params.push(targetId);
  } else if (!isHR) {
    sql += " AND a.employee_id = ?";
    params.push(req.user.id);
  }

  if (status) {
    const statuses = (Array.isArray(status) ? status : [status]).map(s => s.toUpperCase());
    sql += ` AND a.status IN (${statuses.map(() => "?").join(",")})`;
    params.push(...statuses);
  }
  sql += " ORDER BY a.applied_at DESC";
  res.json(db.prepare(sql).all(...params));
});

router.post("/advances", requireAuth, (req, res) => {
  const parsed = AdvanceRequestCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const db = req.app.locals.db;
  const d = parsed.data;
  const result = db.prepare(
    "INSERT INTO advance_requests(employee_id, amount, reason) VALUES(?,?,?)"
  ).run(req.user.id, d.amount, d.reason || null);
  const id = Number(result.lastInsertRowid);
  audit(db, { actorId: req.user.id, action: "CREATE", entity: "advance_request", entityId: id, detail: d });
  broadcast({ type: "advance_request", entity: "advance_requests", id });

  const advSubmitter = db.prepare("SELECT name, manager_id FROM employees WHERE id = ?").get(req.user.id);
  const advBase = {
    type: "advance_submitted", title: "New advance request",
    body: `${advSubmitter?.name || "Employee"} requested a ₹${d.amount} advance`,
    entity: "advance_request", entityId: id,
  };
  const advNotifiedIds = new Set();
  if (advSubmitter?.manager_id && advSubmitter.manager_id !== req.user.id) {
    notify(db, { ...advBase, userId: advSubmitter.manager_id, link: "/team/expenses" });
    advNotifiedIds.add(advSubmitter.manager_id);
  }
  const advHrIds = db.prepare("SELECT id FROM employees WHERE role IN ('HR','ADMIN') AND status = 'ACTIVE'").all();
  for (const h of advHrIds) {
    if (h.id !== req.user.id && !advNotifiedIds.has(h.id)) {
      notify(db, { ...advBase, userId: h.id, link: "/hr/expenses" });
    }
  }

  res.status(201).json({ id, employee_id: req.user.id, status: "PENDING", ...d });
});

router.post("/advances/:id/approve", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const advId = parseInt(req.params.id, 10);
  const adv = db.prepare("SELECT * FROM advance_requests WHERE id = ?").get(advId);
  if (!adv) return res.status(404).json({ error: "Advance request not found" });
  if (adv.status !== "PENDING") return res.status(400).json({ error: "Only PENDING advances can be approved" });
  if (adv.employee_id === req.user.id) return res.status(403).json({ error: "Cannot approve your own advance" });
  if (!canActOnExpense(db, req.user.id, req.user.role, adv.employee_id))
    return res.status(403).json({ error: "Not authorized" });
  db.prepare(
    "UPDATE advance_requests SET status = 'APPROVED', acted_by = ?, acted_at = datetime('now') WHERE id = ?"
  ).run(req.user.id, advId);
  audit(db, { actorId: req.user.id, action: "APPROVE", entity: "advance_request", entityId: advId });
  broadcast({ type: "advance_request", entity: "advance_requests", id: advId });
  notify(db, {
    userId: adv.employee_id, type: "advance_approved", title: "Advance approved",
    body: `Your ₹${adv.amount} advance request has been approved`,
    link: "/my/expenses", entity: "advance_request", entityId: advId,
  });
  res.json({ ok: true, status: "APPROVED" });
});

router.post("/advances/:id/reject", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const advId = parseInt(req.params.id, 10);
  const adv = db.prepare("SELECT * FROM advance_requests WHERE id = ?").get(advId);
  if (!adv) return res.status(404).json({ error: "Advance request not found" });
  if (adv.status !== "PENDING") return res.status(400).json({ error: "Only PENDING advances can be rejected" });
  if (adv.employee_id === req.user.id) return res.status(403).json({ error: "Cannot reject your own advance" });
  if (!canActOnExpense(db, req.user.id, req.user.role, adv.employee_id))
    return res.status(403).json({ error: "Not authorized" });
  db.prepare(
    "UPDATE advance_requests SET status = 'REJECTED', acted_by = ?, acted_at = datetime('now') WHERE id = ?"
  ).run(req.user.id, advId);
  audit(db, { actorId: req.user.id, action: "REJECT", entity: "advance_request", entityId: advId });
  broadcast({ type: "advance_request", entity: "advance_requests", id: advId });
  notify(db, {
    userId: adv.employee_id, type: "advance_rejected", title: "Advance rejected",
    body: `Your ₹${adv.amount} advance request has been rejected`,
    link: "/my/expenses", entity: "advance_request", entityId: advId,
  });
  res.json({ ok: true, status: "REJECTED" });
});

export default router;
