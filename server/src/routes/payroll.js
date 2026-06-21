import { Router } from "express";
import { requireAuth, requireHR } from "../middleware/auth.js";
import { broadcast } from "../utils/sse.js";
import { audit } from "../utils/audit.js";
import { notifyMany } from "../utils/notify.js";
import { payableDays, daysInMonth, pad2 } from "@hrms/shared/attendance";
import { computePayLine, monthlyGross } from "@hrms/shared/payroll";

const router = Router();

// ── DB helpers ───────────────────────────────────────────────────────────────

function getSettings(db) {
  const rows = db
    .prepare(
      "SELECT key, value FROM settings WHERE key IN ('weekOffs','satOff','pfEnabled','pfCapWages','esiEnabled','ptEnabled')"
    )
    .all();
  const m = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]));
  return {
    weekOffs: m.weekOffs ?? [0],
    satOff: m.satOff ?? "none",
    pfEnabled: m.pfEnabled ?? true,
    pfCapWages: m.pfCapWages ?? true,
    esiEnabled: m.esiEnabled ?? true,
    ptEnabled: m.ptEnabled ?? true,
  };
}

function getHolidays(db) {
  return db.prepare("SELECT date, name FROM holidays ORDER BY date").all();
}

function getLeaveTypes(db) {
  return db.prepare("SELECT code, name, paid FROM leave_types").all();
}

function getApprovedLeaves(db) {
  return db
    .prepare(
      "SELECT employee_id, type, date_from, date_to, half_from, half_to, status FROM leaves WHERE status='APPROVED'"
    )
    .all();
}

function getAttendanceForMonth(db, ym) {
  return db
    .prepare("SELECT date, employee_id, code FROM attendance WHERE date LIKE ?")
    .all(`${ym}-%`);
}

/**
 * Get the active salary structure for an employee in a given month.
 * Active = latest effective_from ≤ first day of month.
 */
function getActiveSalary(db, employeeId, ym) {
  const monthStart = `${ym}-01`;
  return db
    .prepare(
      `SELECT * FROM salary_structures
       WHERE employee_id = ? AND effective_from <= ?
       ORDER BY effective_from DESC LIMIT 1`
    )
    .get(employeeId, monthStart);
}

/**
 * Get eligible employees for a payroll run.
 * Exclude: ONBOARDING, not employed in month, zero-salary, zero-payable.
 */
function getEligibleEmployees(db, ym) {
  const monthStart = `${ym}-01`;
  const [y, m] = ym.split("-").map(Number);
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const monthEnd = `${ym}-${pad2(dim)}`;

  return db
    .prepare(
      `SELECT id, code, name, gender, doj, status, exit_date, pf_opt, esi_opt, pt_opt, tds_override, bank_name, bank_acc, ifsc
       FROM employees
       WHERE status != 'ONBOARDING'
         AND doj <= ?
         AND (status != 'EXITED' OR exit_date >= ?)`
    )
    .all(monthEnd, monthStart);
}

// ── Generate payroll lines for a run ─────────────────────────────────────────

function generateLines(db, ym) {
  const settings = getSettings(db);
  const holidays = getHolidays(db);
  const leaveTypes = getLeaveTypes(db);
  const leaves = getApprovedLeaves(db);
  const attRows = getAttendanceForMonth(db, ym);
  const totalDays = daysInMonth(ym);

  // Build attendance lookup: date+empId → code
  const attMap = new Map();
  for (const r of attRows) {
    attMap.set(`${r.date}:${r.employee_id}`, r.code);
  }

  const employees = getEligibleEmployees(db, ym);
  const lines = [];

  for (const emp of employees) {
    const sal = getActiveSalary(db, emp.id, ym);
    if (!sal) continue; // no salary structure → skip
    const gross = monthlyGross(sal);
    if (gross <= 0) continue; // zero salary → skip

    // Compute payable days using attendance engine
    const calSettings = { weekOffs: settings.weekOffs, satOff: settings.satOff };
    const payable = payableDays(
      emp,
      ym,
      { settings: calSettings, holidays, leaves, leaveTypes },
      (dateStr) => attMap.get(`${dateStr}:${emp.id}`) || null
    );

    if (payable <= 0) continue; // zero payable → skip

    const paySettings = {
      pfEnabled: settings.pfEnabled,
      pfCapWages: settings.pfCapWages,
      esiEnabled: settings.esiEnabled,
      ptEnabled: settings.ptEnabled,
    };

    const line = computePayLine(emp, sal, ym, paySettings, payable, totalDays);
    lines.push(line);
  }

  return lines;
}

