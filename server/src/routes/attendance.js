import { Router } from "express";
import { requireAuth, requireRole, isManagerOf } from "../middleware/auth.js";
import { broadcast } from "../utils/sse.js";
import { audit } from "../utils/audit.js";
import { notify } from "../utils/notify.js";
import {
  attStatus,
  attDayValue,
  payableDays,
  daysInMonth,
  isWeekOff,
  holidayOn,
  empOnDate,
} from "@hrms/shared/attendance";
import {
  AttendanceMonthApproveSchema,
  AttendanceMonthRejectSchema,
} from "@hrms/shared/schemas";
import { z } from "zod";

const router = Router();

// ── DB helpers ────────────────────────────────────────────────────────────────

function getSettings(db) {
  const rows = db
    .prepare("SELECT key, value FROM settings WHERE key IN ('weekOffs','satOff')")
    .all();
  const m = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]));
  return { weekOffs: m.weekOffs ?? [0], satOff: m.satOff ?? "none" };
}

function getHolidays(db) {
  return db.prepare("SELECT date, name FROM holidays ORDER BY date").all();
}

function getLeaveTypes(db) {
  return db.prepare("SELECT code, paid FROM leave_types").all();
}

function getApprovedLeaves(db, { employeeIds, dateFrom, dateTo }) {
  if (!employeeIds.length) return [];
  const ph = employeeIds.map(() => "?").join(",");
  return db
    .prepare(
      `SELECT employee_id, type, date_from, date_to, half_from, half_to, status
       FROM leaves
       WHERE status = 'APPROVED'
         AND employee_id IN (${ph})
         AND date_from <= ?
         AND date_to   >= ?`
    )
    .all(...employeeIds, dateTo, dateFrom);
}

function getAttRows(db, { dates, employeeIds }) {
  if (!dates.length || !employeeIds.length) return [];
  const dp = dates.map(() => "?").join(",");
  const ep = employeeIds.map(() => "?").join(",");
  return db
    .prepare(`SELECT date, employee_id, code FROM attendance WHERE date IN (${dp}) AND employee_id IN (${ep})`)
    .all(...dates, ...employeeIds);
}

/** { date: { empId: code } } */
function buildAttMap(rows) {
  const m = {};
  for (const r of rows) {
    if (!m[r.date]) m[r.date] = {};
    m[r.date][r.employee_id] = r.code;
  }
  return m;
}

function pad2(n) { return String(n).padStart(2, "0"); }
function makeDates(ym) {
  const n = daysInMonth(ym);
  return Array.from({ length: n }, (_, i) => `${ym}-${pad2(i + 1)}`);
}

function getAttendanceMonth(db, employeeId, month) {
  return db.prepare("SELECT * FROM attendance_months WHERE employee_id=? AND month=?").get(employeeId, month);
}

/** { employeeId: status } for every attendance_months row in a month; missing → 'OPEN'. */
function getApprovalStatusMap(db, month) {
  const rows = db.prepare("SELECT employee_id, status FROM attendance_months WHERE month = ?").all(month);
  return Object.fromEntries(rows.map((r) => [r.employee_id, r.status]));
}

/**
 * Days in `dates` where `emp` was employed AND not covered by a holiday,
 * week-off, or approved leave, but has no manual attendance code.
 * Reuses the same priority-chain helpers as attStatus() — no second calendar impl.
 */
function computeMissingDates(emp, dates, { settings, holidays, leaves }, getAttCode) {
  const missing = [];
  for (const d of dates) {
    if (!empOnDate(emp, d)) continue;
    const code = getAttCode(d);
    const st = attStatus(emp, d, { settings, holidays, leaves, attCode: code });
    if (st === "L" || st === "H" || st === "WO") continue;
    if (!code) missing.push(d);
  }
  return missing;
}

function activeEmps(db, extra = "", params = []) {
  return db.prepare(`
    SELECT e.id, e.code, e.name, e.doj, e.status, e.exit_date,
           d.name AS dept
    FROM employees e
    LEFT JOIN departments d ON d.id = e.dept_id
    WHERE e.status != 'ONBOARDING' ${extra}
    ORDER BY e.name`).all(...params);
}

// ── GET /attendance?date=YYYY-MM-DD  (HR: daily register) ────────────────────
// ── GET /attendance?month=YYYY-MM   (HR: monthly grid)   ────────────────────

