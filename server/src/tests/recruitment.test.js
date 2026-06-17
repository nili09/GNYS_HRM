import { describe, test, expect, beforeAll } from "vitest";
import supertest from "supertest";
import { buildApp, insertEmployee, loginAs } from "./helpers.js";

describe("Recruitment — Job Openings", () => {
  let app, db, hrCookie, empCookie;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    db.prepare("INSERT INTO departments(name) VALUES(?)").run("Rec-Dept");
    db.prepare("INSERT INTO locations(name) VALUES(?)").run("Rec-Loc");
    await insertEmployee(db, { email: "rec_hr@test.com", code: "RHR1", role: "HR" });
    await insertEmployee(db, { email: "rec_emp@test.com", code: "REMP1", role: "EMPLOYEE" });
    hrCookie = await loginAs(app, "rec_hr@test.com");
    empCookie = await loginAs(app, "rec_emp@test.com");
  });

  test("HR can create a job opening", async () => {
    const res = await supertest(app).post("/api/recruitment/jobs")
      .set("Cookie", hrCookie)
      .send({ title: "Backend Dev", positions: 2, status: "OPEN" });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe("Backend Dev");
    expect(res.body.positions).toBe(2);
  });

  test("employee cannot create a job (403)", async () => {
    const res = await supertest(app).post("/api/recruitment/jobs")
      .set("Cookie", empCookie)
      .send({ title: "Nope", positions: 1 });
    expect(res.status).toBe(403);
  });

  test("HR can list jobs", async () => {
    const res = await supertest(app).get("/api/recruitment/jobs")
      .set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test("HR can filter jobs by status", async () => {
    await supertest(app).post("/api/recruitment/jobs")
      .set("Cookie", hrCookie)
      .send({ title: "Draft Job" });
    const res = await supertest(app).get("/api/recruitment/jobs?status=DRAFT")
      .set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    expect(res.body.every(j => j.status === "DRAFT")).toBe(true);
  });

  test("HR can get a single job", async () => {
    const create = await supertest(app).post("/api/recruitment/jobs")
      .set("Cookie", hrCookie)
      .send({ title: "Single Fetch Job", status: "OPEN" });
    const res = await supertest(app).get(`/api/recruitment/jobs/${create.body.id}`)
      .set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Single Fetch Job");
  });

  test("get non-existent job returns 404", async () => {
    const res = await supertest(app).get("/api/recruitment/jobs/99999")
      .set("Cookie", hrCookie);
    expect(res.status).toBe(404);
  });

  test("HR can patch a job", async () => {
    const create = await supertest(app).post("/api/recruitment/jobs")
      .set("Cookie", hrCookie)
      .send({ title: "Patchable", status: "OPEN" });
    const res = await supertest(app).patch(`/api/recruitment/jobs/${create.body.id}`)
      .set("Cookie", hrCookie)
      .send({ title: "Patched Title" });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Patched Title");
  });

  test("closing a job sets closed_at", async () => {
    const create = await supertest(app).post("/api/recruitment/jobs")
      .set("Cookie", hrCookie)
      .send({ title: "Will Close", status: "OPEN" });
    const res = await supertest(app).patch(`/api/recruitment/jobs/${create.body.id}`)
      .set("Cookie", hrCookie)
      .send({ status: "CLOSED" });
    expect(res.status).toBe(200);
    const row = db.prepare("SELECT closed_at FROM job_openings WHERE id = ?").get(create.body.id);
    expect(row.closed_at).toBeTruthy();
  });

  test("invalid job data returns 400", async () => {
    const res = await supertest(app).post("/api/recruitment/jobs")
      .set("Cookie", hrCookie)
      .send({ positions: -1 });
    expect(res.status).toBe(400);
  });
});

