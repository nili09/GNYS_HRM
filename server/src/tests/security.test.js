import { describe, test, expect, beforeAll } from "vitest";
import { buildApp, insertEmployee, loginAs } from "./helpers.js";
import supertest from "supertest";

describe("Security — salary leakage", () => {
  let app, db, empCookie, mgrCookie, empUser, mgrUser, emp2;

  beforeAll(async () => {
    ({ app, db } = buildApp());

    // Seed settings & leave types
    db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)").run("weekOffs", JSON.stringify([0]));
    db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)").run("satOff", JSON.stringify("none"));
    db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)").run("pfEnabled", JSON.stringify(true));
    db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)").run("pfCapWages", JSON.stringify(true));
    db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)").run("esiEnabled", JSON.stringify(true));
    db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)").run("ptEnabled", JSON.stringify(true));
    db.prepare("INSERT OR IGNORE INTO leave_types(code, name, annual, paid) VALUES(?, ?, ?, ?)").run("EL", "Earned Leave", 18, 1);
    db.prepare("INSERT INTO departments(name) VALUES(?)").run("SecTest");

    mgrUser = await insertEmployee(db, {
      email: "sec_mgr@test.com", code: "SECMGR", name: "Sec Manager",
      doj: "2020-01-01", dept_id: 1,
      pan: "ABCDE1234F", bank_acc: "12345678901234", ifsc: "SBIN0001234",
    });
    empUser = await insertEmployee(db, {
      email: "sec_emp@test.com", code: "SECEMP", name: "Sec Employee",
      doj: "2024-01-01", dept_id: 1, manager_id: mgrUser.id,
      pan: "XYZAB9876K", bank_acc: "99887766554433", ifsc: "HDFC0009999",
    });
    emp2 = await insertEmployee(db, {
      email: "sec_emp2@test.com", code: "SECEMP2", name: "Sec Employee2",
      doj: "2024-01-01", dept_id: 1, manager_id: mgrUser.id,
    });

    // Add salary structure for empUser
    db.prepare(
      `INSERT INTO salary_structures(employee_id, effective_from, ctc_annual, basic, hra, special, conveyance, medical, lta, other_earn, other_earn_label)
       VALUES(?, '2024-01-01', 600000, 25000, 12500, 10000, 1600, 1250, 0, 0, '')`
    ).run(empUser.id);

    empCookie = await loginAs(app, "sec_emp@test.com");
    mgrCookie = await loginAs(app, "sec_mgr@test.com");
  });

  const SALARY_KEYS = ["pan", "aadhaar", "uan", "pf_no", "esi_no", "bank_name", "bank_acc", "ifsc", "pf_opt", "esi_opt", "pt_opt", "tds_override", "password_hash"];

  function hasSalaryKeys(obj) {
    const json = JSON.stringify(obj);
    return SALARY_KEYS.filter((k) => json.includes(`"${k}"`));
  }

  test("GET /employees — employee cannot list employees", async () => {
    const res = await supertest(app).get("/api/employees").set("Cookie", empCookie);
    expect(res.status).toBe(403);
  });

  test("GET /employees/:id — employee reading own profile has no password_hash", async () => {
    const res = await supertest(app).get(`/api/employees/${empUser.id}`).set("Cookie", empCookie);
    expect(res.status).toBe(200);
    expect(res.body.password_hash).toBeUndefined();
  });

  test("GET /employees/:id — employee cannot read another employee's profile", async () => {
    const res = await supertest(app).get(`/api/employees/${mgrUser.id}`).set("Cookie", empCookie);
    expect(res.status).toBe(403);
  });

  test("GET /employees/:id — manager reading report gets no salary/statutory fields", async () => {
    const res = await supertest(app).get(`/api/employees/${empUser.id}`).set("Cookie", mgrCookie);
    expect(res.status).toBe(200);
    const leaked = hasSalaryKeys(res.body);
    expect(leaked).toEqual([]);
  });

  test("GET /dashboard/me — employee dashboard has no salary data except own payslip net", async () => {
    const res = await supertest(app).get("/api/dashboard/me").set("Cookie", empCookie);
    expect(res.status).toBe(200);
    // Should not contain any salary keys
    const leaked = SALARY_KEYS.filter((k) => JSON.stringify(res.body).includes(`"${k}"`));
    expect(leaked).toEqual([]);
  });

  test("GET /dashboard/manager — manager dashboard has no salary data for reports", async () => {
    const res = await supertest(app).get("/api/dashboard/manager").set("Cookie", mgrCookie);
    expect(res.status).toBe(200);
    const leaked = SALARY_KEYS.filter((k) => JSON.stringify(res.body).includes(`"${k}"`));
    expect(leaked).toEqual([]);
  });

  test("GET /attendance/team — no salary data in team attendance", async () => {
    const res = await supertest(app).get("/api/attendance/team?month=2024-06").set("Cookie", mgrCookie);
    expect(res.status).toBe(200);
    const leaked = SALARY_KEYS.filter((k) => JSON.stringify(res.body).includes(`"${k}"`));
    expect(leaked).toEqual([]);
  });

  test("GET /payroll/payslip — employee cannot see draft payslip", async () => {
    // Generate a draft payroll for a month
    const hrUser = await insertEmployee(db, { role: "HR", email: "sec_hr@test.com", code: "SECHR1", name: "Sec HR" });
    const hrCookie = await loginAs(app, "sec_hr@test.com");
    await supertest(app).post("/api/payroll/runs").set("Cookie", hrCookie).send({ month: "2024-06" });

    // Find the payslip line
    const line = db.prepare(
      "SELECT pl.id FROM payroll_lines pl JOIN payroll_runs pr ON pl.run_id=pr.id WHERE pr.month='2024-06' AND pl.employee_id=?"
    ).get(empUser.id);

    if (line) {
      const res = await supertest(app).get(`/api/payroll/payslip/${line.id}`).set("Cookie", empCookie);
      // Draft payslips should not be visible to employee
      expect(res.status).toBe(403);
    }
  });

  test("GET /settings — employee cannot read settings", async () => {
    const res = await supertest(app).get("/api/settings").set("Cookie", empCookie);
    expect(res.status).toBe(403);
  });

  test("GET /audit — employee cannot read audit log", async () => {
    const res = await supertest(app).get("/api/audit").set("Cookie", empCookie);
    expect(res.status).toBe(403);
  });

  test("PUT /settings — employee cannot write settings", async () => {
    const res = await supertest(app).put("/api/settings").set("Cookie", empCookie).send({ companyName: "Hacked" });
    expect(res.status).toBe(403);
  });

  test("password_hash never appears in any employee response", async () => {
    const hrUser2 = await insertEmployee(db, { role: "HR", email: "sec_hr2@test.com", code: "SECHR2", name: "Sec HR2" });
    const hrCookie = await loginAs(app, "sec_hr2@test.com");
    // HR reading employee list
    const list = await supertest(app).get("/api/employees").set("Cookie", hrCookie);
    expect(JSON.stringify(list.body)).not.toContain("password_hash");
    // HR reading single employee
    const single = await supertest(app).get(`/api/employees/${empUser.id}`).set("Cookie", hrCookie);
    expect(JSON.stringify(single.body)).not.toContain("password_hash");
  });
});
