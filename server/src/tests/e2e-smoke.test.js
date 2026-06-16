import { describe, test, expect, beforeAll } from "vitest";
import { buildApp, insertEmployee, loginAs } from "./helpers.js";
import supertest from "supertest";

describe("E2E smoke — full workflow", () => {
  let app, db, hrCookie;
  let alice, bob;

  beforeAll(async () => {
    ({ app, db } = buildApp());

    const settings = [
      ["weekOffs", JSON.stringify([0])],
      ["satOff", JSON.stringify("none")],
      ["pfEnabled", JSON.stringify(true)],
      ["pfCapWages", JSON.stringify(true)],
      ["esiEnabled", JSON.stringify(true)],
      ["ptEnabled", JSON.stringify(true)],
      ["companyName", JSON.stringify("E2E Test Corp")],
    ];
    const ins = db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)");
    for (const [k, v] of settings) ins.run(k, v);

    db.prepare("INSERT OR IGNORE INTO leave_types(code, name, annual, paid) VALUES(?, ?, ?, ?)").run("EL", "Earned Leave", 18, 1);
    db.prepare("INSERT OR IGNORE INTO leave_types(code, name, annual, paid) VALUES(?, ?, ?, ?)").run("CL", "Casual Leave", 7, 1);
    db.prepare("INSERT INTO departments(name) VALUES(?)").run("Engineering");
    db.prepare("INSERT INTO designations(name) VALUES(?)").run("Developer");

    const hrUser = await insertEmployee(db, {
      role: "HR", email: "e2e_hr@test.com", code: "E2EHR", name: "E2E HR",
      doj: "2020-01-01", dept_id: 1,
    });
    hrCookie = await loginAs(app, "e2e_hr@test.com");

    alice = await insertEmployee(db, {
      email: "alice@e2e.com", code: "E2E001", name: "Alice Engineer",
      gender: "Female", doj: "2024-01-01", dept_id: 1, desig_id: 1,
      manager_id: hrUser.id, pan: "ABCDE1234F", bank_acc: "12345678901234", ifsc: "SBIN0001234",
    });
    bob = await insertEmployee(db, {
      email: "bob@e2e.com", code: "E2E002", name: "Bob Tester",
      gender: "Male", doj: "2024-03-15", dept_id: 1, desig_id: 1,
      manager_id: hrUser.id, pan: "XYZAB9876K", bank_acc: "99887766554433", ifsc: "HDFC0009999",
    });
  });

  test("1. Login — HR and employee", async () => {
    const res = await supertest(app).get("/api/auth/me").set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe("e2e_hr@test.com");

    const aliceCookie = await loginAs(app, "alice@e2e.com");
    const aliceMe = await supertest(app).get("/api/auth/me").set("Cookie", aliceCookie);
    expect(aliceMe.status).toBe(200);
    expect(aliceMe.body.email).toBe("alice@e2e.com");
  });

  test("2. CSV import — parsed rows", async () => {
    // The import endpoint expects pre-parsed CSV (headers + rows + mapping)
    const headers = ["Code", "Name", "Gender", "Email", "Date of Joining", "Department"];
    const rows = [
      ["E2E003", "Charlie Intern", "Male", "charlie@e2e.com", "2024-06-01", "Engineering"],
    ];
    // mapping: field name -> column index
    const mapping = { code: 0, name: 1, gender: 2, email: 3, doj: 4, department: 5 };

    const res = await supertest(app)
      .post("/api/employees/import")
      .set("Cookie", hrCookie)
      .send({ headers, rows, mapping, dupMode: "skip" });
    expect(res.status).toBe(200);
    expect(res.body.added).toBeGreaterThanOrEqual(1);
  });

  test("3. Mark attendance and verify", async () => {
    const today = "2024-06-03";
    const marks = {};
    marks[alice.id] = "P";
    marks[bob.id] = "P";

    const markRes = await supertest(app)
      .put("/api/attendance/" + today)
      .set("Cookie", hrCookie)
      .send({ marks });
    expect(markRes.status).toBe(200);

    // GET /api/attendance?date=YYYY-MM-DD returns { date, employees: [...] }
    const check = await supertest(app)
      .get("/api/attendance?date=" + today)
      .set("Cookie", hrCookie);
    expect(check.status).toBe(200);
    const aliceRow = check.body.employees.find(function(r) { return r.code === "E2E001"; });
    expect(aliceRow).toBeDefined();
    expect(aliceRow.attCode).toBe("P");
  });

  test("4. Leave chain — apply then approve", async () => {
    const aliceCookie = await loginAs(app, "alice@e2e.com");

    // Apply leave (balance is auto-calculated from leave_types.annual)
    const apply = await supertest(app)
      .post("/api/leaves")
      .set("Cookie", aliceCookie)
      .send({
        type: "CL",
        date_from: "2024-06-10",
        date_to: "2024-06-11",
        reason: "E2E test leave",
      });
    expect(apply.status).toBe(201);
    const leaveId = apply.body.id;

    // HR approves
    const approve = await supertest(app)
      .post("/api/leaves/" + leaveId + "/approve")
      .set("Cookie", hrCookie);
    expect(approve.status).toBe(200);

    // Verify leave is APPROVED
    const leaveRow = db.prepare("SELECT status FROM leaves WHERE id=?").get(leaveId);
    expect(leaveRow.status).toBe("APPROVED");
  });

  test("5. Payroll — draft + finalize", async () => {
    for (const emp of [alice, bob]) {
      db.prepare(
        "INSERT OR IGNORE INTO salary_structures(employee_id, effective_from, ctc_annual, basic, hra, special, conveyance, medical, lta, other_earn, other_earn_label) VALUES(?, ?, 600000, 25000, 12500, 10000, 1600, 1250, 0, 0, '')"
      ).run(emp.id, emp.doj);
    }

    // Mark full month attendance for June 2024 (weekdays)
    const month = "2024-06";
    for (let d = 1; d <= 30; d++) {
      const date = "2024-06-" + String(d).padStart(2, "0");
      const dow = new Date(date).getDay();
      if (dow === 0) continue;
      const marks = {};
      marks[alice.id] = "P";
      marks[bob.id] = "P";
      await supertest(app)
        .put("/api/attendance/" + date)
        .set("Cookie", hrCookie)
        .send({ marks });
    }

    // Draft payroll
    const draft = await supertest(app)
      .post("/api/payroll/runs")
      .set("Cookie", hrCookie)
      .send({ month: month });
    expect(draft.status).toBe(201);
    const runId = draft.body.run.id;

    // Check draft has lines
    const run = await supertest(app)
      .get("/api/payroll/runs/" + runId)
      .set("Cookie", hrCookie);
    expect(run.status).toBe(200);
    expect(run.body.lines.length).toBeGreaterThanOrEqual(2);

    // Finalize
    const fin = await supertest(app)
      .post("/api/payroll/runs/" + runId + "/finalize")
      .set("Cookie", hrCookie);
    expect(fin.status).toBe(200);
    expect(fin.body.status).toBe("FINAL");
  });

  test("6. Payslip — employee can view own finalized payslip", async () => {
    const aliceCookie = await loginAs(app, "alice@e2e.com");

    const payslips = await supertest(app)
      .get("/api/payroll/my-payslips")
      .set("Cookie", aliceCookie);
    expect(payslips.status).toBe(200);
    expect(payslips.body.length).toBeGreaterThanOrEqual(1);

    const lineId = payslips.body[0].id;
    const slip = await supertest(app)
      .get("/api/payroll/payslip/" + lineId)
      .set("Cookie", aliceCookie);
    expect(slip.status).toBe(200);
    expect(slip.body.net).toBeGreaterThan(0);
    expect(slip.body.emp_name).toBe("Alice Engineer");
  });

  test("7. Backup script exists", async () => {
    const { existsSync } = await import("fs");
    const { resolve } = await import("path");
    const { fileURLToPath } = await import("url");
    const dir = resolve(fileURLToPath(import.meta.url), "..");
    const scriptPath = resolve(dir, "../../../scripts/backup.sh");
    expect(existsSync(scriptPath)).toBe(true);
  });
});
