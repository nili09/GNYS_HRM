import { describe, it, expect, beforeEach } from "vitest";
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

  const hr  = await insertEmployee(db, { role: "HR",      must_change_pw: 0 });
  const emp = await insertEmployee(db, { role: "EMPLOYEE", must_change_pw: 0 });

  const hrCookie  = await loginAs(app, hr.email);
  const empCookie = await loginAs(app, emp.email);

  return { app, db, hr, emp, hrCookie, empCookie };
}

// ── Holidays CRUD ─────────────────────────────────────────────────────────────

describe("Holidays CRUD", () => {
  it("GET /holidays returns empty array initially", async () => {
    const { app, hrCookie } = await setup();
    const res = await supertest(app).get("/api/holidays").set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });

  it("POST /holidays adds a holiday (HR)", async () => {
    const { app, hrCookie } = await setup();
    const res = await supertest(app)
      .post("/api/holidays")
      .set("Cookie", hrCookie)
      .send({ date: "2025-08-15", name: "Independence Day" });
    expect(res.status).toBe(201);
    expect(res.body.date).toBe("2025-08-15");
  });

  it("POST /holidays 409 on duplicate date", async () => {
    const { app, hrCookie } = await setup();
    await supertest(app).post("/api/holidays").set("Cookie", hrCookie).send({ date: "2025-08-15", name: "Test" });
    const res = await supertest(app).post("/api/holidays").set("Cookie", hrCookie).send({ date: "2025-08-15", name: "Dup" });
    expect(res.status).toBe(409);
  });

  it("POST /holidays 403 for EMPLOYEE", async () => {
    const { app, empCookie } = await setup();
    const res = await supertest(app)
      .post("/api/holidays")
      .set("Cookie", empCookie)
      .send({ date: "2025-08-15", name: "Ind" });
    expect(res.status).toBe(403);
  });

  it("DELETE /holidays/:date removes it", async () => {
    const { app, hrCookie } = await setup();
    await supertest(app).post("/api/holidays").set("Cookie", hrCookie).send({ date: "2025-08-15", name: "Ind" });
    const del = await supertest(app).delete("/api/holidays/2025-08-15").set("Cookie", hrCookie);
    expect(del.status).toBe(200);
    const list = await supertest(app).get("/api/holidays").set("Cookie", hrCookie);
    expect(list.body).toHaveLength(0);
  });

  it("GET /holidays?year= filters by year", async () => {
    const { app, hrCookie } = await setup();
    await supertest(app).post("/api/holidays").set("Cookie", hrCookie).send({ date: "2024-01-26", name: "R-Day 2024" });
    await supertest(app).post("/api/holidays").set("Cookie", hrCookie).send({ date: "2025-01-26", name: "R-Day 2025" });
    const res = await supertest(app).get("/api/holidays?year=2024").set("Cookie", hrCookie);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].date).toBe("2024-01-26");
  });

  it("POST /holidays/seed seeds 6 fixed dates", async () => {
    const { app, hrCookie } = await setup();
    const res = await supertest(app).post("/api/holidays/seed?year=2025").set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    expect(res.body.added).toBe(6);
    const list = await supertest(app).get("/api/holidays?year=2025").set("Cookie", hrCookie);
    expect(list.body).toHaveLength(6);
  });

  it("POST /holidays/seed is idempotent (double seed = 0 added)", async () => {
    const { app, hrCookie } = await setup();
    await supertest(app).post("/api/holidays/seed?year=2025").set("Cookie", hrCookie);
    const res2 = await supertest(app).post("/api/holidays/seed?year=2025").set("Cookie", hrCookie);
    expect(res2.body.added).toBe(0);
  });
});

// ── Attendance API — daily ────────────────────────────────────────────────────

