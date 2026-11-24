import { describe, it, expect } from "vitest";
import supertest from "supertest";
import { buildApp, insertEmployee, loginAs } from "./helpers.js";

// ── helpers ───────────────────────────────────────────────────────────────────

function seedSettings(db, overrides = {}) {
  const settings = { weekOffs: [0], satOff: "none", ...overrides };
  const upsert = db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)");
  for (const [k, v] of Object.entries(settings)) {
    upsert.run(k, JSON.stringify(v));
  }
}

function seedLeaveTypes(db) {
  db.prepare(`INSERT OR IGNORE INTO leave_types(code,name,annual,paid,carry_fwd,max_carry)
    VALUES('EL','Earned Leave',21,1,1,30),('LWP','Leave Without Pay',0,0,0,0)`).run();
}

async function setup() {
  const { app, db } = buildApp();
  seedSettings(db);
  seedLeaveTypes(db);

  const hr      = await insertEmployee(db, { role: "HR", must_change_pw: 0 });
  const manager = await insertEmployee(db, { role: "EMPLOYEE", must_change_pw: 0 });
  const emp     = await insertEmployee(db, { role: "EMPLOYEE", must_change_pw: 0, manager_id: manager.id, doj: "2024-01-01" });
  const outsider = await insertEmployee(db, { role: "EMPLOYEE", must_change_pw: 0 });

  const hrCookie       = await loginAs(app, hr.email);
  const managerCookie  = await loginAs(app, manager.email);
  const empCookie      = await loginAs(app, emp.email);
  const outsiderCookie = await loginAs(app, outsider.email);

  return { app, db, hr, manager, emp, outsider, hrCookie, managerCookie, empCookie, outsiderCookie };
}

// 2025-01: 31 days, Sundays are Jan 5/12/19/26 (weekOffs=[0]) → 27 working days.
const YM = "2025-01";
const WORKING_DATES_2025_01 = Array.from({ length: 31 }, (_, i) => {
  const d = i + 1;
  const ds = `${YM}-${String(d).padStart(2, "0")}`;
  const dow = new Date(Date.UTC(2025, 0, d)).getUTCDay();
  return { ds, dow };
}).filter((x) => x.dow !== 0).map((x) => x.ds);

function marksFor(dates, code = "P") {
  return Object.fromEntries(dates.map((d) => [d, code]));
}

// ── PUT /attendance/my ─────────────────────────────────────────────────────────