describe("Recruitment — Candidates", () => {
  let app, db, hrCookie, empCookie;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    await insertEmployee(db, { email: "cand_hr@test.com", code: "CHR1", role: "HR" });
    await insertEmployee(db, { email: "cand_emp@test.com", code: "CEMP1", role: "EMPLOYEE" });
    hrCookie = await loginAs(app, "cand_hr@test.com");
    empCookie = await loginAs(app, "cand_emp@test.com");
  });

  test("HR can create a candidate", async () => {
    const res = await supertest(app).post("/api/recruitment/candidates")
      .set("Cookie", hrCookie)
      .send({ name: "Alice Cand", email: "alice@external.com", source: "LinkedIn" });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Alice Cand");
    expect(res.body.source).toBe("LinkedIn");
  });

  test("employee cannot create a candidate (403)", async () => {
    const res = await supertest(app).post("/api/recruitment/candidates")
      .set("Cookie", empCookie)
      .send({ name: "Bob", email: "bob@ext.com" });
    expect(res.status).toBe(403);
  });

  test("HR can list candidates", async () => {
    const res = await supertest(app).get("/api/recruitment/candidates")
      .set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test("HR can patch a candidate", async () => {
    const create = await supertest(app).post("/api/recruitment/candidates")
      .set("Cookie", hrCookie)
      .send({ name: "Patch Me", email: "patchme@ext.com" });
    const res = await supertest(app).patch(`/api/recruitment/candidates/${create.body.id}`)
      .set("Cookie", hrCookie)
      .send({ phone: "9876543210" });
    expect(res.status).toBe(200);
    expect(res.body.phone).toBe("9876543210");
  });

  test("candidate email is NOT constrained to @igenesys.com", async () => {
    const res = await supertest(app).post("/api/recruitment/candidates")
      .set("Cookie", hrCookie)
      .send({ name: "External Person", email: "person@gmail.com" });
    expect(res.status).toBe(201);
  });

  test("invalid candidate data returns 400", async () => {
    const res = await supertest(app).post("/api/recruitment/candidates")
      .set("Cookie", hrCookie)
      .send({ name: "" });
    expect(res.status).toBe(400);
  });
});

describe("Recruitment — Applications", () => {
  let app, db, hrCookie, jobId, candId;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    await insertEmployee(db, { email: "app_hr@test.com", code: "AHR1", role: "HR" });
    hrCookie = await loginAs(app, "app_hr@test.com");
    const job = await supertest(app).post("/api/recruitment/jobs")
      .set("Cookie", hrCookie).send({ title: "App Test Job", status: "OPEN" });
    jobId = job.body.id;
    const cand = await supertest(app).post("/api/recruitment/candidates")
      .set("Cookie", hrCookie).send({ name: "App Cand", email: "app@ext.com" });
    candId = cand.body.id;
  });

  test("HR can create an application", async () => {
    const res = await supertest(app).post("/api/recruitment/applications")
      .set("Cookie", hrCookie)
      .send({ job_id: jobId, candidate_id: candId });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("APPLIED");
  });

  test("duplicate application is rejected (409)", async () => {
    const res = await supertest(app).post("/api/recruitment/applications")
      .set("Cookie", hrCookie)
      .send({ job_id: jobId, candidate_id: candId });
    expect(res.status).toBe(409);
  });

  test("cannot apply to non-open job", async () => {
    const draft = await supertest(app).post("/api/recruitment/jobs")
      .set("Cookie", hrCookie).send({ title: "Draft Only" });
    const res = await supertest(app).post("/api/recruitment/applications")
      .set("Cookie", hrCookie)
      .send({ job_id: draft.body.id, candidate_id: candId });
    expect(res.status).toBe(400);
  });

  test("HR can list applications", async () => {
    const res = await supertest(app).get("/api/recruitment/applications")
      .set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].candidate_name).toBeTruthy();
  });

  test("HR can filter applications by job_id", async () => {
    const res = await supertest(app).get(`/api/recruitment/applications?job_id=${jobId}`)
      .set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    expect(res.body.every(a => a.job_id === jobId)).toBe(true);
  });

  test("valid status transitions work", async () => {
    const appRow = db.prepare("SELECT id FROM applications WHERE job_id = ? AND candidate_id = ?").get(jobId, candId);
    for (const next of ["SCREENING", "INTERVIEW", "OFFERED", "HIRED"]) {
      const res = await supertest(app).patch(`/api/recruitment/applications/${appRow.id}`)
        .set("Cookie", hrCookie).send({ status: next });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe(next);
    }
  });

  test("cannot transition from terminal state", async () => {
    const appRow = db.prepare("SELECT id FROM applications WHERE job_id = ? AND candidate_id = ?").get(jobId, candId);
    const res = await supertest(app).patch(`/api/recruitment/applications/${appRow.id}`)
      .set("Cookie", hrCookie).send({ status: "SCREENING" });
    expect(res.status).toBe(400);
  });

  test("invalid status transition is rejected", async () => {
    const cand2 = await supertest(app).post("/api/recruitment/candidates")
      .set("Cookie", hrCookie).send({ name: "Trans Test", email: "trans@ext.com" });
    const app2 = await supertest(app).post("/api/recruitment/applications")
      .set("Cookie", hrCookie).send({ job_id: jobId, candidate_id: cand2.body.id });
    const res = await supertest(app).patch(`/api/recruitment/applications/${app2.body.id}`)
      .set("Cookie", hrCookie).send({ status: "HIRED" });
    expect(res.status).toBe(400);
  });
});

