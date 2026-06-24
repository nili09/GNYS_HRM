/**
 * Tests for leave-endpoint scale fixes:
 * BUG-008: GET /leaves pagination
 * BUG-009: GET /leave-balances batched queries (no 2N+1)
 * BUG-015: pending-count excludes orphaned leaves
 */
import { describe, it, expect, beforeEach } from "vitest";
import { buildApp, insertEmployee, loginAs } from "./helpers.js";
import supertest from "supertest";

let app, db, hr, hrCookie;

beforeEach(async () => {
  ({ app, db } = buildApp());
  hr = await insertEmployee(db, {
    email: "hr@igenesys.com", role: "HR", name: "HR User",
  });
  hrCookie = await loginAs(app, "hr@igenesys.com");

  db.prepare("INSERT OR IGNORE INTO leave_types(code,name,annual,paid,carry_fwd,max_carry) VALUES('EL','Earned Leave',12,1,1,6)").run();
  db.prepare("INSERT OR IGNORE INTO leave_types(code,name,annual,paid,carry_fwd,max_carry) VALUES('CL','Casual Leave',6,1,0,0)").run();

  db.prepare("INSERT OR IGNORE INTO settings(key,value) VALUES('weekOffs',?),('satOff',?)").run(JSON.stringify([0]), JSON.stringify("none"));
});

// ═══════════════════════════════════════════════════════════════════════════
// BUG-008: GET /leaves pagination
// ═══════════════════════════════════════════════════════════════════════════

describe("GET /leaves — pagination envelope", () => {
  it("returns { data, total, page, pageSize } shape", async () => {
    const emp = await insertEmployee(db, { email: "pag1@igenesys.com", manager_id: hr.id });
    db.prepare(
      `INSERT INTO leaves(employee_id, type, date_from, date_to, days, status)
       VALUES(?, 'EL', '2025-03-03', '2025-03-05', 3, 'PENDING')`
    ).run(emp.id);

    const res = await supertest(app)
      .get("/api/leaves")
      .set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
    expect(res.body).toHaveProperty("total");
    expect(res.body).toHaveProperty("page");
    expect(res.body).toHaveProperty("pageSize");
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.page).toBe(1);
  });

  it("paginates correctly — no overlap between pages", async () => {
    const emp = await insertEmployee(db, { email: "pag2@igenesys.com", manager_id: hr.id });
    for (let i = 1; i <= 5; i++) {
      db.prepare(
        `INSERT INTO leaves(employee_id, type, date_from, date_to, days, status)
         VALUES(?, 'EL', ?, ?, 1, 'PENDING')`
      ).run(emp.id, `2025-04-${String(i).padStart(2, "0")}`, `2025-04-${String(i).padStart(2, "0")}`);
    }

    const p1 = await supertest(app)
      .get("/api/leaves?limit=3&page=1")
      .set("Cookie", hrCookie);
    const p2 = await supertest(app)
      .get("/api/leaves?limit=3&page=2")
      .set("Cookie", hrCookie);

    expect(p1.body.data.length).toBe(3);
    expect(p2.body.data.length).toBe(2);
    expect(p1.body.total).toBe(5);
    expect(p2.body.total).toBe(5);
    const ids1 = new Set(p1.body.data.map(l => l.id));
    const ids2 = new Set(p2.body.data.map(l => l.id));
    for (const id of ids2) expect(ids1.has(id)).toBe(false);
  });

  it("respects existing filters alongside pagination", async () => {
    const emp = await insertEmployee(db, { email: "pag3@igenesys.com", manager_id: hr.id });
    db.prepare(
      `INSERT INTO leaves(employee_id, type, date_from, date_to, days, status)
       VALUES(?, 'EL', '2025-05-01', '2025-05-01', 1, 'PENDING')`
    ).run(emp.id);
    db.prepare(
      `INSERT INTO leaves(employee_id, type, date_from, date_to, days, status)
       VALUES(?, 'CL', '2025-05-02', '2025-05-02', 1, 'APPROVED')`
    ).run(emp.id);

    const res = await supertest(app)
      .get("/api/leaves?status=PENDING&limit=50")
      .set("Cookie", hrCookie);
    expect(res.body.data.every(l => l.status === "PENDING")).toBe(true);
    expect(res.body.total).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BUG-009: batched balance queries
// ═══════════════════════════════════════════════════════════════════════════

describe("GET /leave-balances — batched queries", () => {
  it("returns correct balances for multiple employees", async () => {
    const emp1 = await insertEmployee(db, { email: "bal1@igenesys.com", doj: "2025-01-01" });
    const emp2 = await insertEmployee(db, { email: "bal2@igenesys.com", doj: "2025-01-01" });

    db.prepare(
      `INSERT INTO leaves(employee_id, type, date_from, date_to, days, status)
       VALUES(?, 'EL', '2025-02-03', '2025-02-05', 3, 'APPROVED')`
    ).run(emp1.id);

    const res = await supertest(app)
      .get("/api/leaves/balances?year=2025")
      .set("Cookie", hrCookie);
    expect(res.status).toBe(200);

    const b1 = res.body.find(b => b.employeeId === emp1.id);
    const b2 = res.body.find(b => b.employeeId === emp2.id);
    expect(b1).toBeTruthy();
    expect(b2).toBeTruthy();
    expect(b1.balances.EL.used).toBe(3);
    expect(b2.balances.EL.used).toBe(0);
  });

  it("uses far fewer queries than 2N+1", async () => {
    for (let i = 0; i < 10; i++) {
      await insertEmployee(db, { email: `batch${i}@igenesys.com`, doj: "2025-01-01" });
    }

    const prepareSpy = [];
    const origPrepare = db.prepare.bind(db);
    db.prepare = function (...args) {
      prepareSpy.push(args[0]);
      return origPrepare(...args);
    };

    await supertest(app)
      .get("/api/leaves/balances?year=2025")
      .set("Cookie", hrCookie);

    db.prepare = origPrepare;

    // With 2N+1 pattern for 10+ employees that would be 20+ queries.
    // Batched: employees query + 1 leaves IN + 1 adjustments IN + leave_types + role check ≈ ≤8
    expect(prepareSpy.length).toBeLessThan(12);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BUG-015: pending-count excludes orphaned leaves
// ═══════════════════════════════════════════════════════════════════════════

describe("GET /leaves/pending-count — excludes orphans", () => {
  it("does not count a leave whose employee_id has no matching employee row", async () => {
    const emp = await insertEmployee(db, { email: "orphan1@igenesys.com", manager_id: hr.id });
    db.prepare(
      `INSERT INTO leaves(employee_id, type, date_from, date_to, days, status)
       VALUES(?, 'EL', '2025-06-10', '2025-06-11', 2, 'PENDING')`
    ).run(emp.id);

    // Insert an orphaned leave — disable FK enforcement temporarily
    const fakeId = 99999;
    db.pragma("foreign_keys = OFF");
    db.prepare(
      `INSERT INTO leaves(employee_id, type, date_from, date_to, days, status)
       VALUES(?, 'EL', '2025-06-12', '2025-06-13', 2, 'PENDING')`
    ).run(fakeId);
    db.pragma("foreign_keys = ON");

    const res = await supertest(app)
      .get("/api/leaves/pending-count")
      .set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    // Should count only the real employee's leave, not the orphan
    expect(res.body.count).toBe(1);
  });
});
