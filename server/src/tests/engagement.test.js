import { describe, test, expect, beforeAll } from "vitest";
import supertest from "supertest";
import { buildApp, insertEmployee, loginAs } from "./helpers.js";

// ── Helpers ────────────────────────────────────────────────────────────────

function seedBadge(db, overrides = {}) {
  const name = overrides.name || `Badge-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const result = db.prepare(
    "INSERT INTO badges(name, description, icon) VALUES(?,?,?)"
  ).run(name, overrides.description ?? "A test badge", overrides.icon ?? "⭐");
  return { id: Number(result.lastInsertRowid), name };
}

function seedAnnouncement(db, publishedBy, overrides = {}) {
  const title = overrides.title || `Ann-${Date.now()}`;
  const result = db.prepare(
    "INSERT INTO announcements(title, body, priority, published_by, expires_at, active) VALUES(?,?,?,?,?,?)"
  ).run(
    title,
    overrides.body ?? "Test body",
    overrides.priority ?? "NORMAL",
    publishedBy,
    overrides.expires_at ?? null,
    overrides.active ?? 1
  );
  return { id: Number(result.lastInsertRowid), title };
}

function seedSurvey(db, createdBy, overrides = {}) {
  const title = overrides.title || `Survey-${Date.now()}`;
  const result = db.prepare(
    "INSERT INTO surveys(title, description, status, anonymous, created_by, closes_at) VALUES(?,?,?,?,?,?)"
  ).run(
    title,
    overrides.description ?? null,
    overrides.status ?? "DRAFT",
    overrides.anonymous ?? 1,
    createdBy,
    overrides.closes_at ?? null
  );
  const surveyId = Number(result.lastInsertRowid);
  const questions = overrides.questions || [
    { question: "How satisfied are you?", type: "RATING" },
  ];
  const qIds = [];
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const qr = db.prepare(
      "INSERT INTO survey_questions(survey_id, question, type, options, sort_order) VALUES(?,?,?,?,?)"
    ).run(surveyId, q.question, q.type, q.options ?? null, i);
    qIds.push(Number(qr.lastInsertRowid));
  }
  return { id: surveyId, title, questionIds: qIds };
}

// ── Announcements ─────────────────────────────────────────────────────────

describe("Engagement: Announcements", () => {
  let app, db, hrCookie, empCookie, hrId;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    const hr = await insertEmployee(db, { email: "hr@eng.com", code: "HRE1", role: "HR" });
    hrId = hr.id;
    await insertEmployee(db, { email: "emp@eng.com", code: "EE1", role: "EMPLOYEE" });
    hrCookie = await loginAs(app, "hr@eng.com");
    empCookie = await loginAs(app, "emp@eng.com");
  });

  test("HR can create an announcement", async () => {
    const res = await supertest(app).post("/api/engagement/announcements")
      .set("Cookie", hrCookie)
      .send({ title: "Welcome!", body: "Welcome to Genesys", priority: "NORMAL" });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe("Welcome!");
  });

  test("employee cannot create an announcement (403)", async () => {
    const res = await supertest(app).post("/api/engagement/announcements")
      .set("Cookie", empCookie)
      .send({ title: "Nope", body: "x", priority: "NORMAL" });
    expect(res.status).toBe(403);
  });

  test("invalid priority is rejected (400)", async () => {
    const res = await supertest(app).post("/api/engagement/announcements")
      .set("Cookie", hrCookie)
      .send({ title: "Bad", body: "x", priority: "EXTREME" });
    expect(res.status).toBe(400);
  });

  test("all authenticated users see active announcements", async () => {
    const res = await supertest(app).get("/api/engagement/announcements").set("Cookie", empCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test("HR can patch an announcement", async () => {
    const ann = seedAnnouncement(db, hrId);
    const res = await supertest(app).patch(`/api/engagement/announcements/${ann.id}`)
      .set("Cookie", hrCookie)
      .send({ priority: "URGENT" });
    expect(res.status).toBe(200);
    expect(res.body.priority).toBe("URGENT");
  });

  test("HR can deactivate an announcement", async () => {
    const ann = seedAnnouncement(db, hrId);
    const res = await supertest(app).patch(`/api/engagement/announcements/${ann.id}`)
      .set("Cookie", hrCookie)
      .send({ active: false });
    expect(res.status).toBe(200);
  });

  test("HR can delete an announcement", async () => {
    const ann = seedAnnouncement(db, hrId);
    const res = await supertest(app).delete(`/api/engagement/announcements/${ann.id}`)
      .set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test("delete non-existent announcement returns 404", async () => {
    const res = await supertest(app).delete("/api/engagement/announcements/99999")
      .set("Cookie", hrCookie);
    expect(res.status).toBe(404);
  });

  test("employees see only active non-expired announcements", async () => {
    // Create expired announcement
    seedAnnouncement(db, hrId, { title: "Expired", expires_at: "2020-01-01" });
    // Create inactive announcement
    seedAnnouncement(db, hrId, { title: "Inactive", active: 0 });

    const empRes = await supertest(app).get("/api/engagement/announcements").set("Cookie", empCookie);
    const hrRes = await supertest(app).get("/api/engagement/announcements").set("Cookie", hrCookie);

    // HR sees more than employee
    expect(hrRes.body.length).toBeGreaterThanOrEqual(empRes.body.length);
    // Employee shouldn't see expired or inactive
    const empTitles = empRes.body.map(a => a.title);
    expect(empTitles).not.toContain("Expired");
    expect(empTitles).not.toContain("Inactive");
  });
});

// ── Surveys ───────────────────────────────────────────────────────────────

describe("Engagement: Surveys", () => {
  let app, db, hrCookie, empCookie, hrId, empId;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    const hr = await insertEmployee(db, { email: "hr@sv.com", code: "HRS1", role: "HR" });
    hrId = hr.id;
    const emp = await insertEmployee(db, { email: "emp@sv.com", code: "ES1", role: "EMPLOYEE" });
    empId = emp.id;
    hrCookie = await loginAs(app, "hr@sv.com");
    empCookie = await loginAs(app, "emp@sv.com");
  });

  test("HR can create a survey with questions", async () => {
    const res = await supertest(app).post("/api/engagement/surveys")
      .set("Cookie", hrCookie)
      .send({
        title: "Q1 Pulse",
        anonymous: true,
        questions: [
          { question: "Rate your satisfaction", type: "RATING", sort_order: 0 },
          { question: "Feedback?", type: "TEXT", sort_order: 1 },
          { question: "Preferred perk?", type: "CHOICE", options: "WFH|Gym|Meals", sort_order: 2 },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe("Q1 Pulse");
    expect(res.body.status).toBe("DRAFT");
    expect(res.body.questions).toHaveLength(3);
  });

  test("employee cannot create surveys (403)", async () => {
    const res = await supertest(app).post("/api/engagement/surveys")
      .set("Cookie", empCookie)
      .send({ title: "Nope", questions: [{ question: "?", type: "TEXT" }] });
    expect(res.status).toBe(403);
  });

  test("employees only see ACTIVE surveys", async () => {
    seedSurvey(db, hrId, { status: "DRAFT", title: "DraftSurvey" });
    seedSurvey(db, hrId, { status: "ACTIVE", title: "ActiveSurvey" });
    seedSurvey(db, hrId, { status: "CLOSED", title: "ClosedSurvey" });

    const empRes = await supertest(app).get("/api/engagement/surveys").set("Cookie", empCookie);
    const hrRes = await supertest(app).get("/api/engagement/surveys").set("Cookie", hrCookie);

    const empTitles = empRes.body.map(s => s.title);
    expect(empTitles).toContain("ActiveSurvey");
    expect(empTitles).not.toContain("DraftSurvey");
    expect(empTitles).not.toContain("ClosedSurvey");

    // HR sees all
    const hrTitles = hrRes.body.map(s => s.title);
    expect(hrTitles).toContain("DraftSurvey");
    expect(hrTitles).toContain("ClosedSurvey");
  });

  test("HR can activate a DRAFT survey", async () => {
    const survey = seedSurvey(db, hrId, { status: "DRAFT" });
    const res = await supertest(app).patch(`/api/engagement/surveys/${survey.id}`)
      .set("Cookie", hrCookie)
      .send({ status: "ACTIVE" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ACTIVE");
  });

  test("HR can close an ACTIVE survey", async () => {
    const survey = seedSurvey(db, hrId, { status: "ACTIVE" });
    const res = await supertest(app).patch(`/api/engagement/surveys/${survey.id}`)
      .set("Cookie", hrCookie)
      .send({ status: "CLOSED" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("CLOSED");
  });

  test("active survey cannot be reopened to DRAFT (400)", async () => {
    const survey = seedSurvey(db, hrId, { status: "ACTIVE" });
    const res = await supertest(app).patch(`/api/engagement/surveys/${survey.id}`)
      .set("Cookie", hrCookie)
      .send({ status: "DRAFT" });
    expect(res.status).toBe(400);
  });

  test("closed surveys cannot be edited (400)", async () => {
    const survey = seedSurvey(db, hrId, { status: "CLOSED" });
    const res = await supertest(app).patch(`/api/engagement/surveys/${survey.id}`)
      .set("Cookie", hrCookie)
      .send({ title: "Reopen?" });
    expect(res.status).toBe(400);
  });

  test("can fetch questions for an active survey", async () => {
    const survey = seedSurvey(db, hrId, { status: "ACTIVE" });
    const res = await supertest(app).get(`/api/engagement/surveys/${survey.id}/questions`)
      .set("Cookie", empCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test("employee cannot see questions for DRAFT survey (403)", async () => {
    const survey = seedSurvey(db, hrId, { status: "DRAFT" });
    const res = await supertest(app).get(`/api/engagement/surveys/${survey.id}/questions`)
      .set("Cookie", empCookie);
    expect(res.status).toBe(403);
  });

  test("employee can respond to an active survey", async () => {
    const survey = seedSurvey(db, hrId, {
      status: "ACTIVE",
      questions: [
        { question: "Rate us", type: "RATING" },
        { question: "Comments?", type: "TEXT" },
      ],
    });
    const res = await supertest(app).post(`/api/engagement/surveys/${survey.id}/respond`)
      .set("Cookie", empCookie)
      .send({
        answers: [
          { question_id: survey.questionIds[0], answer: "4" },
          { question_id: survey.questionIds[1], answer: "Great place" },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
  });

  test("duplicate survey response returns 409", async () => {
    const survey = seedSurvey(db, hrId, {
      status: "ACTIVE",
      questions: [{ question: "Q?", type: "TEXT" }],
    });
    // First response
    await supertest(app).post(`/api/engagement/surveys/${survey.id}/respond`)
      .set("Cookie", empCookie)
      .send({ answers: [{ question_id: survey.questionIds[0], answer: "First" }] });
    // Duplicate
    const res = await supertest(app).post(`/api/engagement/surveys/${survey.id}/respond`)
      .set("Cookie", empCookie)
      .send({ answers: [{ question_id: survey.questionIds[0], answer: "Again" }] });
    expect(res.status).toBe(409);
  });

  test("cannot respond to DRAFT survey (400)", async () => {
    const survey = seedSurvey(db, hrId, {
      status: "DRAFT",
      questions: [{ question: "Q?", type: "TEXT" }],
    });
    const res = await supertest(app).post(`/api/engagement/surveys/${survey.id}/respond`)
      .set("Cookie", empCookie)
      .send({ answers: [{ question_id: survey.questionIds[0], answer: "x" }] });
    expect(res.status).toBe(400);
  });

  test("invalid question_id in response is rejected (400)", async () => {
    const survey = seedSurvey(db, hrId, {
      status: "ACTIVE",
      questions: [{ question: "Q?", type: "TEXT" }],
    });
    const res = await supertest(app).post(`/api/engagement/surveys/${survey.id}/respond`)
      .set("Cookie", empCookie)
      .send({ answers: [{ question_id: 99999, answer: "x" }] });
    expect(res.status).toBe(400);
  });

  test("HR can view survey results", async () => {
    const survey = seedSurvey(db, hrId, {
      status: "ACTIVE",
      questions: [{ question: "Rate", type: "RATING" }],
    });
    // Add a response directly
    db.prepare(
      "INSERT INTO survey_responses(survey_id, employee_id, question_id, answer) VALUES(?,?,?,?)"
    ).run(survey.id, empId, survey.questionIds[0], "5");

    const res = await supertest(app).get(`/api/engagement/surveys/${survey.id}/results`)
      .set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    expect(res.body.totalRespondents).toBe(1);
    expect(res.body.questions[0].avg).toBe(5);
  });

  test("employee cannot view survey results (403)", async () => {
    const survey = seedSurvey(db, hrId, { status: "ACTIVE" });
    const res = await supertest(app).get(`/api/engagement/surveys/${survey.id}/results`)
      .set("Cookie", empCookie);
    expect(res.status).toBe(403);
  });

  test("patch non-existent survey returns 404", async () => {
    const res = await supertest(app).patch("/api/engagement/surveys/99999")
      .set("Cookie", hrCookie)
      .send({ title: "Ghost" });
    expect(res.status).toBe(404);
  });
});

// ── Badges ────────────────────────────────────────────────────────────────

describe("Engagement: Badges", () => {
  let app, db, hrCookie, empCookie;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    await insertEmployee(db, { email: "hr@bg.com", code: "HRB1", role: "HR" });
    await insertEmployee(db, { email: "emp@bg.com", code: "EB1", role: "EMPLOYEE" });
    hrCookie = await loginAs(app, "hr@bg.com");
    empCookie = await loginAs(app, "emp@bg.com");
  });

  test("HR can create a badge", async () => {
    const res = await supertest(app).post("/api/engagement/badges")
      .set("Cookie", hrCookie)
      .send({ name: "Star Performer", description: "Exceeds expectations", icon: "⭐" });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Star Performer");
  });

  test("duplicate badge name is rejected", async () => {
    seedBadge(db, { name: "UniqueOne" });
    const res = await supertest(app).post("/api/engagement/badges")
      .set("Cookie", hrCookie)
      .send({ name: "UniqueOne" });
    // SQLite UNIQUE constraint → 500 or route handles as 409
    expect([409, 500]).toContain(res.status);
  });

  test("employee cannot create a badge (403)", async () => {
    const res = await supertest(app).post("/api/engagement/badges")
      .set("Cookie", empCookie)
      .send({ name: "Nope" });
    expect(res.status).toBe(403);
  });

  test("all users can list badges", async () => {
    const res = await supertest(app).get("/api/engagement/badges").set("Cookie", empCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ── Recognitions ──────────────────────────────────────────────────────────

describe("Engagement: Recognitions", () => {
  let app, db, hrCookie, empCookie, emp2Cookie, hrId, empId, emp2Id, badgeId;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    const hr = await insertEmployee(db, { email: "hr@rec.com", code: "HRR1", role: "HR" });
    hrId = hr.id;
    const emp = await insertEmployee(db, { email: "emp@rec.com", code: "ER1", role: "EMPLOYEE" });
    empId = emp.id;
    const emp2 = await insertEmployee(db, { email: "emp2@rec.com", code: "ER2", role: "EMPLOYEE" });
    emp2Id = emp2.id;
    hrCookie = await loginAs(app, "hr@rec.com");
    empCookie = await loginAs(app, "emp@rec.com");
    emp2Cookie = await loginAs(app, "emp2@rec.com");
    badgeId = seedBadge(db).id;
  });

  test("employee can give recognition to another employee", async () => {
    const res = await supertest(app).post("/api/engagement/recognitions")
      .set("Cookie", empCookie)
      .send({ to_employee: emp2Id, badge_id: badgeId, message: "Great work!" });
    expect(res.status).toBe(201);
    expect(res.body.from_employee).toBe(empId);
    expect(res.body.to_employee).toBe(emp2Id);
  });

  test("cannot recognize yourself (400)", async () => {
    const res = await supertest(app).post("/api/engagement/recognitions")
      .set("Cookie", empCookie)
      .send({ to_employee: empId, badge_id: badgeId, message: "Self praise" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/yourself/i);
  });

  test("invalid badge_id is rejected (400)", async () => {
    const res = await supertest(app).post("/api/engagement/recognitions")
      .set("Cookie", empCookie)
      .send({ to_employee: emp2Id, badge_id: 99999, message: "Ghost badge" });
    expect(res.status).toBe(400);
  });

  test("invalid recipient is rejected (400)", async () => {
    const res = await supertest(app).post("/api/engagement/recognitions")
      .set("Cookie", empCookie)
      .send({ to_employee: 99999, badge_id: badgeId, message: "No one" });
    expect(res.status).toBe(400);
  });

  test("recognition feed returns paginated results", async () => {
    // Seed a few recognitions
    for (let i = 0; i < 3; i++) {
      db.prepare(
        "INSERT INTO recognitions(from_employee, to_employee, badge_id, message) VALUES(?,?,?,?)"
      ).run(empId, emp2Id, badgeId, `Recognition ${i}`);
    }

    const res = await supertest(app).get("/api/engagement/recognitions/feed?page=1&limit=2")
      .set("Cookie", empCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(2);
    expect(res.body.totalPages).toBeGreaterThanOrEqual(1);
    expect(res.body.data[0]).toHaveProperty("from_name");
    expect(res.body.data[0]).toHaveProperty("badge_name");
  });

  test("user can view own recognitions (given)", async () => {
    const res = await supertest(app).get("/api/engagement/recognitions?type=given")
      .set("Cookie", empCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test("user can view own recognitions (received)", async () => {
    const res = await supertest(app).get("/api/engagement/recognitions?type=received")
      .set("Cookie", emp2Cookie);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });
});

// ── Dashboard ─────────────────────────────────────────────────────────────

describe("Engagement: Dashboard", () => {
  let app, db, hrCookie, empCookie, hrId;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    const hr = await insertEmployee(db, { email: "hr@dash.com", code: "HRD1", role: "HR" });
    hrId = hr.id;
    await insertEmployee(db, { email: "emp@dash.com", code: "ED1", role: "EMPLOYEE" });
    hrCookie = await loginAs(app, "hr@dash.com");
    empCookie = await loginAs(app, "emp@dash.com");
  });

  test("HR can access engagement dashboard", async () => {
    const res = await supertest(app).get("/api/engagement/dashboard").set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("surveys");
    expect(res.body).toHaveProperty("recognitions");
    expect(res.body).toHaveProperty("announcements");
  });

  test("employee cannot access engagement dashboard (403)", async () => {
    const res = await supertest(app).get("/api/engagement/dashboard").set("Cookie", empCookie);
    expect(res.status).toBe(403);
  });

  test("dashboard stats reflect data", async () => {
    seedAnnouncement(db, hrId, { title: "DashAnn" });
    const survey = seedSurvey(db, hrId, { status: "ACTIVE" });
    const badge = seedBadge(db);
    const emp = await insertEmployee(db, { email: "dashuser@d.com", code: "DU1" });
    db.prepare(
      "INSERT INTO recognitions(from_employee, to_employee, badge_id, message) VALUES(?,?,?,?)"
    ).run(hrId, emp.id, badge.id, "Dashboard test");

    const res = await supertest(app).get("/api/engagement/dashboard").set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    expect(res.body.surveys.active).toBeGreaterThanOrEqual(1);
    expect(res.body.announcements.active).toBeGreaterThanOrEqual(1);
  });
});

// ── Auth / unauthenticated ────────────────────────────────────────────────

describe("Engagement: Auth guards", () => {
  let app;

  beforeAll(() => {
    ({ app } = buildApp());
  });

  test("unauthenticated requests are rejected", async () => {
    const endpoints = [
      ["GET", "/api/engagement/announcements"],
      ["POST", "/api/engagement/announcements"],
      ["GET", "/api/engagement/surveys"],
      ["GET", "/api/engagement/badges"],
      ["POST", "/api/engagement/recognitions"],
      ["GET", "/api/engagement/recognitions/feed"],
      ["GET", "/api/engagement/dashboard"],
    ];
    for (const [method, path] of endpoints) {
      const res = await supertest(app)[method.toLowerCase()](path);
      expect(res.status).toBe(401);
    }
  });
});
