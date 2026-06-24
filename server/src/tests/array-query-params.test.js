import { describe, it, expect, beforeAll } from "vitest";
import supertest from "supertest";
import { buildApp, insertEmployee, loginAs } from "./helpers.js";

let app, db, hrCookie, emp;

beforeAll(async () => {
  ({ app, db } = buildApp());

  const hr = await insertEmployee(db, {
    role: "HR", email: "hr@igenesys.com", code: "HR001",
  });
  emp = await insertEmployee(db, {
    role: "EMPLOYEE", email: "emp@igenesys.com", code: "EMP001",
    doj: "2024-01-01", manager_id: hr.id,
  });
  hrCookie = await loginAs(app, "hr@igenesys.com");

  db.prepare("INSERT OR IGNORE INTO leave_types(code,name,annual,paid) VALUES('EL','Earned Leave',12,1)").run();
  db.prepare(
    `INSERT INTO leaves(employee_id, type, date_from, date_to, days, status)
     VALUES(?, 'EL', '2025-06-10', '2025-06-11', 2, 'PENDING')`
  ).run(emp.id);
  db.prepare(
    `INSERT INTO leaves(employee_id, type, date_from, date_to, days, status)
     VALUES(?, 'EL', '2025-07-01', '2025-07-02', 2, 'APPROVED')`
  ).run(emp.id);

  db.prepare("INSERT OR IGNORE INTO expense_categories(name) VALUES('Travel')").run();
  const cat = db.prepare("SELECT id FROM expense_categories WHERE name='Travel'").get();
  db.prepare(
    `INSERT INTO expenses(employee_id, category_id, amount, date, description, status)
     VALUES(?,?,100,'2025-06-15','Bus','PENDING')`
  ).run(emp.id, cat.id);
  db.prepare(
    `INSERT INTO expenses(employee_id, category_id, amount, date, description, status)
     VALUES(?,?,200,'2025-06-16','Hotel','APPROVED')`
  ).run(emp.id, cat.id);

  db.prepare(
    `INSERT INTO advance_requests(employee_id, amount, reason, status)
     VALUES(?,500,'Advance','PENDING')`
  ).run(emp.id);
  db.prepare(
    `INSERT INTO advance_requests(employee_id, amount, reason, status)
     VALUES(?,300,'Advance 2','APPROVED')`
  ).run(emp.id);

  db.prepare("INSERT OR IGNORE INTO departments(name) VALUES('Eng')").run();
  db.prepare("INSERT OR IGNORE INTO locations(name) VALUES('HQ')").run();
  const dept = db.prepare("SELECT id FROM departments WHERE name='Eng'").get();
  const loc = db.prepare("SELECT id FROM locations WHERE name='HQ'").get();
  db.prepare(
    `INSERT INTO job_openings(title, dept_id, location_id, positions, status, created_by)
     VALUES('Dev',?,?,2,'OPEN',?)`
  ).run(dept.id, loc.id, hr.id);
  db.prepare(
    `INSERT INTO job_openings(title, dept_id, location_id, positions, status, created_by)
     VALUES('QA',?,?,1,'CLOSED',?)`
  ).run(dept.id, loc.id, hr.id);

  db.prepare(
    `INSERT INTO review_cycles(name, year, start_date, end_date, status, created_by)
     VALUES('H1',2025,'2025-01-01','2025-06-30','ACTIVE',?)`
  ).run(hr.id);
  db.prepare(
    `INSERT INTO review_cycles(name, year, start_date, end_date, status, created_by)
     VALUES('H2',2025,'2025-07-01','2025-12-31','DRAFT',?)`
  ).run(hr.id);

  db.prepare("INSERT OR IGNORE INTO ticket_categories(name) VALUES('IT')").run();
  const tcat = db.prepare("SELECT id FROM ticket_categories WHERE name='IT'").get();
  db.prepare(
    `INSERT INTO tickets(employee_id, category_id, subject, description, status, priority)
     VALUES(?,?,'Laptop','Broken','OPEN','HIGH')`
  ).run(emp.id, tcat.id);
  db.prepare(
    `INSERT INTO tickets(employee_id, category_id, subject, description, status, priority)
     VALUES(?,?,'VPN','Setup','RESOLVED','LOW')`
  ).run(emp.id, tcat.id);
});

describe("Repeated ?status= query params (array handling)", () => {
  it("GET /leaves?status=PENDING&status=APPROVED returns both", async () => {
    const res = await supertest(app)
      .get("/api/leaves?status=PENDING&status=APPROVED")
      .set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    const statuses = res.body.data.map(r => r.status);
    expect(statuses).toContain("PENDING");
    expect(statuses).toContain("APPROVED");
    expect(res.body.data.length).toBe(2);
  });

  it("GET /expenses?status=PENDING&status=APPROVED returns both", async () => {
    const res = await supertest(app)
      .get("/api/expenses?status=PENDING&status=APPROVED")
      .set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    const statuses = res.body.map(r => r.status);
    expect(statuses).toContain("PENDING");
    expect(statuses).toContain("APPROVED");
    expect(res.body.length).toBe(2);
  });

  it("GET /expenses/advances?status=PENDING&status=APPROVED returns both", async () => {
    const res = await supertest(app)
      .get("/api/expenses/advances?status=PENDING&status=APPROVED")
      .set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    const statuses = res.body.map(r => r.status);
    expect(statuses).toContain("PENDING");
    expect(statuses).toContain("APPROVED");
    expect(res.body.length).toBe(2);
  });

  it("GET /recruitment/jobs?status=OPEN&status=CLOSED returns both", async () => {
    const res = await supertest(app)
      .get("/api/recruitment/jobs?status=OPEN&status=CLOSED")
      .set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    const statuses = res.body.map(r => r.status);
    expect(statuses).toContain("OPEN");
    expect(statuses).toContain("CLOSED");
    expect(res.body.length).toBe(2);
  });

  it("GET /performance/review-cycles?status=ACTIVE&status=DRAFT returns both", async () => {
    const res = await supertest(app)
      .get("/api/performance/review-cycles?status=ACTIVE&status=DRAFT")
      .set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    const statuses = res.body.map(r => r.status);
    expect(statuses).toContain("ACTIVE");
    expect(statuses).toContain("DRAFT");
    expect(res.body.length).toBe(2);
  });

  it("GET /helpdesk/tickets?status=OPEN&status=RESOLVED returns both", async () => {
    const res = await supertest(app)
      .get("/api/helpdesk/tickets?status=OPEN&status=RESOLVED")
      .set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    const statuses = res.body.map(r => r.status);
    expect(statuses).toContain("OPEN");
    expect(statuses).toContain("RESOLVED");
    expect(res.body.length).toBe(2);
  });

  it("single ?status= still works (backward compat)", async () => {
    const res = await supertest(app)
      .get("/api/leaves?status=PENDING")
      .set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.every(r => r.status === "PENDING")).toBe(true);
  });

  it("lowercase repeated status is uppercased correctly", async () => {
    const res = await supertest(app)
      .get("/api/leaves?status=pending&status=approved")
      .set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
  });
});
