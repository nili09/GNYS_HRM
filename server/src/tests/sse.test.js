import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { buildApp, insertEmployee, loginAs } from "./helpers.js";
import supertest from "supertest";

describe("SSE Event Emission", () => {
  let app, db, hrCookie, empCookie, adminCookie;
  let broadcastSpy;

  beforeAll(async () => {
    ({ app, db } = buildApp());

    db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)").run("weekOffs", JSON.stringify([0]));
    db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)").run("satOff", JSON.stringify("none"));
    db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)").run("pfEnabled", JSON.stringify(true));
    db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)").run("pfCapWages", JSON.stringify(true));
    db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)").run("esiEnabled", JSON.stringify(true));
    db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)").run("ptEnabled", JSON.stringify(true));
    db.prepare("INSERT OR IGNORE INTO leave_types(code, name, annual, paid) VALUES(?, ?, ?, ?)").run("EL", "Earned Leave", 18, 1);
    db.prepare("INSERT INTO departments(name) VALUES(?)").run("SSE-Test-Dept");

    const admin = await insertEmployee(db, { role: "ADMIN", email: "sse_admin@test.com", code: "SSADM01", name: "SSE Admin" });
    const hr = await insertEmployee(db, { role: "HR", email: "sse_hr@test.com", code: "SSHR01", name: "SSE HR" });
    const emp = await insertEmployee(db, { email: "sse_emp@test.com", code: "SSEMP01", name: "SSE Emp", doj: "2024-01-01" });

    adminCookie = await loginAs(app, "sse_admin@test.com");
    hrCookie = await loginAs(app, "sse_hr@test.com");
    empCookie = await loginAs(app, "sse_emp@test.com");

    const sseModule = await import("../utils/sse.js");
    broadcastSpy = vi.spyOn(sseModule, "broadcast");
  });

  afterAll(() => { broadcastSpy?.mockRestore(); });

  test("employee creation broadcasts SSE", async () => {
    broadcastSpy.mockClear();
    const res = await supertest(app)
      .post("/api/employees")
      .set("Cookie", hrCookie)
      .send({
        code: "SSENEW01", name: "New SSE", gender: "Male",
        email: "ssenew@test.com", doj: "2024-01-01", status: "ACTIVE",
        role: "EMPLOYEE", password: "TestPass@123",
      });
    expect(res.status).toBe(201);
    expect(broadcastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ entity: "employees" })
    );
  });

  test("attendance marking broadcasts SSE", async () => {
    broadcastSpy.mockClear();
    const today = new Date().toISOString().slice(0, 10);
    const empRow = db.prepare("SELECT id FROM employees WHERE code='SSEMP01'").get();
    const marks = {};
    marks[String(empRow.id)] = "P";
    const res = await supertest(app)
      .put(`/api/attendance/${today}`)
      .set("Cookie", hrCookie)
      .send({ marks });
    expect(res.status).toBe(200);
    expect(broadcastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ entity: "attendance" })
    );
  });

  test("leave application broadcasts SSE", async () => {
    broadcastSpy.mockClear();
    const res = await supertest(app)
      .post("/api/leaves")
      .set("Cookie", empCookie)
      .send({ type: "EL", date_from: "2027-03-10", date_to: "2027-03-10", reason: "SSE test" });
    expect(res.status).toBe(201);
    expect(broadcastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ entity: "leaves" })
    );
  });

  test("leave approval broadcasts SSE", async () => {
    const leave = db.prepare("SELECT id FROM leaves WHERE status='PENDING' ORDER BY id DESC LIMIT 1").get();
    if (leave) {
      broadcastSpy.mockClear();
      const res = await supertest(app)
        .post(`/api/leaves/${leave.id}/approve`)
        .set("Cookie", hrCookie)
        .send({});
      expect(res.status).toBe(200);
      expect(broadcastSpy).toHaveBeenCalledWith(
        expect.objectContaining({ entity: "leaves" })
      );
    }
  });

  test("settings update broadcasts SSE", async () => {
    broadcastSpy.mockClear();
    const res = await supertest(app)
      .put("/api/settings")
      .set("Cookie", adminCookie)
      .send({ companyName: "SSE Test Corp" });
    expect(res.status).toBe(200);
    expect(broadcastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ entity: "settings" })
    );
  });

  test("payroll run broadcasts SSE", async () => {
    const empRow = db.prepare("SELECT id FROM employees WHERE code='SSEMP01'").get();
    db.prepare(
      `INSERT OR IGNORE INTO salary_structures(employee_id, effective_from, ctc_annual, basic, hra, special, conveyance, medical, lta, other_earn, other_earn_label)
       VALUES(?, '2024-01-01', 600000, 25000, 12500, 10000, 1600, 1250, 0, 0, '')`
    ).run(empRow.id);

    broadcastSpy.mockClear();
    const res = await supertest(app)
      .post("/api/payroll/runs")
      .set("Cookie", hrCookie)
      .send({ month: "2027-03" });
    expect(res.status).toBe(201);
    expect(broadcastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ entity: "payroll" })
    );
  });
});
