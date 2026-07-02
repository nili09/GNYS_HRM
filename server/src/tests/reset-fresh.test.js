import { describe, test, expect } from "vitest";
import { createTestDb } from "../db/test-db.js";
import { seedLeaveTypes, seedSettings, seedOrgLists } from "../db/seed.js";
import { resetToFresh, previewReset, getResetTablePlan } from "../db/reset-fresh.js";
import { insertEmployee } from "./helpers.js";

/**
 * Builds a "populated production" DB: default baseline (leave types,
 * settings, org lists) plus an admin, a couple of regular employees, and at
 * least one row in every other data table so the wipe can be verified
 * end-to-end rather than against an already-empty table.
 */
async function seedPopulatedDb() {
  const db = createTestDb();

  seedLeaveTypes(db);
  seedSettings(db);
  seedOrgLists(db);

  const admin = await insertEmployee(db, {
    role: "ADMIN", email: "admin@test.com", code: "ADMIN01",
    doj: "2020-01-01", dept_id: 1,
  });
  const emp1 = await insertEmployee(db, {
    role: "EMPLOYEE", email: "emp1@test.com", code: "EMP1",
    doj: "2024-01-01", dept_id: 1, desig_id: 1, manager_id: admin.id,
  });
  await insertEmployee(db, {
    role: "HR", email: "emp2@test.com", code: "EMP2", doj: "2023-01-01",
  });

  db.prepare(
    `INSERT INTO salary_structures(employee_id, effective_from, ctc_annual, basic, hra, special, conveyance, medical, lta, other_earn, other_earn_label)
     VALUES(?, '2024-01-01', 600000, 25000, 12500, 10000, 1600, 1250, 0, 0, 'Other')`
  ).run(emp1.id);

  db.prepare(
    `INSERT INTO leaves(employee_id, type, date_from, date_to, days, status) VALUES(?, 'CL', '2024-06-10', '2024-06-11', 2, 'PENDING')`
  ).run(emp1.id);
  db.prepare(`INSERT INTO leave_adjustments(employee_id, year, type, delta, note) VALUES(?, 2024, 'CL', 1, 'test adj')`).run(emp1.id);
  db.prepare(`INSERT INTO holidays(date, name) VALUES('2024-08-15', 'Independence Day')`).run();
  db.prepare(`INSERT INTO attendance(date, employee_id, code) VALUES('2024-06-03', ?, 'P')`).run(emp1.id);

  const runId = db.prepare(`INSERT INTO payroll_runs(month, status) VALUES('2024-06', 'DRAFT')`).run().lastInsertRowid;
  db.prepare(
    `INSERT INTO payroll_lines(run_id, employee_id, payable, month_days, gross, net) VALUES(?, ?, 30, 30, 30350, 28350)`
  ).run(runId, emp1.id);

  db.prepare(`INSERT INTO audit_log(actor_id, action, entity, entity_id, detail) VALUES(?, 'CREATE', 'employee', ?, '{}')`).run(admin.id, String(emp1.id));
  db.prepare(`INSERT INTO docs_checklist(employee_id, key, done) VALUES(?, 'pan', 1)`).run(emp1.id);

  const policyId = db.prepare(`INSERT INTO expense_policies(name, per_diem_limit, requires_receipt) VALUES('Test Policy', 1000, 1)`).run().lastInsertRowid;
  const catId = db.prepare(`INSERT INTO expense_categories(name, policy_id) VALUES('Test Category', ?)`).run(policyId).lastInsertRowid;
  db.prepare(`INSERT INTO expenses(employee_id, category_id, amount, date, status) VALUES(?, ?, 500, '2024-06-01', 'PENDING')`).run(emp1.id, catId);
  db.prepare(`INSERT INTO advance_requests(employee_id, amount, reason, status) VALUES(?, 2000, 'travel', 'PENDING')`).run(emp1.id);

  const jobId = db.prepare(`INSERT INTO job_openings(title, dept_id, location_id, positions, status, created_by) VALUES('SWE', 1, 1, 2, 'OPEN', ?)`).run(admin.id).lastInsertRowid;
  const candId = db.prepare(`INSERT INTO candidates(name, email) VALUES('Cand One', 'cand1@test.com')`).run().lastInsertRowid;
  const appId = db.prepare(`INSERT INTO applications(job_id, candidate_id, status) VALUES(?, ?, 'APPLIED')`).run(jobId, candId).lastInsertRowid;
  db.prepare(`INSERT INTO interviews(application_id, interviewer_id, scheduled_at) VALUES(?, ?, '2024-06-05T10:00:00')`).run(appId, emp1.id);
  db.prepare(`INSERT INTO offer_letters(application_id, ctc_offered, joining_date, status) VALUES(?, 600000, '2024-07-01', 'DRAFT')`).run(appId);

  const cycleId = db.prepare(`INSERT INTO review_cycles(name, year, start_date, end_date, status, created_by) VALUES('2024 H1', 2024, '2024-01-01', '2024-06-30', 'ACTIVE', ?)`).run(admin.id).lastInsertRowid;
  db.prepare(`INSERT INTO goals(employee_id, cycle_id, title) VALUES(?, ?, 'Goal 1')`).run(emp1.id, cycleId);
  db.prepare(`INSERT INTO reviews(employee_id, cycle_id, reviewer_id) VALUES(?, ?, ?)`).run(emp1.id, cycleId, admin.id);
  db.prepare(`INSERT INTO one_on_ones(employee_id, manager_id, date) VALUES(?, ?, '2024-06-01')`).run(emp1.id, admin.id);

  db.prepare(`INSERT INTO announcements(title, body, published_by) VALUES('Test Announcement', 'body', ?)`).run(admin.id);
  const surveyId = db.prepare(`INSERT INTO surveys(title, status, created_by) VALUES('Test Survey', 'ACTIVE', ?)`).run(admin.id).lastInsertRowid;
  const qId = db.prepare(`INSERT INTO survey_questions(survey_id, question) VALUES(?, 'How are you?')`).run(surveyId).lastInsertRowid;
  db.prepare(`INSERT INTO survey_responses(survey_id, employee_id, question_id, answer) VALUES(?, ?, ?, '5')`).run(surveyId, emp1.id, qId);
  const badgeId = db.prepare(`INSERT INTO badges(name, description) VALUES('Test Badge', 'desc')`).run().lastInsertRowid;
  db.prepare(`INSERT INTO recognitions(from_employee, to_employee, badge_id, message) VALUES(?, ?, ?, 'great job')`).run(emp1.id, admin.id, badgeId);

  const typeId = db.prepare(`INSERT INTO asset_types(name) VALUES('Laptop')`).run().lastInsertRowid;
  const vendorId = db.prepare(`INSERT INTO vendors(name) VALUES('Dell')`).run().lastInsertRowid;
  const assetId = db.prepare(`INSERT INTO assets(asset_type_id, name, vendor_id, status) VALUES(?, 'Dell XPS', ?, 'ASSIGNED')`).run(typeId, vendorId).lastInsertRowid;
  db.prepare(`INSERT INTO asset_assignments(asset_id, employee_id, assigned_by) VALUES(?, ?, ?)`).run(assetId, emp1.id, admin.id);

  const tcatId = db.prepare(`INSERT INTO ticket_categories(name) VALUES('IT Support')`).run().lastInsertRowid;
  const ticketId = db.prepare(`INSERT INTO tickets(employee_id, category_id, subject, description) VALUES(?, ?, 'Laptop issue', 'broken screen')`).run(emp1.id, tcatId).lastInsertRowid;
  db.prepare(`INSERT INTO ticket_comments(ticket_id, author_id, body) VALUES(?, ?, 'looking into it')`).run(ticketId, admin.id);

  db.prepare(`INSERT INTO attachments(owner_type, owner_id, filename, mime, size, path, uploaded_by) VALUES('profile_photo', ?, 'photo.png', 'image/png', 1024, 'uuid.png', ?)`).run(String(emp1.id), emp1.id);
  db.prepare(`INSERT INTO notifications(user_id, type, title) VALUES(?, 'leave_applied', 'Leave applied')`).run(emp1.id);

  db.prepare(`INSERT INTO employee_emergency_contacts(employee_id, name, phone) VALUES(?, 'Jane Doe', '9999999999')`).run(emp1.id);
  db.prepare(`INSERT INTO employee_family(employee_id, name, relationship) VALUES(?, 'John Doe', 'Father')`).run(emp1.id);
  db.prepare(`INSERT INTO employee_nominees(employee_id, name, relationship) VALUES(?, 'Jane Doe', 'Spouse')`).run(emp1.id);
  db.prepare(`INSERT INTO employee_education(employee_id, degree) VALUES(?, 'B.Tech')`).run(emp1.id);
  db.prepare(`INSERT INTO employee_prev_employers(employee_id, company) VALUES(?, 'OldCorp')`).run(emp1.id);
  db.prepare(`INSERT INTO onboarding_policy_acks(employee_id, policy_key) VALUES(?, 'code_of_conduct')`).run(emp1.id);

  // Stale search index entry — proves the wipe clears old data, not just
  // happens to start from an already-empty index.
  db.prepare(`INSERT INTO search_index(entity, entity_id, title, body, meta) VALUES('ticket', '999', 'stale title', 'stale body', '{}')`).run();

  return { db, admin, emp1 };
}