describe("PUT /attendance/:date (HR marks)", () => {
  it("HR can mark an employee present", async () => {
    const { app, db, hrCookie, emp } = await setup();
    const res = await supertest(app)
      .put("/api/attendance/2025-01-06")
      .set("Cookie", hrCookie)
      .send({ marks: { [emp.id]: "P" } });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const row = db.prepare("SELECT code FROM attendance WHERE date=? AND employee_id=?").get("2025-01-06", emp.id);
    expect(row?.code).toBe("P");
  });

  it("mark '' clears the row", async () => {
    const { app, db, hrCookie, emp } = await setup();
    await supertest(app).put("/api/attendance/2025-01-06").set("Cookie", hrCookie).send({ marks: { [emp.id]: "P" } });
    await supertest(app).put("/api/attendance/2025-01-06").set("Cookie", hrCookie).send({ marks: { [emp.id]: "" } });
    const row = db.prepare("SELECT code FROM attendance WHERE date=? AND employee_id=?").get("2025-01-06", emp.id);
    expect(row).toBeUndefined();
  });

  it("EMPLOYEE cannot mark attendance", async () => {
    const { app, empCookie, emp } = await setup();
    const res = await supertest(app)
      .put("/api/attendance/2025-01-06")
      .set("Cookie", empCookie)
      .send({ marks: { [emp.id]: "P" } });
    expect(res.status).toBe(403);
  });

  it("invalid date returns 400", async () => {
    const { app, hrCookie } = await setup();
    const res = await supertest(app)
      .put("/api/attendance/bad-date")
      .set("Cookie", hrCookie)
      .send({ marks: {} });
    expect(res.status).toBe(400);
  });

  it("invalid code returns 400", async () => {
    const { app, hrCookie, emp } = await setup();
    const res = await supertest(app)
      .put("/api/attendance/2025-01-06")
      .set("Cookie", hrCookie)
      .send({ marks: { [emp.id]: "XX" } });
    expect(res.status).toBe(400);
  });

  it("bulk mark: multiple employees, audit logged", async () => {
    const { app, db, hrCookie, emp, hr } = await setup();
    const emp2 = await insertEmployee(db, { role: "EMPLOYEE", must_change_pw: 0 });
    const res = await supertest(app)
      .put("/api/attendance/2025-01-06")
      .set("Cookie", hrCookie)
      .send({ marks: { [emp.id]: "P", [emp2.id]: "WFH" } });
    expect(res.status).toBe(200);
    expect(res.body.marked).toBe(2);

    const auditRow = db.prepare("SELECT action, entity FROM audit_log WHERE action='BULK_MARK'").get();
    expect(auditRow?.action).toBe("BULK_MARK");
    expect(auditRow?.entity).toBe("attendance");
  });
});

describe("GET /attendance?date= (HR daily register)", () => {
  it("returns employee list with attStatus", async () => {
    const { app, hrCookie, emp, db } = await setup();
    // Mark emp as P on Jan 6 2025 (Monday)
    await supertest(app)
      .put("/api/attendance/2025-01-06")
      .set("Cookie", hrCookie)
      .send({ marks: { [emp.id]: "P" } });

    const res = await supertest(app)
      .get("/api/attendance?date=2025-01-06")
      .set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    expect(res.body.date).toBe("2025-01-06");
    expect(res.body.isWeekOff).toBe(false);
    const empRow = res.body.employees.find((e) => e.id === emp.id);
    expect(empRow?.attStatus).toBe("P");
    expect(empRow?.attCode).toBe("P");
  });

  it("Sunday marked as isWeekOff=true", async () => {
    const { app, hrCookie } = await setup();
    // 2025-01-05 = Sunday
    const res = await supertest(app).get("/api/attendance?date=2025-01-05").set("Cookie", hrCookie);
    expect(res.body.isWeekOff).toBe(true);
  });

  it("holiday shown in response", async () => {
    const { app, hrCookie, db } = await setup();
    db.prepare("INSERT INTO holidays(date,name) VALUES('2025-01-26','Republic Day')").run();
    const res = await supertest(app).get("/api/attendance?date=2025-01-26").set("Cookie", hrCookie);
    expect(res.body.holiday?.name).toBe("Republic Day");
  });

  it("leave shows as L in attStatus", async () => {
    const { app, hrCookie, emp, db } = await setup();
    db.prepare(`INSERT INTO leaves(employee_id,type,date_from,date_to,half_from,half_to,days,status)
      VALUES(?,?,?,?,0,0,1,'APPROVED')`).run(emp.id, "EL", "2025-01-06", "2025-01-06");
    const res = await supertest(app).get("/api/attendance?date=2025-01-06").set("Cookie", hrCookie);
    const empRow = res.body.employees.find((e) => e.id === emp.id);
    expect(empRow?.attStatus).toBe("L");
  });

  it("EMPLOYEE cannot call GET /attendance?date=", async () => {
    const { app, empCookie } = await setup();
    const res = await supertest(app).get("/api/attendance?date=2025-01-06").set("Cookie", empCookie);
    expect(res.status).toBe(403);
  });
});

describe("GET /attendance?month= (HR monthly grid)", () => {
  it("returns dayCodes array and payable", async () => {
    const { app, hrCookie, emp, db } = await setup();
    // Mark emp P on Jan 6 (Mon) and HD on Jan 7 (Tue)
    await supertest(app).put("/api/attendance/2025-01-06").set("Cookie", hrCookie).send({ marks: { [emp.id]: "P" } });
    await supertest(app).put("/api/attendance/2025-01-07").set("Cookie", hrCookie).send({ marks: { [emp.id]: "HD" } });

    const res = await supertest(app).get("/api/attendance?month=2025-01").set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    expect(res.body.month).toBe("2025-01");
    expect(res.body.days).toBe(31);
    const empRow = res.body.employees.find((e) => e.id === emp.id);
    expect(empRow?.dayCodes[5]).toBe("P");   // Jan 6 = index 5
    expect(empRow?.dayCodes[6]).toBe("HD");  // Jan 7 = index 6
    expect(empRow?.dayCodes[4]).toBe("WO");  // Jan 5 (Sun) = index 4
    // payable: 4 WOs + P(1) + HD(0.5) = 5.5
    expect(empRow?.payable).toBe(5.5);
  });
});

