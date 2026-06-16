import { describe, test, expect, beforeAll } from "vitest";
import supertest from "supertest";
import { buildApp, insertEmployee, loginAs } from "./helpers.js";

// ── Helpers ────────────────────────────────────────────────────────────────

function seedPolicy(db, overrides = {}) {
  const name = overrides.name || `Policy-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const result = db.prepare(
    "INSERT INTO expense_policies(name, per_diem_limit, requires_receipt, active) VALUES(?,?,?,?)"
  ).run(name, overrides.per_diem_limit ?? null, overrides.requires_receipt ?? 1, overrides.active ?? 1);
  return { id: Number(result.lastInsertRowid), name };
}

function seedCategory(db, overrides = {}) {
  const name = overrides.name || `Cat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const result = db.prepare(
    "INSERT INTO expense_categories(name, policy_id, active) VALUES(?,?,?)"
  ).run(name, overrides.policy_id ?? null, overrides.active ?? 1);
  return { id: Number(result.lastInsertRowid), name };
}

// ── Expense Policies CRUD ──────────────────────────────────────────────────

describe("Expense policies", () => {
  let app, db, hrCookie, empCookie;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    await insertEmployee(db, { email: "hr@exp.com", code: "HRX1", role: "HR" });
    await insertEmployee(db, { email: "emp@exp.com", code: "EX1", role: "EMPLOYEE" });
    hrCookie = await loginAs(app, "hr@exp.com");
    empCookie = await loginAs(app, "emp@exp.com");
  });

  test("HR can create a policy", async () => {
    const res = await supertest(app).post("/api/expenses/policies")
      .set("Cookie", hrCookie)
      .send({ name: "Travel Policy", per_diem_limit: 5000, requires_receipt: 1 });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Travel Policy");
    expect(res.body.per_diem_limit).toBe(5000);
  });

  test("duplicate policy name is rejected (409)", async () => {
    const res = await supertest(app).post("/api/expenses/policies")
      .set("Cookie", hrCookie)
      .send({ name: "Travel Policy" });
    expect(res.status).toBe(409);
  });

  test("employee cannot create a policy (403)", async () => {
    const res = await supertest(app).post("/api/expenses/policies")
      .set("Cookie", empCookie)
      .send({ name: "Nope Policy" });
    expect(res.status).toBe(403);
  });

  test("anyone authenticated can list policies", async () => {
    const res = await supertest(app).get("/api/expenses/policies").set("Cookie", empCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test("HR can patch a policy", async () => {
    const pol = seedPolicy(db, { name: "PatchMe" });
    const res = await supertest(app).patch(`/api/expenses/policies/${pol.id}`)
      .set("Cookie", hrCookie)
      .send({ per_diem_limit: 9999 });
    expect(res.status).toBe(200);
    expect(res.body.per_diem_limit).toBe(9999);
  });

  test("patch non-existent policy returns 404", async () => {
    const res = await supertest(app).patch("/api/expenses/policies/99999")
      .set("Cookie", hrCookie).send({ name: "Ghost" });
    expect(res.status).toBe(404);
  });
});

// ── Expense Categories CRUD ────────────────────────────────────────────────

describe("Expense categories", () => {
  let app, db, hrCookie, empCookie;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    await insertEmployee(db, { email: "hr@cat.com", code: "HRC1", role: "HR" });
    await insertEmployee(db, { email: "emp@cat.com", code: "EC1", role: "EMPLOYEE" });
    hrCookie = await loginAs(app, "hr@cat.com");
    empCookie = await loginAs(app, "emp@cat.com");
  });

  test("HR can create a category", async () => {
    const res = await supertest(app).post("/api/expenses/categories")
      .set("Cookie", hrCookie).send({ name: "Meals" });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Meals");
  });

  test("HR can create category with policy_id", async () => {
    const pol = seedPolicy(db);
    const res = await supertest(app).post("/api/expenses/categories")
      .set("Cookie", hrCookie).send({ name: "Fuel", policy_id: pol.id });
    expect(res.status).toBe(201);
    expect(res.body.policy_id).toBe(pol.id);
  });

  test("category with invalid policy_id is rejected", async () => {
    const res = await supertest(app).post("/api/expenses/categories")
      .set("Cookie", hrCookie).send({ name: "Bad Pol", policy_id: 99999 });
    expect(res.status).toBe(400);
  });

  test("employee cannot create a category (403)", async () => {
    const res = await supertest(app).post("/api/expenses/categories")
      .set("Cookie", empCookie).send({ name: "Nope Cat" });
    expect(res.status).toBe(403);
  });

  test("anyone authenticated can list categories", async () => {
    const res = await supertest(app).get("/api/expenses/categories").set("Cookie", empCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ── Expenses CRUD ──────────────────────────────────────────────────────────

describe("Expense CRUD", () => {
  let app, db, hrCookie, empCookie, empId, catId;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    await insertEmployee(db, { email: "hr@crud.com", code: "HRU1", role: "HR" });
    const emp = await insertEmployee(db, { email: "emp@crud.com", code: "EU1", role: "EMPLOYEE" });
    empId = emp.id;
    hrCookie = await loginAs(app, "hr@crud.com");
    empCookie = await loginAs(app, "emp@crud.com");
    const cat = seedCategory(db);
    catId = cat.id;
  });

  test("employee can submit an expense", async () => {
    const res = await supertest(app).post("/api/expenses")
      .set("Cookie", empCookie)
      .send({ category_id: catId, amount: 1500, date: "2025-06-10", description: "Auto fare" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("PENDING");
    expect(res.body.amount).toBe(1500);
    expect(res.body.employee_id).toBe(empId);
  });

  test("expense with inactive category is rejected", async () => {
    const inactiveCat = seedCategory(db, { active: 0 });
    const res = await supertest(app).post("/api/expenses")
      .set("Cookie", empCookie)
      .send({ category_id: inactiveCat.id, amount: 100, date: "2025-06-10" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/inactive/i);
  });

  test("expense exceeding per-diem limit is rejected", async () => {
    const pol = seedPolicy(db, { per_diem_limit: 500 });
    const cat = seedCategory(db, { policy_id: pol.id });
    const res = await supertest(app).post("/api/expenses")
      .set("Cookie", empCookie)
      .send({ category_id: cat.id, amount: 1000, date: "2025-06-10" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/per-diem limit/i);
  });

  test("employee can list own expenses", async () => {
    const res = await supertest(app).get("/api/expenses").set("Cookie", empCookie);
    expect(res.status).toBe(200);
    expect(res.body.every((x) => x.employee_id === empId)).toBe(true);
  });

  test("HR can list all expenses", async () => {
    const res = await supertest(app).get("/api/expenses").set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test("invalid category_id returns 400", async () => {
    const res = await supertest(app).post("/api/expenses")
      .set("Cookie", empCookie)
      .send({ category_id: 99999, amount: 100, date: "2025-06-10" });
    expect(res.status).toBe(400);
  });

  test("unauthenticated cannot submit expense (401)", async () => {
    const res = await supertest(app).post("/api/expenses")
      .send({ category_id: catId, amount: 100, date: "2025-06-10" });
    expect(res.status).toBe(401);
  });
});

// ── Expense Approval RBAC ──────────────────────────────────────────────────

describe("Expense approval RBAC", () => {
  let app, db, hrCookie, mgrCookie, empCookie, emp2Cookie, empId, emp2Id, catId;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    const hr = await insertEmployee(db, { email: "hr@rbac.com", code: "HRR1", role: "HR" });
    const mgr = await insertEmployee(db, { email: "mgr@rbac.com", code: "MR1", role: "EMPLOYEE" });
    const emp = await insertEmployee(db, { email: "emp@rbac.com", code: "ER1", role: "EMPLOYEE", manager_id: mgr.id });
    const emp2 = await insertEmployee(db, { email: "emp2@rbac.com", code: "ER2", role: "EMPLOYEE" });
    empId = emp.id;
    emp2Id = emp2.id;
    hrCookie = await loginAs(app, "hr@rbac.com");
    mgrCookie = await loginAs(app, "mgr@rbac.com");
    empCookie = await loginAs(app, "emp@rbac.com");
    emp2Cookie = await loginAs(app, "emp2@rbac.com");
    catId = seedCategory(db).id;
  });

  test("employee cannot approve own expense (403)", async () => {
    const create = await supertest(app).post("/api/expenses")
      .set("Cookie", empCookie)
      .send({ category_id: catId, amount: 200, date: "2025-06-10" });
    expect(create.status).toBe(201);
    const res = await supertest(app).post(`/api/expenses/${create.body.id}/approve`)
      .set("Cookie", empCookie).send({});
    expect(res.status).toBe(403);
  });

  test("manager can approve direct report's expense", async () => {
    const create = await supertest(app).post("/api/expenses")
      .set("Cookie", empCookie)
      .send({ category_id: catId, amount: 300, date: "2025-06-10" });
    const res = await supertest(app).post(`/api/expenses/${create.body.id}/approve`)
      .set("Cookie", mgrCookie).send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("APPROVED");
  });

  test("manager cannot approve non-report's expense (403)", async () => {
    const create = await supertest(app).post("/api/expenses")
      .set("Cookie", emp2Cookie)
      .send({ category_id: catId, amount: 300, date: "2025-06-10" });
    const res = await supertest(app).post(`/api/expenses/${create.body.id}/approve`)
      .set("Cookie", mgrCookie).send({});
    expect(res.status).toBe(403);
  });

  test("HR can approve anyone's expense", async () => {
    const create = await supertest(app).post("/api/expenses")
      .set("Cookie", emp2Cookie)
      .send({ category_id: catId, amount: 400, date: "2025-06-10" });
    const res = await supertest(app).post(`/api/expenses/${create.body.id}/approve`)
      .set("Cookie", hrCookie).send({});
    expect(res.status).toBe(200);
  });

  test("employee cannot reject own expense (403)", async () => {
    const create = await supertest(app).post("/api/expenses")
      .set("Cookie", empCookie)
      .send({ category_id: catId, amount: 100, date: "2025-06-10" });
    const res = await supertest(app).post(`/api/expenses/${create.body.id}/reject`)
      .set("Cookie", empCookie).send({});
    expect(res.status).toBe(403);
  });

  test("HR can reject anyone's expense", async () => {
    const create = await supertest(app).post("/api/expenses")
      .set("Cookie", empCookie)
      .send({ category_id: catId, amount: 100, date: "2025-06-10" });
    const res = await supertest(app).post(`/api/expenses/${create.body.id}/reject`)
      .set("Cookie", hrCookie).send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("REJECTED");
  });

  test("cannot approve already-approved expense (400)", async () => {
    const create = await supertest(app).post("/api/expenses")
      .set("Cookie", empCookie)
      .send({ category_id: catId, amount: 100, date: "2025-06-10" });
    await supertest(app).post(`/api/expenses/${create.body.id}/approve`)
      .set("Cookie", hrCookie).send({});
    const res = await supertest(app).post(`/api/expenses/${create.body.id}/approve`)
      .set("Cookie", hrCookie).send({});
    expect(res.status).toBe(400);
  });

  test("cannot reject already-rejected expense (400)", async () => {
    const create = await supertest(app).post("/api/expenses")
      .set("Cookie", empCookie)
      .send({ category_id: catId, amount: 50, date: "2025-06-10" });
    await supertest(app).post(`/api/expenses/${create.body.id}/reject`)
      .set("Cookie", hrCookie).send({});
    const res = await supertest(app).post(`/api/expenses/${create.body.id}/reject`)
      .set("Cookie", hrCookie).send({});
    expect(res.status).toBe(400);
  });

  test("approve non-existent expense returns 404", async () => {
    const res = await supertest(app).post("/api/expenses/99999/approve")
      .set("Cookie", hrCookie).send({});
    expect(res.status).toBe(404);
  });
});

// ── Settle flow ────────────────────────────────────────────────────────────

describe("Expense settle flow", () => {
  let app, db, hrCookie, empCookie, catId;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    await insertEmployee(db, { email: "hr@settle.com", code: "HRS1", role: "HR" });
    await insertEmployee(db, { email: "emp@settle.com", code: "ES1", role: "EMPLOYEE" });
    hrCookie = await loginAs(app, "hr@settle.com");
    empCookie = await loginAs(app, "emp@settle.com");
    catId = seedCategory(db).id;
  });

  test("HR can settle an APPROVED expense", async () => {
    const create = await supertest(app).post("/api/expenses")
      .set("Cookie", empCookie)
      .send({ category_id: catId, amount: 2000, date: "2025-06-10" });
    await supertest(app).post(`/api/expenses/${create.body.id}/approve`)
      .set("Cookie", hrCookie).send({});
    const res = await supertest(app).post(`/api/expenses/${create.body.id}/settle`)
      .set("Cookie", hrCookie)
      .send({ settled_in_month: "2025-06" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("SETTLED");
  });

  test("cannot settle a PENDING expense (400)", async () => {
    const create = await supertest(app).post("/api/expenses")
      .set("Cookie", empCookie)
      .send({ category_id: catId, amount: 500, date: "2025-06-10" });
    const res = await supertest(app).post(`/api/expenses/${create.body.id}/settle`)
      .set("Cookie", hrCookie)
      .send({ settled_in_month: "2025-06" });
    expect(res.status).toBe(400);
  });

  test("employee cannot settle (403)", async () => {
    const create = await supertest(app).post("/api/expenses")
      .set("Cookie", empCookie)
      .send({ category_id: catId, amount: 500, date: "2025-06-10" });
    await supertest(app).post(`/api/expenses/${create.body.id}/approve`)
      .set("Cookie", hrCookie).send({});
    const res = await supertest(app).post(`/api/expenses/${create.body.id}/settle`)
      .set("Cookie", empCookie)
      .send({ settled_in_month: "2025-06" });
    expect(res.status).toBe(403);
  });

  test("settle requires valid month format", async () => {
    const create = await supertest(app).post("/api/expenses")
      .set("Cookie", empCookie)
      .send({ category_id: catId, amount: 500, date: "2025-06-10" });
    await supertest(app).post(`/api/expenses/${create.body.id}/approve`)
      .set("Cookie", hrCookie).send({});
    const res = await supertest(app).post(`/api/expenses/${create.body.id}/settle`)
      .set("Cookie", hrCookie)
      .send({ settled_in_month: "June 2025" });
    expect(res.status).toBe(400);
  });
});

// ── Advance requests ───────────────────────────────────────────────────────

describe("Advance requests", () => {
  let app, db, hrCookie, mgrCookie, empCookie, empId;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    await insertEmployee(db, { email: "hr@adv.com", code: "HRA1", role: "HR" });
    const mgr = await insertEmployee(db, { email: "mgr@adv.com", code: "MA1", role: "EMPLOYEE" });
    const emp = await insertEmployee(db, { email: "emp@adv.com", code: "EA1", role: "EMPLOYEE", manager_id: mgr.id });
    empId = emp.id;
    hrCookie = await loginAs(app, "hr@adv.com");
    mgrCookie = await loginAs(app, "mgr@adv.com");
    empCookie = await loginAs(app, "emp@adv.com");
  });

  test("employee can submit an advance request", async () => {
    const res = await supertest(app).post("/api/expenses/advances")
      .set("Cookie", empCookie)
      .send({ amount: 10000, reason: "Client visit" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("PENDING");
    expect(res.body.amount).toBe(10000);
  });

  test("employee can list own advances", async () => {
    const res = await supertest(app).get("/api/expenses/advances").set("Cookie", empCookie);
    expect(res.status).toBe(200);
    expect(res.body.every((a) => a.employee_id === empId)).toBe(true);
  });

  test("HR can list all advances", async () => {
    const res = await supertest(app).get("/api/expenses/advances").set("Cookie", hrCookie);
    expect(res.status).toBe(200);
  });

  test("employee cannot approve own advance (403)", async () => {
    const create = await supertest(app).post("/api/expenses/advances")
      .set("Cookie", empCookie)
      .send({ amount: 5000 });
    const res = await supertest(app).post(`/api/expenses/advances/${create.body.id}/approve`)
      .set("Cookie", empCookie).send({});
    expect(res.status).toBe(403);
  });

  test("manager can approve direct report's advance", async () => {
    const create = await supertest(app).post("/api/expenses/advances")
      .set("Cookie", empCookie)
      .send({ amount: 3000 });
    const res = await supertest(app).post(`/api/expenses/advances/${create.body.id}/approve`)
      .set("Cookie", mgrCookie).send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("APPROVED");
  });

  test("HR can reject anyone's advance", async () => {
    const create = await supertest(app).post("/api/expenses/advances")
      .set("Cookie", empCookie)
      .send({ amount: 2000 });
    const res = await supertest(app).post(`/api/expenses/advances/${create.body.id}/reject`)
      .set("Cookie", hrCookie).send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("REJECTED");
  });

  test("cannot approve already-approved advance (400)", async () => {
    const create = await supertest(app).post("/api/expenses/advances")
      .set("Cookie", empCookie)
      .send({ amount: 1000 });
    await supertest(app).post(`/api/expenses/advances/${create.body.id}/approve`)
      .set("Cookie", hrCookie).send({});
    const res = await supertest(app).post(`/api/expenses/advances/${create.body.id}/approve`)
      .set("Cookie", hrCookie).send({});
    expect(res.status).toBe(400);
  });

  test("advance reject non-existent returns 404", async () => {
    const res = await supertest(app).post("/api/expenses/advances/99999/reject")
      .set("Cookie", hrCookie).send({});
    expect(res.status).toBe(404);
  });

  test("unauthenticated cannot submit advance (401)", async () => {
    const res = await supertest(app).post("/api/expenses/advances")
      .send({ amount: 1000 });
    expect(res.status).toBe(401);
  });
});

// ── Pending endpoint & filters ─────────────────────────────────────────────

describe("Expense pending endpoint and filters", () => {
  let app, db, hrCookie, mgrCookie, empCookie, catId;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    await insertEmployee(db, { email: "hr@pend.com", code: "HRP1", role: "HR" });
    const mgr = await insertEmployee(db, { email: "mgr@pend.com", code: "MP1", role: "EMPLOYEE" });
    await insertEmployee(db, { email: "emp@pend.com", code: "EP1", role: "EMPLOYEE", manager_id: mgr.id });
    await insertEmployee(db, { email: "emp2@pend.com", code: "EP2", role: "EMPLOYEE" });
    hrCookie = await loginAs(app, "hr@pend.com");
    mgrCookie = await loginAs(app, "mgr@pend.com");
    empCookie = await loginAs(app, "emp@pend.com");
    catId = seedCategory(db).id;

    await supertest(app).post("/api/expenses").set("Cookie", empCookie)
      .send({ category_id: catId, amount: 100, date: "2025-06-15" });
  });

  test("HR sees all pending expenses", async () => {
    const res = await supertest(app).get("/api/expenses/pending").set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  test("manager sees only direct reports' pending expenses", async () => {
    const res = await supertest(app).get("/api/expenses/pending").set("Cookie", mgrCookie);
    expect(res.status).toBe(200);
    expect(res.body.every((x) => x.employee_code === "EP1")).toBe(true);
  });

  test("pending-count endpoint works", async () => {
    const res = await supertest(app).get("/api/expenses/pending-count").set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    expect(typeof res.body.count).toBe("number");
    expect(res.body.count).toBeGreaterThanOrEqual(1);
  });

  test("status filter works on GET /expenses", async () => {
    const res = await supertest(app).get("/api/expenses?status=PENDING").set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    expect(res.body.every((x) => x.status === "PENDING")).toBe(true);
  });

  test("month filter works on GET /expenses", async () => {
    const res = await supertest(app).get("/api/expenses?month=2025-06").set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    expect(res.body.every((x) => x.date.startsWith("2025-06"))).toBe(true);
  });

  test("non-HR employee cannot see other's expenses (403)", async () => {
    const emp2Cookie = await loginAs(app, "emp2@pend.com");
    const emp1 = db.prepare("SELECT id FROM employees WHERE email = 'emp@pend.com'").get();
    const res = await supertest(app).get(`/api/expenses?employee_id=${emp1.id}`)
      .set("Cookie", emp2Cookie);
    expect(res.status).toBe(403);
  });
});

// ── Audit logging ──────────────────────────────────────────────────────────

describe("Expense audit logging", () => {
  let app, db, hrCookie, empCookie, catId;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    await insertEmployee(db, { email: "hr@aud.com", code: "HRD1", role: "HR" });
    await insertEmployee(db, { email: "emp@aud.com", code: "ED1", role: "EMPLOYEE" });
    hrCookie = await loginAs(app, "hr@aud.com");
    empCookie = await loginAs(app, "emp@aud.com");
    catId = seedCategory(db).id;
  });

  test("expense creation is audited", async () => {
    const before = db.prepare("SELECT COUNT(*) as c FROM audit_log WHERE entity = 'expense'").get().c;
    await supertest(app).post("/api/expenses").set("Cookie", empCookie)
      .send({ category_id: catId, amount: 500, date: "2025-06-10" });
    const after = db.prepare("SELECT COUNT(*) as c FROM audit_log WHERE entity = 'expense'").get().c;
    expect(after).toBe(before + 1);
  });

  test("expense approval is audited", async () => {
    const create = await supertest(app).post("/api/expenses").set("Cookie", empCookie)
      .send({ category_id: catId, amount: 500, date: "2025-06-10" });
    const before = db.prepare("SELECT COUNT(*) as c FROM audit_log WHERE entity = 'expense' AND action = 'APPROVE'").get().c;
    await supertest(app).post(`/api/expenses/${create.body.id}/approve`)
      .set("Cookie", hrCookie).send({});
    const after = db.prepare("SELECT COUNT(*) as c FROM audit_log WHERE entity = 'expense' AND action = 'APPROVE'").get().c;
    expect(after).toBe(before + 1);
  });
});