// ── Routes ───────────────────────────────────────────────────────────────────

// GET /payroll/runs — list all runs (HR only)
router.get("/runs", ...requireHR, (req, res) => {
  const db = req.app.locals.db;
  const runs = db
    .prepare("SELECT * FROM payroll_runs ORDER BY month DESC")
    .all();
  res.json(runs);
});

// GET /payroll/runs/:id — run detail with lines
router.get("/runs/:id", ...requireHR, (req, res) => {
  const db = req.app.locals.db;
  const run = db.prepare("SELECT * FROM payroll_runs WHERE id=?").get(req.params.id);
  if (!run) return res.status(404).json({ error: "Run not found" });
  const lines = db
    .prepare(
      `SELECT pl.*, e.code as emp_code, e.name as emp_name, e.bank_name, e.bank_acc, e.ifsc
       FROM payroll_lines pl JOIN employees e ON pl.employee_id=e.id
       WHERE pl.run_id=? ORDER BY e.code`
    )
    .all(run.id);
  res.json({ run, lines });
});

// POST /payroll/runs — generate a draft run (HR only)
router.post("/runs", ...requireHR, (req, res) => {
  const db = req.app.locals.db;
  const { month } = req.body;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: "Invalid month format (YYYY-MM)" });
  }

  // Check for existing run
  const existing = db.prepare("SELECT * FROM payroll_runs WHERE month=?").get(month);
  if (existing) {
    return res.status(409).json({ error: "Run already exists for this month" });
  }

  const result = db
    .prepare("INSERT INTO payroll_runs(month) VALUES(?)")
    .run(month);
  const runId = Number(result.lastInsertRowid);

  const lines = generateLines(db, month);

  // Insert lines
  const insertLine = db.prepare(
    `INSERT INTO payroll_lines(run_id, employee_id, payable, month_days,
       earn_basic, earn_hra, earn_conv, earn_medical, earn_lta, earn_special, earn_other,
       gross, ded_pf, ded_esi, ded_pt, ded_tds, net, er_epf, er_eps, er_esi, esi_covered)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const insertMany = db.transaction((lines) => {
    for (const l of lines) {
      insertLine.run(
        runId,
        l.employee_id,
        l.payable,
        l.month_days,
        l.earn_basic,
        l.earn_hra,
        l.earn_conv,
        l.earn_medical,
        l.earn_lta,
        l.earn_special,
        l.earn_other,
        l.gross,
        l.ded_pf,
        l.ded_esi,
        l.ded_pt,
        l.ded_tds,
        l.net,
        l.er_epf,
        l.er_eps,
        l.er_esi,
        l.esi_covered
      );
    }
  });
  insertMany(lines);

  audit(db, {
    actorId: req.user.id,
    action: "generate",
    entity: "payroll_run",
    entityId: String(runId),
    detail: JSON.stringify({ month, lineCount: lines.length }),
  });

  const run = db.prepare("SELECT * FROM payroll_runs WHERE id=?").get(runId);
  const savedLines = db
    .prepare(
      `SELECT pl.*, e.code as emp_code, e.name as emp_name
       FROM payroll_lines pl JOIN employees e ON pl.employee_id=e.id
       WHERE pl.run_id=? ORDER BY e.code`
    )
    .all(runId);

  broadcast({ type: "mutation", entity: "payroll", id: runId });
  res.status(201).json({ run, lines: savedLines });
});

// POST /payroll/runs/:id/regenerate — re-calc a DRAFT run
router.post("/runs/:id/regenerate", ...requireHR, (req, res) => {
  const db = req.app.locals.db;
  const run = db.prepare("SELECT * FROM payroll_runs WHERE id=?").get(req.params.id);
  if (!run) return res.status(404).json({ error: "Run not found" });
  if (run.status !== "DRAFT") {
    return res.status(400).json({ error: "Can only regenerate DRAFT runs" });
  }

  // Delete old lines
  db.prepare("DELETE FROM payroll_lines WHERE run_id=?").run(run.id);

  const lines = generateLines(db, run.month);

  const insertLine = db.prepare(
    `INSERT INTO payroll_lines(run_id, employee_id, payable, month_days,
       earn_basic, earn_hra, earn_conv, earn_medical, earn_lta, earn_special, earn_other,
       gross, ded_pf, ded_esi, ded_pt, ded_tds, net, er_epf, er_eps, er_esi, esi_covered)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertMany = db.transaction((lines) => {
    for (const l of lines) {
      insertLine.run(
        run.id,
        l.employee_id,
        l.payable,
        l.month_days,
        l.earn_basic,
        l.earn_hra,
        l.earn_conv,
        l.earn_medical,
        l.earn_lta,
        l.earn_special,
        l.earn_other,
        l.gross,
        l.ded_pf,
        l.ded_esi,
        l.ded_pt,
        l.ded_tds,
        l.net,
        l.er_epf,
        l.er_eps,
        l.er_esi,
        l.esi_covered
      );
    }
  });
  insertMany(lines);

  const savedLines = db
    .prepare(
      `SELECT pl.*, e.code as emp_code, e.name as emp_name
       FROM payroll_lines pl JOIN employees e ON pl.employee_id=e.id
       WHERE pl.run_id=? ORDER BY e.code`
    )
    .all(run.id);

  broadcast({ type: "mutation", entity: "payroll", id: run.id });
  res.json({ run, lines: savedLines });
});

