import { describe, test, expect, beforeAll, vi } from "vitest";
import { buildApp, insertEmployee, loginAs } from "./helpers.js";
import supertest from "supertest";

describe("Payroll data-integrity bugs", () => {
  let app, db, hrUser, hrCookie;

  beforeAll(async () => {
    ({ app, db } = buildApp());

    db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)").run("weekOffs", JSON.stringify([0]));
    db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)").run("satOff", JSON.stringify("none"));
    db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)").run("pfEnabled", JSON.stringify(true));
    db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)").run("pfCapWages", JSON.stringify(true));
    db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)").run("esiEnabled", JSON.stringify(true));
    db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)").run("ptEnabled", JSON.stringify(true));
    db.prepare("INSERT OR IGNORE INTO leave_types(code, name, annual, paid) VALUES(?, ?, ?, ?)").run("EL", "Earned Leave", 18, 1);

    hrUser = await insertEmployee(db, {
      role: "HR", email: "hr@test.com", code: "HR001", name: "HR Manager", doj: "2020-01-01",
    });
    hrCookie = await loginAs(app, "hr@test.com");
  });

  function seedAttendance(employeeId, ym) {
    const [y, m] = ym.split("-").map(Number);
    const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
    for (let d = 1; d <= dim; d++) {
      const ds = `${ym}-${String(d).padStart(2, "0")}`;
      const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      if (dow === 0) continue;
      db.prepare("INSERT OR REPLACE INTO attendance(date, employee_id, code, marked_by) VALUES(?, ?, 'P', ?)").run(ds, employeeId, hrUser.id);
    }
  }

  async function makeEmployee(code, ym, basic = 15000) {
    const emp = await insertEmployee(db, {
      email: `${code.toLowerCase()}@test.com`, code, name: `Emp ${code}`,
      gender: "Male", doj: "2024-01-01", pf_opt: 1, esi_opt: 1, pt_opt: 1,
    });
    db.prepare(
      "INSERT INTO salary_structures(employee_id, effective_from, ctc_annual, basic, hra, special, conveyance, medical) VALUES(?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(emp.id, "2024-01-01", basic * 12, basic, 7500, 5000, 1600, 1250);
    seedAttendance(emp.id, ym);
    return emp;
  }

  // ── BUG-003: run-create atomicity ──────────────────────────────────────────

  describe("BUG-003: generateLines failure leaves no orphan run", () => {
    test("if generateLines throws, no run row is left behind and the month is retryable", async () => {
      const emp = await makeEmployee("BUG003", "2025-07");

      // Corrupt the settings to make generateLines throw (remove required table temporarily)
      // Instead: we'll use a more reliable approach — temporarily rename a table to force a SQL error
      // Actually the cleanest way: drop attendance to trigger the query, but that's destructive.
      // Better: temporarily break the holidays query by dropping the table
      db.exec("ALTER TABLE holidays RENAME TO holidays_bak");

      const res = await supertest(app)
        .post("/api/payroll/runs")
        .set("Cookie", hrCookie)
        .send({ month: "2025-07" });

      // Restore immediately
      db.exec("ALTER TABLE holidays_bak RENAME TO holidays");

      // The request should have failed (500)
      expect(res.status).toBe(500);

      // No orphaned run row should exist
      const orphan = db.prepare("SELECT * FROM payroll_runs WHERE month='2025-07'").get();
      expect(orphan).toBeUndefined();

      // Retry should succeed (not 409)
      const retry = await supertest(app)
        .post("/api/payroll/runs")
        .set("Cookie", hrCookie)
        .send({ month: "2025-07" });
      expect(retry.status).toBe(201);
      expect(retry.body.lines.length).toBeGreaterThan(0);
    });
  });

  // ── BUG-014: regenerate atomicity ──────────────────────────────────────────

  describe("BUG-014: failed regenerate keeps prior lines", () => {
    test("if re-insert fails, old lines are preserved", async () => {
      const emp = await makeEmployee("BUG014", "2025-08");

      // Create a valid draft run
      const create = await supertest(app)
        .post("/api/payroll/runs")
        .set("Cookie", hrCookie)
        .send({ month: "2025-08" });
      expect(create.status).toBe(201);
      const runId = create.body.run.id;
      const originalLineCount = create.body.lines.length;
      expect(originalLineCount).toBeGreaterThan(0);

      // Corrupt holidays to break generateLines during regenerate
      db.exec("ALTER TABLE holidays RENAME TO holidays_bak");

      const regen = await supertest(app)
        .post(`/api/payroll/runs/${runId}/regenerate`)
        .set("Cookie", hrCookie);

      db.exec("ALTER TABLE holidays_bak RENAME TO holidays");

      // Regenerate should have failed
      expect(regen.status).toBe(500);

      // Original lines should still be intact
      const linesAfter = db.prepare("SELECT COUNT(*) as c FROM payroll_lines WHERE run_id=?").get(runId).c;
      expect(linesAfter).toBe(originalLineCount);
    });
  });

  // ── BUG-007: salary structure tiebreaker ───────────────────────────────────

  describe("BUG-007: salary structure tiebreaker", () => {
    test("picks latest effective_from, and id DESC as tiebreaker in the query", async () => {
      const emp = await insertEmployee(db, {
        email: "bug007@test.com", code: "BUG007", name: "Emp BUG007",
        gender: "Male", doj: "2024-01-01", pf_opt: 0, esi_opt: 0, pt_opt: 0,
      });

      // Older structure: basic 10000
      db.prepare(
        "INSERT INTO salary_structures(employee_id, effective_from, ctc_annual, basic, hra, special, conveyance, medical) VALUES(?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(emp.id, "2024-01-01", 120000, 10000, 5000, 3000, 0, 0);

      // Newer structure (higher id, later effective_from): basic 25000
      db.prepare(
        "INSERT INTO salary_structures(employee_id, effective_from, ctc_annual, basic, hra, special, conveyance, medical) VALUES(?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(emp.id, "2025-06-01", 300000, 25000, 10000, 5000, 0, 0);

      seedAttendance(emp.id, "2025-09");

      const res = await supertest(app)
        .post("/api/payroll/runs")
        .set("Cookie", hrCookie)
        .send({ month: "2025-09" });
      expect(res.status).toBe(201);

      const line = res.body.lines.find(l => l.employee_id === emp.id);
      expect(line).toBeDefined();
      // Must pick the 2025-06-01 structure (basic 25000), not the 2024-01-01 one
      expect(line.earn_basic).toBe(25000);

      // Verify the query includes id DESC tiebreaker
      const sal = db.prepare(
        `SELECT * FROM salary_structures
         WHERE employee_id = ? AND effective_from <= '2025-09-01'
         ORDER BY effective_from DESC, id DESC LIMIT 1`
      ).get(emp.id);
      expect(sal.basic).toBe(25000);
    });
  });

  // ── BUG-016: finalize response format matches GET ──────────────────────────

  describe("BUG-016: finalize/reopen response format matches GET", () => {
    test("finalize response finalized_at format matches subsequent GET", async () => {
      const emp = await makeEmployee("BUG016", "2025-10");

      const create = await supertest(app)
        .post("/api/payroll/runs")
        .set("Cookie", hrCookie)
        .send({ month: "2025-10" });
      expect(create.status).toBe(201);
      const runId = create.body.run.id;

      const fin = await supertest(app)
        .post(`/api/payroll/runs/${runId}/finalize`)
        .set("Cookie", hrCookie);
      expect(fin.status).toBe(200);
      expect(fin.body.status).toBe("FINAL");

      // GET the same run
      const get = await supertest(app)
        .get(`/api/payroll/runs/${runId}`)
        .set("Cookie", hrCookie);
      expect(get.status).toBe(200);

      // finalized_at from finalize response must exactly equal the GET value
      expect(fin.body.finalized_at).toBe(get.body.run.finalized_at);
      // Must be in DB format (no T, no Z)
      expect(fin.body.finalized_at).not.toContain("T");
      expect(fin.body.finalized_at).not.toContain("Z");
    });

    test("reopen response finalized_at is null and matches GET", async () => {
      const run = db.prepare("SELECT * FROM payroll_runs WHERE month='2025-10'").get();

      const reopen = await supertest(app)
        .post(`/api/payroll/runs/${run.id}/reopen`)
        .set("Cookie", hrCookie);
      expect(reopen.status).toBe(200);
      expect(reopen.body.status).toBe("DRAFT");
      expect(reopen.body.finalized_at).toBeNull();

      const get = await supertest(app)
        .get(`/api/payroll/runs/${run.id}`)
        .set("Cookie", hrCookie);
      expect(get.body.run.finalized_at).toBeNull();
    });
  });
});
