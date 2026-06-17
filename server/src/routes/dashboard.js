import { Router } from "express";
import { requireAuth, requireHR } from "../middleware/auth.js";
import { attStatus, daysInMonth, pad2, payableDays } from "@hrms/shared/attendance";

const router = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

function todayStr() {
  // Asia/Kolkata fixed
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function thisMonth() {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

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
  return db.prepare("SELECT code, name, paid FROM leave_types").all();
}

function getApprovedLeaves(db) {
  return db
    .prepare("SELECT employee_id, type, date_from, date_to, half_from, half_to, status FROM leaves WHERE status='APPROVED'")
    .all();
}

// ── GET /dashboard/hr — HR head dashboard ────────────────────────────────────

router.get("/hr", ...requireHR, (req, res) => {
  const db = req.app.locals.db;
  const today = todayStr();
  const ym = thisMonth();
  const settings = getSettings(db);
  const holidays = getHolidays(db);
  const leaves = getApprovedLeaves(db);

  // Headcount
  const active = db.prepare("SELECT COUNT(*) as c FROM employees WHERE status='ACTIVE'").get().c;
  const onboarding = db.prepare("SELECT COUNT(*) as c FROM employees WHERE status='ONBOARDING'").get().c;
  const notice = db.prepare("SELECT COUNT(*) as c FROM employees WHERE status='NOTICE'").get().c;
  const total = db.prepare("SELECT COUNT(*) as c FROM employees WHERE status IN ('ACTIVE','ONBOARDING','NOTICE')").get().c;

  // Today's attendance
  const activeEmps = db.prepare("SELECT id, doj, status, exit_date FROM employees WHERE status IN ('ACTIVE','NOTICE')").all();
  const todayMarks = db.prepare("SELECT employee_id, code FROM attendance WHERE date=?").all(today);
  const markMap = new Map(todayMarks.map((m) => [m.employee_id, m.code]));

  let presentToday = 0;
  let onLeaveToday = 0;
  for (const emp of activeEmps) {
    const code = attStatus(emp, today, {
      settings, holidays, leaves,
      attCode: markMap.get(emp.id) || null,
    });
    if (["P", "HD", "WFH", "OD"].includes(code)) presentToday++;
    if (code === "L") onLeaveToday++;
  }

  // Pending leave approvals with aging
  const pendingLeaves = db
    .prepare(
      `SELECT l.id, l.employee_id, l.type, l.date_from, l.date_to, l.days, l.applied_at, l.reason,
              e.name as emp_name, e.code as emp_code
       FROM leaves l JOIN employees e ON l.employee_id=e.id
       WHERE l.status='PENDING' ORDER BY l.applied_at ASC LIMIT 10`
    )
    .all();
  const pendingCount = db.prepare("SELECT COUNT(*) as c FROM leaves WHERE status='PENDING'").get().c;

  // Dept distribution
  const deptDist = db
    .prepare(
      `SELECT COALESCE(d.name, 'Unassigned') as dept, COUNT(*) as count
       FROM employees e LEFT JOIN departments d ON e.dept_id=d.id
       WHERE e.status IN ('ACTIVE','NOTICE')
       GROUP BY dept ORDER BY count DESC`
    )
    .all();

  // Payroll status
  const latestRun = db.prepare("SELECT * FROM payroll_runs ORDER BY month DESC LIMIT 1").get();
  const finalizedRuns = db.prepare("SELECT COUNT(*) as c FROM payroll_runs WHERE status='FINAL'").get().c;

  // Joiners/exits this month
  const joiners = db
    .prepare("SELECT id, name, code, doj FROM employees WHERE doj LIKE ? ORDER BY doj")
    .all(`${ym}-%`);
  const exits = db
    .prepare("SELECT id, name, code, exit_date FROM employees WHERE exit_date LIKE ? AND status='EXITED' ORDER BY exit_date")
    .all(`${ym}-%`);

  // Upcoming holidays (next 5)
  const upcomingHolidays = holidays.filter((h) => h.date >= today).slice(0, 5);

  // Upcoming birthdays (next 30 days)
  const allEmps = db
    .prepare("SELECT id, name, code, dob FROM employees WHERE status IN ('ACTIVE','NOTICE') AND dob IS NOT NULL")
    .all();
  const birthdays = [];
  const now = new Date(today + "T00:00:00Z");
  for (const emp of allEmps) {
    if (!emp.dob) continue;
    const [, bm, bd] = emp.dob.split("-").map(Number);
    let next = new Date(Date.UTC(now.getUTCFullYear(), bm - 1, bd));
    if (next < now) next = new Date(Date.UTC(now.getUTCFullYear() + 1, bm - 1, bd));
    const diff = Math.floor((next - now) / 86400000);
    if (diff <= 30) {
      birthdays.push({ id: emp.id, name: emp.name, code: emp.code, date: `${pad2(bm)}/${pad2(bd)}`, daysAway: diff });
    }
  }
  birthdays.sort((a, b) => a.daysAway - b.daysAway);

  // ── Recruitment KPIs ──
  const openPositions = db.prepare("SELECT COUNT(*) as c FROM job_openings WHERE status='OPEN'").get().c;
  const candidatesInPipeline = db.prepare(
    "SELECT COUNT(*) as c FROM applications WHERE status NOT IN ('HIRED','REJECTED')"
  ).get().c;
  const hiredThisMonth = db.prepare(
    "SELECT COUNT(*) as c FROM applications WHERE status='HIRED' AND updated_at LIKE ?"
  ).get(`${ym}-%`).c;
  const avgHireRow = db.prepare(
    `SELECT AVG(julianday(a.updated_at) - julianday(a.applied_at)) as avg_days
     FROM applications a WHERE a.status='HIRED'`
  ).get();
  const avgDaysToHire = avgHireRow?.avg_days ? Math.round(avgHireRow.avg_days) : 0;

  // ── Expenses KPIs ──
  const expPending = db.prepare(
    "SELECT COUNT(*) as c, COALESCE(SUM(amount),0) as total FROM expenses WHERE status='PENDING'"
  ).get();
  const settledThisMonth = db.prepare(
    "SELECT COUNT(*) as c FROM expenses WHERE status='SETTLED' AND settled_in_month=?"
  ).get(ym).c;

  // ── Performance KPIs ──
  const activeCycle = db.prepare("SELECT id, name FROM review_cycles WHERE status='ACTIVE' ORDER BY id DESC LIMIT 1").get();
  let perfCompletionRate = 0;
  let pendingReviews = 0;
  if (activeCycle) {
    const totalReviews = db.prepare("SELECT COUNT(*) as c FROM reviews WHERE cycle_id=?").get(activeCycle.id).c;
    const submitted = db.prepare("SELECT COUNT(*) as c FROM reviews WHERE cycle_id=? AND status='SUBMITTED'").get(activeCycle.id).c;
    perfCompletionRate = totalReviews > 0 ? Math.round((submitted / totalReviews) * 100) : 0;
    pendingReviews = totalReviews - submitted;
  }

  // ── Engagement KPIs ──
  const activeSurveys = db.prepare("SELECT COUNT(*) as c FROM surveys WHERE status='ACTIVE'").get().c;
  const surveyParticipation = (() => {
    const s = db.prepare("SELECT id FROM surveys WHERE status='ACTIVE'").all();
    if (s.length === 0) return 0;
    const totalActive = db.prepare("SELECT COUNT(*) as c FROM employees WHERE status='ACTIVE'").get().c;
    let totalParticipants = 0;
    for (const sv of s) {
      const responded = db.prepare(
        "SELECT COUNT(DISTINCT employee_id) as c FROM survey_responses WHERE survey_id=?"
      ).get(sv.id).c;
      totalParticipants += responded;
    }
    return totalActive > 0 ? Math.round((totalParticipants / (s.length * totalActive)) * 100) : 0;
  })();
  const weekAgo = (() => {
    const d = new Date(today + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 7);
    return d.toISOString().slice(0, 10);
  })();
  const recognitionsThisWeek = db.prepare(
    "SELECT COUNT(*) as c FROM recognitions WHERE created_at >= ?"
  ).get(weekAgo).c;

  // ── Assets KPIs ──
  const totalAssets = db.prepare("SELECT COUNT(*) as c FROM assets").get().c;
  const assignedAssets = db.prepare("SELECT COUNT(*) as c FROM assets WHERE status='ASSIGNED'").get().c;
  const inRepairAssets = db.prepare("SELECT COUNT(*) as c FROM assets WHERE status='IN_REPAIR'").get().c;

  // ── Helpdesk KPIs ──
  const openTickets = db.prepare("SELECT COUNT(*) as c FROM tickets WHERE status IN ('OPEN','IN_PROGRESS')").get().c;
  const urgentTickets = db.prepare(
    "SELECT COUNT(*) as c FROM tickets WHERE priority='URGENT' AND status IN ('OPEN','IN_PROGRESS')"
  ).get().c;
  const avgResRow = db.prepare(
    `SELECT AVG((julianday(resolved_at) - julianday(created_at)) * 24) as avg_hrs
     FROM tickets WHERE resolved_at IS NOT NULL`
  ).get();
  const avgResolutionHours = avgResRow?.avg_hrs ? Math.round(avgResRow.avg_hrs) : 0;

  res.json({
    headcount: { active, onboarding, notice, total },
    today: { present: presentToday, onLeave: onLeaveToday, total: activeEmps.length, date: today },
    pendingLeaves: { items: pendingLeaves, total: pendingCount },
    deptDistribution: deptDist,
    payroll: { latestRun, finalizedRuns },
    joiners,
    exits,
    upcomingHolidays,
    birthdays: birthdays.slice(0, 8),
    recruitment: { openPositions, candidatesInPipeline, hiredThisMonth, avgDaysToHire },
    expenses: { pendingCount: expPending.c, pendingAmount: expPending.total, settledThisMonth },
    performance: { activeCycle: activeCycle?.name || null, completionRate: perfCompletionRate, pendingReviews },
    engagement: { activeSurveys, participationRate: surveyParticipation, recognitionsThisWeek },
    assets: { total: totalAssets, assigned: assignedAssets, inRepair: inRepairAssets },
    helpdesk: { openTickets, avgResolutionHours, urgentCount: urgentTickets },
  });
});

// ── GET /dashboard/manager — manager dashboard ──────────────────────────────

router.get("/manager", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const today = todayStr();
  const settings = getSettings(db);
  const holidays = getHolidays(db);
  const leaves = getApprovedLeaves(db);

  // Direct reports
  const reports = db
    .prepare("SELECT id, name, code, doj, status, exit_date FROM employees WHERE manager_id=? AND status IN ('ACTIVE','NOTICE')")
    .all(req.user.id);

  if (reports.length === 0) {
    return res.json({ isManager: false, reports: [], outToday: [], pending: [], summary: {} });
  }

  // Who's out today
  const todayMarks = db.prepare("SELECT employee_id, code FROM attendance WHERE date=?").all(today);
  const markMap = new Map(todayMarks.map((m) => [m.employee_id, m.code]));

  const outToday = [];
  for (const emp of reports) {
    const code = attStatus(emp, today, {
      settings, holidays, leaves,
      attCode: markMap.get(emp.id) || null,
    });
    if (code === "L") outToday.push({ id: emp.id, name: emp.name, code: emp.code });
  }

  // Pending approvals for direct reports
  const reportIds = reports.map((r) => r.id);
  const placeholders = reportIds.map(() => "?").join(",");
  const pending = reportIds.length
    ? db
        .prepare(
          `SELECT l.id, l.employee_id, l.type, l.date_from, l.date_to, l.days, l.applied_at,
                  e.name as emp_name
           FROM leaves l JOIN employees e ON l.employee_id=e.id
           WHERE l.status='PENDING' AND l.employee_id IN (${placeholders})
           ORDER BY l.applied_at ASC`
        )
        .all(...reportIds)
    : [];

  // Team month summary
  const ym = thisMonth();
  const leaveTypes = getLeaveTypes(db);
  const attRows = db.prepare("SELECT date, employee_id, code FROM attendance WHERE date LIKE ?").all(`${ym}-%`);
  const attMap = new Map();
  for (const r of attRows) attMap.set(`${r.date}:${r.employee_id}`, r.code);

  let totalPresent = 0;
  let totalLeave = 0;
  for (const emp of reports) {
    const dim = daysInMonth(ym);
    for (let d = 1; d <= dim; d++) {
      const ds = `${ym}-${pad2(d)}`;
      if (ds > today) break;
      const code = attStatus(emp, ds, {
        settings, holidays, leaves,
        attCode: attMap.get(`${ds}:${emp.id}`) || null,
      });
      if (["P", "WFH", "OD"].includes(code)) totalPresent++;
      if (code === "L") totalLeave++;
    }
  }

  // Pending expense approvals for direct reports
  const pendingExpenses = reportIds.length
    ? db
        .prepare(
          `SELECT e.id, e.amount, e.date, e.description, e.status, emp.name as emp_name
           FROM expenses e JOIN employees emp ON e.employee_id=emp.id
           WHERE e.status='PENDING' AND e.employee_id IN (${placeholders})
           ORDER BY e.applied_at ASC`
        )
        .all(...reportIds)
    : [];

  // Direct reports' goals in active cycle
  const activeCycle = db.prepare("SELECT id FROM review_cycles WHERE status='ACTIVE' ORDER BY id DESC LIMIT 1").get();
  let teamGoals = { total: 0, completed: 0, completionRate: 0 };
  if (activeCycle && reportIds.length) {
    const gTotal = db.prepare(
      `SELECT COUNT(*) as c FROM goals WHERE cycle_id=? AND employee_id IN (${placeholders})`
    ).get(activeCycle.id, ...reportIds).c;
    const gDone = db.prepare(
      `SELECT COUNT(*) as c FROM goals WHERE cycle_id=? AND status='COMPLETED' AND employee_id IN (${placeholders})`
    ).get(activeCycle.id, ...reportIds).c;
    teamGoals = { total: gTotal, completed: gDone, completionRate: gTotal > 0 ? Math.round((gDone / gTotal) * 100) : 0 };
  }

  res.json({
    isManager: true,
    teamSize: reports.length,
    outToday,
    pending,
    summary: { present: totalPresent, leave: totalLeave },
    pendingExpenses,
    teamGoals,
  });
});

