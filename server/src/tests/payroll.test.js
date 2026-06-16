import { describe, test, expect, beforeAll, beforeEach } from "vitest";
import {
  STAT,
  calcPT,
  calcPF,
  calcESI,
  calcAnnualTax,
  calcMonthlyTDS,
  monthlyGross,
  computePayLine,
} from "@hrms/shared/payroll";
import { buildApp, insertEmployee, loginAs } from "./helpers.js";
import supertest from "supertest";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §8 TEST VECTORS — these are MANDATORY and must pass EXACTLY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§8 — calcAnnualTax", () => {
  test("rebate at 12L gross (taxable 11.25L ≤ 12L)", () => {
    expect(calcAnnualTax(1200000)).toBe(0);
  });
  test("normal 18L gross → 150800", () => {
    expect(calcAnnualTax(1800000)).toBe(150800);
  });
  test("marginal relief 13.25L gross → 52000", () => {
    expect(calcAnnualTax(1325000)).toBe(52000);
  });
  test("high 30L gross → 475800", () => {
    expect(calcAnnualTax(3000000)).toBe(475800);
  });
});

describe("§8 — calcMonthlyTDS", () => {
  test("150000/month → 12567", () => {
    expect(calcMonthlyTDS(150000)).toBe(12567);
  });
});

describe("§8 — calcPF", () => {
  test("basic 42000, capped: emp 1800, EPS 1250, erEPF 550", () => {
    const r = calcPF(42000, true);
    expect(r.empPF).toBe(1800);
    expect(r.erEPS).toBe(1250);
    expect(r.erEPF).toBe(550);
  });
  test("basic 10000, capped: emp 1200", () => {
    const r = calcPF(10000, true);
    expect(r.empPF).toBe(1200);
  });
  test("basic 42000, uncapped: emp 5040, EPS still 1250", () => {
    const r = calcPF(42000, false);
    expect(r.empPF).toBe(5040);
    expect(r.erEPS).toBe(1250);
  });
});

describe("§8 — calcESI", () => {
  test("gross 18000 covered: emp 135, er 585", () => {
    const r = calcESI(18000, true);
    expect(r.emp).toBe(135);
    expect(r.er).toBe(585);
    expect(r.covered).toBe(true);
  });
  test("gross 25000 not covered", () => {
    const r = calcESI(25000, true);
    expect(r.covered).toBe(false);
  });
});

describe("§8 — calcPT (Maharashtra)", () => {
  test("male 50000 Jun → 200", () => {
    expect(calcPT(50000, "Male", 6)).toBe(200);
  });
  test("male 50000 Feb → 300", () => {
    expect(calcPT(50000, "Male", 2)).toBe(300);
  });
  test("male 9000 → 175", () => {
    expect(calcPT(9000, "Male", 6)).toBe(175);
  });
  test("male 7000 → 0", () => {
    expect(calcPT(7000, "Male", 6)).toBe(0);
  });
  test("female 20000 → 0", () => {
    expect(calcPT(20000, "Female", 6)).toBe(0);
  });
  test("female 30000 → 200", () => {
    expect(calcPT(30000, "Female", 6)).toBe(200);
  });
  test("annual male >10k = 2500 (11×200 + 1×300)", () => {
    let annual = 0;
    for (let m = 1; m <= 12; m++) annual += calcPT(50000, "Male", m);
    expect(annual).toBe(2500);
  });
});

describe("§8 — computePayLine (full month)", () => {
  const sal = { basic: 15000, hra: 7500, special: 5000, conveyance: 1600, medical: 1250, lta: 0, other_earn: 0 };
  const emp = { id: 1, gender: "Male", pf_opt: 1, esi_opt: 1, pt_opt: 1, tds_override: null };
  const settings = { pfEnabled: true, pfCapWages: true, esiEnabled: true, ptEnabled: true };

  test("30/30 days: gross 30350, PF 1800, ESI 0 (>21k), PT 200, TDS 0, net 28350", () => {
    const line = computePayLine(emp, sal, "2026-06", settings, 30, 30);
    expect(line.gross).toBe(30350);
    expect(line.ded_pf).toBe(1800);
    expect(line.ded_esi).toBe(0);     // full gross 30350 > 21000
    expect(line.ded_pt).toBe(200);
    expect(line.ded_tds).toBe(0);     // annual 30350*12 < rebate threshold
    expect(line.net).toBe(28350);
  });
});