describe("PUT /attendance/my (self bulk mark)", () => {
  it("employee can bulk-mark their own month", async () => {
    const { app, db, emp, empCookie } = await setup();
    const res = await supertest(app)
      .put(`/api/attendance/my?month=${YM}`)
      .set("Cookie", empCookie)
      .send({ marks: { [`${YM}-06`]: "P", [`${YM}-07`]: "HD" } });
    expect(res.status).toBe(200);
    const row = db.prepare("SELECT code, marked_by FROM attendance WHERE date=? AND employee_id=?").get(`${YM}-06`, emp.id);
    expect(row?.code).toBe("P");
    expect(row?.marked_by).toBe(emp.id);
  });

  it("'' clears the row", async () => {
    const { app, db, emp, empCookie } = await setup();
    await supertest(app).put(`/api/attendance/my?month=${YM}`).set("Cookie", empCookie).send({ marks: { [`${YM}-06`]: "P" } });
    await supertest(app).put(`/api/attendance/my?month=${YM}`).set("Cookie", empCookie).send({ marks: { [`${YM}-06`]: "" } });
    const row = db.prepare("SELECT code FROM attendance WHERE date=? AND employee_id=?").get(`${YM}-06`, emp.id);
    expect(row).toBeUndefined();
  });

  it("rejects a date outside the requested month (400)", async () => {
    const { app, empCookie } = await setup();
    const res = await supertest(app)
      .put(`/api/attendance/my?month=${YM}`)
      .set("Cookie", empCookie)
      .send({ marks: { "2025-02-01": "P" } });
    expect(res.status).toBe(400);
  });

  it("rejects a date before doj (400)", async () => {
    const { app, db, empCookie, manager } = await setup();
    const joiner = await insertEmployee(db, { role: "EMPLOYEE", must_change_pw: 0, manager_id: manager.id, doj: `${YM}-20` });
    const joinerCookie = await loginAs(app, joiner.email);
    const res = await supertest(app)
      .put(`/api/attendance/my?month=${YM}`)
      .set("Cookie", joinerCookie)
      .send({ marks: { [`${YM}-10`]: "P" } });
    expect(res.status).toBe(400);
  });

  it("rejects a date after exit_date (400)", async () => {
    const { app, db, manager } = await setup();
    // Log in while still ACTIVE (EXITED accounts can't log in at all), then
    // simulate HR processing the exit mid-session — the existing cookie stays
    // valid since attachUser re-reads status fresh on every request.
    const exited = await insertEmployee(db, { role: "EMPLOYEE", must_change_pw: 0, manager_id: manager.id, doj: "2024-01-01" });
    const exitedCookie = await loginAs(app, exited.email);
    db.prepare("UPDATE employees SET status='EXITED', exit_date=? WHERE id=?").run(`${YM}-15`, exited.id);

    const res = await supertest(app)
      .put(`/api/attendance/my?month=${YM}`)
      .set("Cookie", exitedCookie)
      .send({ marks: { [`${YM}-20`]: "P" } });
    expect(res.status).toBe(400);

    // A date within the window still works
    const ok = await supertest(app)
      .put(`/api/attendance/my?month=${YM}`)
      .set("Cookie", exitedCookie)
      .send({ marks: { [`${YM}-10`]: "P" } });
    expect(ok.status).toBe(200);
  });

  it("409 while month is SUBMITTED", async () => {
    const { app, db, emp } = await setup();
    db.prepare("INSERT INTO attendance_months(employee_id, month, status) VALUES(?,?,'SUBMITTED')").run(emp.id, YM);
    const empCookie = await loginAs(app, emp.email);
    const res = await supertest(app)
      .put(`/api/attendance/my?month=${YM}`)
      .set("Cookie", empCookie)
      .send({ marks: { [`${YM}-06`]: "P" } });
    expect(res.status).toBe(409);
  });

  it("409 while month is APPROVED", async () => {
    const { app, db, emp } = await setup();
    db.prepare("INSERT INTO attendance_months(employee_id, month, status) VALUES(?,?,'APPROVED')").run(emp.id, YM);
    const empCookie = await loginAs(app, emp.email);
    const res = await supertest(app)
      .put(`/api/attendance/my?month=${YM}`)
      .set("Cookie", empCookie)
      .send({ marks: { [`${YM}-06`]: "P" } });
    expect(res.status).toBe(409);
  });

  it("editing while REJECTED is allowed and flips status back to OPEN", async () => {
    const { app, db, emp, empCookie } = await setup();
    db.prepare("INSERT INTO attendance_months(employee_id, month, status, act_comment) VALUES(?,?,'REJECTED','fix dates')").run(emp.id, YM);
    const res = await supertest(app)
      .put(`/api/attendance/my?month=${YM}`)
      .set("Cookie", empCookie)
      .send({ marks: { [`${YM}-06`]: "P" } });
    expect(res.status).toBe(200);
    const row = db.prepare("SELECT status FROM attendance_months WHERE employee_id=? AND month=?").get(emp.id, YM);
    expect(row.status).toBe("OPEN");
  });
});

// ── POST /attendance/my/submit ──────────────────────────────────────────────

