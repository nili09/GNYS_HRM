import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { buildApp, insertEmployee, loginAs } from "./helpers.js";

let app, db;

beforeEach(async () => {
  ({ app, db } = buildApp());
});

// ── Helpers ────────────────────────────────────────────────────────────────

function seedLeaveTypes(db) {
  const ins = db.prepare("INSERT OR IGNORE INTO leave_types(code, name, annual, paid, carry_fwd, max_carry) VALUES(?,?,?,?,?,?)");
  ins.run("EL", "Earned Leave", 18, 1, 1, 10);
  ins.run("CL", "Casual Leave", 7, 1, 0, 0);
  ins.run("SL", "Sick Leave", 7, 1, 0, 0);
}

function seedSettings(db) {
  const ups = db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)");
  ups.run("weekOffs", JSON.stringify(["Sun"]));
  ups.run("satOff", JSON.stringify("NONE"));
}

// ── Notification CRUD ──────────────────────────────────────────────────────

describe("notification endpoints", () => {
  it("GET /notifications returns empty for new user", async () => {
    const emp = await insertEmployee(db, { email: "n1@igenesys.com" });
    const cookie = await loginAs(app, "n1@igenesys.com");
    const res = await request(app).get("/api/notifications").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(0);
    expect(res.body.total).toBe(0);
  });

  it("GET /notifications/unread-count returns 0 initially", async () => {
    const emp = await insertEmployee(db, { email: "n2@igenesys.com" });
    const cookie = await loginAs(app, "n2@igenesys.com");
    const res = await request(app).get("/api/notifications/unread-count").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
  });

  it("mark-read works and decrements unread count", async () => {
    const emp = await insertEmployee(db, { email: "n3@igenesys.com" });
    const cookie = await loginAs(app, "n3@igenesys.com");

    db.prepare(
      "INSERT INTO notifications(user_id, type, title, body, link) VALUES(?,?,?,?,?)"
    ).run(emp.id, "test", "Test", "body", "/test");

    const notif = db.prepare("SELECT id FROM notifications WHERE user_id = ?").get(emp.id);

    let res = await request(app).get("/api/notifications/unread-count").set("Cookie", cookie);
    expect(res.body.count).toBe(1);

    res = await request(app).post(`/api/notifications/${notif.id}/read`).set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    res = await request(app).get("/api/notifications/unread-count").set("Cookie", cookie);
    expect(res.body.count).toBe(0);
  });

  it("mark-read returns 404 for another user's notification", async () => {
    const emp1 = await insertEmployee(db, { email: "n4@igenesys.com" });
    const emp2 = await insertEmployee(db, { email: "n5@igenesys.com" });
    const cookie2 = await loginAs(app, "n5@igenesys.com");

    db.prepare(
      "INSERT INTO notifications(user_id, type, title) VALUES(?,?,?)"
    ).run(emp1.id, "test", "Not yours");

    const notif = db.prepare("SELECT id FROM notifications WHERE user_id = ?").get(emp1.id);
    const res = await request(app).post(`/api/notifications/${notif.id}/read`).set("Cookie", cookie2);
    expect(res.status).toBe(404);
  });

  it("read-all marks all unread as read", async () => {
    const emp = await insertEmployee(db, { email: "n6@igenesys.com" });
    const cookie = await loginAs(app, "n6@igenesys.com");

    for (let i = 0; i < 3; i++) {
      db.prepare("INSERT INTO notifications(user_id, type, title) VALUES(?,?,?)").run(emp.id, "test", `N${i}`);
    }

    let res = await request(app).get("/api/notifications/unread-count").set("Cookie", cookie);
    expect(res.body.count).toBe(3);

    res = await request(app).post("/api/notifications/read-all").set("Cookie", cookie);
    expect(res.body.ok).toBe(true);
    expect(res.body.marked).toBe(3);

    res = await request(app).get("/api/notifications/unread-count").set("Cookie", cookie);
    expect(res.body.count).toBe(0);
  });

  it("notifications are user-scoped", async () => {
    const emp1 = await insertEmployee(db, { email: "n7@igenesys.com" });
    const emp2 = await insertEmployee(db, { email: "n8@igenesys.com" });

    db.prepare("INSERT INTO notifications(user_id, type, title) VALUES(?,?,?)").run(emp1.id, "test", "For emp1");
    db.prepare("INSERT INTO notifications(user_id, type, title) VALUES(?,?,?)").run(emp2.id, "test", "For emp2");

    const cookie1 = await loginAs(app, "n7@igenesys.com");
    const res = await request(app).get("/api/notifications").set("Cookie", cookie1);
    expect(res.body.total).toBe(1);
    expect(res.body.rows[0].title).toBe("For emp1");
  });

  it("requires auth", async () => {
    const res = await request(app).get("/api/notifications");
    expect(res.status).toBe(401);
  });
});

