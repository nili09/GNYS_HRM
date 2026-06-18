import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { broadcast } from "../utils/sse.js";
import { audit } from "../utils/audit.js";
import {
  attStatus,
  attDayValue,
  payableDays,
  daysInMonth,
  isWeekOff,
  holidayOn,
} from "@hrms/shared/attendance";
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

    const employees = emps.map((emp) => {
      const code = (attMap[dateStr] || {})[emp.id] || null;
      const st   = attStatus(emp, dateStr, { settings, holidays, leaves, attCode: code });
      const lv   = leaves.find((l) => l.employee_id === emp.id);
      return {
        id: emp.id, code: emp.code, name: emp.name, dept: emp.dept || null,
        doj: emp.doj, status: emp.status,
        attStatus: st, attCode: code,
        leaveType: lv?.type || null,
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

  res.json({ month: ym, days: dates.length, holidays: monthHols, dayCodes, payable: pd });
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

// ── PUT /attendance/:date  {marks:{empId:code|""}}  (HR only) ─────────────────

const MarksSchema = z.object({
  marks: z.record(
    z.string(),
    z.enum(["P", "A", "HD", "WFH", "OD", ""])
  ),
});

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

  db.transaction(() => {
    for (const [empIdStr, code] of entries) {
      const empId = Number(empIdStr);
      if (!empId) continue;
      if (code === "") del.run(dateStr, empId);
      else             upsert.run(dateStr, empId, code, actor);
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

  broadcast({ type: "mutation", entity: "attendance", id: dateStr });
  res.json({ ok: true, date: dateStr, marked: entries.length });
});

export default router;