// POST /payroll/runs/:id/finalize
router.post("/runs/:id/finalize", ...requireHR, (req, res) => {
  const db = req.app.locals.db;
  const run = db.prepare("SELECT * FROM payroll_runs WHERE id=?").get(req.params.id);
  if (!run) return res.status(404).json({ error: "Run not found" });
  if (run.status !== "DRAFT") {
    return res.status(400).json({ error: "Can only finalize DRAFT runs" });
  }

  db.prepare(
    "UPDATE payroll_runs SET status='FINAL', finalized_at=datetime('now') WHERE id=?"
  ).run(run.id);

  audit(db, {
    actorId: req.user.id,
    action: "finalize",
    entity: "payroll_run",
    entityId: String(run.id),
    detail: JSON.stringify({ month: run.month }),
  });

  broadcast({ type: "mutation", entity: "payroll", id: run.id });

  // Notify every employee included in the run that their payslip is ready
  const lines = db.prepare("SELECT employee_id FROM payroll_lines WHERE run_id = ?").all(run.id);
  if (lines.length > 0) {
    notifyMany(db, lines.map(l => l.employee_id), {
      type: "payslip_ready",
      title: "Your payslip is ready",
      body: `Payslip for ${run.month} has been finalized`,
      link: "/my/payslips",
      entity: "payroll_run",
      entityId: run.id,
    });
  }

  res.json({ ...run, status: "FINAL", finalized_at: new Date().toISOString() });
});

// POST /payroll/runs/:id/reopen
router.post("/runs/:id/reopen", ...requireHR, (req, res) => {
  const db = req.app.locals.db;
  const run = db.prepare("SELECT * FROM payroll_runs WHERE id=?").get(req.params.id);
  if (!run) return res.status(404).json({ error: "Run not found" });
  if (run.status !== "FINAL") {
    return res.status(400).json({ error: "Can only reopen FINAL runs" });
  }

  db.prepare(
    "UPDATE payroll_runs SET status='DRAFT', finalized_at=NULL WHERE id=?"
  ).run(run.id);

  audit(db, {
    actorId: req.user.id,
    action: "reopen",
    entity: "payroll_run",
    entityId: String(run.id),
    detail: JSON.stringify({ month: run.month }),
  });

  broadcast({ type: "mutation", entity: "payroll", id: run.id });
  res.json({ ...run, status: "DRAFT", finalized_at: null });
});

