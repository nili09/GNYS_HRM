import { Router } from "express";
import { requireAuth, requireHR, isManagerOf } from "../middleware/auth.js";
import { audit } from "../utils/audit.js";
import { broadcast } from "../utils/sse.js";
import { notify } from "../utils/notify.js";
import { ResignationSubmitSchema, ResignationActSchema } from "@hrms/shared/schemas";

const router = Router();

/* ── POST /resignation/submit — employee submits resignation ── */
router.post("/submit", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const emp = db.prepare("SELECT id, status, resignation_status, manager_id, name FROM employees WHERE id = ?").get(req.user.id);
  if (!emp) return res.status(404).json({ error: "Employee not found" });

  if (emp.status !== "ACTIVE") {
    return res.status(400).json({ error: "Only active employees can submit a resignation" });
  }
  if (emp.resignation_status === "PENDING") {
    return res.status(409).json({ error: "A resignation is already pending" });
  }

  const parse = ResignationSubmitSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.issues[0].message });
  const d = parse.data;

  db.prepare(`UPDATE employees SET
    resignation_type = ?, resignation_reason = ?, requestee_remarks = ?,
    resignation_intended_last_day = ?, resignation_status = 'PENDING',
    resignation_submitted_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?`
  ).run(d.resignation_type, d.resignation_reason, d.requestee_remarks ?? null,
    d.intended_last_day, req.user.id);

  audit(db, {
    actorId: req.user.id,
    action: "RESIGNATION_SUBMIT",
    entity: "employees",
    entityId: req.user.id,
    detail: { type: d.resignation_type, intended_last_day: d.intended_last_day },
  });

  // Notify manager (if exists) and all HR users. HR gets the employee list page;
  // non-HR managers have no dedicated resignation view so they get the dashboard.
  const hrUsers = db.prepare("SELECT id FROM employees WHERE role IN ('HR','ADMIN') AND status != 'EXITED'").all();
  const hrUserIds = new Set(hrUsers.map(h => h.id));
  const resignNotifiedIds = new Set();
  if (emp.manager_id && emp.manager_id !== req.user.id) {
    const managerLink = hrUserIds.has(emp.manager_id) ? "/hr/employees" : "/my/dashboard";
    notify(db, {
      userId: emp.manager_id, type: "RESIGNATION",
      title: "Resignation submitted", body: `${emp.name} has submitted a resignation`,
      link: managerLink, entity: "employees", entityId: req.user.id,
    });
    resignNotifiedIds.add(emp.manager_id);
  }
  for (const h of hrUsers) {
    if (h.id !== req.user.id && !resignNotifiedIds.has(h.id)) {
      notify(db, {
        userId: h.id, type: "RESIGNATION",
        title: "Resignation submitted", body: `${emp.name} has submitted a resignation`,
        link: "/hr/employees", entity: "employees", entityId: req.user.id,
      });
    }
  }

  broadcast({ type: "mutation", entity: "employees", id: req.user.id });
  res.json({ ok: true });
});

/* ── GET /resignation/my — get own resignation status ── */
router.get("/my", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const row = db.prepare(`SELECT resignation_type, resignation_reason, requestee_remarks,
    resignation_intended_last_day, resignation_status, resignation_submitted_at,
    approver_remarks, resignation_acted_at, exit_date
    FROM employees WHERE id = ?`).get(req.user.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  if (!row.resignation_status) return res.json({ status: null });
  res.json(row);
});

/* ── POST /resignation/cancel — employee cancels pending resignation ── */
router.post("/cancel", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const emp = db.prepare("SELECT id, resignation_status, name, manager_id FROM employees WHERE id = ?").get(req.user.id);
  if (!emp) return res.status(404).json({ error: "Not found" });

  if (emp.resignation_status !== "PENDING") {
    return res.status(400).json({ error: "Can only cancel a pending resignation" });
  }

  db.prepare(`UPDATE employees SET
    resignation_type = NULL, resignation_reason = NULL, requestee_remarks = NULL,
    resignation_intended_last_day = NULL, resignation_status = 'WITHDRAWN',
    resignation_submitted_at = NULL, updated_at = datetime('now')
    WHERE id = ?`
  ).run(req.user.id);

  audit(db, {
    actorId: req.user.id,
    action: "RESIGNATION_CANCEL",
    entity: "employees",
    entityId: req.user.id,
  });

  const hrUsersCan = db.prepare("SELECT id FROM employees WHERE role IN ('HR','ADMIN') AND status != 'EXITED'").all();
  const hrUserIdsCan = new Set(hrUsersCan.map(h => h.id));
  const cancelNotifiedIds = new Set();
  if (emp.manager_id && emp.manager_id !== req.user.id) {
    const managerLink = hrUserIdsCan.has(emp.manager_id) ? "/hr/employees" : "/my/dashboard";
    notify(db, {
      userId: emp.manager_id, type: "RESIGNATION",
      title: "Resignation withdrawn", body: `${emp.name} has withdrawn their resignation`,
      link: managerLink, entity: "employees", entityId: req.user.id,
    });
    cancelNotifiedIds.add(emp.manager_id);
  }
  for (const h of hrUsersCan) {
    if (h.id !== req.user.id && !cancelNotifiedIds.has(h.id)) {
      notify(db, {
        userId: h.id, type: "RESIGNATION",
        title: "Resignation withdrawn", body: `${emp.name} has withdrawn their resignation`,
        link: "/hr/employees", entity: "employees", entityId: req.user.id,
      });
    }
  }

  broadcast({ type: "mutation", entity: "employees", id: req.user.id });
  res.json({ ok: true });
});