// ── Leave notifications ────────────────────────────────────────────────────

describe("leave → notifications", () => {
  it("applying for leave notifies manager", async () => {
    seedLeaveTypes(db);
    seedSettings(db);

    const mgr = await insertEmployee(db, { email: "mgr@igenesys.com", role: "EMPLOYEE" });
    const emp = await insertEmployee(db, { email: "lemp@igenesys.com", manager_id: mgr.id });
    const cookie = await loginAs(app, "lemp@igenesys.com");

    const res = await request(app).post("/api/leaves").set("Cookie", cookie).send({
      type: "EL", date_from: "2026-07-01", date_to: "2026-07-02",
      half_from: 0, half_to: 0,
    });
    expect(res.status).toBe(201);

    const notifs = db.prepare("SELECT * FROM notifications WHERE user_id = ?").all(mgr.id);
    expect(notifs.length).toBeGreaterThanOrEqual(1);
    expect(notifs.some(n => n.type === "leave_applied")).toBe(true);
  });

  it("approving leave notifies employee", async () => {
    seedLeaveTypes(db);
    seedSettings(db);

    const mgr = await insertEmployee(db, { email: "mgr2@igenesys.com", role: "EMPLOYEE" });
    const emp = await insertEmployee(db, { email: "lemp2@igenesys.com", manager_id: mgr.id });

    const empCookie = await loginAs(app, "lemp2@igenesys.com");
    const applyRes = await request(app).post("/api/leaves").set("Cookie", empCookie).send({
      type: "CL", date_from: "2026-08-04", date_to: "2026-08-04",
      half_from: 0, half_to: 0,
    });
    expect(applyRes.status).toBe(201);
    const leaveId = applyRes.body.id;

    const mgrCookie = await loginAs(app, "mgr2@igenesys.com");
    const approveRes = await request(app).post(`/api/leaves/${leaveId}/approve`).set("Cookie", mgrCookie).send({});
    expect(approveRes.status).toBe(200);

    const notifs = db.prepare("SELECT * FROM notifications WHERE user_id = ? AND type = 'leave_approved'").all(emp.id);
    expect(notifs).toHaveLength(1);
    expect(notifs[0].entity).toBe("leave");
    expect(notifs[0].entity_id).toBe(leaveId);
  });

  it("rejecting leave notifies employee", async () => {
    seedLeaveTypes(db);
    seedSettings(db);

    const mgr = await insertEmployee(db, { email: "mgr3@igenesys.com", role: "EMPLOYEE" });
    const emp = await insertEmployee(db, { email: "lemp3@igenesys.com", manager_id: mgr.id });

    const empCookie = await loginAs(app, "lemp3@igenesys.com");
    const applyRes = await request(app).post("/api/leaves").set("Cookie", empCookie).send({
      type: "SL", date_from: "2026-09-01", date_to: "2026-09-01",
      half_from: 0, half_to: 0,
    });
    const leaveId = applyRes.body.id;

    const mgrCookie = await loginAs(app, "mgr3@igenesys.com");
    await request(app).post(`/api/leaves/${leaveId}/reject`).set("Cookie", mgrCookie).send({ comment: "sorry" });

    const notifs = db.prepare("SELECT * FROM notifications WHERE user_id = ? AND type = 'leave_rejected'").all(emp.id);
    expect(notifs).toHaveLength(1);
  });
});

