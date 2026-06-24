import { describe, test, expect, beforeAll } from "vitest";
import supertest from "supertest";
import { buildApp, insertEmployee, loginAs } from "./helpers.js";
import { indexEntity, removeEntity, reindexAll, search } from "../utils/search.js";

// ── Unit: indexing functions ─────────────────────────────────────────────

describe("Search: indexing utilities", () => {
  let db;

  beforeAll(() => {
    ({ db } = buildApp());
  });

  test("indexEntity inserts into FTS5 table", () => {
    indexEntity(db, "employee", 1, "John Doe", "EMP001 john@test.com Engineering", { dept: "Engineering" });
    const rows = db.prepare("SELECT * FROM search_index WHERE entity='employee' AND entity_id='1'").all();
    expect(rows.length).toBe(1);
    expect(rows[0].title).toBe("John Doe");
  });

  test("indexEntity upserts (replaces existing)", () => {
    indexEntity(db, "employee", 1, "John Doe Updated", "EMP001 john@test.com HR", { dept: "HR" });
    const rows = db.prepare("SELECT * FROM search_index WHERE entity='employee' AND entity_id='1'").all();
    expect(rows.length).toBe(1);
    expect(rows[0].title).toBe("John Doe Updated");
  });

  test("removeEntity deletes from FTS5 table", () => {
    indexEntity(db, "announcement", 99, "Test Ann", "body text", {});
    removeEntity(db, "announcement", 99);
    const rows = db.prepare("SELECT * FROM search_index WHERE entity='announcement' AND entity_id='99'").all();
    expect(rows.length).toBe(0);
  });

  test("search returns matching results", () => {
    indexEntity(db, "employee", 10, "Alice Smith", "EMP010 alice@igenesys.com", { dept: "Tech" });
    const results = search(db, "Alice", { userId: 10, userRole: "ADMIN" });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title).toContain("Alice");
  });

  test("search with empty query returns empty", () => {
    const results = search(db, "", { userId: 1, userRole: "ADMIN" });
    expect(results).toEqual([]);
  });

  test("search with special characters doesn't crash", () => {
    const results = search(db, "test@#$%", { userId: 1, userRole: "ADMIN" });
    expect(Array.isArray(results)).toBe(true);
  });

  test("search filters by entity type", () => {
    indexEntity(db, "employee", 20, "Bob Builder", "EMP020", {});
    indexEntity(db, "ticket", 20, "Bob issue", "description", { employee_id: 20, assigned_to: null });
    const results = search(db, "Bob", { entity: "employee", userId: 1, userRole: "ADMIN" });
    expect(results.every(r => r.entity === "employee")).toBe(true);
  });

  test("search respects limit", () => {
    for (let i = 100; i < 110; i++) {
      indexEntity(db, "employee", i, `Zeta Worker ${i}`, `EMP${i}`, {});
    }
    const results = search(db, "Zeta", { limit: 3, userId: 1, userRole: "ADMIN" });
    expect(results.length).toBeLessThanOrEqual(3);
  });

  test("partial matching works (prefix)", () => {
    indexEntity(db, "employee", 200, "Priya Sharma", "EMP200 priya@test.com", {});
    const results = search(db, "Pri", { userId: 1, userRole: "ADMIN" });
    expect(results.some(r => r.title === "Priya Sharma")).toBe(true);
  });
});

// ── RBAC filtering ──────────────────────────────────────────────────────

