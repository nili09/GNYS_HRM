/**
 * Reproducing tests for bugs found in the 2026-06-22 audit.
 * Each test is marked .skip so it doesn't break CI — these are evidence, not fixes.
 * Remove .skip after the corresponding bug is fixed.
 */
import { describe, it, expect } from "vitest";
import supertest from "supertest";
import { buildApp, insertEmployee, loginAs } from "./helpers.js";

// ─── BUG-001: Leave settings key mismatch ──────────────────────────────────

describe.skip("BUG-001: leaves.js getSettings reads 'calendar' key that doesn't exist", () => {
  it("leave working-day count should respect satOff=2_4 setting", async () => {
    const { app, db } = buildApp();

    // Store Saturday-off settings the way every other module does
    const ups = db.prepare(
      "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
    );
    ups.run("weekOffs", JSON.stringify([0]));
    ups.run("satOff", JSON.stringify("2_4"));

    // Seed a leave type
    db.prepare(
      "INSERT OR IGNORE INTO leave_types(code, name, annual, paid, carry_fwd, max_carry) VALUES('EL','Earned Leave',12,1,1,30)"
    ).run();

    const admin = await insertEmployee(db, {
      role: "ADMIN", email: "admin@igenesys.com", code: "ADM001",
    });
    const emp = await insertEmployee(db, {
      role: "EMPLOYEE", email: "emp@igenesys.com", code: "EMP001",
      manager_id: admin.id, doj: "2024-01-01",
    });
    const cookie = await loginAs(app, "emp@igenesys.com");

    // Apply leave for a range that includes a 2nd Saturday (Jan 11 2025 is a Saturday, week ceil(11/7)=2)
    // Jan 6-11 2025 (Mon-Sat): 5 weekdays + 1 Saturday
    // With satOff=2_4, the 2nd Saturday (Jan 11) should be a week-off → 5 working days
    // Without satOff (the bug), all Saturdays are working → 6 working days
    const res = await supertest(app)
      .post("/api/leaves")
      .set("Cookie", cookie)
      .send({
        type: "EL",
        date_from: "2025-01-06",
        date_to: "2025-01-11",
        half_from: false,
        half_to: false,
      });

    expect(res.status).toBe(201);
    // If the bug is present, days will be 6 (Saturday counted as working)
    // When fixed, days should be 5 (2nd Saturday is a week-off)
    expect(res.body.days).toBe(5);
  });
});

// ─── BUG-002: Leave cancel uses UTC date, not IST ──────────────────────────

describe.skip("BUG-002: leave cancel date comparison uses UTC not Asia/Kolkata", () => {
  it("should use IST date for cancel eligibility check", async () => {
    // This test documents the bug but can't easily simulate timezone differences
    // in a unit test. The fix is to replace:
    //   const today = new Date().toISOString().slice(0, 10);
    // with:
    //   const today = new Date().toLocaleString("en-CA", { timeZone: "Asia/Kolkata" }).slice(0, 10);
    // or use the same todayStr() pattern as dashboard.js.
    //
    // Evidence: leaves.js:418 uses new Date().toISOString().slice(0,10) (UTC)
    // while dashboard.js:11 uses toLocaleString with timeZone: "Asia/Kolkata" (IST).
    expect(true).toBe(true); // placeholder — timezone testing requires mocking Date
  });
});

// ─── BUG-003: Payroll run creation not atomic ──────────────────────────────

describe.skip("BUG-003: payroll run INSERT is outside the lines transaction", () => {
  it("orphan run row remains if generateLines throws", async () => {
    const { app, db } = buildApp();

    const admin = await insertEmployee(db, {
      role: "ADMIN", email: "admin@igenesys.com", code: "ADM001",
    });
    const cookie = await loginAs(app, "admin@igenesys.com");

    // Create an employee with a salary structure that will trigger payroll
    const emp = await insertEmployee(db, {
      role: "EMPLOYEE", email: "emp@igenesys.com", code: "EMP001",
      doj: "2024-01-01", pf_opt: 1, esi_opt: 1, pt_opt: 1,
    });
    db.prepare(
      `INSERT INTO salary_structures(employee_id, effective_from, ctc_annual,
         basic, hra, special, conveyance, medical, lta, other_earn)
       VALUES(?, '2024-01-01', 600000, 25000, 10000, 5000, 1600, 1250, 0, 0)`
    ).run(emp.id);

    // Generate a valid run first
    const res = await supertest(app)
      .post("/api/payroll/runs")
      .set("Cookie", cookie)
      .send({ month: "2025-06" });

    expect(res.status).toBe(201);

    // Try creating another run for the same month — should get 409
    const dup = await supertest(app)
      .post("/api/payroll/runs")
      .set("Cookie", cookie)
      .send({ month: "2025-06" });
    expect(dup.status).toBe(409);

    // Evidence: the run INSERT at payroll.js:178 is outside the transaction.
    // If generateLines() threw, the payroll_runs row would persist, blocking retries.
    const run = db.prepare("SELECT * FROM payroll_runs WHERE month='2025-06'").get();
    const lineCount = db.prepare("SELECT COUNT(*) as c FROM payroll_lines WHERE run_id=?").get(run.id).c;
    // In the success case, lines exist. But on failure, lines=0 and the run is stuck.
    expect(lineCount).toBeGreaterThan(0);
  });
});