// ── Expense notifications ──────────────────────────────────────────────────

describe("expense → notifications", () => {
  it("submitting expense notifies manager and HR", async () => {
    const hr = await insertEmployee(db, { email: "hr@igenesys.com", role: "HR" });
    const mgr = await insertEmployee(db, { email: "emgr@igenesys.com", role: "EMPLOYEE" });
    const emp = await insertEmployee(db, { email: "eemp@igenesys.com", manager_id: mgr.id });

    db.prepare("INSERT INTO expense_categories(name, active) VALUES('Travel', 1)").run();
    const cat = db.prepare("SELECT id FROM expense_categories WHERE name = 'Travel'").get();

    const cookie = await loginAs(app, "eemp@igenesys.com");
    const res = await request(app).post("/api/expenses").set("Cookie", cookie).send({
      category_id: cat.id, amount: 500, date: "2026-07-01",
    });
    expect(res.status).toBe(201);

    const mgrNotifs = db.prepare("SELECT * FROM notifications WHERE user_id = ? AND type = 'expense_submitted'").all(mgr.id);
    expect(mgrNotifs.length).toBeGreaterThanOrEqual(1);

    const hrNotifs = db.prepare("SELECT * FROM notifications WHERE user_id = ? AND type = 'expense_submitted'").all(hr.id);
    expect(hrNotifs.length).toBeGreaterThanOrEqual(1);
  });

  it("approving expense notifies employee", async () => {
    const hr = await insertEmployee(db, { email: "hr2@igenesys.com", role: "HR" });
    const emp = await insertEmployee(db, { email: "eemp2@igenesys.com" });

    db.prepare("INSERT INTO expense_categories(name, active) VALUES('Food', 1)").run();
    const cat = db.prepare("SELECT id FROM expense_categories WHERE name = 'Food'").get();

    const empCookie = await loginAs(app, "eemp2@igenesys.com");
    const createRes = await request(app).post("/api/expenses").set("Cookie", empCookie).send({
      category_id: cat.id, amount: 200, date: "2026-07-01",
    });
    const expId = createRes.body.id;

    const hrCookie = await loginAs(app, "hr2@igenesys.com");
    const res = await request(app).post(`/api/expenses/${expId}/approve`).set("Cookie", hrCookie).send({});
    expect(res.status).toBe(200);

    const notifs = db.prepare("SELECT * FROM notifications WHERE user_id = ? AND type = 'expense_approved'").all(emp.id);
    expect(notifs).toHaveLength(1);
  });
});

// ── Performance notifications ──────────────────────────────────────────────

describe("review → notifications", () => {
  it("assigning review notifies the reviewer", async () => {
    const hr = await insertEmployee(db, { email: "hr3@igenesys.com", role: "HR" });
    const reviewer = await insertEmployee(db, { email: "rev@igenesys.com" });
    const emp = await insertEmployee(db, { email: "pemp@igenesys.com" });

    db.prepare(
      "INSERT INTO review_cycles(name, year, start_date, end_date, status, created_by) VALUES(?,?,?,?,?,?)"
    ).run("H1 2026", 2026, "2026-01-01", "2026-06-30", "ACTIVE", hr.id);
    const cycle = db.prepare("SELECT id FROM review_cycles WHERE name = 'H1 2026'").get();

    const hrCookie = await loginAs(app, "hr3@igenesys.com");
    const res = await request(app).post("/api/performance/reviews").set("Cookie", hrCookie).send({
      employee_id: emp.id, cycle_id: cycle.id, reviewer_id: reviewer.id, relationship: "MANAGER",
    });
    expect(res.status).toBe(201);

    const notifs = db.prepare("SELECT * FROM notifications WHERE user_id = ? AND type = 'review_assigned'").all(reviewer.id);
    expect(notifs).toHaveLength(1);
    expect(notifs[0].entity).toBe("review");
  });
});

