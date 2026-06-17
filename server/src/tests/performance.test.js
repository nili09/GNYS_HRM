import { describe, test, expect, beforeAll } from "vitest";
import supertest from "supertest";
import { buildApp, insertEmployee, loginAs } from "./helpers.js";

// ── Review Cycles ──────────────────────────────────────────────────────────

describe("Performance — Review Cycles", () => {
  let app, db, hrCookie, empCookie;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    await insertEmployee(db, { email: "perf_hr@test.com", code: "PHR1", role: "HR" });
    await insertEmployee(db, { email: "perf_emp@test.com", code: "PEMP1", role: "EMPLOYEE" });
    hrCookie = await loginAs(app, "perf_hr@test.com");
    empCookie = await loginAs(app, "perf_emp@test.com");
  });

  test("HR can create a review cycle", async () => {
    const res = await supertest(app).post("/api/performance/review-cycles")
      .set("Cookie", hrCookie)
      .send({ name: "FY2026 Annual", year: 2026, start_date: "2026-04-01", end_date: "2027-03-31" });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("FY2026 Annual");
    expect(res.body.status).toBe("DRAFT");
  });

  test("employee cannot create a cycle (403)", async () => {
    const res = await supertest(app).post("/api/performance/review-cycles")
      .set("Cookie", empCookie)
      .send({ name: "Nope", year: 2026, start_date: "2026-01-01", end_date: "2026-12-31" });
    expect(res.status).toBe(403);
  });

  test("start_date must be before end_date", async () => {
    const res = await supertest(app).post("/api/performance/review-cycles")
      .set("Cookie", hrCookie)
      .send({ name: "Bad Dates", year: 2026, start_date: "2027-01-01", end_date: "2026-01-01" });
    expect(res.status).toBe(400);
  });

  test("anyone authenticated can list cycles", async () => {
    const res = await supertest(app).get("/api/performance/review-cycles").set("Cookie", empCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test("HR can activate a cycle", async () => {
    const cycles = await supertest(app).get("/api/performance/review-cycles").set("Cookie", hrCookie);
    const id = cycles.body[0].id;
    const res = await supertest(app).patch(`/api/performance/review-cycles/${id}`)
      .set("Cookie", hrCookie).send({ status: "ACTIVE" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ACTIVE");
  });

  test("HR can close a cycle", async () => {
    const create = await supertest(app).post("/api/performance/review-cycles")
      .set("Cookie", hrCookie)
      .send({ name: "To Close", year: 2026, start_date: "2026-01-01", end_date: "2026-06-30", status: "ACTIVE" });
    const res = await supertest(app).patch(`/api/performance/review-cycles/${create.body.id}`)
      .set("Cookie", hrCookie).send({ status: "CLOSED" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("CLOSED");
  });

  test("patch non-existent cycle returns 404", async () => {
    const res = await supertest(app).patch("/api/performance/review-cycles/99999")
      .set("Cookie", hrCookie).send({ status: "ACTIVE" });
    expect(res.status).toBe(404);
  });
});

// ── Goals ───────────────────────────────────────────────────────────────────

describe("Performance — Goals", () => {
  let app, db, hrCookie, empCookie, mgrCookie, emp2Cookie;
  let empId, mgrId, emp2Id, cycleId;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    const mgr = await insertEmployee(db, { email: "goal_mgr@test.com", code: "GMGR1", role: "EMPLOYEE" });
    mgrId = mgr.id;
    const emp = await insertEmployee(db, { email: "goal_emp@test.com", code: "GEMP1", role: "EMPLOYEE", manager_id: mgrId });
    empId = emp.id;
    const emp2 = await insertEmployee(db, { email: "goal_emp2@test.com", code: "GEMP2", role: "EMPLOYEE" });
    emp2Id = emp2.id;
    await insertEmployee(db, { email: "goal_hr@test.com", code: "GHR1", role: "HR" });

    hrCookie = await loginAs(app, "goal_hr@test.com");
    empCookie = await loginAs(app, "goal_emp@test.com");
    mgrCookie = await loginAs(app, "goal_mgr@test.com");
    emp2Cookie = await loginAs(app, "goal_emp2@test.com");

    const cycle = await supertest(app).post("/api/performance/review-cycles")
      .set("Cookie", hrCookie)
      .send({ name: "Goal Cycle", year: 2026, start_date: "2026-04-01", end_date: "2027-03-31", status: "ACTIVE" });
    cycleId = cycle.body.id;
  });

  test("employee can create own goal", async () => {
    const res = await supertest(app).post("/api/performance/goals")
      .set("Cookie", empCookie)
      .send({ employee_id: empId, cycle_id: cycleId, title: "Improve code quality", weight: 40 });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe("Improve code quality");
    expect(res.body.weight).toBe(40);
  });

  test("employee cannot create goal for others (403)", async () => {
    const res = await supertest(app).post("/api/performance/goals")
      .set("Cookie", empCookie)
      .send({ employee_id: emp2Id, cycle_id: cycleId, title: "Not mine", weight: 50 });
    expect(res.status).toBe(403);
  });

  test("HR can create goal for any employee", async () => {
    const res = await supertest(app).post("/api/performance/goals")
      .set("Cookie", hrCookie)
      .send({ employee_id: emp2Id, cycle_id: cycleId, title: "HR set goal", weight: 30 });
    expect(res.status).toBe(201);
  });

  test("cannot create goal for inactive cycle", async () => {
    const closed = await supertest(app).post("/api/performance/review-cycles")
      .set("Cookie", hrCookie)
      .send({ name: "Closed Cycle", year: 2025, start_date: "2025-01-01", end_date: "2025-12-31" });
    const res = await supertest(app).post("/api/performance/goals")
      .set("Cookie", empCookie)
      .send({ employee_id: empId, cycle_id: closed.body.id, title: "Wont work", weight: 10 });
    expect(res.status).toBe(400);
  });

  test("employee can update own goal progress + self_rating", async () => {
    const goals = await supertest(app).get(`/api/performance/goals?employee_id=${empId}&cycle_id=${cycleId}`)
      .set("Cookie", empCookie);
    const goalId = goals.body[0].id;
    const res = await supertest(app).patch(`/api/performance/goals/${goalId}`)
      .set("Cookie", empCookie)
      .send({ status: "IN_PROGRESS", actual_value: "90% coverage", self_rating: 4 });
    expect(res.status).toBe(200);
    expect(res.body.self_rating).toBe(4);
    expect(res.body.status).toBe("IN_PROGRESS");
  });

  test("manager can set manager_rating on direct report's goal", async () => {
    const goals = await supertest(app).get(`/api/performance/goals?employee_id=${empId}&cycle_id=${cycleId}`)
      .set("Cookie", mgrCookie);
    const goalId = goals.body[0].id;
    const res = await supertest(app).patch(`/api/performance/goals/${goalId}`)
      .set("Cookie", mgrCookie)
      .send({ manager_rating: 3 });
    expect(res.status).toBe(200);
    expect(res.body.manager_rating).toBe(3);
  });

  test("employee cannot set manager_rating (403)", async () => {
    const goals = await supertest(app).get(`/api/performance/goals?employee_id=${empId}&cycle_id=${cycleId}`)
      .set("Cookie", empCookie);
    const goalId = goals.body[0].id;
    const res = await supertest(app).patch(`/api/performance/goals/${goalId}`)
      .set("Cookie", empCookie)
      .send({ manager_rating: 5 });
    expect(res.status).toBe(403);
  });

  test("unrelated employee cannot patch another's goal (403)", async () => {
    const goals = await supertest(app).get(`/api/performance/goals?employee_id=${empId}&cycle_id=${cycleId}`)
      .set("Cookie", hrCookie);
    const goalId = goals.body[0].id;
    const res = await supertest(app).patch(`/api/performance/goals/${goalId}`)
      .set("Cookie", emp2Cookie)
      .send({ status: "COMPLETED" });
    expect(res.status).toBe(403);
  });

  test("manager sees direct reports' goals", async () => {
    const res = await supertest(app).get("/api/performance/goals")
      .set("Cookie", mgrCookie);
    expect(res.status).toBe(200);
    expect(res.body.some(g => g.employee_id === empId)).toBe(true);
  });

  test("employee only sees own goals (not others)", async () => {
    const res = await supertest(app).get("/api/performance/goals")
      .set("Cookie", empCookie);
    expect(res.status).toBe(200);
    expect(res.body.every(g => g.employee_id === empId)).toBe(true);
  });

  test("HR sees all goals", async () => {
    const res = await supertest(app).get("/api/performance/goals")
      .set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
  });

  test("patch non-existent goal returns 404", async () => {
    const res = await supertest(app).patch("/api/performance/goals/99999")
      .set("Cookie", hrCookie).send({ status: "COMPLETED" });
    expect(res.status).toBe(404);
  });

  test("employee cannot view unrelated employee's goals via query", async () => {
    const res = await supertest(app).get(`/api/performance/goals?employee_id=${emp2Id}`)
      .set("Cookie", empCookie);
    expect(res.status).toBe(403);
  });
});

// ── Reviews ────────────────────────────────────────────────────────────────

describe("Performance — Reviews", () => {
  let app, db, hrCookie, empCookie, reviewerCookie, emp2Cookie;
  let empId, reviewerId, cycleId;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    const emp = await insertEmployee(db, { email: "rev_emp@test.com", code: "REMP1", role: "EMPLOYEE" });
    empId = emp.id;
    const reviewer = await insertEmployee(db, { email: "rev_mgr@test.com", code: "RMGR1", role: "EMPLOYEE" });
    reviewerId = reviewer.id;
    const emp2 = await insertEmployee(db, { email: "rev_emp2@test.com", code: "REMP2", role: "EMPLOYEE" });
    await insertEmployee(db, { email: "rev_hr@test.com", code: "RHR1", role: "HR" });

    hrCookie = await loginAs(app, "rev_hr@test.com");
    empCookie = await loginAs(app, "rev_emp@test.com");
    reviewerCookie = await loginAs(app, "rev_mgr@test.com");
    emp2Cookie = await loginAs(app, "rev_emp2@test.com");

    const cycle = await supertest(app).post("/api/performance/review-cycles")
      .set("Cookie", hrCookie)
      .send({ name: "Review Cycle", year: 2026, start_date: "2026-04-01", end_date: "2027-03-31", status: "ACTIVE" });
    cycleId = cycle.body.id;
  });

  test("HR can create a review assignment", async () => {
    const res = await supertest(app).post("/api/performance/reviews")
      .set("Cookie", hrCookie)
      .send({ employee_id: empId, cycle_id: cycleId, reviewer_id: reviewerId, relationship: "MANAGER" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("PENDING");
  });

  test("duplicate review assignment is rejected (409)", async () => {
    const res = await supertest(app).post("/api/performance/reviews")
      .set("Cookie", hrCookie)
      .send({ employee_id: empId, cycle_id: cycleId, reviewer_id: reviewerId, relationship: "MANAGER" });
    expect(res.status).toBe(409);
  });

  test("employee cannot create review assignments (403)", async () => {
    const res = await supertest(app).post("/api/performance/reviews")
      .set("Cookie", empCookie)
      .send({ employee_id: empId, cycle_id: cycleId, reviewer_id: reviewerId, relationship: "PEER" });
    expect(res.status).toBe(403);
  });

  test("cannot assign review for inactive cycle", async () => {
    const draft = await supertest(app).post("/api/performance/review-cycles")
      .set("Cookie", hrCookie)
      .send({ name: "Draft Only", year: 2025, start_date: "2025-01-01", end_date: "2025-12-31" });
    const res = await supertest(app).post("/api/performance/reviews")
      .set("Cookie", hrCookie)
      .send({ employee_id: empId, cycle_id: draft.body.id, reviewer_id: reviewerId });
    expect(res.status).toBe(400);
  });

  test("reviewer can submit feedback", async () => {
    const reviews = await supertest(app).get("/api/performance/reviews")
      .set("Cookie", reviewerCookie);
    const revId = reviews.body.find(r => r.reviewer_id === reviewerId).id;
    const res = await supertest(app).patch(`/api/performance/reviews/${revId}`)
      .set("Cookie", reviewerCookie)
      .send({ overall_rating: 4, strengths: "Good communicator", improvements: "Time management", status: "SUBMITTED" });
    expect(res.status).toBe(200);
    expect(res.body.overall_rating).toBe(4);
    expect(res.body.status).toBe("SUBMITTED");
  });

  test("non-reviewer cannot patch review (403)", async () => {
    const reviews = await supertest(app).get("/api/performance/reviews").set("Cookie", hrCookie);
    const revId = reviews.body[0].id;
    const res = await supertest(app).patch(`/api/performance/reviews/${revId}`)
      .set("Cookie", emp2Cookie)
      .send({ overall_rating: 1, status: "SUBMITTED" });
    expect(res.status).toBe(403);
  });

  test("reviewer cannot re-submit after submission", async () => {
    const reviews = await supertest(app).get("/api/performance/reviews")
      .set("Cookie", reviewerCookie);
    const revId = reviews.body.find(r => r.status === "SUBMITTED").id;
    const res = await supertest(app).patch(`/api/performance/reviews/${revId}`)
      .set("Cookie", reviewerCookie)
      .send({ overall_rating: 5 });
    expect(res.status).toBe(400);
  });

  test("HR can still edit a submitted review", async () => {
    const reviews = await supertest(app).get("/api/performance/reviews").set("Cookie", hrCookie);
    const revId = reviews.body.find(r => r.status === "SUBMITTED").id;
    const res = await supertest(app).patch(`/api/performance/reviews/${revId}`)
      .set("Cookie", hrCookie)
      .send({ comments: "HR note added" });
    expect(res.status).toBe(200);
    expect(res.body.comments).toBe("HR note added");
  });

  test("employee sees reviews where they are subject or reviewer", async () => {
    const res = await supertest(app).get("/api/performance/reviews").set("Cookie", empCookie);
    expect(res.status).toBe(200);
    expect(res.body.every(r => r.employee_id === empId || r.reviewer_id === empId)).toBe(true);
  });

  test("HR can assign peer review (360)", async () => {
    const res = await supertest(app).post("/api/performance/reviews")
      .set("Cookie", hrCookie)
      .send({ employee_id: empId, cycle_id: cycleId, reviewer_id: reviewerId, relationship: "PEER" });
    expect(res.status).toBe(201);
    expect(res.body.relationship).toBe("PEER");
  });
});

// ── 1-on-1s ────────────────────────────────────────────────────────────────

describe("Performance — 1-on-1s", () => {
  let app, db, hrCookie, empCookie, mgrCookie, outsiderCookie;
  let empId, mgrId;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    const mgr = await insertEmployee(db, { email: "ooo_mgr@test.com", code: "OMGR1", role: "EMPLOYEE" });
    mgrId = mgr.id;
    const emp = await insertEmployee(db, { email: "ooo_emp@test.com", code: "OEMP1", role: "EMPLOYEE", manager_id: mgrId });
    empId = emp.id;
    await insertEmployee(db, { email: "ooo_out@test.com", code: "OOUT1", role: "EMPLOYEE" });
    await insertEmployee(db, { email: "ooo_hr@test.com", code: "OHR1", role: "HR" });

    hrCookie = await loginAs(app, "ooo_hr@test.com");
    empCookie = await loginAs(app, "ooo_emp@test.com");
    mgrCookie = await loginAs(app, "ooo_mgr@test.com");
    outsiderCookie = await loginAs(app, "ooo_out@test.com");
  });

  test("manager can create a 1-on-1", async () => {
    const res = await supertest(app).post("/api/performance/one-on-ones")
      .set("Cookie", mgrCookie)
      .send({ employee_id: empId, manager_id: mgrId, date: "2026-06-15", notes: "Discussed project progress" });
    expect(res.status).toBe(201);
    expect(res.body.notes).toBe("Discussed project progress");
  });

  test("employee can create a 1-on-1 with their manager", async () => {
    const res = await supertest(app).post("/api/performance/one-on-ones")
      .set("Cookie", empCookie)
      .send({ employee_id: empId, manager_id: mgrId, date: "2026-06-22" });
    expect(res.status).toBe(201);
  });

  test("outsider cannot create 1-on-1 for others (403)", async () => {
    const res = await supertest(app).post("/api/performance/one-on-ones")
      .set("Cookie", outsiderCookie)
      .send({ employee_id: empId, manager_id: mgrId, date: "2026-06-25" });
    expect(res.status).toBe(403);
  });

  test("1-on-1 visible only to employee and manager", async () => {
    const empRes = await supertest(app).get("/api/performance/one-on-ones")
      .set("Cookie", empCookie);
    expect(empRes.status).toBe(200);
    expect(empRes.body.length).toBeGreaterThan(0);

    const mgrRes = await supertest(app).get("/api/performance/one-on-ones")
      .set("Cookie", mgrCookie);
    expect(mgrRes.status).toBe(200);
    expect(mgrRes.body.length).toBeGreaterThan(0);

    const outRes = await supertest(app).get("/api/performance/one-on-ones")
      .set("Cookie", outsiderCookie);
    expect(outRes.status).toBe(200);
    expect(outRes.body.length).toBe(0);
  });

  test("HR can see all 1-on-1s", async () => {
    const res = await supertest(app).get("/api/performance/one-on-ones")
      .set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test("involved party can update 1-on-1", async () => {
    const list = await supertest(app).get("/api/performance/one-on-ones")
      .set("Cookie", mgrCookie);
    const id = list.body[0].id;
    const res = await supertest(app).patch(`/api/performance/one-on-ones/${id}`)
      .set("Cookie", mgrCookie)
      .send({ action_items: "Follow up on deployment" });
    expect(res.status).toBe(200);
    expect(res.body.action_items).toBe("Follow up on deployment");
  });

  test("outsider cannot update 1-on-1 (403)", async () => {
    const list = await supertest(app).get("/api/performance/one-on-ones")
      .set("Cookie", hrCookie);
    const id = list.body[0].id;
    const res = await supertest(app).patch(`/api/performance/one-on-ones/${id}`)
      .set("Cookie", outsiderCookie)
      .send({ notes: "Hacked" });
    expect(res.status).toBe(403);
  });

  test("patch non-existent 1-on-1 returns 404", async () => {
    const res = await supertest(app).patch("/api/performance/one-on-ones/99999")
      .set("Cookie", hrCookie).send({ notes: "Ghost" });
    expect(res.status).toBe(404);
  });
});

// ── Dashboard + Employee Profile ───────────────────────────────────────────

describe("Performance — Dashboard & Employee Profile", () => {
  let app, db, hrCookie, empCookie, mgrCookie;
  let empId, mgrId;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    db.prepare("INSERT INTO departments(name) VALUES(?)").run("Perf-Dept");
    const mgr = await insertEmployee(db, { email: "pd_mgr@test.com", code: "PDMGR1", role: "EMPLOYEE", dept_id: 1 });
    mgrId = mgr.id;
    const emp = await insertEmployee(db, { email: "pd_emp@test.com", code: "PDEMP1", role: "EMPLOYEE", dept_id: 1, manager_id: mgrId });
    empId = emp.id;
    await insertEmployee(db, { email: "pd_hr@test.com", code: "PDHR1", role: "HR" });

    hrCookie = await loginAs(app, "pd_hr@test.com");
    empCookie = await loginAs(app, "pd_emp@test.com");
    mgrCookie = await loginAs(app, "pd_mgr@test.com");

    const cycle = await supertest(app).post("/api/performance/review-cycles")
      .set("Cookie", hrCookie)
      .send({ name: "Dash Cycle", year: 2026, start_date: "2026-04-01", end_date: "2027-03-31", status: "ACTIVE" });
    const cycleId = cycle.body.id;

    await supertest(app).post("/api/performance/goals").set("Cookie", empCookie)
      .send({ employee_id: empId, cycle_id: cycleId, title: "Goal 1", weight: 50 });

    const rev = await supertest(app).post("/api/performance/reviews").set("Cookie", hrCookie)
      .send({ employee_id: empId, cycle_id: cycleId, reviewer_id: mgrId, relationship: "MANAGER" });
    await supertest(app).patch(`/api/performance/reviews/${rev.body.id}`).set("Cookie", mgrCookie)
      .send({ overall_rating: 4, status: "SUBMITTED" });
  });

  test("HR can access performance dashboard", async () => {
    const res = await supertest(app).get("/api/performance/dashboard")
      .set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    expect(res.body.activeCycles).toBeGreaterThanOrEqual(1);
    expect(res.body.totalGoals).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(res.body.avgByDept)).toBe(true);
    expect(Array.isArray(res.body.completionRate)).toBe(true);
  });

  test("employee cannot access performance dashboard (403)", async () => {
    const res = await supertest(app).get("/api/performance/dashboard")
      .set("Cookie", empCookie);
    expect(res.status).toBe(403);
  });

  test("employee can view own performance profile", async () => {
    const res = await supertest(app).get(`/api/performance/employee/${empId}`)
      .set("Cookie", empCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.goals)).toBe(true);
    expect(Array.isArray(res.body.reviews)).toBe(true);
    expect(res.body.goals.length).toBeGreaterThanOrEqual(1);
  });

  test("manager can view direct report's performance profile", async () => {
    const res = await supertest(app).get(`/api/performance/employee/${empId}`)
      .set("Cookie", mgrCookie);
    expect(res.status).toBe(200);
    expect(res.body.goals.length).toBeGreaterThanOrEqual(1);
  });

  test("unrelated employee cannot view another's profile (403)", async () => {
    const other = await insertEmployee(db, { email: "pd_other@test.com", code: "PDOTH1", role: "EMPLOYEE" });
    const otherCookie = await loginAs(app, "pd_other@test.com");
    const res = await supertest(app).get(`/api/performance/employee/${empId}`)
      .set("Cookie", otherCookie);
    expect(res.status).toBe(403);
  });
});