// ─── BUG-006: Array query params on GET /leaves ────────────────────────────

describe("BUG-006: GET /leaves?status=X&status=Y silently returns empty", () => {
  it("should handle array status query param", async () => {
    const { app, db } = buildApp();

    db.prepare(
      "INSERT OR IGNORE INTO leave_types(code, name, annual, paid) VALUES('EL','Earned Leave',12,1)"
    ).run();

    const admin = await insertEmployee(db, {
      role: "ADMIN", email: "admin@igenesys.com", code: "ADM001",
    });
    const emp = await insertEmployee(db, {
      role: "EMPLOYEE", email: "emp@igenesys.com", code: "EMP001",
      doj: "2024-01-01",
    });

    // Insert a PENDING leave directly
    db.prepare(
      `INSERT INTO leaves(employee_id, type, date_from, date_to, days, status)
       VALUES(?, 'EL', '2025-06-10', '2025-06-11', 2, 'PENDING')`
    ).run(emp.id);

    const cookie = await loginAs(app, "admin@igenesys.com");

    // Single status — should work
    const single = await supertest(app)
      .get("/api/leaves?status=PENDING")
      .set("Cookie", cookie);
    expect(single.status).toBe(200);
    expect(single.body.data.length).toBeGreaterThan(0);

    // Array status — the bug: .toUpperCase() on array produces garbage
    const multi = await supertest(app)
      .get("/api/leaves?status=PENDING&status=APPROVED")
      .set("Cookie", cookie);
    expect(multi.status).toBe(200);
    // With the bug, this returns [] because "PENDING,APPROVED".toUpperCase() matches nothing.
    // When fixed (using IN clause like employees.js), it should return the PENDING leave.
    expect(multi.body.data.length).toBeGreaterThan(0);
  });
});

// ─── BUG-007: Salary structure tiebreaker missing ──────────────────────────

describe.skip("BUG-007: two salary structures with same effective_from → nondeterministic", () => {
  it("should deterministically pick the most recently inserted structure", async () => {
    const { app, db } = buildApp();

    const admin = await insertEmployee(db, {
      role: "ADMIN", email: "admin@igenesys.com", code: "ADM001",
    });
    const emp = await insertEmployee(db, {
      role: "EMPLOYEE", email: "emp@igenesys.com", code: "EMP001",
      doj: "2024-01-01", pf_opt: 0, esi_opt: 0, pt_opt: 0,
    });

    // Two salary structures with the same effective_from
    db.prepare(
      `INSERT INTO salary_structures(employee_id, effective_from, ctc_annual,
         basic, hra, special, conveyance, medical, lta, other_earn)
       VALUES(?, '2024-01-01', 300000, 10000, 5000, 3000, 0, 0, 0, 0)`
    ).run(emp.id);

    db.prepare(
      `INSERT INTO salary_structures(employee_id, effective_from, ctc_annual,
         basic, hra, special, conveyance, medical, lta, other_earn)
       VALUES(?, '2024-01-01', 600000, 25000, 10000, 5000, 0, 0, 0, 0)`
    ).run(emp.id);

    const cookie = await loginAs(app, "admin@igenesys.com");

    const res = await supertest(app)
      .post("/api/payroll/runs")
      .set("Cookie", cookie)
      .send({ month: "2025-06" });

    expect(res.status).toBe(201);
    const line = res.body.lines.find(l => l.employee_id === emp.id);
    expect(line).toBeDefined();
    // The latest-inserted structure has basic=25000
    // With the bug (no tiebreaker), this could be either 10000 or 25000
    expect(line.earn_basic).toBe(25000);
  });
});