router.get("/", requireRole("HR", "ADMIN"), (req, res) => {
  const db = req.app.locals.db;

  // ─── daily ─────────────────────────────────────────────────────────────────
  if (req.query.date) {
    const dateStr = req.query.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr))
      return res.status(400).json({ error: "date must be YYYY-MM-DD" });

    const settings = getSettings(db);
    const holidays = getHolidays(db);
    const hol      = holidayOn(dateStr, holidays);
    const isOff    = isWeekOff(dateStr, settings);
    const emps     = activeEmps(db);
    const empIds   = emps.map((e) => e.id);

    const leaves   = getApprovedLeaves(db, { employeeIds: empIds, dateFrom: dateStr, dateTo: dateStr });
    const attRows  = getAttRows(db, { dates: [dateStr], employeeIds: empIds });
    const attMap   = buildAttMap(attRows);
    const leaveTypes = getLeaveTypes(db);
    const approvalMap = getApprovalStatusMap(db, dateStr.slice(0, 7));

    const employees = emps.map((emp) => {
      const code = (attMap[dateStr] || {})[emp.id] || null;
      const st   = attStatus(emp, dateStr, { settings, holidays, leaves, attCode: code });
      const lv   = leaves.find((l) => l.employee_id === emp.id);
      return {
        id: emp.id, code: emp.code, name: emp.name, dept: emp.dept || null,
        doj: emp.doj, status: emp.status,
        attStatus: st, attCode: code,
        leaveType: lv?.type || null,
        approvalStatus: approvalMap[emp.id] || "OPEN",
      };
    });

    return res.json({ date: dateStr, isWeekOff: isOff, holiday: hol || null, employees });
  }

  // ─── monthly ───────────────────────────────────────────────────────────────
  if (req.query.month) {
    const ym = req.query.month;
    if (!/^\d{4}-\d{2}$/.test(ym))
      return res.status(400).json({ error: "month must be YYYY-MM" });

    const dates    = makeDates(ym);
    const settings = getSettings(db);
    const holidays = getHolidays(db);
    const leaveTypes = getLeaveTypes(db);
    const emps     = activeEmps(db);
    const empIds   = emps.map((e) => e.id);

    const leaves   = getApprovedLeaves(db, { employeeIds: empIds, dateFrom: dates[0], dateTo: dates[dates.length - 1] });
    const attRows  = getAttRows(db, { dates, employeeIds: empIds });
    const attMap   = buildAttMap(attRows);
    const monthHols = holidays.filter((h) => h.date.startsWith(ym));
    const approvalMap = getApprovalStatusMap(db, ym);

    const employees = emps.map((emp) => {
      const dayCodes = dates.map((d) => {
        const code = (attMap[d] || {})[emp.id] || null;
        return attStatus(emp, d, { settings, holidays, leaves, attCode: code });
      });
      const pd = payableDays(
        emp, ym,
        { settings, holidays, leaves, leaveTypes },
        (d) => (attMap[d] || {})[emp.id] || null
      );
      return {
        id: emp.id, code: emp.code, name: emp.name, dept: emp.dept || null, dayCodes, payable: pd,
        approvalStatus: approvalMap[emp.id] || "OPEN",
      };
    });

    return res.json({ month: ym, days: dates.length, holidays: monthHols, employees });
  }

  return res.status(400).json({ error: "Provide ?date=YYYY-MM-DD or ?month=YYYY-MM" });
});

// ── GET /attendance/me?month=YYYY-MM  (any authenticated employee) ────────────