describe("Search: RBAC", () => {
  let db;

  beforeAll(() => {
    ({ db } = buildApp());
  });

  test("HR sees all entities", () => {
    indexEntity(db, "ticket", 300, "Secretive ticket", "confidential", { employee_id: 50, assigned_to: 51 });
    indexEntity(db, "expense", 300, "Secretive expense", "trip", { status: "PENDING", employee_id: 50 });
    const results = search(db, "Secretive", { userId: 1, userRole: "HR" });
    expect(results.length).toBe(2);
  });

  test("employee can't see others' tickets", () => {
    indexEntity(db, "ticket", 301, "Other ticket", "someone else", { employee_id: 50, assigned_to: 51 });
    const results = search(db, "Other ticket", { userId: 99, userRole: "EMPLOYEE" });
    expect(results.filter(r => r.entity === "ticket")).toHaveLength(0);
  });

  test("employee sees own tickets", () => {
    indexEntity(db, "ticket", 302, "My ticket", "my issue", { employee_id: 99, assigned_to: null });
    const results = search(db, "My ticket", { userId: 99, userRole: "EMPLOYEE" });
    expect(results.some(r => r.entity === "ticket" && r.entity_id === 302)).toBe(true);
  });

  test("employee sees tickets assigned to them", () => {
    indexEntity(db, "ticket", 303, "Assigned ticket", "assigned to me", { employee_id: 50, assigned_to: 99 });
    const results = search(db, "Assigned ticket", { userId: 99, userRole: "EMPLOYEE" });
    expect(results.some(r => r.entity_id === 303)).toBe(true);
  });

  test("employee can't see others' expenses", () => {
    indexEntity(db, "expense", 304, "Other expense", "trip", { status: "PENDING", employee_id: 50 });
    const results = search(db, "Other expense", { userId: 99, userRole: "EMPLOYEE" });
    expect(results.filter(r => r.entity === "expense")).toHaveLength(0);
  });

  test("employee sees announcements", () => {
    indexEntity(db, "announcement", 305, "Company picnic", "fun day", { priority: "NORMAL" });
    const results = search(db, "Company picnic", { userId: 99, userRole: "EMPLOYEE" });
    expect(results.some(r => r.entity === "announcement")).toBe(true);
  });

  test("employee sees own profile only", () => {
    indexEntity(db, "employee", 99, "Self Employee", "EMP099", {});
    indexEntity(db, "employee", 50, "Other Employee", "EMP050", {});
    const results = search(db, "Employee", { userId: 99, userRole: "EMPLOYEE" });
    const empResults = results.filter(r => r.entity === "employee");
    expect(empResults.every(r => r.entity_id === 99)).toBe(true);
  });

  test("employee cannot see job openings", () => {
    indexEntity(db, "job", 400, "Software Engineer", "React Node", { dept: "Tech", status: "OPEN" });
    const results = search(db, "Software Engineer", { userId: 99, userRole: "EMPLOYEE" });
    expect(results.filter(r => r.entity === "job")).toHaveLength(0);
  });

  test("HR sees job openings", () => {
    indexEntity(db, "job", 401, "Product Manager", "roadmap strategy", { dept: "Product", status: "OPEN" });
    const results = search(db, "Product Manager", { userId: 1, userRole: "HR" });
    expect(results.some(r => r.entity === "job")).toBe(true);
  });

  test("manager sees direct reports", async () => {
    const app = buildApp().app;
    const localDb = app.locals.db;
    const mgr = await insertEmployee(localDb, { email: "mgr@rbac.com", code: "MGR1" });
    const report = await insertEmployee(localDb, { email: "rep@rbac.com", code: "REP1", manager_id: mgr.id });
    indexEntity(localDb, "employee", mgr.id, "Manager User", "MGR1", {});
    indexEntity(localDb, "employee", report.id, "Report User", "REP1", {});
    const results = search(localDb, "User", { userId: mgr.id, userRole: "EMPLOYEE" });
    const empIds = results.filter(r => r.entity === "employee").map(r => r.entity_id);
    expect(empIds).toContain(mgr.id);
    expect(empIds).toContain(report.id);
  });
});

// ── API endpoints ───────────────────────────────────────────────────────

