import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { buildApp, insertEmployee, loginAs } from "./helpers.js";

let app, db;

beforeEach(async () => {
  ({ app, db } = buildApp());
});

function seedSettings(db) {
  db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES('weekOffs', ?)")
    .run(JSON.stringify([0]));
  db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES('satOff', ?)")
    .run(JSON.stringify("none"));
}

function seedLeaveTypes(db) {
  for (const code of ["EL", "CL", "SL", "LWP"]) {
    db.prepare(
      "INSERT OR IGNORE INTO leave_types(code, name, annual, paid, carry_fwd, max_carry) VALUES(?, ?, 21, 1, 0, 0)"
    ).run(code, code);
  }
}

describe("GET /attendance/team-calendar", () => {
  it("rejects missing month param", async () => {
    const emp = await insertEmployee(db, { email: "a@igenesys.com", role: "HR" });
    const cookie = await loginAs(app, "a@igenesys.com");
    const res = await request(app)
      .get("/api/attendance/team-calendar")
      .set("Cookie", cookie);
    expect(res.status).toBe(400);
  });

  it("manager sees only direct reports", async () => {
    seedSettings(db);
    seedLeaveTypes(db);
    const mgr = await insertEmployee(db, { email: "mgr@igenesys.com" });
    const rep = await insertEmployee(db, { email: "rep@igenesys.com", manager_id: mgr.id, name: "Alice Report" });
    await insertEmployee(db, { email: "other@igenesys.com", name: "Bob Other" });

    // Give Alice an approved leave on a weekday in 2025-01 (Wed Jan 15)
    db.prepare(
      `INSERT INTO leaves(employee_id, type, date_from, date_to, half_from, half_to, days, reason, status, applied_at)
       VALUES(?, 'EL', '2025-01-15', '2025-01-15', 0, 0, 1, 'test', 'APPROVED', datetime('now'))`
    ).run(rep.id);

    const cookie = await loginAs(app, "mgr@igenesys.com");
    const res = await request(app)
      .get("/api/attendance/team-calendar?month=2025-01")
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.month).toBe("2025-01");
    expect(res.body.days).toBe(31);

    const jan15 = res.body.entries.find((e) => e.date === "2025-01-15");
    expect(jan15).toBeDefined();
    expect(jan15.people).toHaveLength(1);
    expect(jan15.people[0].name).toBe("Alice Report");
    expect(jan15.people[0].status).toBe("L");
    expect(jan15.people[0].leave_type).toBe("EL");

    // Bob should NOT appear anywhere
    const allNames = res.body.entries.flatMap((e) => e.people.map((p) => p.name));
    expect(allNames).not.toContain("Bob Other");
  });

  it("plain employee with no reports gets empty entries", async () => {
    seedSettings(db);
    await insertEmployee(db, { email: "solo@igenesys.com" });
    const cookie = await loginAs(app, "solo@igenesys.com");
    const res = await request(app)
      .get("/api/attendance/team-calendar?month=2025-01")
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.entries).toEqual([]);
  });

  it("HR sees all employees", async () => {
    seedSettings(db);
    seedLeaveTypes(db);
    const hr = await insertEmployee(db, { email: "hr@igenesys.com", role: "HR" });
    const emp1 = await insertEmployee(db, { email: "e1@igenesys.com", name: "Eve" });
    const emp2 = await insertEmployee(db, { email: "e2@igenesys.com", name: "Frank" });

    // Both on leave same day (Tue Jan 14, 2025)
    for (const emp of [emp1, emp2]) {
      db.prepare(
        `INSERT INTO leaves(employee_id, type, date_from, date_to, half_from, half_to, days, reason, status, applied_at)
         VALUES(?, 'CL', '2025-01-14', '2025-01-14', 0, 0, 1, 'test', 'APPROVED', datetime('now'))`
      ).run(emp.id);
    }

    const cookie = await loginAs(app, "hr@igenesys.com");
    const res = await request(app)
      .get("/api/attendance/team-calendar?month=2025-01")
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    const jan14 = res.body.entries.find((e) => e.date === "2025-01-14");
    expect(jan14).toBeDefined();
    const names = jan14.people.map((p) => p.name).sort();
    expect(names).toContain("Eve");
    expect(names).toContain("Frank");
  });

  it("includes WFH and OD attendance marks", async () => {
    seedSettings(db);
    const mgr = await insertEmployee(db, { email: "mgr2@igenesys.com" });
    const rep = await insertEmployee(db, { email: "wfh@igenesys.com", manager_id: mgr.id, name: "Wanda" });

    // Mark WFH on Wed Jan 15, 2025
    db.prepare(
      `INSERT INTO attendance(date, employee_id, code, marked_by, marked_at)
       VALUES('2025-01-15', ?, 'WFH', ?, datetime('now'))`
    ).run(rep.id, mgr.id);

    const cookie = await loginAs(app, "mgr2@igenesys.com");
    const res = await request(app)
      .get("/api/attendance/team-calendar?month=2025-01")
      .set("Cookie", cookie);
    const jan15 = res.body.entries.find((e) => e.date === "2025-01-15");
    expect(jan15).toBeDefined();
    expect(jan15.people[0].status).toBe("WFH");
    expect(jan15.people[0].name).toBe("Wanda");
  });

  it("holidays appear in entries and holidays array", async () => {
    seedSettings(db);
    const hr = await insertEmployee(db, { email: "hr2@igenesys.com", role: "HR" });
    await insertEmployee(db, { email: "emp@igenesys.com", name: "Test Emp" });

    db.prepare("INSERT INTO holidays(date, name) VALUES('2025-01-26', 'Republic Day')").run();

    const cookie = await loginAs(app, "hr2@igenesys.com");
    const res = await request(app)
      .get("/api/attendance/team-calendar?month=2025-01")
      .set("Cookie", cookie);
    expect(res.body.holidays).toEqual([{ date: "2025-01-26", name: "Republic Day" }]);
    const jan26 = res.body.entries.find((e) => e.date === "2025-01-26");
    expect(jan26).toBeDefined();
    expect(jan26.people.some((p) => p.status === "H")).toBe(true);
  });

  it("days with nobody out are omitted from entries", async () => {
    seedSettings(db);
    const mgr = await insertEmployee(db, { email: "mgr3@igenesys.com" });
    await insertEmployee(db, { email: "emp3@igenesys.com", manager_id: mgr.id });

    const cookie = await loginAs(app, "mgr3@igenesys.com");
    const res = await request(app)
      .get("/api/attendance/team-calendar?month=2025-01")
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    // Only holidays (weekends aren't included as "out" entries) and actual absences
    // With no leaves/marks, only holiday entries should appear if any
    for (const entry of res.body.entries) {
      expect(entry.people.length).toBeGreaterThan(0);
    }
  });

  it("requires authentication", async () => {
    const res = await request(app)
      .get("/api/attendance/team-calendar?month=2025-01");
    expect(res.status).toBe(401);
  });
});