router.get("/me", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const ym = req.query.month;
  if (!ym || !/^\d{4}-\d{2}$/.test(ym))
    return res.status(400).json({ error: "Provide ?month=YYYY-MM" });

  const emp = db
    .prepare("SELECT id, doj, status, exit_date FROM employees WHERE id=?")
    .get(req.user.id);
  if (!emp) return res.status(404).json({ error: "Not found" });

  const dates    = makeDates(ym);
  const settings = getSettings(db);
  const holidays = getHolidays(db);
  const leaveTypes = getLeaveTypes(db);
  const leaves   = getApprovedLeaves(db, { employeeIds: [emp.id], dateFrom: dates[0], dateTo: dates[dates.length - 1] });
  const attRows  = getAttRows(db, { dates, employeeIds: [emp.id] });
  const attMap   = buildAttMap(attRows);
  const monthHols = holidays.filter((h) => h.date.startsWith(ym));

  const dayCodes = dates.map((d) => {
    const code = (attMap[d] || {})[emp.id] || null;
    return attStatus(emp, d, { settings, holidays, leaves, attCode: code });
  });
  const pd = payableDays(
    emp, ym,
    { settings, holidays, leaves, leaveTypes },
    (d) => (attMap[d] || {})[emp.id] || null
  );
  const missingDates = computeMissingDates(
    emp, dates, { settings, holidays, leaves },
    (d) => (attMap[d] || {})[emp.id] || null
  );

  const monthRow = getAttendanceMonth(db, emp.id, ym);
  let actedByName = null;
  if (monthRow?.acted_by) {
    actedByName = db.prepare("SELECT name FROM employees WHERE id=?").get(monthRow.acted_by)?.name || null;
  }
  const approval = {
    status: monthRow?.status || "OPEN",
    submitted_at: monthRow?.submitted_at || null,
    acted_by: actedByName,
    acted_at: monthRow?.acted_at || null,
    act_comment: monthRow?.act_comment || null,
  };

  res.json({ month: ym, days: dates.length, holidays: monthHols, dayCodes, payable: pd, approval, missingDates });
});

// ── GET /attendance/team?month=YYYY-MM  (manager: direct reports) ─────────────

router.get("/team", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const ym = req.query.month;
  if (!ym || !/^\d{4}-\d{2}$/.test(ym))
    return res.status(400).json({ error: "Provide ?month=YYYY-MM" });

  // HR/ADMIN see all; managers see direct reports only
  let emps;
  if (["HR", "ADMIN"].includes(req.user.role)) {
    emps = activeEmps(db);
  } else {
    emps = activeEmps(db, "AND e.manager_id = ?", [req.user.id]);
    if (!emps.length)
      return res.json({ month: ym, days: daysInMonth(ym), holidays: [], employees: [] });
  }

  const dates    = makeDates(ym);
  const settings = getSettings(db);
  const holidays = getHolidays(db);
  const leaveTypes = getLeaveTypes(db);
  const empIds   = emps.map((e) => e.id);
  const leaves   = getApprovedLeaves(db, { employeeIds: empIds, dateFrom: dates[0], dateTo: dates[dates.length - 1] });
  const attRows  = getAttRows(db, { dates, employeeIds: empIds });
  const attMap   = buildAttMap(attRows);
  const monthHols = holidays.filter((h) => h.date.startsWith(ym));

  const employees = emps.map((emp) => {
    const dayCodes = dates.map((d) => {
      const code = (attMap[d] || {})[emp.id] || null;
      return attStatus(emp, d, { settings, holidays, leaves, attCode: code });
    });
    const pd = payableDays(
      emp, ym,
      { settings, holidays, leaves, leaveTypes },
      (d) => (attMap[d] || {})[emp.id] || null
    );
    return { id: emp.id, code: emp.code, name: emp.name, dept: emp.dept || null, dayCodes, payable: pd };
  });

  res.json({ month: ym, days: dates.length, holidays: monthHols, employees });
});

// ── GET /attendance/team-calendar?month=YYYY-MM  (who's out view) ─────────────

router.get("/team-calendar", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const ym = req.query.month;
  if (!ym || !/^\d{4}-\d{2}$/.test(ym))
    return res.status(400).json({ error: "Provide ?month=YYYY-MM" });

  let emps;
  if (["HR", "ADMIN"].includes(req.user.role)) {
    emps = activeEmps(db);
  } else {
    emps = activeEmps(db, "AND e.manager_id = ?", [req.user.id]);
    if (!emps.length)
      return res.json({ month: ym, days: daysInMonth(ym), holidays: [], entries: [] });
  }

  const dates    = makeDates(ym);
  const settings = getSettings(db);
  const holidays = getHolidays(db);
  const empIds   = emps.map((e) => e.id);
  const leaves   = getApprovedLeaves(db, { employeeIds: empIds, dateFrom: dates[0], dateTo: dates[dates.length - 1] });
  const attRows  = getAttRows(db, { dates, employeeIds: empIds });
  const attMap   = buildAttMap(attRows);
  const monthHols = holidays.filter((h) => h.date.startsWith(ym));

  const empMap = Object.fromEntries(emps.map((e) => [e.id, e]));
  const entries = [];

  for (const d of dates) {
    const dayEntries = [];
    for (const emp of emps) {
      const attCode = (attMap[d] || {})[emp.id] || null;
      const status  = attStatus(emp, d, { settings, holidays, leaves, attCode });
      if (status === "L" || status === "WFH" || status === "OD" || status === "H") {
        const entry = { employee_id: emp.id, name: emp.name, dept: emp.dept || null, status };
        if (status === "L") {
          const lv = leaves.find(
            (l) => l.employee_id === emp.id && l.date_from <= d && l.date_to >= d
          );
          if (lv) entry.leave_type = lv.type;
        }
        dayEntries.push(entry);
      }
    }
    if (dayEntries.length > 0) {
      entries.push({ date: d, people: dayEntries });
    }
  }

  res.json({ month: ym, days: dates.length, holidays: monthHols, entries });
});

