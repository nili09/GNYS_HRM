import { describe, test, expect, beforeAll } from "vitest";
import { buildApp, insertEmployee, loginAs } from "./helpers.js";
import supertest from "supertest";

describe("Dashboard + Settings API", () => {
  let app, db, adminUser, hrUser, empUser, mgrUser, emp2;
  let adminCookie, hrCookie, empCookie, mgrCookie;

  beforeAll(async () => {
    ({ app, db } = buildApp());

    db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)").run("weekOffs", JSON.stringify([0]));
    db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)").run("satOff", JSON.stringify("none"));
    db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)").run("pfEnabled", JSON.stringify(true));
    db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)").run("pfCapWages", JSON.stringify(true));
    db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)").run("esiEnabled", JSON.stringify(true));
    db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)").run("ptEnabled", JSON.stringify(true));

    db.prepare("INSERT OR IGNORE INTO leave_types(code, name, annual, paid) VALUES(?, ?, ?, ?)").run("EL", "Earned Leave", 18, 1);
    db.prepare("INSERT OR IGNORE INTO leave_types(code, name, annual, paid) VALUES(?, ?, ?, ?)").run("CL", "Casual Leave", 7, 1);
    db.prepare("INSERT OR IGNORE INTO leave_types(code, name, annual, paid) VALUES(?, ?, ?, ?)").run("LWP", "Leave Without Pay", 0, 0);

    db.prepare("INSERT INTO departments(name) VALUES(?)").run("Engineering");
    db.prepare("INSERT INTO departments(name) VALUES(?)").run("HR Dept");

    adminUser = await insertEmployee(db, { role: "ADMIN", email: "admin@test.com", code: "ADM001", name: "Admin User", doj: "2020-01-01", dept_id: 2 });
    hrUser = await insertEmployee(db, { role: "HR", email: "hr@test.com", code: "HR001", name: "HR Manager", doj: "2020-01-01", dept_id: 2 });
    mgrUser = await insertEmployee(db, { email: "mgr@test.com", code: "MGR001", name: "Team Manager", doj: "2020-01-01", dept_id: 1 });
    empUser = await insertEmployee(db, { email: "emp@test.com", code: "EMP001", name: "Emp One", doj: "2024-01-01", dept_id: 1, manager_id: mgrUser.id });
    emp2 = await insertEmployee(db, { email: "emp2@test.com", code: "EMP002", name: "Emp Two", doj: "2024-06-01", dept_id: 1, manager_id: mgrUser.id });

    db.prepare(
      "INSERT INTO leaves(employee_id, type, date_from, date_to, days, status) VALUES(?, ?, ?, ?, ?, ?)"
    ).run(empUser.id, "EL", "2026-07-01", "2026-07-02", 2, "PENDING");

    // Use IST to match the dashboard route
    const istNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const today = istNow.getFullYear() + "-" + String(istNow.getMonth()+1).padStart(2,"0") + "-" + String(istNow.getDate()).padStart(2,"0");

    // Find a weekday this month (weekOffs=[0] = Sunday)
    const dow = istNow.getDay();
    let weekdayDate = today;
    if (dow === 0) {
      const d = new Date(istNow);
      d.setDate(d.getDate() - 1);
      weekdayDate = d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
    }

    db.prepare(
      "INSERT INTO leaves(employee_id, type, date_from, date_to, days, status) VALUES(?, ?, ?, ?, ?, ?)"
    ).run(emp2.id, "EL", weekdayDate, weekdayDate, 1, "APPROVED");

    db.prepare("INSERT OR REPLACE INTO attendance(date, employee_id, code, marked_by) VALUES(?, ?, 'P', ?)").run(weekdayDate, empUser.id, hrUser.id);

    adminCookie = await loginAs(app, "admin@test.com");
    hrCookie = await loginAs(app, "hr@test.com");
    empCookie = await loginAs(app, "emp@test.com");
    mgrCookie = await loginAs(app, "mgr@test.com");
  });

  describe("GET /dashboard/hr", () => {
    test("returns headcount KPIs", async () => {
      const res = await supertest(app).get("/api/dashboard/hr").set("Cookie", hrCookie);
      expect(res.status).toBe(200);
      expect(res.body.headcount.active).toBeGreaterThanOrEqual(5);
      expect(res.body.headcount).toHaveProperty("onboarding");
      expect(res.body.headcount).toHaveProperty("notice");
    });

    test("returns today attendance stats", async () => {
      const res = await supertest(app).get("/api/dashboard/hr").set("Cookie", hrCookie);
      expect(res.body.today).toHaveProperty("present");
      expect(res.body.today).toHaveProperty("onLeave");
      const istNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
      if (istNow.getDay() !== 0) {
        expect(res.body.today.present).toBeGreaterThanOrEqual(1);
      } else {
        expect(res.body.today.present).toBeGreaterThanOrEqual(0);
      }
    });

    test("returns pending leaves with count", async () => {
      const res = await supertest(app).get("/api/dashboard/hr").set("Cookie", hrCookie);
      expect(res.body.pendingLeaves.total).toBeGreaterThanOrEqual(1);
      expect(res.body.pendingLeaves.items.length).toBeGreaterThanOrEqual(1);
      expect(res.body.pendingLeaves.items[0]).toHaveProperty("emp_name");
    });

    test("returns dept distribution", async () => {
      const res = await supertest(app).get("/api/dashboard/hr").set("Cookie", hrCookie);
      expect(res.body.deptDistribution.length).toBeGreaterThanOrEqual(1);
      const eng = res.body.deptDistribution.find(function(d) { return d.dept === "Engineering"; });
      expect(eng).toBeTruthy();
      expect(eng.count).toBeGreaterThanOrEqual(3);
    });

    test("returns payroll status", async () => {
      const res = await supertest(app).get("/api/dashboard/hr").set("Cookie", hrCookie);
      expect(res.body.payroll).toHaveProperty("finalizedRuns");
    });

    test("employee cannot access HR dashboard (403)", async () => {
      const res = await supertest(app).get("/api/dashboard/hr").set("Cookie", empCookie);
      expect(res.status).toBe(403);
    });
  });

  describe("GET /dashboard/manager", () => {
    test("manager sees team data", async () => {
      const res = await supertest(app).get("/api/dashboard/manager").set("Cookie", mgrCookie);
      expect(res.status).toBe(200);
      expect(res.body.isManager).toBe(true);
      expect(res.body.teamSize).toBe(2);
    });

    test("manager sees out-today for direct reports", async () => {
      const res = await supertest(app).get("/api/dashboard/manager").set("Cookie", mgrCookie);
      const istNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
      if (istNow.getDay() !== 0) {
        expect(res.body.outToday.length).toBeGreaterThanOrEqual(1);
      } else {
        expect(Array.isArray(res.body.outToday)).toBe(true);
      }
    });

    test("manager sees pending leaves for direct reports", async () => {
      const res = await supertest(app).get("/api/dashboard/manager").set("Cookie", mgrCookie);
      expect(res.body.pending.length).toBeGreaterThanOrEqual(1);
    });

    test("non-manager gets isManager=false", async () => {
      const res = await supertest(app).get("/api/dashboard/manager").set("Cookie", empCookie);
      expect(res.status).toBe(200);
      expect(res.body.isManager).toBe(false);
    });
  });

  describe("GET /dashboard/me", () => {
    test("returns balances, attendance, pending, last payslip", async () => {
      const res = await supertest(app).get("/api/dashboard/me").set("Cookie", empCookie);
      expect(res.status).toBe(200);
      expect(res.body.balances.length).toBeGreaterThanOrEqual(1);
      expect(res.body.attendance).toHaveProperty("present");
      expect(res.body.attendance.present).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(res.body.pendingRequests)).toBe(true);
    });

    test("employee sees own pending requests", async () => {
      const res = await supertest(app).get("/api/dashboard/me").set("Cookie", empCookie);
      expect(res.body.pendingRequests.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("GET /settings", () => {
    test("HR can read settings", async () => {
      const res = await supertest(app).get("/api/settings").set("Cookie", hrCookie);
      expect(res.status).toBe(200);
      expect(res.body.weekOffs).toEqual([0]);
      expect(res.body.pfEnabled).toBe(true);
    });

    test("employee cannot read settings (403)", async () => {
      const res = await supertest(app).get("/api/settings").set("Cookie", empCookie);
      expect(res.status).toBe(403);
    });
  });

  describe("PUT /settings", () => {
    test("ADMIN can update settings", async () => {
      const res = await supertest(app)
        .put("/api/settings")
        .set("Cookie", adminCookie)
        .send({ satOff: "2_4", companyName: "Genesys Test" });
      expect(res.status).toBe(200);
      expect(res.body.satOff).toBe("2_4");
      expect(res.body.companyName).toBe("Genesys Test");
    });

    test("HR cannot update settings (403)", async () => {
      const res = await supertest(app)
        .put("/api/settings")
        .set("Cookie", hrCookie)
        .send({ satOff: "all" });
      expect(res.status).toBe(403);
    });

    test("settings update is audit-logged", async () => {
      const audit = db.prepare("SELECT * FROM audit_log WHERE entity='settings' ORDER BY id DESC LIMIT 1").get();
      expect(audit).toBeTruthy();
      expect(audit.action).toBe("update");
    });
  });

  describe("GET /audit", () => {
    test("ADMIN can view audit log", async () => {
      const res = await supertest(app).get("/api/audit").set("Cookie", adminCookie);
      expect(res.status).toBe(200);
      expect(res.body.rows.length).toBeGreaterThanOrEqual(1);
      expect(res.body).toHaveProperty("total");
    });

    test("supports entity filter", async () => {
      const res = await supertest(app).get("/api/audit?entity=settings").set("Cookie", adminCookie);
      expect(res.status).toBe(200);
      expect(res.body.rows.every(function(r) { return r.entity === "settings"; })).toBe(true);
    });

    test("HR cannot view audit log (403)", async () => {
      const res = await supertest(app).get("/api/audit").set("Cookie", hrCookie);
      expect(res.status).toBe(403);
    });

    test("employee cannot view audit log (403)", async () => {
      const res = await supertest(app).get("/api/audit").set("Cookie", empCookie);
      expect(res.status).toBe(403);
    });
  });
});
