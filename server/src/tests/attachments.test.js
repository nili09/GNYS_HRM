import { describe, test, expect, beforeAll } from "vitest";
import supertest from "supertest";
import { buildApp, insertEmployee, loginAs } from "./helpers.js";

function seedExpenseCategory(db) {
  const r = db.prepare("INSERT INTO expense_categories(name) VALUES('Travel')").run();
  return Number(r.lastInsertRowid);
}

function seedExpense(db, employeeId, categoryId) {
  const r = db.prepare(
    "INSERT INTO expenses(employee_id, category_id, amount, date) VALUES(?,?,?,?)"
  ).run(employeeId, categoryId, 1000, "2025-01-15");
  return Number(r.lastInsertRowid);
}

function seedTicketCategory(db) {
  const r = db.prepare("INSERT INTO ticket_categories(name) VALUES('IT Support')").run();
  return Number(r.lastInsertRowid);
}

function seedTicket(db, employeeId, categoryId) {
  const r = db.prepare(
    "INSERT INTO tickets(employee_id, category_id, subject, description, priority, status) VALUES(?,?,?,?,?,?)"
  ).run(employeeId, categoryId, "Test ticket", "desc", "MEDIUM", "OPEN");
  return Number(r.lastInsertRowid);
}

// ── Upload validation ────────────────────────────────────────────────────────
describe("Attachments: Upload validation", () => {
  let app, db, empCookie, empId;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    const emp = await insertEmployee(db, { email: "emp@val.com", code: "EVAL1" });
    empId = emp.id;
    empCookie = await loginAs(app, "emp@val.com");
  });

  test("rejects when no file is uploaded", async () => {
    const res = await supertest(app)
      .post("/api/attachments")
      .set("Cookie", empCookie)
      .field("owner_type", "profile_photo")
      .field("owner_id", String(empId));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/No file/i);
  });

  test("rejects disallowed MIME types", async () => {
    const buf = Buffer.from("#!/bin/bash\necho hi");
    const res = await supertest(app)
      .post("/api/attachments")
      .set("Cookie", empCookie)
      .attach("file", buf, { filename: "script.sh", contentType: "application/x-sh" })
      .field("owner_type", "profile_photo")
      .field("owner_id", String(empId));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not allowed/i);
  });

  test("rejects files over 5MB", async () => {
    const buf = Buffer.alloc(5 * 1024 * 1024 + 1, "x");
    const res = await supertest(app)
      .post("/api/attachments")
      .set("Cookie", empCookie)
      .attach("file", buf, { filename: "big.pdf", contentType: "application/pdf" })
      .field("owner_type", "profile_photo")
      .field("owner_id", String(empId));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/too large|file size/i);
  });

  test("requires owner_type and owner_id", async () => {
    const buf = Buffer.from("hello");
    const res = await supertest(app)
      .post("/api/attachments")
      .set("Cookie", empCookie)
      .attach("file", buf, { filename: "test.txt", contentType: "text/plain" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/owner_type.*owner_id/i);
  });

  test("rejects invalid owner_type", async () => {
    const buf = Buffer.from("hello");
    const res = await supertest(app)
      .post("/api/attachments")
      .set("Cookie", empCookie)
      .attach("file", buf, { filename: "test.txt", contentType: "text/plain" })
      .field("owner_type", "invalid")
      .field("owner_id", "1");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid owner_type/i);
  });
});

// ── Expense receipt upload ───────────────────────────────────────────────────
describe("Attachments: Expense receipt", () => {
  let app, db, empCookie, empId, expenseId;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    const emp = await insertEmployee(db, { email: "emp@exp.com", code: "EEXP1" });
    empId = emp.id;
    empCookie = await loginAs(app, "emp@exp.com");
    const catId = seedExpenseCategory(db);
    expenseId = seedExpense(db, empId, catId);
  });

  test("employee uploads receipt to own expense", async () => {
    const buf = Buffer.from("%PDF-1.4 test content");
    const res = await supertest(app)
      .post("/api/attachments")
      .set("Cookie", empCookie)
      .attach("file", buf, { filename: "receipt.pdf", contentType: "application/pdf" })
      .field("owner_type", "expense")
      .field("owner_id", String(expenseId));
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.filename).toBe("receipt.pdf");
  });

  test("employee can list expense attachments", async () => {
    const res = await supertest(app)
      .get("/api/attachments")
      .query({ owner_type: "expense", owner_id: String(expenseId) })
      .set("Cookie", empCookie);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });
});