// ── GET /attendance/me ────────────────────────────────────────────────────────

describe("GET /attendance/me?month= (employee self)", () => {
  it("employee sees own month view", async () => {
    const { app, hrCookie, empCookie, emp } = await setup();
    await supertest(app).put("/api/attendance/2025-01-06").set("Cookie", hrCookie).send({ marks: { [emp.id]: "P" } });

    const res = await supertest(app).get("/api/attendance/me?month=2025-01").set("Cookie", empCookie);
    expect(res.status).toBe(200);
    expect(res.body.dayCodes[5]).toBe("P");  // Jan 6
    expect(typeof res.body.payable).toBe("number");
  });

  it("requires auth", async () => {
    const { app } = await setup();
    const res = await supertest(app).get("/api/attendance/me?month=2025-01");
    expect(res.status).toBe(401);
  });

  it("missing month returns 400", async () => {
    const { app, empCookie } = await setup();
    const res = await supertest(app).get("/api/attendance/me").set("Cookie", empCookie);
    expect(res.status).toBe(400);
  });
});

// ── SSE: mark → mutation broadcast (structural check) ────────────────────────

describe("SSE broadcast on PUT", () => {
  it("PUT /attendance/:date responds 200 (broadcast is async side-effect)", async () => {
    const { app, hrCookie, emp } = await setup();
    const res = await supertest(app)
      .put("/api/attendance/2025-06-10")
      .set("Cookie", hrCookie)
      .send({ marks: { [emp.id]: "P" } });
    // SSE broadcast is a fire-and-forget side effect; we just confirm the mutation succeeded
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// ── Priority chain via API ────────────────────────────────────────────────────

describe("Priority chain through API", () => {
  it("leave beats manual mark in GET /attendance?date=", async () => {
    const { app, hrCookie, emp, db } = await setup();
    // Mark P on Jan 6
    await supertest(app).put("/api/attendance/2025-01-06").set("Cookie", hrCookie).send({ marks: { [emp.id]: "P" } });
    // Also give them an approved EL on Jan 6
    db.prepare(`INSERT INTO leaves(employee_id,type,date_from,date_to,half_from,half_to,days,status)
      VALUES(?,?,?,?,0,0,1,'APPROVED')`).run(emp.id, "EL", "2025-01-06", "2025-01-06");

    const res = await supertest(app).get("/api/attendance?date=2025-01-06").set("Cookie", hrCookie);
    const empRow = res.body.employees.find((e) => e.id === emp.id);
    expect(empRow?.attStatus).toBe("L"); // leave beats manual P
  });

  it("holiday beats weekoff in GET /attendance?date=", async () => {
    const { app, hrCookie, db } = await setup();
    // 2025-01-26 is a Sunday (WO) — also a holiday
    db.prepare("INSERT INTO holidays(date,name) VALUES('2025-01-26','Republic Day')").run();
    const res = await supertest(app).get("/api/attendance?date=2025-01-26").set("Cookie", hrCookie);
    expect(res.body.isWeekOff).toBe(true);
    expect(res.body.holiday?.name).toBe("Republic Day");
    // For every employee, attStatus should be H (holiday wins over WO)
    for (const e of res.body.employees) {
      if (e.attStatus !== "") expect(e.attStatus).toBe("H");
    }
  });
});

// ── Payable days match hand-computed value ────────────────────────────────────

describe("Payable days — hand-computed acceptance", () => {
  it("Jan 2025: 4 WOs, 1 P, 1 HD = 5.5 payable", async () => {
    const { app, hrCookie, empCookie, emp } = await setup();
    await supertest(app).put("/api/attendance/2025-01-06").set("Cookie", hrCookie).send({ marks: { [emp.id]: "P" } });
    await supertest(app).put("/api/attendance/2025-01-07").set("Cookie", hrCookie).send({ marks: { [emp.id]: "HD" } });

    const res = await supertest(app).get("/api/attendance/me?month=2025-01").set("Cookie", empCookie);
    expect(res.body.payable).toBe(5.5);
    // Verify manually: 4 Sundays (5,12,19,26) = 4 WO = 4.0; Jan6 P=1.0; Jan7 HD=0.5 → 5.5
  });
});