describe("Search: API", () => {
  let app, db, hrCookie, empCookie, adminCookie, empId;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    await insertEmployee(db, { email: "hr@sr.com", code: "HRSR1", role: "HR" });
    const emp = await insertEmployee(db, { email: "emp@sr.com", code: "ESR1", role: "EMPLOYEE" });
    empId = emp.id;
    await insertEmployee(db, { email: "admin@sr.com", code: "ASR1", role: "ADMIN" });
    hrCookie = await loginAs(app, "hr@sr.com");
    empCookie = await loginAs(app, "emp@sr.com");
    adminCookie = await loginAs(app, "admin@sr.com");
    indexEntity(db, "employee", empId, "Test Employee", "ESR1 emp@sr.com", { dept: "Tech", status: "ACTIVE" });
  });

  test("GET /search?q= returns results", async () => {
    const res = await supertest(app).get("/api/search?q=Test Employee").set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty("entity");
    expect(res.body[0]).toHaveProperty("title");
    expect(res.body[0]).toHaveProperty("snippet");
    expect(res.body[0]).toHaveProperty("meta");
  });

  test("GET /search with empty q returns empty", async () => {
    const res = await supertest(app).get("/api/search?q=").set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test("GET /search with entity filter", async () => {
    indexEntity(db, "ticket", 500, "API ticket", "test", { employee_id: empId, assigned_to: null });
    const res = await supertest(app).get("/api/search?q=API&entity=ticket").set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    expect(res.body.every(r => r.entity === "ticket")).toBe(true);
  });

  test("unauthenticated search rejected", async () => {
    const res = await supertest(app).get("/api/search?q=test");
    expect(res.status).toBe(401);
  });

  test("POST /search/reindex requires ADMIN", async () => {
    const res1 = await supertest(app).post("/api/search/reindex").set("Cookie", empCookie);
    expect(res1.status).toBe(403);
    const res2 = await supertest(app).post("/api/search/reindex").set("Cookie", hrCookie);
    expect(res2.status).toBe(403);
  });

  test("ADMIN can reindex", async () => {
    const res = await supertest(app).post("/api/search/reindex").set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test("reindex populates search_index from existing data", async () => {
    reindexAll(db);
    const count = db.prepare("SELECT COUNT(*) as c FROM search_index").get().c;
    expect(count).toBeGreaterThan(0);
  });
});

// ── Integration: mutations auto-index ───────────────────────────────────

describe("Search: auto-indexing on mutation", () => {
  let app, db, hrCookie;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    await insertEmployee(db, { email: "hr@si.com", code: "HRSI1", role: "HR" });
    hrCookie = await loginAs(app, "hr@si.com");
    db.prepare("INSERT INTO asset_types(name) VALUES('Laptop')").run();
    db.prepare("INSERT INTO ticket_categories(name) VALUES('IT')").run();
    db.prepare("INSERT INTO expense_categories(name) VALUES('Travel')").run();
    db.prepare("INSERT INTO expense_policies(name, per_diem_limit, requires_receipt) VALUES('Standard',5000,1)").run();
  });

  test("creating an employee auto-indexes", async () => {
    const res = await supertest(app).post("/api/employees").set("Cookie", hrCookie).send({
      code: "SIDX1", name: "Search Indexed", gender: "Male", email: "sidx@igenesys.com", doj: "2024-01-01",
    });
    expect(res.status).toBe(201);
    const rows = db.prepare("SELECT * FROM search_index WHERE entity='employee' AND entity_id=?").all(String(res.body.id));
    expect(rows.length).toBe(1);
    expect(rows[0].title).toBe("Search Indexed");
  });

  test("creating a ticket auto-indexes", async () => {
    await insertEmployee(db, { email: "ticketer@si.com", code: "TSI1", role: "EMPLOYEE" });
    const ticketerCookie = await loginAs(app, "ticketer@si.com");
    const catId = db.prepare("SELECT id FROM ticket_categories WHERE name='IT'").get().id;
    const res = await supertest(app).post("/api/helpdesk/tickets").set("Cookie", ticketerCookie).send({
      category_id: catId, subject: "Searchable ticket", description: "Find me", priority: "HIGH",
    });
    expect(res.status).toBe(201);
    const rows = db.prepare("SELECT * FROM search_index WHERE entity='ticket' AND entity_id=?").all(String(res.body.id));
    expect(rows.length).toBe(1);
  });

  test("creating an asset auto-indexes", async () => {
    const typeId = db.prepare("SELECT id FROM asset_types WHERE name='Laptop'").get().id;
    const res = await supertest(app).post("/api/assets").set("Cookie", hrCookie).send({
      asset_type_id: typeId, name: "Searchable Laptop", serial_no: "SRX001",
    });
    expect(res.status).toBe(201);
    const rows = db.prepare("SELECT * FROM search_index WHERE entity='asset' AND entity_id=?").all(String(res.body.id));
    expect(rows.length).toBe(1);
  });
});