// ── Ticket attachment ────────────────────────────────────────────────────────
describe("Attachments: Ticket attachment", () => {
  let app, db, empCookie, empId, ticketId;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    const emp = await insertEmployee(db, { email: "emp@tix.com", code: "ETIX1" });
    empId = emp.id;
    empCookie = await loginAs(app, "emp@tix.com");
    const catId = seedTicketCategory(db);
    ticketId = seedTicket(db, empId, catId);
  });

  test("employee uploads file to own ticket", async () => {
    const buf = Buffer.from("screenshot data");
    const res = await supertest(app)
      .post("/api/attachments")
      .set("Cookie", empCookie)
      .attach("file", buf, { filename: "screenshot.png", contentType: "image/png" })
      .field("owner_type", "ticket")
      .field("owner_id", String(ticketId));
    expect(res.status).toBe(201);
    expect(res.body.filename).toBe("screenshot.png");
  });
});

// ── Doc checklist ────────────────────────────────────────────────────────────
describe("Attachments: Doc checklist", () => {
  let app, db, empCookie, empId;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    const emp = await insertEmployee(db, { email: "emp@doc.com", code: "EDOC1" });
    empId = emp.id;
    empCookie = await loginAs(app, "emp@doc.com");
  });

  test("employee uploads to own doc checklist", async () => {
    const buf = Buffer.from("pan card scan");
    const res = await supertest(app)
      .post("/api/attachments")
      .set("Cookie", empCookie)
      .attach("file", buf, { filename: "pan.pdf", contentType: "application/pdf" })
      .field("owner_type", "doc_checklist")
      .field("owner_id", `${empId}:pan_card`);
    expect(res.status).toBe(201);
  });

  test("employee can download own doc", async () => {
    const list = await supertest(app)
      .get("/api/attachments")
      .query({ owner_type: "doc_checklist", owner_id: `${empId}:pan_card` })
      .set("Cookie", empCookie);
    expect(list.status).toBe(200);
    expect(list.body.length).toBeGreaterThanOrEqual(1);
  });
});

// ── Profile photo ────────────────────────────────────────────────────────────
describe("Attachments: Profile photo", () => {
  let app, db, empCookie, empId;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    const emp = await insertEmployee(db, { email: "emp@photo.com", code: "EPHOTO1" });
    empId = emp.id;
    empCookie = await loginAs(app, "emp@photo.com");
  });

  test("employee uploads profile photo and profile_photo_id is updated", async () => {
    const buf = Buffer.from("fake jpeg data");
    const res = await supertest(app)
      .post("/api/attachments")
      .set("Cookie", empCookie)
      .attach("file", buf, { filename: "avatar.jpg", contentType: "image/jpeg" })
      .field("owner_type", "profile_photo")
      .field("owner_id", String(empId));
    expect(res.status).toBe(201);

    const emp = db.prepare("SELECT profile_photo_id FROM employees WHERE id = ?").get(empId);
    expect(emp.profile_photo_id).toBe(res.body.id);
  });

  test("uploading a new profile photo replaces the old one", async () => {
    const buf = Buffer.from("new jpeg data");
    const res = await supertest(app)
      .post("/api/attachments")
      .set("Cookie", empCookie)
      .attach("file", buf, { filename: "avatar2.jpg", contentType: "image/jpeg" })
      .field("owner_type", "profile_photo")
      .field("owner_id", String(empId));
    expect(res.status).toBe(201);

    // Only one profile photo attachment should exist
    const rows = db.prepare(
      "SELECT id FROM attachments WHERE owner_type = 'profile_photo' AND owner_id = ?"
    ).all(String(empId));
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe(res.body.id);
  });

  test("profile photo thumb is accessible by any authenticated user", async () => {
    // Create another user
    await insertEmployee(db, { email: "other@photo.com", code: "OPHOTO1" });
    const otherCookie = await loginAs(app, "other@photo.com");

    const att = db.prepare(
      "SELECT id FROM attachments WHERE owner_type = 'profile_photo' AND owner_id = ?"
    ).get(String(empId));

    const res = await supertest(app)
      .get(`/api/attachments/${att.id}/thumb`)
      .set("Cookie", otherCookie);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/image/);
  });
});

