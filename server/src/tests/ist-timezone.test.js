import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import supertest from "supertest";
import { buildApp, insertEmployee, loginAs } from "./helpers.js";
import { todayIST, currentYearIST } from "@hrms/shared";

function seedLeaveTypes(db) {
  db.prepare(
    `INSERT OR IGNORE INTO leave_types(code, name, annual, paid, carry_fwd, max_carry)
     VALUES('CL','Casual Leave',7,1,0,0),('EL','Earned Leave',12,1,1,30),('SL','Sick Leave',7,1,0,0)`
  ).run();
}

describe("IST timezone: boundary window (00:00–05:30 IST)", () => {
  let app, db, request;

  beforeEach(() => {
    ({ app, db } = buildApp());
    request = supertest(app);
    seedLeaveTypes(db);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // 2026-01-01 02:00 IST = 2025-12-31 20:30 UTC
  // IST date = 2026-01-01, IST year = 2026
  // UTC date = 2025-12-31, UTC year = 2025
  const BOUNDARY_UTC = new Date("2025-12-31T20:30:00.000Z");

  describe("shared helpers", () => {
    it("todayIST returns IST date, not UTC date", () => {
      vi.useFakeTimers({ now: BOUNDARY_UTC });
      expect(todayIST()).toBe("2026-01-01");
    });

    it("currentYearIST returns IST year, not UTC year", () => {
      vi.useFakeTimers({ now: BOUNDARY_UTC });
      expect(currentYearIST()).toBe(2026);
    });
  });

  describe("leave cancel eligibility uses IST", () => {
    it("uses IST date for cancel check, not UTC", async () => {
      const emp = await insertEmployee(db, { email: "emp_tz@igenesys.com" });

      db.prepare(
        `INSERT INTO leaves(employee_id, type, date_from, date_to, days, reason, status, applied_at)
         VALUES(?, 'CL', '2026-01-01', '2026-01-01', 1, 'test', 'APPROVED', datetime('now'))`
      ).run(emp.id);
      const leaveId = db.prepare("SELECT last_insert_rowid() as id").get().id;

      // Login before faking timers (bcrypt/JWT need real timers)
      const cookie = await loginAs(app, emp.email, "TestPass@123");

      // Fake clock: IST is 2026-01-01 02:00, UTC is 2025-12-31 20:30
      vi.useFakeTimers({ now: BOUNDARY_UTC, shouldAdvanceTime: true });

      // IST today = 2026-01-01 = date_from, so leave has started → cancel should be rejected
      const res = await request
        .post(`/api/leaves/${leaveId}/cancel`)
        .set("Cookie", cookie);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/already started/);
    });
  });

  describe("leave balances default year uses IST", () => {
    it("defaults to IST year when year param omitted", async () => {
      const emp = await insertEmployee(db, { email: "bal_tz@igenesys.com" });

      const cookie = await loginAs(app, emp.email, "TestPass@123");

      vi.useFakeTimers({ now: BOUNDARY_UTC, shouldAdvanceTime: true });

      const res = await request
        .get("/api/leaves/balances")
        .set("Cookie", cookie);
      expect(res.status).toBe(200);
      expect(res.body[0].year).toBe(2026);
    });
  });

  describe("holiday seed default year uses IST", () => {
    it("defaults to IST year when year param omitted", async () => {
      const hr = await insertEmployee(db, { role: "HR", email: "hol_tz@igenesys.com" });

      const cookie = await loginAs(app, hr.email, "TestPass@123");

      vi.useFakeTimers({ now: BOUNDARY_UTC, shouldAdvanceTime: true });

      const res = await request
        .post("/api/holidays/seed")
        .set("Cookie", cookie);
      expect(res.status).toBe(200);
      expect(res.body.year).toBe("2026");
    });
  });

  describe("CSV import default DOJ uses IST", () => {
    it("defaults DOJ to IST date when CSV omits it", async () => {
      const hr = await insertEmployee(db, { role: "HR", email: "imp_tz@igenesys.com" });

      const cookie = await loginAs(app, hr.email, "TestPass@123");

      vi.useFakeTimers({ now: BOUNDARY_UTC, shouldAdvanceTime: true });

      const res = await request
        .post("/api/employees/import")
        .set("Cookie", cookie)
        .send({
          headers: ["Employee Name", "Email Id"],
          rows: [["Timezone Test", "tztest@igenesys.com"]],
          mapping: { name: 0, email: 1 },
        });
      expect(res.status).toBe(200);

      const emp = db.prepare("SELECT doj FROM employees WHERE email='tztest@igenesys.com'").get();
      expect(emp.doj).toBe("2026-01-01");
    });
  });
});