describe("POST /attendance/my/submit", () => {
  it("400 with missingDates when incomplete", async () => {
    const { app, empCookie } = await setup();
    // Only mark a few days, leave the rest unmarked
    await supertest(app).put(`/api/attendance/my?month=${YM}`).set("Cookie", empCookie)
      .send({ marks: marksFor(WORKING_DATES_2025_01.slice(0, 3)) });
    const res = await supertest(app).post("/api/attendance/my/submit").set("Cookie", empCookie).send({ month: YM });
    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.missingDates)).toBe(true);
    expect(res.body.missingDates.length).toBe(WORKING_DATES_2025_01.length - 3);
  });

  it("leave/holiday/week-off days are never in missingDates", async () => {
    const { app, db, emp, empCookie } = await setup();
    db.prepare("INSERT INTO holidays(date,name) VALUES(?,?)").run(`${YM}-10`, "Test Holiday");
    db.prepare(`INSERT INTO leaves(employee_id,type,date_from,date_to,half_from,half_to,days,status)
      VALUES(?,?,?,?,0,0,1,'APPROVED')`).run(emp.id, "EL", `${YM}-15`, `${YM}-15`);

    const required = WORKING_DATES_2025_01.filter((d) => d !== `${YM}-10` && d !== `${YM}-15`);
    await supertest(app).put(`/api/attendance/my?month=${YM}`).set("Cookie", empCookie)
      .send({ marks: marksFor(required) });

    const res = await supertest(app).post("/api/attendance/my/submit").set("Cookie", empCookie).send({ month: YM });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("SUBMITTED");
  });

  it("mid-month joiner: only needs days from doj onward", async () => {
    const { app, db, manager } = await setup();
    // Jan 27-31 2025 are Mon-Fri, no Sundays in range
    const joiner = await insertEmployee(db, { role: "EMPLOYEE", must_change_pw: 0, manager_id: manager.id, doj: `${YM}-27` });
    const joinerCookie = await loginAs(app, joiner.email);
    const required = ["27", "28", "29", "30", "31"].map((d) => `${YM}-${d}`);
    await supertest(app).put(`/api/attendance/my?month=${YM}`).set("Cookie", joinerCookie).send({ marks: marksFor(required) });

    const submit = await supertest(app).post("/api/attendance/my/submit").set("Cookie", joinerCookie).send({ month: YM });
    expect(submit.status).toBe(200);
    expect(submit.body.status).toBe("SUBMITTED");
  });

  it("exited employee: only needs days up to exit_date", async () => {
    const { app, db, manager } = await setup();
    // Jan 1-15 2025 minus Sundays (5,12) = 13 working days.
    // Log in while still ACTIVE, then flip to EXITED — see comment above.
    const exited = await insertEmployee(db, { role: "EMPLOYEE", must_change_pw: 0, manager_id: manager.id, doj: "2024-01-01" });
    const exitedCookie = await loginAs(app, exited.email);
    db.prepare("UPDATE employees SET status='EXITED', exit_date=? WHERE id=?").run(`${YM}-15`, exited.id);

    const required = WORKING_DATES_2025_01.filter((d) => d <= `${YM}-15`);
    await supertest(app).put(`/api/attendance/my?month=${YM}`).set("Cookie", exitedCookie).send({ marks: marksFor(required) });

    const submit = await supertest(app).post("/api/attendance/my/submit").set("Cookie", exitedCookie).send({ month: YM });
    expect(submit.status).toBe(200);
  });

  it("submit success sets status SUBMITTED and submitted_at, notifies manager", async () => {
    const { app, db, emp, manager, empCookie } = await setup();
    await supertest(app).put(`/api/attendance/my?month=${YM}`).set("Cookie", empCookie).send({ marks: marksFor(WORKING_DATES_2025_01) });

    const res = await supertest(app).post("/api/attendance/my/submit").set("Cookie", empCookie).send({ month: YM });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("SUBMITTED");

    const row = db.prepare("SELECT status, submitted_at FROM attendance_months WHERE employee_id=? AND month=?").get(emp.id, YM);
    expect(row.status).toBe("SUBMITTED");
    expect(row.submitted_at).toBeTruthy();

    const notif = db.prepare("SELECT * FROM notifications WHERE user_id=? AND type='attendance_submitted'").get(manager.id);
    expect(notif).toBeTruthy();
    expect(notif.link).toBe("/team/attendance-approvals");

    const auditRow = db.prepare("SELECT action FROM audit_log WHERE action='SUBMIT' AND entity='attendance_month'").get();
    expect(auditRow).toBeTruthy();
  });

  it("notifies HR when the employee has no manager", async () => {
    const { app, db, hr } = await setup();
    const lone = await insertEmployee(db, { role: "EMPLOYEE", must_change_pw: 0, doj: "2024-01-01" });
    const loneCookie = await loginAs(app, lone.email);
    await supertest(app).put(`/api/attendance/my?month=${YM}`).set("Cookie", loneCookie).send({ marks: marksFor(WORKING_DATES_2025_01) });
    await supertest(app).post("/api/attendance/my/submit").set("Cookie", loneCookie).send({ month: YM });

    const notif = db.prepare("SELECT * FROM notifications WHERE user_id=? AND type='attendance_submitted'").get(hr.id);
    expect(notif).toBeTruthy();
  });

  it("409 if already SUBMITTED", async () => {
    const { app, db, emp, empCookie } = await setup();
    db.prepare("INSERT INTO attendance_months(employee_id, month, status) VALUES(?,?,'SUBMITTED')").run(emp.id, YM);
    const res = await supertest(app).post("/api/attendance/my/submit").set("Cookie", empCookie).send({ month: YM });
    expect(res.status).toBe(409);
  });

  it("409 if already APPROVED", async () => {
    const { app, db, emp, empCookie } = await setup();
    db.prepare("INSERT INTO attendance_months(employee_id, month, status) VALUES(?,?,'APPROVED')").run(emp.id, YM);
    const res = await supertest(app).post("/api/attendance/my/submit").set("Cookie", empCookie).send({ month: YM });
    expect(res.status).toBe(409);
  });
});