// GET /payroll/runs/:id/register.csv — full register export (HR only)
router.get("/runs/:id/register.csv", ...requireHR, (req, res) => {
  const db = req.app.locals.db;
  const run = db.prepare("SELECT * FROM payroll_runs WHERE id=?").get(req.params.id);
  if (!run) return res.status(404).json({ error: "Run not found" });

  const lines = db
    .prepare(
      `SELECT pl.*, e.code as emp_code, e.name as emp_name
       FROM payroll_lines pl JOIN employees e ON pl.employee_id=e.id
       WHERE pl.run_id=? ORDER BY e.code`
    )
    .all(run.id);

  const headers = [
    "Employee Code",
    "Employee Name",
    "Payable Days",
    "Month Days",
    "Basic",
    "HRA",
    "Conveyance",
    "Medical",
    "LTA",
    "Special",
    "Other",
    "Gross",
    "PF",
    "ESI",
    "PT",
    "TDS",
    "Net",
    "ER EPF",
    "ER EPS",
    "ER ESI",
  ];
  const rows = lines.map((l) =>
    [
      l.emp_code,
      `"${l.emp_name}"`,
      l.payable,
      l.month_days,
      l.earn_basic,
      l.earn_hra,
      l.earn_conv,
      l.earn_medical,
      l.earn_lta,
      l.earn_special,
      l.earn_other,
      l.gross,
      l.ded_pf,
      l.ded_esi,
      l.ded_pt,
      l.ded_tds,
      l.net,
      l.er_epf,
      l.er_eps,
      l.er_esi,
    ].join(",")
  );

  const csv = [headers.join(","), ...rows].join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="payroll-register-${run.month}.csv"`
  );
  res.send(csv);
});

// GET /payroll/runs/:id/bank.csv — bank transfer file (HR only)
router.get("/runs/:id/bank.csv", ...requireHR, (req, res) => {
  const db = req.app.locals.db;
  const run = db.prepare("SELECT * FROM payroll_runs WHERE id=?").get(req.params.id);
  if (!run) return res.status(404).json({ error: "Run not found" });

  const lines = db
    .prepare(
      `SELECT pl.net, e.code as emp_code, e.name as emp_name, e.bank_name, e.bank_acc, e.ifsc
       FROM payroll_lines pl JOIN employees e ON pl.employee_id=e.id
       WHERE pl.run_id=? AND pl.net > 0 ORDER BY e.code`
    )
    .all(run.id);

  const headers = [
    "Employee Code",
    "Employee Name",
    "Bank Name",
    "Account Number",
    "IFSC",
    "Net Amount",
  ];
  const rows = lines.map((l) =>
    [
      l.emp_code,
      `"${l.emp_name}"`,
      `"${l.bank_name || ""}"`,
      l.bank_acc || "",
      l.ifsc || "",
      l.net,
    ].join(",")
  );

  const csv = [headers.join(","), ...rows].join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="bank-transfer-${run.month}.csv"`
  );
  res.send(csv);
});

// GET /payroll/payslip/:lineId — view a single payslip
router.get("/payslip/:lineId", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const line = db
    .prepare(
      `SELECT pl.*, pr.month, pr.status as run_status, pr.finalized_at,
              e.code as emp_code, e.name as emp_name, e.gender, e.doj,
              e.dept_id, e.desig_id, e.pan, e.uan, e.pf_no, e.esi_no,
              e.bank_name, e.bank_acc, e.ifsc
       FROM payroll_lines pl
       JOIN payroll_runs pr ON pl.run_id=pr.id
       JOIN employees e ON pl.employee_id=e.id
       WHERE pl.id=?`
    )
    .get(req.params.lineId);

  if (!line) return res.status(404).json({ error: "Payslip not found" });

  const isHR = ["HR", "ADMIN"].includes(req.user.role);
  const isSelf = line.employee_id === req.user.id;

  // Employee can only view own, finalized payslips
  if (!isHR) {
    if (!isSelf) return res.status(403).json({ error: "Forbidden" });
    if (line.run_status !== "FINAL") {
      return res.status(403).json({ error: "Payslip not yet finalized" });
    }
  }

  // Enrich with dept/desig names
  const dept = line.dept_id
    ? db.prepare("SELECT name FROM departments WHERE id=?").get(line.dept_id)
    : null;
  const desig = line.desig_id
    ? db.prepare("SELECT name FROM designations WHERE id=?").get(line.desig_id)
    : null;

  res.json({
    ...line,
    dept_name: dept?.name || null,
    desig_name: desig?.name || null,
  });
});

// GET /payroll/my-payslips — employee's own finalized payslips
router.get("/my-payslips", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const rows = db
    .prepare(
      `SELECT pl.id, pl.gross, pl.net, pl.payable, pl.month_days, pr.month, pr.finalized_at
       FROM payroll_lines pl
       JOIN payroll_runs pr ON pl.run_id=pr.id
       WHERE pl.employee_id=? AND pr.status='FINAL'
       ORDER BY pr.month DESC`
    )
    .all(req.user.id);
  res.json(rows);
});

export default router;