/* ── POST /resignation/:id/act — manager/HR approves or rejects ── */
router.post("/:id/act", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const targetId = parseInt(req.params.id, 10);
  const isHR = ["HR", "ADMIN"].includes(req.user.role);
  const isManager = isManagerOf(db, req.user.id, targetId);

  if (!isHR && !isManager) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const emp = db.prepare("SELECT id, status, resignation_status, name FROM employees WHERE id = ?").get(targetId);
  if (!emp) return res.status(404).json({ error: "Employee not found" });
  if (emp.resignation_status !== "PENDING") {
    return res.status(400).json({ error: "No pending resignation to act on" });
  }

  const parse = ResignationActSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.issues[0].message });
  const d = parse.data;

  if (d.action === "APPROVE") {
    const lwd = d.last_working_day || db.prepare("SELECT resignation_intended_last_day FROM employees WHERE id = ?").get(targetId)?.resignation_intended_last_day;
    db.prepare(`UPDATE employees SET
      resignation_status = 'APPROVED', status = 'NOTICE',
      approver_remarks = ?, exit_date = ?,
      resignation_acted_by = ?, resignation_acted_at = datetime('now'),
      updated_at = datetime('now')
      WHERE id = ?`
    ).run(d.approver_remarks ?? null, lwd, req.user.id, targetId);
  } else {
    db.prepare(`UPDATE employees SET
      resignation_status = 'REJECTED', approver_remarks = ?,
      resignation_acted_by = ?, resignation_acted_at = datetime('now'),
      updated_at = datetime('now')
      WHERE id = ?`
    ).run(d.approver_remarks ?? null, req.user.id, targetId);
  }

  audit(db, {
    actorId: req.user.id,
    action: d.action === "APPROVE" ? "RESIGNATION_APPROVE" : "RESIGNATION_REJECT",
    entity: "employees",
    entityId: targetId,
    detail: { approver_remarks: d.approver_remarks },
  });

  notify(db, {
    userId: targetId,
    type: "RESIGNATION",
    title: d.action === "APPROVE" ? "Resignation approved" : "Resignation rejected",
    body: d.action === "APPROVE"
      ? "Your resignation has been approved"
      : "Your resignation has been rejected",
    link: `/my/resignation`,
    entity: "employees",
    entityId: targetId,
  });

  broadcast({ type: "mutation", entity: "employees", id: targetId });
  res.json({ ok: true });
});

/* ── GET /resignation/pending — HR/manager sees pending resignations ── */
router.get("/pending", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const isHR = ["HR", "ADMIN"].includes(req.user.role);

  let rows;
  if (isHR) {
    rows = db.prepare(`SELECT e.id, e.code, e.name, e.resignation_type, e.resignation_reason,
      e.requestee_remarks, e.resignation_intended_last_day, e.resignation_submitted_at
      FROM employees e WHERE e.resignation_status = 'PENDING' ORDER BY e.resignation_submitted_at DESC`).all();
  } else {
    rows = db.prepare(`SELECT e.id, e.code, e.name, e.resignation_type, e.resignation_reason,
      e.requestee_remarks, e.resignation_intended_last_day, e.resignation_submitted_at
      FROM employees e WHERE e.resignation_status = 'PENDING' AND e.manager_id = ?
      ORDER BY e.resignation_submitted_at DESC`).all(req.user.id);
    if (rows.length === 0) return res.status(403).json({ error: "Forbidden" });
  }

  res.json(rows);
});

export default router;