// ── GET /attendance/me — approval + missingDates ────────────────────────────

describe("GET /attendance/me approval record", () => {
  it("defaults to OPEN with no attendance_months row", async () => {
    const { app, empCookie } = await setup();
    const res = await supertest(app).get(`/api/attendance/me?month=${YM}`).set("Cookie", empCookie);
    expect(res.body.approval.status).toBe("OPEN");
    expect(Array.isArray(res.body.missingDates)).toBe(true);
    expect(res.body.missingDates.length).toBe(WORKING_DATES_2025_01.length);
  });

  it("missingDates empties out once all working days are marked", async () => {
    const { app, empCookie } = await setup();
    await supertest(app).put(`/api/attendance/my?month=${YM}`).set("Cookie", empCookie).send({ marks: marksFor(WORKING_DATES_2025_01) });
    const res = await supertest(app).get(`/api/attendance/me?month=${YM}`).set("Cookie", empCookie);
    expect(res.body.missingDates.length).toBe(0);
  });

  it("reflects SUBMITTED status and acted_by name after approval", async () => {
    const { app, db, emp, manager, empCookie, managerCookie } = await setup();
    await supertest(app).put(`/api/attendance/my?month=${YM}`).set("Cookie", empCookie).send({ marks: marksFor(WORKING_DATES_2025_01) });
    await supertest(app).post("/api/attendance/my/submit").set("Cookie", empCookie).send({ month: YM });
    await supertest(app).post(`/api/attendance/months/${emp.id}/${YM}/approve`).set("Cookie", managerCookie).send({});

    const res = await supertest(app).get(`/api/attendance/me?month=${YM}`).set("Cookie", empCookie);
    expect(res.body.approval.status).toBe("APPROVED");
    expect(res.body.approval.acted_by).toBe(manager.name);
  });
});

// ── GET /attendance/pending ──────────────────────────────────────────────────

describe("GET /attendance/pending", () => {
  async function submitFullMonth(app, cookie) {
    await supertest(app).put(`/api/attendance/my?month=${YM}`).set("Cookie", cookie).send({ marks: marksFor(WORKING_DATES_2025_01) });
    return supertest(app).post("/api/attendance/my/submit").set("Cookie", cookie).send({ month: YM });
  }

  it("manager sees only direct reports' SUBMITTED months", async () => {
    const { app, db, emp, empCookie, managerCookie, outsiderCookie } = await setup();
    await submitFullMonth(app, empCookie);
    // outsider is not managed by `manager`, and submitting their own month should not show up
    await submitFullMonth(app, outsiderCookie);

    const res = await supertest(app).get("/api/attendance/pending").set("Cookie", managerCookie);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].employee_id).toBe(emp.id);
  });

  it("HR sees all SUBMITTED months", async () => {
    const { app, empCookie, outsiderCookie, hrCookie } = await setup();
    await submitFullMonth(app, empCookie);
    await submitFullMonth(app, outsiderCookie);

    const res = await supertest(app).get("/api/attendance/pending").set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
  });

  it("employee with no reports sees an empty queue", async () => {
    const { app, empCookie, outsiderCookie } = await setup();
    await submitFullMonth(app, outsiderCookie);
    const res = await supertest(app).get("/api/attendance/pending").set("Cookie", empCookie);
    expect(res.body).toEqual([]);
  });

  it("filters by ?month=", async () => {
    const { app, managerCookie, empCookie } = await setup();
    await submitFullMonth(app, empCookie);
    const res = await supertest(app).get(`/api/attendance/pending?month=2024-12`).set("Cookie", managerCookie);
    expect(res.body).toEqual([]);
  });
});