// ── PUT /attendance/my?month=YYYY-MM  {marks:{'YYYY-MM-DD':code|""}}  (self) ──

const MarksSchema = z.object({
  marks: z.record(
    z.string(),
    z.enum(["P", "A", "HD", "WFH", "OD", ""])
  ),
});

router.put("/my", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const ym = req.query.month;
  if (!ym || !/^\d{4}-\d{2}$/.test(ym))
    return res.status(400).json({ error: "Provide ?month=YYYY-MM" });

  const parsed = MarksSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { marks } = parsed.data;
  const entries = Object.entries(marks);
  if (!entries.length) return res.status(400).json({ error: "marks is empty" });

  const empId = req.user.id;
  const emp = db.prepare("SELECT id, doj, status, exit_date FROM employees WHERE id=?").get(empId);
  if (!emp) return res.status(404).json({ error: "Not found" });

  const monthRow = getAttendanceMonth(db, empId, ym);
  if (monthRow && (monthRow.status === "SUBMITTED" || monthRow.status === "APPROVED")) {
    return res.status(409).json({ error: `Cannot edit attendance while month is ${monthRow.status}` });
  }

  const validDates = new Set(makeDates(ym));
  for (const dateStr of Object.keys(marks)) {
    if (!validDates.has(dateStr))
      return res.status(400).json({ error: `${dateStr} is not in ${ym}` });
    if (!empOnDate(emp, dateStr))
      return res.status(400).json({ error: `${dateStr} is outside your employment window` });
  }

  const upsert = db.prepare(`
    INSERT INTO attendance(date, employee_id, code, marked_by, marked_at)
    VALUES(?, ?, ?, ?, datetime('now'))
    ON CONFLICT(date, employee_id)
    DO UPDATE SET code=excluded.code, marked_by=excluded.marked_by, marked_at=excluded.marked_at`);
  const del = db.prepare("DELETE FROM attendance WHERE date=? AND employee_id=?");

  db.transaction(() => {
    for (const [dateStr, code] of entries) {
      if (code === "") del.run(dateStr, empId);
      else             upsert.run(dateStr, empId, code, empId);
    }
    if (monthRow && monthRow.status === "REJECTED") {
      db.prepare("UPDATE attendance_months SET status='OPEN' WHERE employee_id=? AND month=?").run(empId, ym);
    }
  })();

  broadcast({ type: "mutation", entity: "attendance", id: ym });
  res.json({ ok: true, month: ym, marked: entries.length });
});

// ── POST /attendance/my/submit {month}  (self: submit for manager approval) ──

const SubmitSchema = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) });