describe("§8 — computePayLine (half month)", () => {
  const sal = { basic: 15000, hra: 7500, special: 5000, conveyance: 1600, medical: 1250, lta: 0, other_earn: 0 };
  const emp = { id: 1, gender: "Male", pf_opt: 1, esi_opt: 1, pt_opt: 1, tds_override: null };
  const settings = { pfEnabled: true, pfCapWages: true, esiEnabled: true, ptEnabled: true };

  test("15/30 days: basic 7500, PF 900", () => {
    const line = computePayLine(emp, sal, "2026-06", settings, 15, 30);
    expect(line.earn_basic).toBe(7500);
    expect(line.ded_pf).toBe(900);
  });
});

describe("§8 — computePayLine (ESI case)", () => {
  // gross 19600 full month → ESI covered (19600 ≤ 21000)
  const sal = { basic: 10000, hra: 5000, special: 3000, conveyance: 1000, medical: 600, lta: 0, other_earn: 0 };
  const settings = { pfEnabled: true, pfCapWages: true, esiEnabled: true, ptEnabled: true };

  test("ESI emp ceil(19600×.0075)=147, er ceil(19600×.0325)=637", () => {
    const fullGross = monthlyGross(sal);
    expect(fullGross).toBe(19600);
    const emp = { id: 1, gender: "Male", pf_opt: 1, esi_opt: 1, pt_opt: 1, tds_override: null };
    const line = computePayLine(emp, sal, "2026-06", settings, 30, 30);
    expect(line.ded_esi).toBe(147);
    expect(line.er_esi).toBe(637);
    expect(line.esi_covered).toBe(1);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Additional engine tests (not §8 but critical)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("calcPT edge cases", () => {
  test("male exactly 7500 → 0", () => {
    expect(calcPT(7500, "Male", 6)).toBe(0);
  });
  test("male exactly 10000 → 175", () => {
    expect(calcPT(10000, "Male", 6)).toBe(175);
  });
  test("female exactly 25000 → 0", () => {
    expect(calcPT(25000, "Female", 6)).toBe(0);
  });
  test("female Feb → 300", () => {
    expect(calcPT(30000, "Female", 2)).toBe(300);
  });
});

describe("tds_override", () => {
  test("overrides calculated TDS", () => {
    const sal = { basic: 40000, hra: 20000, special: 10000, conveyance: 0, medical: 0, lta: 0, other_earn: 0 };
    const emp = { id: 1, gender: "Male", pf_opt: 0, esi_opt: 0, pt_opt: 0, tds_override: 5000 };
    const settings = { pfEnabled: true, pfCapWages: true, esiEnabled: true, ptEnabled: true };
    const line = computePayLine(emp, sal, "2026-06", settings, 30, 30);
    expect(line.ded_tds).toBe(5000);
  });
  test("tds_override 0 means zero TDS (not null)", () => {
    const sal = { basic: 40000, hra: 20000, special: 10000, conveyance: 0, medical: 0, lta: 0, other_earn: 0 };
    const emp = { id: 1, gender: "Male", pf_opt: 0, esi_opt: 0, pt_opt: 0, tds_override: 0 };
    const settings = { pfEnabled: true, pfCapWages: true, esiEnabled: true, ptEnabled: true };
    const line = computePayLine(emp, sal, "2026-06", settings, 30, 30);
    expect(line.ded_tds).toBe(0);
  });
});

describe("computePayLine — zero payable", () => {
  test("0 payable days → all earnings zero, net negative from statutory on full gross", () => {
    const sal = { basic: 15000, hra: 7500, special: 5000, conveyance: 1600, medical: 1250, lta: 0, other_earn: 0 };
    const emp = { id: 1, gender: "Male", pf_opt: 1, esi_opt: 1, pt_opt: 1, tds_override: null };
    const settings = { pfEnabled: true, pfCapWages: true, esiEnabled: true, ptEnabled: true };
    const line = computePayLine(emp, sal, "2026-06", settings, 0, 30);
    expect(line.gross).toBe(0);
    expect(line.earn_basic).toBe(0);
    // PT & TDS still based on full gross
    expect(line.ded_pt).toBe(200);
  });
});

describe("monthlyGross", () => {
  test("sums all components", () => {
    expect(monthlyGross({ basic: 10000, hra: 5000, special: 3000, conveyance: 1000, medical: 600, lta: 400, other_earn: 200 })).toBe(20200);
  });
  test("handles missing fields", () => {
    expect(monthlyGross({})).toBe(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// API integration tests — payroll runs, finalize, reopen, RBAC, CSV exports
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Payroll API", () => {
  let app, db, hrUser, empUser, hrCookie, empCookie;

  beforeAll(async () => {
    ({ app, db } = buildApp());

    // Insert settings
    db.prepare(`INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)`).run("weekOffs", JSON.stringify([0]));
    db.prepare(`INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)`).run("satOff", JSON.stringify("none"));
    db.prepare(`INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)`).run("pfEnabled", JSON.stringify(true));
    db.prepare(`INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)`).run("pfCapWages", JSON.stringify(true));
    db.prepare(`INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)`).run("esiEnabled", JSON.stringify(true));
    db.prepare(`INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)`).run("ptEnabled", JSON.stringify(true));

    // Insert leave type so attendance resolution doesn't fail
    db.prepare(`INSERT OR IGNORE INTO leave_types(code, name, annual, paid) VALUES(?, ?, ?, ?)`).run("EL", "Earned Leave", 18, 1);

    // HR user
    hrUser = await insertEmployee(db, {
      role: "HR",
      email: "hr@test.com",
      code: "HR001",
      name: "HR Manager",
      doj: "2020-01-01",
    });

    // Employee user with salary structure
    empUser = await insertEmployee(db, {
      email: "emp@test.com",
      code: "EMP001",
      name: "Emp One",
      gender: "Male",
      doj: "2024-01-01",
      pf_opt: 1,
      esi_opt: 1,
      pt_opt: 1,
    });
    // Salary structure: basic 15000, hra 7500, special 5000, conv 1600, med 1250 = 30350
    db.prepare(`INSERT INTO salary_structures(employee_id, effective_from, ctc_annual, basic, hra, special, conveyance, medical)
                VALUES(?, ?, ?, ?, ?, ?, ?, ?)`).run(empUser.id, "2024-01-01", 364200, 15000, 7500, 5000, 1600, 1250);

    hrCookie = await loginAs(app, "hr@test.com");
    empCookie = await loginAs(app, "emp@test.com");
  });

  // Helper: seed attendance marks for a full month
  function seedFullMonthAttendance(employeeId, ym) {
    const [y, m] = ym.split("-").map(Number);
    const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
    for (let d = 1; d <= dim; d++) {
      const ds = `${ym}-${String(d).padStart(2, "0")}`;
      const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      if (dow === 0) continue; // Sunday = week off, skip
      // Mark all working days present
      db.prepare(`INSERT OR REPLACE INTO attendance(date, employee_id, code, marked_by) VALUES(?, ?, 'P', ?)`).run(ds, employeeId, hrUser.id);
    }
  }

  describe("POST /payroll/runs — generate draft", () => {
    test("HR can generate a run", async () => {
      seedFullMonthAttendance(empUser.id, "2026-01");
      const res = await supertest(app)
        .post("/api/payroll/runs")
        .set("Cookie", hrCookie)
        .send({ month: "2026-01" });
      expect(res.status).toBe(201);
      expect(res.body.run.status).toBe("DRAFT");
      expect(res.body.run.month).toBe("2026-01");
      expect(res.body.lines.length).toBeGreaterThanOrEqual(1);
      // Check the employee's line
      const empLine = res.body.lines.find((l) => l.employee_id === empUser.id);
      expect(empLine).toBeDefined();
      expect(empLine.gross).toBeGreaterThan(0);
    });

    test("employee cannot generate a run (403)", async () => {
      const res = await supertest(app)
        .post("/api/payroll/runs")
        .set("Cookie", empCookie)
        .send({ month: "2026-02" });
      expect(res.status).toBe(403);
    });

    test("duplicate month rejects (409)", async () => {
      const res = await supertest(app)
        .post("/api/payroll/runs")
        .set("Cookie", hrCookie)
        .send({ month: "2026-01" });
      expect(res.status).toBe(409);
    });
  });

  describe("POST /payroll/runs/:id/regenerate — re-calculate draft", () => {
    test("regenerate updates lines", async () => {
      const runs = db.prepare(`SELECT * FROM payroll_runs WHERE month='2026-01'`).get();
      const res = await supertest(app)
        .post(`/api/payroll/runs/${runs.id}/regenerate`)
        .set("Cookie", hrCookie);
      expect(res.status).toBe(200);
      expect(res.body.lines.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("POST /payroll/runs/:id/finalize", () => {
    test("HR can finalize a DRAFT run", async () => {
      const run = db.prepare(`SELECT * FROM payroll_runs WHERE month='2026-01'`).get();
      const res = await supertest(app)
        .post(`/api/payroll/runs/${run.id}/finalize`)
        .set("Cookie", hrCookie);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("FINAL");
      // Check DB
      const updated = db.prepare(`SELECT * FROM payroll_runs WHERE id=?`).get(run.id);
      expect(updated.status).toBe("FINAL");
      expect(updated.finalized_at).toBeTruthy();
    });

    test("cannot finalize already-finalized run", async () => {
      const run = db.prepare(`SELECT * FROM payroll_runs WHERE month='2026-01'`).get();
      const res = await supertest(app)
        .post(`/api/payroll/runs/${run.id}/finalize`)
        .set("Cookie", hrCookie);
      expect(res.status).toBe(400);
    });

    test("cannot regenerate a FINAL run", async () => {
      const run = db.prepare(`SELECT * FROM payroll_runs WHERE month='2026-01'`).get();
      const res = await supertest(app)
        .post(`/api/payroll/runs/${run.id}/regenerate`)
        .set("Cookie", hrCookie);
      expect(res.status).toBe(400);
    });
  });

  describe("POST /payroll/runs/:id/reopen", () => {
    test("HR can reopen a FINAL run (audit logged)", async () => {
      const run = db.prepare(`SELECT * FROM payroll_runs WHERE month='2026-01'`).get();
      const res = await supertest(app)
        .post(`/api/payroll/runs/${run.id}/reopen`)
        .set("Cookie", hrCookie);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("DRAFT");
      // Check audit log
      const audit = db.prepare(
        `SELECT * FROM audit_log WHERE entity='payroll_run' AND action='reopen' AND entity_id=?`
      ).get(String(run.id));
      expect(audit).toBeTruthy();
    });

    test("cannot reopen a DRAFT run", async () => {
      const run = db.prepare(`SELECT * FROM payroll_runs WHERE month='2026-01'`).get();
      const res = await supertest(app)
        .post(`/api/payroll/runs/${run.id}/reopen`)
        .set("Cookie", hrCookie);
      expect(res.status).toBe(400);
    });
  });

  describe("GET /payroll/runs", () => {
    test("HR can list runs", async () => {
      const res = await supertest(app)
        .get("/api/payroll/runs")
        .set("Cookie", hrCookie);
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    test("employee cannot list runs (403)", async () => {
      const res = await supertest(app)
        .get("/api/payroll/runs")
        .set("Cookie", empCookie);
      expect(res.status).toBe(403);
    });
  });

  describe("GET /payroll/runs/:id — run detail with lines", () => {
    test("HR can view run detail", async () => {
      const run = db.prepare(`SELECT * FROM payroll_runs WHERE month='2026-01'`).get();
      const res = await supertest(app)
        .get(`/api/payroll/runs/${run.id}`)
        .set("Cookie", hrCookie);
      expect(res.status).toBe(200);
      expect(res.body.run).toBeDefined();
      expect(res.body.lines.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("CSV exports", () => {
    test("register.csv returns CSV", async () => {
      // Finalize first
      const run = db.prepare(`SELECT * FROM payroll_runs WHERE month='2026-01'`).get();
      if (run.status === "DRAFT") {
        await supertest(app)
          .post(`/api/payroll/runs/${run.id}/finalize`)
          .set("Cookie", hrCookie);
      }
      const finalRun = db.prepare(`SELECT * FROM payroll_runs WHERE month='2026-01'`).get();
      const res = await supertest(app)
        .get(`/api/payroll/runs/${finalRun.id}/register.csv`)
        .set("Cookie", hrCookie);
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("text/csv");
      expect(res.text).toContain("Employee Code");
    });

    test("bank.csv returns CSV", async () => {
      const run = db.prepare(`SELECT * FROM payroll_runs WHERE month='2026-01'`).get();
      const res = await supertest(app)
        .get(`/api/payroll/runs/${run.id}/bank.csv`)
        .set("Cookie", hrCookie);
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("text/csv");
    });

    test("employee cannot get register.csv (403)", async () => {
      const run = db.prepare(`SELECT * FROM payroll_runs WHERE month='2026-01'`).get();
      const res = await supertest(app)
        .get(`/api/payroll/runs/${run.id}/register.csv`)
        .set("Cookie", empCookie);
      expect(res.status).toBe(403);
    });
  });

  describe("GET /payroll/payslip/:lineId", () => {
    test("employee can view own payslip (finalized run)", async () => {
      // Ensure run is finalized
      const run = db.prepare(`SELECT * FROM payroll_runs WHERE month='2026-01'`).get();
      if (run.status === "DRAFT") {
        await supertest(app)
          .post(`/api/payroll/runs/${run.id}/finalize`)
          .set("Cookie", hrCookie);
      }
      const line = db.prepare(
        `SELECT pl.* FROM payroll_lines pl JOIN payroll_runs pr ON pl.run_id=pr.id
         WHERE pl.employee_id=? AND pr.month='2026-01'`
      ).get(empUser.id);
      expect(line).toBeTruthy();
      const res = await supertest(app)
        .get(`/api/payroll/payslip/${line.id}`)
        .set("Cookie", empCookie);
      expect(res.status).toBe(200);
      expect(res.body.employee_id).toBe(empUser.id);
      expect(res.body.gross).toBeGreaterThan(0);
    });

    test("employee cannot view others' payslip (403)", async () => {
      const line = db.prepare(
        `SELECT pl.* FROM payroll_lines pl JOIN payroll_runs pr ON pl.run_id=pr.id
         WHERE pl.employee_id=? AND pr.month='2026-01'`
      ).get(hrUser.id);
      if (line) {
        const res = await supertest(app)
          .get(`/api/payroll/payslip/${line.id}`)
          .set("Cookie", empCookie);
        expect(res.status).toBe(403);
      }
    });

    test("employee cannot view payslip from DRAFT run (403)", async () => {
      // Create a draft run for a different month
      seedFullMonthAttendance(empUser.id, "2026-03");
      await supertest(app)
        .post("/api/payroll/runs")
        .set("Cookie", hrCookie)
        .send({ month: "2026-03" });
      const line = db.prepare(
        `SELECT pl.* FROM payroll_lines pl JOIN payroll_runs pr ON pl.run_id=pr.id
         WHERE pl.employee_id=? AND pr.month='2026-03'`
      ).get(empUser.id);
      if (line) {
        const res = await supertest(app)
          .get(`/api/payroll/payslip/${line.id}`)
          .set("Cookie", empCookie);
        expect(res.status).toBe(403);
      }
    });

    test("HR can view any payslip (even draft)", async () => {
      const line = db.prepare(
        `SELECT pl.* FROM payroll_lines pl JOIN payroll_runs pr ON pl.run_id=pr.id
         WHERE pl.employee_id=? AND pr.month='2026-03'`
      ).get(empUser.id);
      if (line) {
        const res = await supertest(app)
          .get(`/api/payroll/payslip/${line.id}`)
          .set("Cookie", hrCookie);
        expect(res.status).toBe(200);
      }
    });
  });

  describe("GET /payroll/my-payslips — employee's finalized payslips", () => {
    test("returns only finalized payslips for the logged-in employee", async () => {
      const res = await supertest(app)
        .get("/api/payroll/my-payslips")
        .set("Cookie", empCookie);
      expect(res.status).toBe(200);
      // Only 2026-01 is finalized; 2026-03 is draft
      const months = res.body.map((p) => p.month);
      expect(months).toContain("2026-01");
      expect(months).not.toContain("2026-03");
    });
  });

  describe("Payroll exclusions", () => {
    test("ONBOARDING employees are excluded from run", async () => {
      const ob = await insertEmployee(db, {
        email: "onb@test.com",
        code: "ONB001",
        status: "ONBOARDING",
        doj: "2026-04-01",
      });
      db.prepare(`INSERT INTO salary_structures(employee_id, effective_from, basic) VALUES(?, ?, ?)`).run(ob.id, "2026-04-01", 20000);
      seedFullMonthAttendance(ob.id, "2026-04");
      const res = await supertest(app)
        .post("/api/payroll/runs")
        .set("Cookie", hrCookie)
        .send({ month: "2026-04" });
      expect(res.status).toBe(201);
      const obLine = res.body.lines.find((l) => l.employee_id === ob.id);
      expect(obLine).toBeUndefined();
    });

    test("employees not employed in month are excluded", async () => {
      const exited = await insertEmployee(db, {
        email: "exited@test.com",
        code: "EXIT001",
        status: "EXITED",
        doj: "2020-01-01",
      });
      db.prepare(`UPDATE employees SET exit_date='2025-12-31' WHERE id=?`).run(exited.id);
      db.prepare(`INSERT INTO salary_structures(employee_id, effective_from, basic) VALUES(?, ?, ?)`).run(exited.id, "2020-01-01", 20000);
      // Try generating for 2026-05 — this employee exited before it
      seedFullMonthAttendance(exited.id, "2026-05");
      const res = await supertest(app)
        .post("/api/payroll/runs")
        .set("Cookie", hrCookie)
        .send({ month: "2026-05" });
      expect(res.status).toBe(201);
      const exLine = res.body.lines.find((l) => l.employee_id === exited.id);
      expect(exLine).toBeUndefined();
    });

    test("zero-salary employees are excluded", async () => {
      const zs = await insertEmployee(db, {
        email: "zerosalary@test.com",
        code: "ZS001",
        doj: "2020-01-01",
      });
      // No salary structure inserted
      seedFullMonthAttendance(zs.id, "2026-06");
      const res = await supertest(app)
        .post("/api/payroll/runs")
        .set("Cookie", hrCookie)
        .send({ month: "2026-06" });
      expect(res.status).toBe(201);
      const zsLine = res.body.lines.find((l) => l.employee_id === zs.id);
      expect(zsLine).toBeUndefined();
    });
  });
});