// ── Approve / Reject ────────────────────────────────────────────────────────

describe("POST /attendance/months/:employeeId/:month/approve", () => {
  async function submittedEmp(app, db, manager) {
    const emp = await insertEmployee(db, { role: "EMPLOYEE", must_change_pw: 0, manager_id: manager.id, doj: "2024-01-01" });
    const cookie = await loginAs(app, emp.email);
    await supertest(app).put(`/api/attendance/my?month=${YM}`).set("Cookie", cookie).send({ marks: marksFor(WORKING_DATES_2025_01) });
    await supertest(app).post("/api/attendance/my/submit").set("Cookie", cookie).send({ month: YM });
    return { emp, cookie };
  }

  it("manager can approve a direct report's SUBMITTED month", async () => {
    const { app, db, manager, managerCookie } = await setup();
    const { emp } = await submittedEmp(app, db, manager);

    const res = await supertest(app).post(`/api/attendance/months/${emp.id}/${YM}/approve`).set("Cookie", managerCookie).send({ comment: "looks good" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("APPROVED");

    const row = db.prepare("SELECT status, acted_by, act_comment FROM attendance_months WHERE employee_id=? AND month=?").get(emp.id, YM);
    expect(row.status).toBe("APPROVED");
    expect(row.acted_by).toBe(manager.id);
    expect(row.act_comment).toBe("looks good");

    const notif = db.prepare("SELECT * FROM notifications WHERE user_id=? AND type='attendance_approved'").get(emp.id);
    expect(notif?.link).toBe("/my/attendance");

    const auditRow = db.prepare("SELECT action FROM audit_log WHERE action='APPROVE' AND entity='attendance_month'").get();
    expect(auditRow).toBeTruthy();
  });

  it("409 when month is not SUBMITTED (still OPEN)", async () => {
    const { app, db, manager, managerCookie } = await setup();
    const emp = await insertEmployee(db, { role: "EMPLOYEE", must_change_pw: 0, manager_id: manager.id });
    const res = await supertest(app).post(`/api/attendance/months/${emp.id}/${YM}/approve`).set("Cookie", managerCookie).send({});
    expect(res.status).toBe(409);
  });

  it("403 when caller is not the manager, HR, or ADMIN", async () => {
    const { app, db, manager, outsiderCookie } = await setup();
    const { emp } = await submittedEmp(app, db, manager);
    const res = await supertest(app).post(`/api/attendance/months/${emp.id}/${YM}/approve`).set("Cookie", outsiderCookie).send({});
    expect(res.status).toBe(403);
  });

  it("self-approval is blocked for a non-HR employee", async () => {
    const { app, db, manager } = await setup();
    const { emp, cookie } = await submittedEmp(app, db, manager);
    const res = await supertest(app).post(`/api/attendance/months/${emp.id}/${YM}/approve`).set("Cookie", cookie).send({});
    expect(res.status).toBe(403);
  });

  it("HR/ADMIN can approve any month, including their own", async () => {
    const { app, db, hr, hrCookie } = await setup();
    await supertest(app).put(`/api/attendance/my?month=${YM}`).set("Cookie", hrCookie).send({ marks: marksFor(WORKING_DATES_2025_01) });
    await supertest(app).post("/api/attendance/my/submit").set("Cookie", hrCookie).send({ month: YM });

    const res = await supertest(app).post(`/api/attendance/months/${hr.id}/${YM}/approve`).set("Cookie", hrCookie).send({});
    expect(res.status).toBe(200);
  });
});

describe("POST /attendance/months/:employeeId/:month/reject + resubmit", () => {
  it("400 without a comment", async () => {
    const { app, db, manager, managerCookie } = await setup();
    const emp = await insertEmployee(db, { role: "EMPLOYEE", must_change_pw: 0, manager_id: manager.id, doj: "2024-01-01" });
    const cookie = await loginAs(app, emp.email);
    await supertest(app).put(`/api/attendance/my?month=${YM}`).set("Cookie", cookie).send({ marks: marksFor(WORKING_DATES_2025_01) });
    await supertest(app).post("/api/attendance/my/submit").set("Cookie", cookie).send({ month: YM });

    const res = await supertest(app).post(`/api/attendance/months/${emp.id}/${YM}/reject`).set("Cookie", managerCookie).send({});
    expect(res.status).toBe(400);
  });

  it("reject then edit then resubmit cycle", async () => {
    const { app, db, manager, managerCookie } = await setup();
    const emp = await insertEmployee(db, { role: "EMPLOYEE", must_change_pw: 0, manager_id: manager.id, doj: "2024-01-01" });
    const cookie = await loginAs(app, emp.email);
    await supertest(app).put(`/api/attendance/my?month=${YM}`).set("Cookie", cookie).send({ marks: marksFor(WORKING_DATES_2025_01) });
    await supertest(app).post("/api/attendance/my/submit").set("Cookie", cookie).send({ month: YM });

    const rej = await supertest(app).post(`/api/attendance/months/${emp.id}/${YM}/reject`).set("Cookie", managerCookie).send({ comment: "fix Jan 6" });
    expect(rej.status).toBe(200);
    expect(rej.body.status).toBe("REJECTED");

    let row = db.prepare("SELECT status, act_comment FROM attendance_months WHERE employee_id=? AND month=?").get(emp.id, YM);
    expect(row.status).toBe("REJECTED");
    expect(row.act_comment).toBe("fix Jan 6");

    const notif = db.prepare("SELECT * FROM notifications WHERE user_id=? AND type='attendance_rejected'").get(emp.id);
    expect(notif).toBeTruthy();

    // Employee edits — flips back to OPEN
    const edit = await supertest(app).put(`/api/attendance/my?month=${YM}`).set("Cookie", cookie).send({ marks: { [`${YM}-06`]: "HD" } });
    expect(edit.status).toBe(200);
    row = db.prepare("SELECT status FROM attendance_months WHERE employee_id=? AND month=?").get(emp.id, YM);
    expect(row.status).toBe("OPEN");

    // Resubmit
    const resubmit = await supertest(app).post("/api/attendance/my/submit").set("Cookie", cookie).send({ month: YM });
    expect(resubmit.status).toBe(200);
    expect(resubmit.body.status).toBe("SUBMITTED");
  });
});

// ── HR override on PUT /attendance/:date ─────────────────────────────────────

describe("HR override of an APPROVED month", () => {
  it("stamps hr_override_at/by and audits, month stays APPROVED", async () => {
    const { app, db, manager, hr, hrCookie, managerCookie } = await setup();
    const emp = await insertEmployee(db, { role: "EMPLOYEE", must_change_pw: 0, manager_id: manager.id, doj: "2024-01-01" });
    const cookie = await loginAs(app, emp.email);
    await supertest(app).put(`/api/attendance/my?month=${YM}`).set("Cookie", cookie).send({ marks: marksFor(WORKING_DATES_2025_01) });
    await supertest(app).post("/api/attendance/my/submit").set("Cookie", cookie).send({ month: YM });
    await supertest(app).post(`/api/attendance/months/${emp.id}/${YM}/approve`).set("Cookie", managerCookie).send({});

    const res = await supertest(app)
      .put(`/api/attendance/${YM}-15`)
      .set("Cookie", hrCookie)
      .send({ marks: { [emp.id]: "A" } });
    expect(res.status).toBe(200);
    expect(res.body.overridden).toContain(emp.id);

    const attRow = db.prepare("SELECT code FROM attendance WHERE date=? AND employee_id=?").get(`${YM}-15`, emp.id);
    expect(attRow.code).toBe("A");

    const monthRow = db.prepare("SELECT status, hr_override_at, hr_override_by FROM attendance_months WHERE employee_id=? AND month=?").get(emp.id, YM);
    expect(monthRow.status).toBe("APPROVED");
    expect(monthRow.hr_override_at).toBeTruthy();
    expect(monthRow.hr_override_by).toBe(hr.id);

    const auditRow = db.prepare("SELECT action, entity, entity_id FROM audit_log WHERE action='ATTENDANCE_OVERRIDE'").get();
    expect(auditRow).toBeTruthy();
    expect(auditRow.entity).toBe("attendance_month");
    expect(auditRow.entity_id).toBe(`${emp.id}:${YM}`);
  });

  it("does not stamp override for a non-APPROVED month", async () => {
    const { app, db, hr, hrCookie, emp } = await setup();
    const res = await supertest(app)
      .put(`/api/attendance/${YM}-15`)
      .set("Cookie", hrCookie)
      .send({ marks: { [emp.id]: "P" } });
    expect(res.status).toBe(200);
    expect(res.body.overridden).toEqual([]);

    const monthRow = db.prepare("SELECT hr_override_at FROM attendance_months WHERE employee_id=? AND month=?").get(emp.id, YM);
    expect(monthRow).toBeUndefined();
  });
});

// ── Payroll unapproved warning ──────────────────────────────────────────────

describe("Payroll unapproved-attendance warning", () => {
  function seedPayrollSettings(db) {
    const upsert = db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)");
    upsert.run("pfEnabled", JSON.stringify(true));
    upsert.run("pfCapWages", JSON.stringify(true));
    upsert.run("esiEnabled", JSON.stringify(true));
    upsert.run("ptEnabled", JSON.stringify(true));
  }

  function giveSalary(db, employeeId) {
    db.prepare(
      "INSERT INTO salary_structures(employee_id, effective_from, ctc_annual, basic, hra, special, conveyance, medical) VALUES(?,?,?,?,?,?,?,?)"
    ).run(employeeId, "2024-01-01", 180000, 15000, 7500, 5000, 1600, 1250);
  }

  it("generate: lists employees in the run without an APPROVED month", async () => {
    const { app, db, emp, hrCookie } = await setup();
    seedPayrollSettings(db);
    giveSalary(db, emp.id);

    const res = await supertest(app).post("/api/payroll/runs").set("Cookie", hrCookie).send({ month: YM });
    expect(res.status).toBe(201);
    expect(res.body.lines.some((l) => l.employee_id === emp.id)).toBe(true);
    expect(res.body.unapprovedCount).toBeGreaterThanOrEqual(1);
    const entry = res.body.unapproved.find((u) => u.employee_id === emp.id);
    expect(entry).toBeTruthy();
    expect(entry.status).toBe("OPEN");
  });

  it("regenerate: unapprovedCount drops to 0 once every employee in the run is APPROVED", async () => {
    const { app, db, emp, manager, hrCookie, managerCookie } = await setup();
    seedPayrollSettings(db);
    giveSalary(db, emp.id);

    const create = await supertest(app).post("/api/payroll/runs").set("Cookie", hrCookie).send({ month: YM });
    expect(create.body.unapprovedCount).toBeGreaterThanOrEqual(1);

    // Approve emp's month
    const empCookie = await loginAs(app, emp.email);
    await supertest(app).put(`/api/attendance/my?month=${YM}`).set("Cookie", empCookie).send({ marks: marksFor(WORKING_DATES_2025_01) });
    await supertest(app).post("/api/attendance/my/submit").set("Cookie", empCookie).send({ month: YM });
    await supertest(app).post(`/api/attendance/months/${emp.id}/${YM}/approve`).set("Cookie", managerCookie).send({});

    const regen = await supertest(app).post(`/api/payroll/runs/${create.body.run.id}/regenerate`).set("Cookie", hrCookie).send({});
    expect(regen.status).toBe(200);
    expect(regen.body.unapprovedCount).toBe(0);
    expect(regen.body.unapproved).toEqual([]);
  });
});