router.post("/my/submit", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const parsed = SubmitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Provide {month: YYYY-MM}" });
  const { month: ym } = parsed.data;

  const empId = req.user.id;
  const emp = db.prepare("SELECT id, doj, status, exit_date FROM employees WHERE id=?").get(empId);
  if (!emp) return res.status(404).json({ error: "Not found" });

  const monthRow = getAttendanceMonth(db, empId, ym);
  const currentStatus = monthRow?.status || "OPEN";
  if (currentStatus === "SUBMITTED" || currentStatus === "APPROVED") {
    return res.status(409).json({ error: `Month is already ${currentStatus}` });
  }

  const dates    = makeDates(ym);
  const settings = getSettings(db);
  const holidays = getHolidays(db);
  const leaves   = getApprovedLeaves(db, { employeeIds: [empId], dateFrom: dates[0], dateTo: dates[dates.length - 1] });
  const attRows  = getAttRows(db, { dates, employeeIds: [empId] });
  const attMap   = buildAttMap(attRows);

  const missingDates = computeMissingDates(
    emp, dates, { settings, holidays, leaves },
    (d) => (attMap[d] || {})[empId] || null
  );
  if (missingDates.length > 0) {
    return res.status(400).json({
      error: `${missingDates.length} day(s) still need to be marked before you can submit`,
      missingDates,
    });
  }

  db.prepare(`
    INSERT INTO attendance_months(employee_id, month, status, submitted_at)
    VALUES(?, ?, 'SUBMITTED', datetime('now'))
    ON CONFLICT(employee_id, month)
    DO UPDATE SET status='SUBMITTED', submitted_at=excluded.submitted_at`
  ).run(empId, ym);

  audit(db, {
    actorId: empId, action: "SUBMIT", entity: "attendance_month",
    entityId: `${empId}:${ym}`, detail: { month: ym },
  });
  broadcast({ type: "mutation", entity: "attendance_months", id: `${empId}:${ym}` });

  // Notify direct manager, or all HR/ADMIN if the employee has no manager.
  const applicant = db.prepare("SELECT name, manager_id FROM employees WHERE id=?").get(empId);
  const notifBase = {
    type: "attendance_submitted", title: "Attendance submitted for approval",
    body: `${applicant?.name || "Employee"} submitted attendance for ${ym}`,
    link: "/team/attendance-approvals", entity: "attendance_month", entityId: `${empId}:${ym}`,
  };
  if (applicant?.manager_id) {
    notify(db, { ...notifBase, userId: applicant.manager_id });
  } else {
    const hrIds = db.prepare("SELECT id FROM employees WHERE role IN ('HR','ADMIN') AND status = 'ACTIVE'").all();
    for (const h of hrIds) notify(db, { ...notifBase, userId: h.id });
  }

  res.json({ ok: true, month: ym, status: "SUBMITTED" });
});

// ── GET /attendance/pending?month=  (SUBMITTED months awaiting the caller) ───

router.get("/pending", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const isHR = ["HR", "ADMIN"].includes(req.user.role);
  const ym = req.query.month;
  if (ym && !/^\d{4}-\d{2}$/.test(ym))
    return res.status(400).json({ error: "month must be YYYY-MM" });

  let where = "am.status = 'SUBMITTED'";
  const params = [];
  if (ym) { where += " AND am.month = ?"; params.push(ym); }
  if (!isHR) { where += " AND e.manager_id = ?"; params.push(req.user.id); }

  const rows = db.prepare(
    `SELECT am.employee_id, am.month, am.status, am.submitted_at,
            e.name as employee_name, e.code as employee_code
     FROM attendance_months am JOIN employees e ON am.employee_id = e.id
     WHERE ${where} ORDER BY am.submitted_at`
  ).all(...params);

  res.json(rows);
});

// ── POST /attendance/months/:employeeId/:month/approve|reject  (manager/HR) ──

function canActOnAttendanceMonth(db, actorId, actorRole, targetEmployeeId) {
  if (["HR", "ADMIN"].includes(actorRole)) return true;
  if (actorId === targetEmployeeId) return false; // never allow self-approval
  return isManagerOf(db, actorId, targetEmployeeId);
}

router.post("/months/:employeeId/:month/approve", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const employeeId = parseInt(req.params.employeeId, 10);
  const month = req.params.month;
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: "month must be YYYY-MM" });

  if (!canActOnAttendanceMonth(db, req.user.id, req.user.role, employeeId))
    return res.status(403).json({ error: "Not authorized to act on this month" });

  const monthRow = getAttendanceMonth(db, employeeId, month);
  if ((monthRow?.status || "OPEN") !== "SUBMITTED")
    return res.status(409).json({ error: "Only SUBMITTED months can be approved" });

  const parsed = AttendanceMonthApproveSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { comment } = parsed.data;

  db.prepare(
    `UPDATE attendance_months SET status='APPROVED', acted_by=?, acted_at=datetime('now'), act_comment=?
     WHERE employee_id=? AND month=?`
  ).run(req.user.id, comment || null, employeeId, month);

  audit(db, {
    actorId: req.user.id, action: "APPROVE", entity: "attendance_month",
    entityId: `${employeeId}:${month}`, detail: { month },
  });
  broadcast({ type: "mutation", entity: "attendance_months", id: `${employeeId}:${month}` });

  const approver = db.prepare("SELECT name FROM employees WHERE id=?").get(req.user.id);
  notify(db, {
    userId: employeeId, type: "attendance_approved", title: "Attendance approved",
    body: `Your attendance for ${month} was approved by ${approver?.name || "Manager"}`,
    link: "/my/attendance", entity: "attendance_month", entityId: `${employeeId}:${month}`,
  });

  res.json({ ok: true, status: "APPROVED" });
});