// ── GET /dashboard/me — employee self dashboard ─────────────────────────────

router.get("/me", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const today = todayStr();
  const ym = thisMonth();

  // Leave balances
  const leaveTypes = getLeaveTypes(db);
  const empLeaves = db
    .prepare("SELECT type, days, status, date_from FROM leaves WHERE employee_id=? AND status='APPROVED'")
    .all(req.user.id);
  const adjustments = db
    .prepare("SELECT type, delta FROM leave_adjustments WHERE employee_id=?")
    .all(req.user.id);
  const emp = db.prepare("SELECT doj FROM employees WHERE id=?").get(req.user.id);

  const year = Number(today.slice(0, 4));
  const balances = leaveTypes
    .filter((t) => t.paid)
    .map((lt) => {
      const annual = lt.annual || 0;
      // Simple entitlement for current year
      let entitled = annual;
      if (emp && emp.doj && emp.doj.slice(0, 4) === String(year)) {
        const joinMonth = Number(emp.doj.slice(5, 7));
        entitled = Math.round((annual * (13 - joinMonth) / 12) * 2) / 2;
      }
      const adj = adjustments.filter((a) => a.type === lt.code).reduce((s, a) => s + a.delta, 0);
      const used = empLeaves.filter((l) => l.type === lt.code && l.date_from.slice(0, 4) === String(year)).reduce((s, l) => s + l.days, 0);
      return { type: lt.code, name: lt.name, entitled, adjusted: adj, used, available: entitled + adj - used };
    });

  // This month attendance summary
  const settings = getSettings(db);
  const holidays = getHolidays(db);
  const approvedLeaves = getApprovedLeaves(db);
  const attRows = db.prepare("SELECT date, code FROM attendance WHERE employee_id=? AND date LIKE ?").all(req.user.id, `${ym}-%`);
  const attMap = new Map(attRows.map((r) => [r.date, r.code]));

  const empRow = db.prepare("SELECT id, doj, status, exit_date FROM employees WHERE id=?").get(req.user.id);
  let present = 0, absent = 0, leaves = 0, halfDays = 0;
  const dim = daysInMonth(ym);
  for (let d = 1; d <= dim; d++) {
    const ds = `${ym}-${pad2(d)}`;
    if (ds > today) break;
    const code = attStatus(empRow, ds, {
      settings, holidays, leaves: approvedLeaves,
      attCode: attMap.get(ds) || null,
    });
    if (["P", "WFH", "OD"].includes(code)) present++;
    else if (code === "HD") halfDays++;
    else if (code === "L") leaves++;
    else if (code === "A" || code === "") absent++;
  }

  // Pending requests
  const pendingRequests = db
    .prepare("SELECT id, type, date_from, date_to, days, status, applied_at FROM leaves WHERE employee_id=? AND status='PENDING' ORDER BY applied_at DESC")
    .all(req.user.id);

  // Last payslip
  const lastPayslip = db
    .prepare(
      `SELECT pl.id, pl.gross, pl.net, pr.month
       FROM payroll_lines pl JOIN payroll_runs pr ON pl.run_id=pr.id
       WHERE pl.employee_id=? AND pr.status='FINAL'
       ORDER BY pr.month DESC LIMIT 1`
    )
    .get(req.user.id);

  // Pending expenses
  const myExpenses = db.prepare(
    "SELECT COUNT(*) as c, COALESCE(SUM(amount),0) as total FROM expenses WHERE employee_id=? AND status='PENDING'"
  ).get(req.user.id);

  // Open tickets
  const myOpenTickets = db.prepare(
    "SELECT COUNT(*) as c FROM tickets WHERE employee_id=? AND status IN ('OPEN','IN_PROGRESS')"
  ).get(req.user.id).c;

  // My assets
  const myAssets = db.prepare(
    `SELECT COUNT(*) as c FROM asset_assignments aa
     JOIN assets a ON aa.asset_id=a.id
     WHERE aa.employee_id=? AND aa.returned_at IS NULL`
  ).get(req.user.id).c;

  // Upcoming interviews (as interviewer)
  const myInterviews = db.prepare(
    `SELECT i.id, i.scheduled_at, i.mode, i.duration_mins,
            c.name as candidate_name, jo.title as job_title
     FROM interviews i
     JOIN applications app ON i.application_id=app.id
     JOIN candidates c ON app.candidate_id=c.id
     JOIN job_openings jo ON app.job_id=jo.id
     WHERE i.interviewer_id=? AND i.status='SCHEDULED' AND i.scheduled_at >= ?
     ORDER BY i.scheduled_at LIMIT 5`
  ).all(req.user.id, today);

  // Active surveys not yet responded to
  const activeSurveys = db.prepare(
    `SELECT s.id, s.title FROM surveys s
     WHERE s.status='ACTIVE'
     AND s.id NOT IN (
       SELECT DISTINCT survey_id FROM survey_responses WHERE employee_id=?
     )`
  ).all(req.user.id);

  // Recent recognitions received
  const recentRecognitions = db.prepare(
    `SELECT r.id, r.message, r.created_at, e.name as from_name, b.name as badge_name, b.icon as badge_icon
     FROM recognitions r
     JOIN employees e ON r.from_employee=e.id
     JOIN badges b ON r.badge_id=b.id
     WHERE r.to_employee=?
     ORDER BY r.created_at DESC LIMIT 5`
  ).all(req.user.id);

  res.json({
    balances,
    attendance: { present, absent, leaves, halfDays, month: ym },
    pendingRequests,
    lastPayslip: lastPayslip || null,
    myExpenses: { count: myExpenses.c, total: myExpenses.total },
    myOpenTickets,
    myAssets,
    myInterviews,
    activeSurveys,
    recentRecognitions,
  });
});

export default router;