describe("Recruitment — Interviews", () => {
  let app, db, hrCookie, empCookie, emp2Cookie, appId, empId, emp2Id;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    const hr = await insertEmployee(db, { email: "int_hr@test.com", code: "IHR1", role: "HR" });
    const emp = await insertEmployee(db, { email: "int_emp@test.com", code: "IEMP1", role: "EMPLOYEE" });
    const emp2 = await insertEmployee(db, { email: "int_emp2@test.com", code: "IEMP2", role: "EMPLOYEE" });
    empId = emp.id;
    emp2Id = emp2.id;
    hrCookie = await loginAs(app, "int_hr@test.com");
    empCookie = await loginAs(app, "int_emp@test.com");
    emp2Cookie = await loginAs(app, "int_emp2@test.com");

    const job = await supertest(app).post("/api/recruitment/jobs")
      .set("Cookie", hrCookie).send({ title: "Interview Job", status: "OPEN" });
    const cand = await supertest(app).post("/api/recruitment/candidates")
      .set("Cookie", hrCookie).send({ name: "Int Cand", email: "intcand@ext.com" });
    const application = await supertest(app).post("/api/recruitment/applications")
      .set("Cookie", hrCookie).send({ job_id: job.body.id, candidate_id: cand.body.id });
    appId = application.body.id;
  });

  test("HR can schedule an interview", async () => {
    const res = await supertest(app).post("/api/recruitment/interviews")
      .set("Cookie", hrCookie)
      .send({ application_id: appId, interviewer_id: empId, scheduled_at: "2027-06-20T10:00:00", mode: "VIDEO" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("SCHEDULED");
    expect(res.body.mode).toBe("VIDEO");
  });

  test("employee cannot schedule an interview (403)", async () => {
    const res = await supertest(app).post("/api/recruitment/interviews")
      .set("Cookie", empCookie)
      .send({ application_id: appId, interviewer_id: empId, scheduled_at: "2027-06-21T10:00:00" });
    expect(res.status).toBe(403);
  });

  test("HR sees all interviews", async () => {
    const res = await supertest(app).get("/api/recruitment/interviews")
      .set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test("interviewer sees only own interviews", async () => {
    await supertest(app).post("/api/recruitment/interviews")
      .set("Cookie", hrCookie)
      .send({ application_id: appId, interviewer_id: emp2Id, scheduled_at: "2027-06-22T10:00:00" });
    const res1 = await supertest(app).get("/api/recruitment/interviews")
      .set("Cookie", empCookie);
    expect(res1.status).toBe(200);
    expect(res1.body.every(i => i.interviewer_id === empId)).toBe(true);
    const res2 = await supertest(app).get("/api/recruitment/interviews")
      .set("Cookie", emp2Cookie);
    expect(res2.status).toBe(200);
    expect(res2.body.every(i => i.interviewer_id === emp2Id)).toBe(true);
  });

  test("interviewer can submit feedback and rating", async () => {
    const intRow = db.prepare("SELECT id FROM interviews WHERE interviewer_id = ?").get(empId);
    const res = await supertest(app).patch(`/api/recruitment/interviews/${intRow.id}`)
      .set("Cookie", empCookie)
      .send({ feedback: "Good candidate", rating: 4, status: "COMPLETED" });
    expect(res.status).toBe(200);
    expect(res.body.feedback).toBe("Good candidate");
    expect(res.body.rating).toBe(4);
  });

  test("interviewer cannot modify schedule fields", async () => {
    const intRow = db.prepare("SELECT id FROM interviews WHERE interviewer_id = ?").get(empId);
    const res = await supertest(app).patch(`/api/recruitment/interviews/${intRow.id}`)
      .set("Cookie", empCookie)
      .send({ scheduled_at: "2027-07-01T10:00:00" });
    expect(res.status).toBe(403);
  });

  test("non-assigned employee cannot patch interview", async () => {
    const intRow = db.prepare("SELECT id FROM interviews WHERE interviewer_id = ?").get(empId);
    const res = await supertest(app).patch(`/api/recruitment/interviews/${intRow.id}`)
      .set("Cookie", emp2Cookie)
      .send({ feedback: "Not my interview" });
    expect(res.status).toBe(403);
  });

  test("HR can reschedule interview", async () => {
    const intRow = db.prepare("SELECT id FROM interviews WHERE interviewer_id = ?").get(emp2Id);
    const res = await supertest(app).patch(`/api/recruitment/interviews/${intRow.id}`)
      .set("Cookie", hrCookie)
      .send({ scheduled_at: "2027-07-15T14:00:00", mode: "PHONE" });
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("PHONE");
  });

  test("interview with invalid application returns 400", async () => {
    const res = await supertest(app).post("/api/recruitment/interviews")
      .set("Cookie", hrCookie)
      .send({ application_id: 99999, interviewer_id: empId, scheduled_at: "2027-06-25T10:00:00" });
    expect(res.status).toBe(400);
  });
});

describe("Recruitment — Offers", () => {
  let app, db, hrCookie, appId;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    await insertEmployee(db, { email: "off_hr@test.com", code: "OHR1", role: "HR" });
    hrCookie = await loginAs(app, "off_hr@test.com");

    const job = await supertest(app).post("/api/recruitment/jobs")
      .set("Cookie", hrCookie).send({ title: "Offer Job", status: "OPEN" });
    const cand = await supertest(app).post("/api/recruitment/candidates")
      .set("Cookie", hrCookie).send({ name: "Offer Cand", email: "offer@ext.com" });
    const application = await supertest(app).post("/api/recruitment/applications")
      .set("Cookie", hrCookie).send({ job_id: job.body.id, candidate_id: cand.body.id });
    appId = application.body.id;
  });

  test("HR can create an offer", async () => {
    const res = await supertest(app).post(`/api/recruitment/offers/${appId}`)
      .set("Cookie", hrCookie)
      .send({ ctc_offered: 800000, joining_date: "2027-08-01" });
    expect(res.status).toBe(201);
    expect(res.body.ctc_offered).toBe(800000);
    expect(res.body.application_id).toBe(appId);
  });

  test("duplicate offer for same application is rejected (409)", async () => {
    const res = await supertest(app).post(`/api/recruitment/offers/${appId}`)
      .set("Cookie", hrCookie)
      .send({ ctc_offered: 900000, joining_date: "2027-09-01" });
    expect(res.status).toBe(409);
  });

  test("HR can get an offer by application", async () => {
    const res = await supertest(app).get(`/api/recruitment/offers/${appId}`)
      .set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    expect(res.body.ctc_offered).toBe(800000);
  });

  test("get offer for non-existent application returns 404", async () => {
    const res = await supertest(app).get("/api/recruitment/offers/99999")
      .set("Cookie", hrCookie);
    expect(res.status).toBe(404);
  });

  test("HR can patch an offer", async () => {
    const offer = db.prepare("SELECT id FROM offer_letters WHERE application_id = ?").get(appId);
    const res = await supertest(app).patch(`/api/recruitment/offers/${offer.id}`)
      .set("Cookie", hrCookie)
      .send({ ctc_offered: 850000, status: "SENT" });
    expect(res.status).toBe(200);
    expect(res.body.ctc_offered).toBe(850000);
    expect(res.body.status).toBe("SENT");
  });

  test("patch non-existent offer returns 404", async () => {
    const res = await supertest(app).patch("/api/recruitment/offers/99999")
      .set("Cookie", hrCookie)
      .send({ status: "ACCEPTED" });
    expect(res.status).toBe(404);
  });

  test("offer for non-existent application returns 404", async () => {
    const res = await supertest(app).post("/api/recruitment/offers/99999")
      .set("Cookie", hrCookie)
      .send({ ctc_offered: 500000, joining_date: "2027-10-01" });
    expect(res.status).toBe(404);
  });
});