// ── Asset notifications ────────────────────────────────────────────────────

describe("asset → notifications", () => {
  it("assigning asset notifies the employee", async () => {
    const hr = await insertEmployee(db, { email: "hr4@igenesys.com", role: "HR" });
    const emp = await insertEmployee(db, { email: "aemp@igenesys.com" });

    db.prepare("INSERT INTO asset_types(name) VALUES('Laptop')").run();
    const atId = db.prepare("SELECT id FROM asset_types WHERE name = 'Laptop'").get().id;
    db.prepare("INSERT INTO assets(asset_type_id, name, status) VALUES(?,?,?)").run(atId, "MacBook Pro", "AVAILABLE");
    const assetId = db.prepare("SELECT id FROM assets WHERE name = 'MacBook Pro'").get().id;

    const hrCookie = await loginAs(app, "hr4@igenesys.com");
    const res = await request(app).post(`/api/assets/${assetId}/assign`).set("Cookie", hrCookie).send({
      employee_id: emp.id, is_temporary: false,
    });
    expect(res.status).toBe(201);

    const notifs = db.prepare("SELECT * FROM notifications WHERE user_id = ? AND type = 'asset_assigned'").all(emp.id);
    expect(notifs).toHaveLength(1);
    expect(notifs[0].body).toContain("MacBook Pro");
  });
});

// ── Helpdesk notifications ─────────────────────────────────────────────────

describe("helpdesk → notifications", () => {
  it("comment on ticket notifies ticket creator", async () => {
    const hr = await insertEmployee(db, { email: "hr5@igenesys.com", role: "HR" });
    const emp = await insertEmployee(db, { email: "hemp@igenesys.com" });

    db.prepare("INSERT INTO ticket_categories(name, active) VALUES('IT Support', 1)").run();
    const catId = db.prepare("SELECT id FROM ticket_categories WHERE name = 'IT Support'").get().id;

    const empCookie = await loginAs(app, "hemp@igenesys.com");
    const ticketRes = await request(app).post("/api/helpdesk/tickets").set("Cookie", empCookie).send({
      category_id: catId, subject: "Printer broken", description: "Cannot print", priority: "MEDIUM",
    });
    expect(ticketRes.status).toBe(201);
    const ticketId = ticketRes.body.id;

    const hrCookie = await loginAs(app, "hr5@igenesys.com");
    const commentRes = await request(app).post(`/api/helpdesk/tickets/${ticketId}/comments`).set("Cookie", hrCookie).send({
      body: "We'll look into it",
    });
    expect(commentRes.status).toBe(201);

    const notifs = db.prepare("SELECT * FROM notifications WHERE user_id = ? AND type = 'helpdesk_reply'").all(emp.id);
    expect(notifs).toHaveLength(1);
    expect(notifs[0].body).toContain("Printer broken");
  });
});

// ── Engagement notifications ───────────────────────────────────────────────

