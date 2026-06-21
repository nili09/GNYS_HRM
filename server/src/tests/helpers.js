import express from "express";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import { createTestDb } from "../db/test-db.js";
import { attachUser, enforcePasswordChange } from "../middleware/auth.js";
import { createAuthRouter } from "../routes/auth.js";
import employeesRouter from "../routes/employees.js";
import importRouter from "../routes/import.js";
import { departmentsRouter, designationsRouter, locationsRouter } from "../routes/org.js";
import attendanceRouter from "../routes/attendance.js";
import holidaysRouter from "../routes/holidays.js";
import leavesRouter from "../routes/leaves.js";
import auditRouter from "../routes/audit.js";
import payrollRouter from "../routes/payroll.js";
import dashboardRouter from "../routes/dashboard.js";
import settingsRouter from "../routes/settings.js";
import expensesRouter from "../routes/expenses.js";
import recruitmentRouter from "../routes/recruitment.js";
import performanceRouter from "../routes/performance.js";
import engagementRouter from "../routes/engagement.js";
import assetsRouter from "../routes/assets.js";
import helpdeskRouter from "../routes/helpdesk.js";
import searchRouter from "../routes/search.js";
import notificationsRouter from "../routes/notifications.js";
import attachmentsRouter from "../routes/attachments.js";
import employeeDetailsRouter from "../routes/employee-details.js";
import resignationRouter from "../routes/resignation.js";
import onboardingRouter from "../routes/onboarding.js";

/**
 * Build a fresh Express app backed by an in-memory SQLite DB.
 * opts.rateLimitMax — override the login rate limit (default 1000 for tests
 *   so individual tests don't exhaust it; pass a low value to test the limiter).
 */
export function buildApp(opts = {}) {
  process.env.JWT_SECRET = "test-secret-do-not-use-in-production-32chars";

  const db = createTestDb();
  const app = express();
  app.use(express.json({ limit: "5mb" }));
  app.use(cookieParser());
  app.locals.db = db;
  app.use(attachUser);
  app.use(enforcePasswordChange);
  app.use("/api/auth", createAuthRouter({ rateLimitMax: opts.rateLimitMax ?? 1000 }));
  // Specific path mounted before /api/employees (mirrors src/index.js).
  app.use("/api/employees/import", importRouter);
  app.use("/api/employees", employeesRouter);
  app.use("/api/departments", departmentsRouter);
  app.use("/api/designations", designationsRouter);
  app.use("/api/locations", locationsRouter);
  app.use("/api/attendance", attendanceRouter);
  app.use("/api/holidays",    holidaysRouter);
  app.use("/api/leaves",      leavesRouter);
  app.use("/api/audit", auditRouter);
  app.use("/api/payroll", payrollRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api/expenses", expensesRouter);
  app.use("/api/recruitment", recruitmentRouter);
  app.use("/api/performance", performanceRouter);
  app.use("/api/engagement", engagementRouter);
  app.use("/api/assets", assetsRouter);
  app.use("/api/helpdesk", helpdeskRouter);
  app.use("/api/search", searchRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/attachments", attachmentsRouter);
  app.use("/api/employees", employeeDetailsRouter);
  app.use("/api/resignation", resignationRouter);
  app.use("/api/onboarding", onboardingRouter);
  app.get("/api/health", (req, res) => res.json({ ok: true }));

  return { app, db };
}

/**
 * Insert a test employee with a pre-hashed password.
 * Uses bcrypt cost 4 (fast) — bcrypt.compare auto-reads cost from the hash.
 */
export async function insertEmployee(db, overrides = {}) {
  const ts = Date.now() + Math.random().toString(36).slice(2);
  const defaults = {
    code: `EMP${ts}`,
    name: "Test Employee",
    gender: "Male",
    email: `test_${ts}@example.com`,
    doj: "2024-01-01",
    status: "ACTIVE",
    role: "EMPLOYEE",
    password_hash: await bcrypt.hash("TestPass@123", 4),
    must_change_pw: 0,
  };
  const emp = { ...defaults, ...overrides };
  const result = db
    .prepare(
      `INSERT INTO employees(code, name, gender, email, doj, status, role, password_hash, must_change_pw)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      emp.code,
      emp.name,
      emp.gender,
      emp.email,
      emp.doj,
      emp.status,
      emp.role,
      emp.password_hash,
      emp.must_change_pw
    );
  const id = Number(result.lastInsertRowid);
  // Apply additional column overrides
  const extraCols = [
    "pf_opt", "esi_opt", "pt_opt", "tds_override", "manager_id", "exit_date", "exit_reason",
    "bank_name", "bank_acc", "ifsc", "pan", "uan", "dob", "dept_id", "desig_id",
    "prefix", "blood_group", "nationality", "employment_status", "other_status",
    "company", "business_unit", "sub_branch", "functional_manager_code",
    "personal_status", "education_status", "work_exp_status", "family_status",
    "health_insurance_status", "nominee_status", "dependent_status", "child_info_status",
    "bank_status", "prev_employer_status", "document_status",
    "resignation_type", "resignation_reason", "requestee_remarks",
    "approver_resignation_type", "approver_resignation_reason", "approver_remarks",
    "login_enabled", "invite_status", "login_status",
    "notice_period_confirm", "notice_period_probation", "wedding_anniversary",
    "resignation_status", "resignation_submitted_at", "resignation_intended_last_day",
    "resignation_acted_by", "resignation_acted_at",
  ];
  for (const col of extraCols) {
    if (col in overrides) {
      db.prepare(`UPDATE employees SET ${col}=? WHERE id=?`).run(overrides[col], id);
    }
  }
  return { ...emp, id };
}

/**
 * Login helper — returns the cookie string for subsequent requests.
 */
export async function loginAs(app, email, password = "TestPass@123") {
  const supertest = (await import("supertest")).default;
  const res = await supertest(app)
    .post("/api/auth/login")
    .send({ email, password });
  if (res.status !== 200) throw new Error(`Login failed: ${res.status} ${JSON.stringify(res.body)}`);
  // Extract cookie
  const cookies = res.headers["set-cookie"];
  return cookies;
}
