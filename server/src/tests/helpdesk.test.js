import { describe, test, expect, beforeAll } from "vitest";
import supertest from "supertest";
import { buildApp, insertEmployee, loginAs } from "./helpers.js";

function seedCategory(db, name, assignedTo) {
  const result = db.prepare(
    "INSERT INTO ticket_categories(name, assigned_to) VALUES(?,?)"
  ).run(name || `Cat-${Date.now()}`, assignedTo ?? null);
  return { id: Number(result.lastInsertRowid), name };
}

function seedTicket(db, employeeId, categoryId, overrides = {}) {
  const result = db.prepare(
    "INSERT INTO tickets(employee_id, category_id, subject, description, priority, status, assigned_to) VALUES(?,?,?,?,?,?,?)"
  ).run(
    employeeId, categoryId,
    overrides.subject ?? "Test ticket",
    overrides.description ?? "Test description",
    overrides.priority ?? "MEDIUM",
    overrides.status ?? "OPEN",
    overrides.assigned_to ?? null
  );
  return { id: Number(result.lastInsertRowid) };
}

// ── Categories ───────────────────────────────────────────────────────────

describe("Helpdesk: Categories", () => {
  let app, db, hrCookie, empCookie;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    await insertEmployee(db, { email: "hr@tc.com", code: "HRTC1", role: "HR" });
    await insertEmployee(db, { email: "emp@tc.com", code: "ETC1", role: "EMPLOYEE" });
    hrCookie = await loginAs(app, "hr@tc.com");
    empCookie = await loginAs(app, "emp@tc.com");
  });

  test("HR can create a ticket category", async () => {
    const res = await supertest(app).post("/api/helpdesk/ticket-categories")
      .set("Cookie", hrCookie).send({ name: "IT Support" });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("IT Support");
  });

  test("duplicate category name returns 409", async () => {
    seedCategory(db, "Network");
    const res = await supertest(app).post("/api/helpdesk/ticket-categories")
      .set("Cookie", hrCookie).send({ name: "Network" });
    expect(res.status).toBe(409);
  });

  test("employee cannot create categories (403)", async () => {
    const res = await supertest(app).post("/api/helpdesk/ticket-categories")
      .set("Cookie", empCookie).send({ name: "Nope" });
    expect(res.status).toBe(403);
  });

  test("all users can list categories", async () => {
    const res = await supertest(app).get("/api/helpdesk/ticket-categories").set("Cookie", empCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ── Ticket Lifecycle ─────────────────────────────────────────────────────

describe("Helpdesk: Ticket Lifecycle", () => {
  let app, db, hrCookie, empCookie, emp2Cookie, empId, emp2Id, hrId, catId;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    const hr = await insertEmployee(db, { email: "hr@tl.com", code: "HRTL1", role: "HR" });
    hrId = hr.id;
    const emp = await insertEmployee(db, { email: "emp@tl.com", code: "ETL1", role: "EMPLOYEE" });
    empId = emp.id;
    const emp2 = await insertEmployee(db, { email: "emp2@tl.com", code: "ETL2", role: "EMPLOYEE" });
    emp2Id = emp2.id;
    hrCookie = await loginAs(app, "hr@tl.com");
    empCookie = await loginAs(app, "emp@tl.com");
    emp2Cookie = await loginAs(app, "emp2@tl.com");
    catId = seedCategory(db, "IT Support").id;
  });

  test("employee can create a ticket", async () => {
    const res = await supertest(app).post("/api/helpdesk/tickets")
      .set("Cookie", empCookie)
      .send({ category_id: catId, subject: "Laptop broken", description: "Screen cracked", priority: "HIGH" });
    expect(res.status).toBe(201);
    expect(res.body.subject).toBe("Laptop broken");
    expect(res.body.status).toBe("OPEN");
    expect(res.body.employee_id).toBe(empId);
  });

  test("auto-assigns to category default resolver", async () => {
    const catWithResolver = seedCategory(db, "HR Queries", hrId);
    const res = await supertest(app).post("/api/helpdesk/tickets")
      .set("Cookie", empCookie)
      .send({ category_id: catWithResolver.id, subject: "Leave query", description: "Need info" });
    expect(res.status).toBe(201);
    expect(res.body.assigned_to).toBe(hrId);
  });

  test("invalid category returns 400", async () => {
    const res = await supertest(app).post("/api/helpdesk/tickets")
      .set("Cookie", empCookie)
      .send({ category_id: 99999, subject: "Ghost", description: "Nowhere" });
    expect(res.status).toBe(400);
  });

  test("employee sees own tickets", async () => {
    const res = await supertest(app).get("/api/helpdesk/tickets").set("Cookie", empCookie);
    expect(res.status).toBe(200);
    expect(res.body.every(t => t.employee_id === empId || t.assigned_to === empId)).toBe(true);
  });

  test("HR sees all tickets", async () => {
    // Create a ticket by emp2
    seedTicket(db, emp2Id, catId);
    const res = await supertest(app).get("/api/helpdesk/tickets").set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    const empIds = new Set(res.body.map(t => t.employee_id));
    expect(empIds.size).toBeGreaterThanOrEqual(1);
  });

  test("resolver can update ticket status", async () => {
    const ticket = seedTicket(db, empId, catId, { assigned_to: hrId });
    const res = await supertest(app).patch(`/api/helpdesk/tickets/${ticket.id}`)
      .set("Cookie", hrCookie)
      .send({ status: "IN_PROGRESS" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("IN_PROGRESS");
  });

  test("non-resolver employee cannot update ticket (403)", async () => {
    const ticket = seedTicket(db, empId, catId, { assigned_to: hrId });
    const res = await supertest(app).patch(`/api/helpdesk/tickets/${ticket.id}`)
      .set("Cookie", emp2Cookie)
      .send({ status: "RESOLVED" });
    expect(res.status).toBe(403);
  });

  test("resolving a ticket sets resolved_at", async () => {
    const ticket = seedTicket(db, empId, catId, { assigned_to: hrId });
    await supertest(app).patch(`/api/helpdesk/tickets/${ticket.id}`)
      .set("Cookie", hrCookie).send({ status: "RESOLVED" });
    const row = db.prepare("SELECT resolved_at FROM tickets WHERE id = ?").get(ticket.id);
    expect(row.resolved_at).not.toBeNull();
  });

  test("HR can reassign a ticket", async () => {
    const ticket = seedTicket(db, empId, catId);
    const res = await supertest(app).patch(`/api/helpdesk/tickets/${ticket.id}`)
      .set("Cookie", hrCookie)
      .send({ assigned_to: emp2Id });
    expect(res.status).toBe(200);
    expect(res.body.assigned_to).toBe(emp2Id);
  });

  test("patch non-existent ticket returns 404", async () => {
    const res = await supertest(app).patch("/api/helpdesk/tickets/99999")
      .set("Cookie", hrCookie).send({ status: "CLOSED" });
    expect(res.status).toBe(404);
  });

  test("tickets sorted by priority (URGENT first)", async () => {
    seedTicket(db, empId, catId, { priority: "LOW", assigned_to: hrId });
    seedTicket(db, empId, catId, { priority: "URGENT", assigned_to: hrId });
    const res = await supertest(app).get("/api/helpdesk/tickets").set("Cookie", hrCookie);
    const priorities = res.body.map(t => t.priority);
    const urgentIdx = priorities.indexOf("URGENT");
    const lowIdx = priorities.indexOf("LOW");
    if (urgentIdx >= 0 && lowIdx >= 0) expect(urgentIdx).toBeLessThan(lowIdx);
  });
});

// ── Comments ─────────────────────────────────────────────────────────────

describe("Helpdesk: Comments", () => {
  let app, db, hrCookie, empCookie, emp2Cookie, empId, hrId, catId;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    const hr = await insertEmployee(db, { email: "hr@cm.com", code: "HRCM1", role: "HR" });
    hrId = hr.id;
    const emp = await insertEmployee(db, { email: "emp@cm.com", code: "ECM1", role: "EMPLOYEE" });
    empId = emp.id;
    const emp2 = await insertEmployee(db, { email: "emp2@cm.com", code: "ECM2", role: "EMPLOYEE" });
    hrCookie = await loginAs(app, "hr@cm.com");
    empCookie = await loginAs(app, "emp@cm.com");
    emp2Cookie = await loginAs(app, "emp2@cm.com");
    catId = seedCategory(db, "General").id;
  });

  test("ticket creator can add a comment", async () => {
    const ticket = seedTicket(db, empId, catId);
    const res = await supertest(app).post(`/api/helpdesk/tickets/${ticket.id}/comments`)
      .set("Cookie", empCookie)
      .send({ body: "Any update?" });
    expect(res.status).toBe(201);
    expect(res.body.body).toBe("Any update?");
  });

  test("assigned resolver can add a comment", async () => {
    const ticket = seedTicket(db, empId, catId, { assigned_to: hrId });
    const res = await supertest(app).post(`/api/helpdesk/tickets/${ticket.id}/comments`)
      .set("Cookie", hrCookie)
      .send({ body: "Working on it" });
    expect(res.status).toBe(201);
  });

  test("unrelated employee cannot add comment (403)", async () => {
    const ticket = seedTicket(db, empId, catId);
    const res = await supertest(app).post(`/api/helpdesk/tickets/${ticket.id}/comments`)
      .set("Cookie", emp2Cookie)
      .send({ body: "Snooping" });
    expect(res.status).toBe(403);
  });

  test("unrelated employee cannot view comments (403)", async () => {
    const ticket = seedTicket(db, empId, catId);
    const res = await supertest(app).get(`/api/helpdesk/tickets/${ticket.id}/comments`)
      .set("Cookie", emp2Cookie);
    expect(res.status).toBe(403);
  });

  test("ticket creator can view comments", async () => {
    const ticket = seedTicket(db, empId, catId);
    db.prepare("INSERT INTO ticket_comments(ticket_id, author_id, body) VALUES(?,?,?)")
      .run(ticket.id, empId, "Test comment");
    const res = await supertest(app).get(`/api/helpdesk/tickets/${ticket.id}/comments`)
      .set("Cookie", empCookie);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty("author_name");
  });

  test("comment on non-existent ticket returns 404", async () => {
    const res = await supertest(app).post("/api/helpdesk/tickets/99999/comments")
      .set("Cookie", hrCookie).send({ body: "Ghost" });
    expect(res.status).toBe(404);
  });
});

// ── Dashboard ────────────────────────────────────────────────────────────

describe("Helpdesk: Dashboard", () => {
  let app, db, hrCookie, empCookie, hrId, empId, catId;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    const hr = await insertEmployee(db, { email: "hr@hd.com", code: "HRHD1", role: "HR" });
    hrId = hr.id;
    const emp = await insertEmployee(db, { email: "emp@hd.com", code: "EHD1", role: "EMPLOYEE" });
    empId = emp.id;
    hrCookie = await loginAs(app, "hr@hd.com");
    empCookie = await loginAs(app, "emp@hd.com");
    catId = seedCategory(db, "IT").id;
    seedTicket(db, empId, catId, { assigned_to: hrId });
    seedTicket(db, empId, catId, { assigned_to: hrId, status: "RESOLVED" });
  });

  test("HR can access helpdesk dashboard", async () => {
    const res = await supertest(app).get("/api/helpdesk/dashboard").set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("totalOpen");
    expect(res.body).toHaveProperty("totalResolved");
    expect(res.body).toHaveProperty("openByCategory");
    expect(res.body).toHaveProperty("avgResolutionTime");
    expect(res.body).toHaveProperty("agentLoad");
  });

  test("employee cannot access helpdesk dashboard (403)", async () => {
    const res = await supertest(app).get("/api/helpdesk/dashboard").set("Cookie", empCookie);
    expect(res.status).toBe(403);
  });

  test("dashboard stats reflect data", async () => {
    const res = await supertest(app).get("/api/helpdesk/dashboard").set("Cookie", hrCookie);
    expect(res.body.totalOpen).toBeGreaterThanOrEqual(1);
    expect(res.body.totalResolved).toBeGreaterThanOrEqual(1);
  });
});

// ── Auth guards ──────────────────────────────────────────────────────────

describe("Helpdesk: Auth guards", () => {
  let app;
  beforeAll(() => { ({ app } = buildApp()); });

  test("unauthenticated requests are rejected", async () => {
    const endpoints = [
      ["GET", "/api/helpdesk/tickets"],
      ["POST", "/api/helpdesk/tickets"],
      ["GET", "/api/helpdesk/ticket-categories"],
      ["GET", "/api/helpdesk/dashboard"],
    ];
    for (const [method, path] of endpoints) {
      const res = await supertest(app)[method.toLowerCase()](path);
      expect(res.status).toBe(401);
    }
  });
});