describe("Recruitment — Dashboard", () => {
  let app, db, hrCookie, empCookie;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    await insertEmployee(db, { email: "dash_hr@test.com", code: "DHR1", role: "HR" });
    await insertEmployee(db, { email: "dash_emp@test.com", code: "DEMP1", role: "EMPLOYEE" });
    hrCookie = await loginAs(app, "dash_hr@test.com");
    empCookie = await loginAs(app, "dash_emp@test.com");

    const job = await supertest(app).post("/api/recruitment/jobs")
      .set("Cookie", hrCookie).send({ title: "Dashboard Job", status: "OPEN", positions: 3 });
    const cand = await supertest(app).post("/api/recruitment/candidates")
      .set("Cookie", hrCookie).send({ name: "Dash Cand", email: "dash@ext.com" });
    await supertest(app).post("/api/recruitment/applications")
      .set("Cookie", hrCookie).send({ job_id: job.body.id, candidate_id: cand.body.id });
  });

  test("HR can access recruitment dashboard", async () => {
    const res = await supertest(app).get("/api/recruitment/dashboard")
      .set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    expect(res.body.openJobs).toBeGreaterThanOrEqual(1);
    expect(res.body.totalPositions).toBeGreaterThanOrEqual(3);
    expect(Array.isArray(res.body.candidatesByStage)).toBe(true);
    expect(Array.isArray(res.body.recentHires)).toBe(true);
  });

  test("employee cannot access recruitment dashboard (403)", async () => {
    const res = await supertest(app).get("/api/recruitment/dashboard")
      .set("Cookie", empCookie);
    expect(res.status).toBe(403);
  });
});