router.post("/months/:employeeId/:month/reject", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const employeeId = parseInt(req.params.employeeId, 10);
  const month = req.params.month;
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: "month must be YYYY-MM" });

  if (!canActOnAttendanceMonth(db, req.user.id, req.user.role, employeeId))
    return res.status(403).json({ error: "Not authorized to act on this month" });

  const monthRow = getAttendanceMonth(db, employeeId, month);
  if ((monthRow?.status || "OPEN") !== "SUBMITTED")
    return res.status(409).json({ error: "Only SUBMITTED months can be rejected" });

  const parsed = AttendanceMonthRejectSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { comment } = parsed.data;

  db.prepare(
    `UPDATE attendance_months SET status='REJECTED', acted_by=?, acted_at=datetime('now'), act_comment=?
     WHERE employee_id=? AND month=?`
  ).run(req.user.id, comment, employeeId, month);

  audit(db, {
    actorId: req.user.id, action: "REJECT", entity: "attendance_month",
    entityId: `${employeeId}:${month}`, detail: { month, comment },
  });
  broadcast({ type: "mutation", entity: "attendance_months", id: `${employeeId}:${month}` });

  const rejector = db.prepare("SELECT name FROM employees WHERE id=?").get(req.user.id);
  notify(db, {
    userId: employeeId, type: "attendance_rejected", title: "Attendance rejected",
    body: `Your attendance for ${month} was rejected by ${rejector?.name || "Manager"}: ${comment}`,
    link: "/my/attendance", entity: "attendance_month", entityId: `${employeeId}:${month}`,
  });

  res.json({ ok: true, status: "REJECTED" });
});

// ── PUT /attendance/:date  {marks:{empId:code|""}}  (HR only) ─────────────────

router.put("/:date", requireRole("HR", "ADMIN"), (req, res) => {
  const db      = req.app.locals.db;
  const dateStr = req.params.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr))
    return res.status(400).json({ error: "date must be YYYY-MM-DD" });

  const parsed = MarksSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { marks } = parsed.data;
  const actor    = req.user.id;
  const entries  = Object.entries(marks);
  if (!entries.length) return res.status(400).json({ error: "marks is empty" });

  const upsert = db.prepare(`
    INSERT INTO attendance(date, employee_id, code, marked_by, marked_at)
    VALUES(?, ?, ?, ?, datetime('now'))
    ON CONFLICT(date, employee_id)
    DO UPDATE SET code=excluded.code, marked_by=excluded.marked_by, marked_at=excluded.marked_at`);
  const del = db.prepare("DELETE FROM attendance WHERE date=? AND employee_id=?");

  // If a date's employee-month is already APPROVED, this write overrides HR's
  // own earlier approval — stamp it on the month row instead of silently
  // letting it look untouched (spec: "HR is the authority", month stays APPROVED).
  const ym = dateStr.slice(0, 7);
  const getMonthStatus = db.prepare("SELECT status FROM attendance_months WHERE employee_id=? AND month=?");
  const stampOverride = db.prepare(
    "UPDATE attendance_months SET hr_override_at=datetime('now'), hr_override_by=? WHERE employee_id=? AND month=?"
  );
  const overridden = [];

  db.transaction(() => {
    for (const [empIdStr, code] of entries) {
      const empId = Number(empIdStr);
      if (!empId) continue;
      if (code === "") del.run(dateStr, empId);
      else             upsert.run(dateStr, empId, code, actor);

      const monthRow = getMonthStatus.get(empId, ym);
      if (monthRow?.status === "APPROVED") {
        stampOverride.run(actor, empId, ym);
        overridden.push(empId);
      }
    }
  })();

  // Audit bulk marks (>1 employee in one call)
  if (entries.length > 1) {
    audit(db, {
      actorId: actor,
      action: "BULK_MARK",
      entity: "attendance",
      entityId: dateStr,
      detail: { count: entries.length, marks },
    });
  }

  for (const empId of overridden) {
    audit(db, {
      actorId: actor,
      action: "ATTENDANCE_OVERRIDE",
      entity: "attendance_month",
      entityId: `${empId}:${ym}`,
      detail: { date: dateStr, code: marks[empId] },
    });
  }

  broadcast({ type: "mutation", entity: "attendance", id: dateStr });
  res.json({ ok: true, date: dateStr, marked: entries.length, overridden });
});

export default router;