describe("engagement → notifications", () => {
  it("recognition notifies the recipient", async () => {
    const giver = await insertEmployee(db, { email: "giver@igenesys.com" });
    const receiver = await insertEmployee(db, { email: "recv@igenesys.com" });

    db.prepare("INSERT INTO badges(name, icon) VALUES(?,?)").run("Star", "⭐");
    const badgeId = db.prepare("SELECT id FROM badges WHERE name = 'Star'").get().id;

    const cookie = await loginAs(app, "giver@igenesys.com");
    const res = await request(app).post("/api/engagement/recognitions").set("Cookie", cookie).send({
      to_employee: receiver.id, badge_id: badgeId, message: "Great work!",
    });
    expect(res.status).toBe(201);

    const notifs = db.prepare("SELECT * FROM notifications WHERE user_id = ? AND type = 'recognition'").all(receiver.id);
    expect(notifs).toHaveLength(1);
    expect(notifs[0].body).toContain("Star");
    expect(notifs[0].body).toContain("Great work!");
  });

  it("announcement notifies all active employees", async () => {
    const hr = await insertEmployee(db, { email: "hr6@igenesys.com", role: "HR" });
    const emp1 = await insertEmployee(db, { email: "ae1@igenesys.com" });
    const emp2 = await insertEmployee(db, { email: "ae2@igenesys.com" });

    const cookie = await loginAs(app, "hr6@igenesys.com");
    const res = await request(app).post("/api/engagement/announcements").set("Cookie", cookie).send({
      title: "Company picnic Friday", body: "Bring sunscreen", priority: "NORMAL",
    });
    expect(res.status).toBe(201);

    const n1 = db.prepare("SELECT * FROM notifications WHERE user_id = ? AND type = 'announcement'").all(emp1.id);
    const n2 = db.prepare("SELECT * FROM notifications WHERE user_id = ? AND type = 'announcement'").all(emp2.id);
    expect(n1).toHaveLength(1);
    expect(n2).toHaveLength(1);

    // HR who posted should NOT get the notification
    const nHr = db.prepare("SELECT * FROM notifications WHERE user_id = ? AND type = 'announcement'").all(hr.id);
    expect(nHr).toHaveLength(0);
  });
});

// ── Unread count correctness ───────────────────────────────────────────────

describe("unread count correctness", () => {
  it("count never goes negative — mark-read on already-read notification is a no-op", async () => {
    const emp = await insertEmployee(db, { email: "nc1@igenesys.com" });
    const cookie = await loginAs(app, "nc1@igenesys.com");

    db.prepare("INSERT INTO notifications(user_id, type, title) VALUES(?,?,?)").run(emp.id, "test", "X");
    const notif = db.prepare("SELECT id FROM notifications WHERE user_id = ?").get(emp.id);

    // Mark read once
    await request(app).post(`/api/notifications/${notif.id}/read`).set("Cookie", cookie);
    // Mark read again (already read)
    await request(app).post(`/api/notifications/${notif.id}/read`).set("Cookie", cookie);

    const res = await request(app).get("/api/notifications/unread-count").set("Cookie", cookie);
    expect(res.body.count).toBe(0);
  });

  it("read-all on zero unread returns marked=0 and count stays 0", async () => {
    const emp = await insertEmployee(db, { email: "nc2@igenesys.com" });
    const cookie = await loginAs(app, "nc2@igenesys.com");

    const res = await request(app).post("/api/notifications/read-all").set("Cookie", cookie);
    expect(res.body.ok).toBe(true);
    expect(res.body.marked).toBe(0);

    const cnt = await request(app).get("/api/notifications/unread-count").set("Cookie", cookie);
    expect(cnt.body.count).toBe(0);
  });
});

// ── Self-notification & deduplication ─────────────────────────────────────