// ── RBAC enforcement ─────────────────────────────────────────────────────────
describe("Attachments: RBAC", () => {
  let app, db, emp1Cookie, emp2Cookie, emp1Id, emp2Id;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    const emp1 = await insertEmployee(db, { email: "emp1@rbac.com", code: "ERBAC1" });
    const emp2 = await insertEmployee(db, { email: "emp2@rbac.com", code: "ERBAC2" });
    emp1Id = emp1.id;
    emp2Id = emp2.id;
    emp1Cookie = await loginAs(app, "emp1@rbac.com");
    emp2Cookie = await loginAs(app, "emp2@rbac.com");
  });

  test("employee cannot download another employee's doc_checklist attachment", async () => {
    // emp1 uploads a doc
    const buf = Buffer.from("private doc");
    const upload = await supertest(app)
      .post("/api/attachments")
      .set("Cookie", emp1Cookie)
      .attach("file", buf, { filename: "aadhaar.pdf", contentType: "application/pdf" })
      .field("owner_type", "doc_checklist")
      .field("owner_id", `${emp1Id}:aadhaar`);
    expect(upload.status).toBe(201);

    // emp2 tries to download
    const res = await supertest(app)
      .get(`/api/attachments/${upload.body.id}/download`)
      .set("Cookie", emp2Cookie);
    expect(res.status).toBe(403);
  });

  test("employee cannot download another employee's expense receipt", async () => {
    const catId = seedExpenseCategory(db);
    const expId = seedExpense(db, emp1Id, catId);

    const buf = Buffer.from("receipt data");
    const upload = await supertest(app)
      .post("/api/attachments")
      .set("Cookie", emp1Cookie)
      .attach("file", buf, { filename: "receipt.pdf", contentType: "application/pdf" })
      .field("owner_type", "expense")
      .field("owner_id", String(expId));
    expect(upload.status).toBe(201);

    // emp2 tries to download
    const res = await supertest(app)
      .get(`/api/attachments/${upload.body.id}/download`)
      .set("Cookie", emp2Cookie);
    expect(res.status).toBe(403);
  });

  test("employee cannot upload to another employee's profile_photo", async () => {
    const buf = Buffer.from("hacker photo");
    const res = await supertest(app)
      .post("/api/attachments")
      .set("Cookie", emp2Cookie)
      .attach("file", buf, { filename: "hack.jpg", contentType: "image/jpeg" })
      .field("owner_type", "profile_photo")
      .field("owner_id", String(emp1Id));
    expect(res.status).toBe(403);
  });

  test("HR can download any attachment", async () => {
    await insertEmployee(db, { email: "hr@rbac.com", code: "HRBAC1", role: "HR" });
    const hrCookie = await loginAs(app, "hr@rbac.com");

    // Upload by emp1
    const buf = Buffer.from("emp1 private doc");
    const upload = await supertest(app)
      .post("/api/attachments")
      .set("Cookie", emp1Cookie)
      .attach("file", buf, { filename: "doc.pdf", contentType: "application/pdf" })
      .field("owner_type", "doc_checklist")
      .field("owner_id", `${emp1Id}:passport`);
    expect(upload.status).toBe(201);

    // HR can download
    const res = await supertest(app)
      .get(`/api/attachments/${upload.body.id}/download`)
      .set("Cookie", hrCookie);
    expect(res.status).toBe(200);
  });
});
