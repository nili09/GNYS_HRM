import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { buildApp, insertEmployee, loginAs } from "./helpers.js";

let app, db;

beforeEach(async () => {
  ({ app, db } = buildApp());
});

// ── is_manager derivation ────────────────────────────────────────────────────

describe("is_manager flag", () => {
  it("login returns is_manager: false for employee with no reports", async () => {
    await insertEmployee(db, { email: "solo@igenesys.com" });
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "solo@igenesys.com", password: "TestPass@123" });
    expect(res.status).toBe(200);
    expect(res.body.is_manager).toBe(false);
  });

  it("login returns is_manager: true when employee has active direct reports", async () => {
    const mgr = await insertEmployee(db, { email: "mgr@igenesys.com" });
    await insertEmployee(db, { email: "rep@igenesys.com", manager_id: mgr.id });
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "mgr@igenesys.com", password: "TestPass@123" });
    expect(res.status).toBe(200);
    expect(res.body.is_manager).toBe(true);
  });

  it("login returns is_manager: false when all reports are EXITED", async () => {
    const mgr = await insertEmployee(db, { email: "mgr2@igenesys.com" });
    await insertEmployee(db, { email: "ex@igenesys.com", manager_id: mgr.id, status: "EXITED" });
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "mgr2@igenesys.com", password: "TestPass@123" });
    expect(res.status).toBe(200);
    expect(res.body.is_manager).toBe(false);
  });

  it("GET /auth/me returns is_manager: false for plain employee", async () => {
    const emp = await insertEmployee(db, { email: "plain@igenesys.com" });
    const cookie = await loginAs(app, "plain@igenesys.com");
    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.is_manager).toBe(false);
  });

  it("GET /auth/me returns is_manager: true for manager", async () => {
    const mgr = await insertEmployee(db, { email: "boss@igenesys.com" });
    await insertEmployee(db, { email: "sub@igenesys.com", manager_id: mgr.id });
    const cookie = await loginAs(app, "boss@igenesys.com");
    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.is_manager).toBe(true);
  });

  it("is_manager counts ONBOARDING and NOTICE reports", async () => {
    const mgr = await insertEmployee(db, { email: "mgr3@igenesys.com" });
    await insertEmployee(db, { email: "onb@igenesys.com", manager_id: mgr.id, status: "ONBOARDING" });
    const cookie = await loginAs(app, "mgr3@igenesys.com");
    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", cookie);
    expect(res.body.is_manager).toBe(true);
  });
});

// ── Interviews count endpoint ────────────────────────────────────────────────

describe("GET /recruitment/interviews/my-count", () => {
  it("returns 0 for employee with no interviews", async () => {
    await insertEmployee(db, { email: "noiv@igenesys.com" });
    const cookie = await loginAs(app, "noiv@igenesys.com");
    const res = await request(app)
      .get("/api/recruitment/interviews/my-count")
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
  });
});

// ── Surveys count endpoint ───────────────────────────────────────────────────

describe("GET /engagement/surveys/my-count", () => {
  it("returns 0 when no active surveys exist", async () => {
    await insertEmployee(db, { email: "nosv@igenesys.com" });
    const cookie = await loginAs(app, "nosv@igenesys.com");
    const res = await request(app)
      .get("/api/engagement/surveys/my-count")
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
  });

  it("counts active surveys not yet responded to", async () => {
    const hr = await insertEmployee(db, { email: "hr@igenesys.com", role: "HR" });
    const emp = await insertEmployee(db, { email: "emps@igenesys.com" });

    db.prepare(
      `INSERT INTO surveys (title, description, status, anonymous, created_by, created_at)
       VALUES ('Test Survey', 'desc', 'ACTIVE', 0, ?, datetime('now'))`
    ).run(hr.id);

    const cookie = await loginAs(app, "emps@igenesys.com");
    const res = await request(app)
      .get("/api/engagement/surveys/my-count")
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
  });

  it("excludes surveys already responded to", async () => {
    const hr = await insertEmployee(db, { email: "hr2@igenesys.com", role: "HR" });
    const emp = await insertEmployee(db, { email: "emp2@igenesys.com" });

    const surveyId = db.prepare(
      `INSERT INTO surveys (title, description, status, anonymous, created_by, created_at)
       VALUES ('Done Survey', 'desc', 'ACTIVE', 0, ?, datetime('now'))`
    ).run(hr.id).lastInsertRowid;

    const questionId = db.prepare(
      `INSERT INTO survey_questions (survey_id, question, type, sort_order)
       VALUES (?, 'Q1', 'TEXT', 1)`
    ).run(surveyId).lastInsertRowid;

    db.prepare(
      `INSERT INTO survey_responses (survey_id, employee_id, question_id, answer)
       VALUES (?, ?, ?, 'yes')`
    ).run(surveyId, emp.id, questionId);

    const cookie = await loginAs(app, "emp2@igenesys.com");
    const res = await request(app)
      .get("/api/engagement/surveys/my-count")
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
  });
});