describe("self-notification and deduplication", () => {
  it("employee who applies for leave does NOT receive the leave_applied notification", async () => {
    seedLeaveTypes(db);
    seedSettings(db);

    const mgr = await insertEmployee(db, { email: "mgr10@igenesys.com", role: "EMPLOYEE" });
    const emp = await insertEmployee(db, { email: "lemp10@igenesys.com", manager_id: mgr.id });
    const cookie = await loginAs(app, "lemp10@igenesys.com");

    await request(app).post("/api/leaves").set("Cookie", cookie).send({
      type: "EL", date_from: "2026-11-03", date_to: "2026-11-03",
      half_from: 0, half_to: 0,
    });

    const selfNotifs = db.prepare(
      "SELECT * FROM notifications WHERE user_id = ? AND type = 'leave_applied'"
    ).all(emp.id);
    expect(selfNotifs).toHaveLength(0);
  });

  it("manager who is also HR gets only ONE notification per leave_applied event", async () => {
    seedLeaveTypes(db);
    seedSettings(db);

    // HR user who is also a manager
    const hrMgr = await insertEmployee(db, { email: "hrmgr@igenesys.com", role: "HR" });
    const emp = await insertEmployee(db, { email: "lemp11@igenesys.com", manager_id: hrMgr.id });
    const cookie = await loginAs(app, "lemp11@igenesys.com");

    await request(app).post("/api/leaves").set("Cookie", cookie).send({
      type: "CL", date_from: "2026-11-04", date_to: "2026-11-04",
      half_from: 0, half_to: 0,
    });

    const notifs = db.prepare(
      "SELECT * FROM notifications WHERE user_id = ? AND type = 'leave_applied'"
    ).all(hrMgr.id);
    // Must receive exactly 1 notification, not 2
    expect(notifs).toHaveLength(1);
  });

  it("manager gets link /team/approvals, HR gets link /hr/leave", async () => {
    seedLeaveTypes(db);
    seedSettings(db);

    const hr = await insertEmployee(db, { email: "hr20@igenesys.com", role: "HR" });
    const mgr = await insertEmployee(db, { email: "mgr20@igenesys.com", role: "EMPLOYEE" });
    const emp = await insertEmployee(db, { email: "lemp20@igenesys.com", manager_id: mgr.id });
    const cookie = await loginAs(app, "lemp20@igenesys.com");

    await request(app).post("/api/leaves").set("Cookie", cookie).send({
      type: "SL", date_from: "2026-11-05", date_to: "2026-11-05",
      half_from: 0, half_to: 0,
    });

    const mgrNotif = db.prepare("SELECT * FROM notifications WHERE user_id = ? AND type = 'leave_applied'").get(mgr.id);
    const hrNotif = db.prepare("SELECT * FROM notifications WHERE user_id = ? AND type = 'leave_applied'").get(hr.id);
    expect(mgrNotif?.link).toBe("/team/approvals");
    expect(hrNotif?.link).toBe("/hr/leave");
  });
});

// ── Payroll finalize notifications ────────────────────────────────────────

describe("payroll → notifications", () => {
  it("finalizing a payroll run notifies each employee in the run", async () => {
    const hr = await insertEmployee(db, { email: "hrpay@igenesys.com", role: "HR" });
    const emp1 = await insertEmployee(db, { email: "pay1@igenesys.com" });
    const emp2 = await insertEmployee(db, { email: "pay2@igenesys.com" });

    // Seed a payroll run and lines manually
    db.prepare("INSERT INTO payroll_runs(month, status) VALUES(?,?)").run("2026-05", "DRAFT");
    const run = db.prepare("SELECT id FROM payroll_runs WHERE month = '2026-05'").get();
    for (const empId of [emp1.id, emp2.id]) {
      db.prepare(
        `INSERT INTO payroll_lines(run_id, employee_id, payable, month_days, gross, net)
         VALUES(?,?,?,?,?,?)`
      ).run(run.id, empId, 22, 31, 50000, 45000);
    }

    const cookie = await loginAs(app, "hrpay@igenesys.com");
    const res = await request(app).post(`/api/payroll/runs/${run.id}/finalize`).set("Cookie", cookie);
    expect(res.status).toBe(200);

    const n1 = db.prepare("SELECT * FROM notifications WHERE user_id = ? AND type = 'payslip_ready'").all(emp1.id);
    const n2 = db.prepare("SELECT * FROM notifications WHERE user_id = ? AND type = 'payslip_ready'").all(emp2.id);
    expect(n1).toHaveLength(1);
    expect(n2).toHaveLength(1);
    expect(n1[0].link).toBe("/my/payslips");
    expect(n1[0].body).toContain("2026-05");
  });
});