describe("reset-fresh — getResetTablePlan / previewReset", () => {
  test("categorizes every non-special table as wipe or reseed, nothing missing", () => {
    const db = createTestDb();
    const { wipe, reseed } = getResetTablePlan(db);
    expect(reseed.sort()).toEqual([
      "asset_types", "badges", "departments", "designations",
      "expense_categories", "expense_policies", "holidays",
      "leave_types", "locations", "settings",
      "survey_questions", "surveys", "ticket_categories",
    ]);
    // A representative sample that must land in "wipe", including a table
    // that's added via migrate.js rather than schema.sql.
    for (const t of ["leaves", "attendance", "expenses", "tickets", "onboarding_policy_acks", "attachments", "audit_log"]) {
      expect(wipe).toContain(t);
    }
    expect(wipe).not.toContain("employees");
    expect(wipe).not.toContain("search_index");
  });

  test("dry run reports counts without changing anything", async () => {
    const { db } = await seedPopulatedDb();
    const before = previewReset(db);
    expect(before.counts.employees_admin).toBe(1);
    expect(before.counts.leaves).toBe(1);

    const after = previewReset(db);
    expect(after.counts).toEqual(before.counts); // unchanged — read-only
  });
});

describe("reset-fresh — resetToFresh", () => {
  test("wipes every data table to zero, preserves only ADMIN, reseeds defaults", async () => {
    const { db, admin, emp1 } = await seedPopulatedDb();

    const result = await resetToFresh(db);

    for (const t of result.wipe) {
      expect(result.after[t], `${t} should be empty after reset`).toBe(0);
    }

    expect(result.after.employees).toBe(1);
    expect(result.after.employees_admin).toBe(1);
    expect(result.after.leave_types).toBe(6);
    expect(result.after.settings).toBe(7);
    expect(result.after.departments).toBe(8);
    expect(result.after.designations).toBe(15);
    expect(result.after.locations).toBe(5);
    expect(result.after.badges).toBe(13);
    expect(result.after.holidays).toBeGreaterThanOrEqual(12); // 6 per year × 2 years
    expect(result.after.expense_policies).toBe(2);
    expect(result.after.expense_categories).toBe(4);
    expect(result.after.asset_types).toBe(4);
    expect(result.after.ticket_categories).toBe(4);
    expect(result.after.surveys).toBe(4);
    expect(result.after.survey_questions).toBeGreaterThanOrEqual(15);

    // Search index rebuilt clean — only the surviving admin profile, the
    // stale "ticket 999" entry is gone.
    expect(result.after.search_index).toBe(1);
    const indexed = db.prepare("SELECT entity, entity_id FROM search_index").all();
    expect(indexed).toEqual([{ entity: "employee", entity_id: String(admin.id) }]);

    // Non-admin employee actually gone.
    const survivor = db.prepare("SELECT id FROM employees WHERE id = ?").get(emp1.id);
    expect(survivor).toBeUndefined();

    // Admin row itself untouched (login, password_hash, must_change_pw, code).
    const adminRow = db.prepare("SELECT * FROM employees WHERE id = ?").get(admin.id);
    expect(adminRow.email).toBe("admin@test.com");
    expect(adminRow.code).toBe("ADMIN01");
    expect(adminRow.password_hash).toBe(admin.password_hash);
    expect(adminRow.must_change_pw).toBe(admin.must_change_pw);

    expect(result.preservedAdmins).toHaveLength(1);
    expect(result.preservedAdmins[0].email).toBe("admin@test.com");
    expect(result.fkViolations).toEqual([]);
  });

  test("new employee ids after reset never collide with the preserved admin's id", async () => {
    const { db, admin } = await seedPopulatedDb();
    await resetToFresh(db);

    const newId = db
      .prepare(`INSERT INTO employees(code, name, email, doj, password_hash) VALUES('NEW1','New Hire','new1@test.com','2024-01-01','hash')`)
      .run().lastInsertRowid;

    expect(Number(newId)).toBeGreaterThan(admin.id);
  });

  test("--reset-admin-pw resets password and forces change; default leaves it alone", async () => {
    const { db: db1, admin: admin1 } = await seedPopulatedDb();
    await resetToFresh(db1);
    const untouched = db1.prepare("SELECT password_hash, must_change_pw FROM employees WHERE id = ?").get(admin1.id);
    expect(untouched.password_hash).toBe(admin1.password_hash);

    const { db: db2, admin: admin2 } = await seedPopulatedDb();
    await resetToFresh(db2, { resetAdminPw: true, adminPassword: "NewAdminPass@123" });
    const reset = db2.prepare("SELECT password_hash, must_change_pw FROM employees WHERE id = ?").get(admin2.id);
    expect(reset.password_hash).not.toBe(admin2.password_hash);
    expect(reset.must_change_pw).toBe(1);
  });

  test("rejects --reset-admin-pw without a password", async () => {
    const { db } = await seedPopulatedDb();
    await expect(resetToFresh(db, { resetAdminPw: true })).rejects.toThrow(/adminPassword/);
  });

  test("refuses to run when no ADMIN-role employee exists", async () => {
    const db = createTestDb();
    seedLeaveTypes(db);
    seedSettings(db);
    seedOrgLists(db);
    await insertEmployee(db, { role: "HR", email: "hr@test.com", code: "HR1" });

    await expect(resetToFresh(db)).rejects.toThrow(/no ADMIN-role employee/);
  });

  test("preserves all ADMIN accounts when more than one exists", async () => {
    const { db, admin } = await seedPopulatedDb();
    const admin2 = await insertEmployee(db, { role: "ADMIN", email: "admin2@test.com", code: "ADMIN02", doj: "2021-01-01" });

    const result = await resetToFresh(db);

    expect(result.after.employees_admin).toBe(2);
    expect(result.preservedAdmins.map((a) => a.email).sort()).toEqual(["admin2@test.com", "admin@test.com"]);
  });
});