// ── Interview scheduled notifications ─────────────────────────────────────

describe("recruitment → notifications", () => {
  it("scheduling an interview notifies the interviewer", async () => {
    const hr = await insertEmployee(db, { email: "hrrec@igenesys.com", role: "HR" });
    const interviewer = await insertEmployee(db, { email: "inter@igenesys.com" });

    // Seed a candidate + job + application
    db.prepare("INSERT INTO job_openings(title, positions, status, created_by) VALUES(?,?,?,?)").run("Dev", 1, "OPEN", hr.id);
    const job = db.prepare("SELECT id FROM job_openings LIMIT 1").get();
    db.prepare("INSERT INTO candidates(name, email) VALUES(?,?)").run("Alice Smith", "alice@ext.com");
    const cand = db.prepare("SELECT id FROM candidates LIMIT 1").get();
    db.prepare("INSERT INTO applications(job_id, candidate_id, status) VALUES(?,?,?)").run(job.id, cand.id, "INTERVIEW");
    const app_ = db.prepare("SELECT id FROM applications LIMIT 1").get();

    const cookie = await loginAs(app, "hrrec@igenesys.com");
    const res = await request(app).post("/api/recruitment/interviews").set("Cookie", cookie).send({
      application_id: app_.id,
      interviewer_id: interviewer.id,
      scheduled_at: "2026-12-01T10:00:00.000Z",
      duration_mins: 60,
      mode: "VIDEO",
    });
    expect(res.status).toBe(201);

    const notifs = db.prepare(
      "SELECT * FROM notifications WHERE user_id = ? AND type = 'interview_scheduled'"
    ).all(interviewer.id);
    expect(notifs).toHaveLength(1);
    expect(notifs[0].link).toBe("/my/interviews");
    expect(notifs[0].body).toContain("Alice Smith");
  });
});

// ── Advance request notifications ─────────────────────────────────────────

describe("advance request → notifications", () => {
  it("approving an advance notifies the employee", async () => {
    const hr = await insertEmployee(db, { email: "hradv@igenesys.com", role: "HR" });
    const emp = await insertEmployee(db, { email: "advemp@igenesys.com" });

    const empCookie = await loginAs(app, "advemp@igenesys.com");
    const createRes = await request(app).post("/api/expenses/advances").set("Cookie", empCookie).send({
      amount: 5000, reason: "Travel",
    });
    expect(createRes.status).toBe(201);
    const advId = createRes.body.id;

    const hrCookie = await loginAs(app, "hradv@igenesys.com");
    const res = await request(app).post(`/api/expenses/advances/${advId}/approve`).set("Cookie", hrCookie);
    expect(res.status).toBe(200);

    const notifs = db.prepare(
      "SELECT * FROM notifications WHERE user_id = ? AND type = 'advance_approved'"
    ).all(emp.id);
    expect(notifs).toHaveLength(1);
    expect(notifs[0].link).toBe("/my/expenses");
  });

  it("rejecting an advance notifies the employee", async () => {
    const hr = await insertEmployee(db, { email: "hradv2@igenesys.com", role: "HR" });
    const emp = await insertEmployee(db, { email: "advemp2@igenesys.com" });

    const empCookie = await loginAs(app, "advemp2@igenesys.com");
    const createRes = await request(app).post("/api/expenses/advances").set("Cookie", empCookie).send({
      amount: 3000, reason: "Emergency",
    });
    const advId = createRes.body.id;

    const hrCookie = await loginAs(app, "hradv2@igenesys.com");
    await request(app).post(`/api/expenses/advances/${advId}/reject`).set("Cookie", hrCookie);

    const notifs = db.prepare(
      "SELECT * FROM notifications WHERE user_id = ? AND type = 'advance_rejected'"
    ).all(emp.id);
    expect(notifs).toHaveLength(1);
  });
});
