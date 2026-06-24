/**
 * Leave management tests — pure functions + API integration.
 * Covers: working-day counting, proration, balance formula, overlap,
 * approval chain, RBAC, over-balance confirm, cancellation rules.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { buildApp, insertEmployee, loginAs } from "./helpers.js";
import { countWorkingDays, prorateDays, leaveBalance, findOverlap, dateRange } from "@hrms/shared/leave";
import supertest from "supertest";

// ═══════════════════════════════════════════════════════════════════════════
// PURE FUNCTION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("dateRange", () => {
  it("yields inclusive range", () => {
    const days = [...dateRange("2025-01-01", "2025-01-03")];
    expect(days).toEqual(["2025-01-01", "2025-01-02", "2025-01-03"]);
  });
  it("single day", () => {
    expect([...dateRange("2025-06-15", "2025-06-15")]).toEqual(["2025-06-15"]);
  });
  it("empty if to < from", () => {
    expect([...dateRange("2025-06-15", "2025-06-14")]).toEqual([]);
  });
});

describe("countWorkingDays", () => {
  const settings = { weekOffs: [0], satOff: "2_4" };
  const holidays = [{ date: "2025-01-26", name: "Republic Day" }];

  it("skips Sundays", () => {
    // Mon 2025-01-06 to Fri 2025-01-10 = 5 working days
    expect(countWorkingDays("2025-01-06", "2025-01-10", 0, 0, settings, [])).toBe(5);
  });

  it("skips holidays", () => {
    // 2025-01-26 is Sunday anyway, but let's test with a weekday holiday
    const hol = [{ date: "2025-01-07", name: "Test" }];
    expect(countWorkingDays("2025-01-06", "2025-01-10", 0, 0, settings, hol)).toBe(4);
  });

  it("half-day on first day", () => {
    expect(countWorkingDays("2025-01-06", "2025-01-10", 1, 0, settings, [])).toBe(4.5);
  });

  it("half-day on last day", () => {
    expect(countWorkingDays("2025-01-06", "2025-01-10", 0, 1, settings, [])).toBe(4.5);
  });

  it("half-day on both", () => {
    expect(countWorkingDays("2025-01-06", "2025-01-10", 1, 1, settings, [])).toBe(4);
  });

  it("single day half = 0.5", () => {
    // Mon 2025-01-06 — half on both first and last (same day) = 1 - 0.5 - 0.5 = max(0,0) = 0
    expect(countWorkingDays("2025-01-06", "2025-01-06", 1, 1, settings, [])).toBe(0);
  });

  it("single day half_from only = 0.5", () => {
    expect(countWorkingDays("2025-01-06", "2025-01-06", 1, 0, settings, [])).toBe(0.5);
  });

  it("skips 2nd/4th Saturdays", () => {
    // Jan 2025: 2nd Sat = Jan 11, 4th Sat = Jan 25
    // Jan 6-25 (Mon-Sat): 20 calendar days
    // Sundays in range: 12, 19 = 2
    // 2nd Sat (11), 4th Sat (25) = 2 off
    // Working = 20 - 2 - 2 = 16
    expect(countWorkingDays("2025-01-06", "2025-01-25", 0, 0, settings, [])).toBe(16);
  });

  it("returns 0 when to < from", () => {
    expect(countWorkingDays("2025-01-10", "2025-01-06", 0, 0, settings, [])).toBe(0);
  });

  it("entire range is holidays/weekoffs = 0", () => {
    // Sat Jan 11 (2nd Sat off) + Sun Jan 12
    expect(countWorkingDays("2025-01-11", "2025-01-12", 0, 0, settings, [])).toBe(0);
  });
});

describe("prorateDays", () => {
  it("non-joining year returns full annual", () => {
    expect(prorateDays(12, "2024-01-15", 2025)).toBe(12);
  });

  it("joining Jan = 12 months left = full", () => {
    expect(prorateDays(12, "2025-01-15", 2025)).toBe(12);
  });

  it("joining Jul = 6 months left = 6", () => {
    expect(prorateDays(12, "2025-07-10", 2025)).toBe(6);
  });

  it("joining Dec = 1 month left = 1", () => {
    expect(prorateDays(12, "2025-12-01", 2025)).toBe(1);
  });

  it("rounds to 0.5 — joining Oct, annual 15", () => {
    // 3 months left: 15 * 3/12 = 3.75 → round(3.75*2)/2 = round(7.5)/2 = 8/2 = 4
    expect(prorateDays(15, "2025-10-01", 2025)).toBe(4);
  });

  it("joining Apr, annual 10", () => {
    // 9 months left: 10 * 9/12 = 7.5 → round(7.5*2)/2 = round(15)/2 = 15/2 = 7.5
    expect(prorateDays(10, "2025-04-01", 2025)).toBe(7.5);
  });

  it("0 annual stays 0", () => {
    expect(prorateDays(0, "2025-06-01", 2025)).toBe(0);
  });
});

describe("leaveBalance", () => {
  const types = [
    { code: "EL", annual: 12, paid: 1 },
    { code: "CL", annual: 6, paid: 1 },
    { code: "LWP", annual: 0, paid: 0 },
  ];

  it("full year, no usage", () => {
    const bal = leaveBalance(1, 2025, "2024-01-01", types, [], []);
    expect(bal.EL).toEqual({ entitled: 12, adj: 0, used: 0, available: 12 });
    expect(bal.CL).toEqual({ entitled: 6, adj: 0, used: 0, available: 6 });
  });

  it("with usage", () => {
    const leaves = [
      { employee_id: 1, type: "EL", status: "APPROVED", date_from: "2025-03-01", date_to: "2025-03-05", days: 5 },
    ];
    const bal = leaveBalance(1, 2025, "2024-01-01", types, leaves, []);
    expect(bal.EL.used).toBe(5);
    expect(bal.EL.available).toBe(7);
  });

  it("with adjustments", () => {
    const adjs = [{ employee_id: 1, year: 2025, type: "EL", delta: 3 }];
    const bal = leaveBalance(1, 2025, "2024-01-01", types, [], adjs);
    expect(bal.EL.adj).toBe(3);
    expect(bal.EL.available).toBe(15);
  });

  it("proration in joining year", () => {
    const bal = leaveBalance(1, 2025, "2025-07-01", types, [], []);
    expect(bal.EL.entitled).toBe(6); // 12 * 6/12
    expect(bal.CL.entitled).toBe(3); // 6 * 6/12
  });

  it("ignores PENDING/REJECTED leaves in used", () => {
    const leaves = [
      { employee_id: 1, type: "EL", status: "PENDING", date_from: "2025-03-01", date_to: "2025-03-03", days: 3 },
      { employee_id: 1, type: "EL", status: "REJECTED", date_from: "2025-04-01", date_to: "2025-04-02", days: 2 },
    ];
    const bal = leaveBalance(1, 2025, "2024-01-01", types, leaves, []);
    expect(bal.EL.used).toBe(0);
    expect(bal.EL.available).toBe(12);
  });

  it("filters by year", () => {
    const leaves = [
      { employee_id: 1, type: "EL", status: "APPROVED", date_from: "2024-12-20", date_to: "2024-12-25", days: 4 },
      { employee_id: 1, type: "EL", status: "APPROVED", date_from: "2025-01-10", date_to: "2025-01-12", days: 2 },
    ];
    const bal = leaveBalance(1, 2025, "2024-01-01", types, leaves, []);
    expect(bal.EL.used).toBe(2); // only 2025 leave
  });

  it("negative available when over-used", () => {
    const leaves = [
      { employee_id: 1, type: "EL", status: "APPROVED", date_from: "2025-01-01", date_to: "2025-01-20", days: 15 },
    ];
    const bal = leaveBalance(1, 2025, "2024-01-01", types, leaves, []);
    expect(bal.EL.available).toBe(-3);
  });
});

describe("findOverlap", () => {
  const leaves = [
    { id: 1, employee_id: 1, status: "APPROVED", date_from: "2025-03-10", date_to: "2025-03-15" },
    { id: 2, employee_id: 1, status: "PENDING",  date_from: "2025-04-01", date_to: "2025-04-05" },
    { id: 3, employee_id: 1, status: "REJECTED", date_from: "2025-05-01", date_to: "2025-05-05" },
    { id: 4, employee_id: 2, status: "APPROVED", date_from: "2025-03-10", date_to: "2025-03-15" },
  ];

  it("detects overlap with APPROVED", () => {
    expect(findOverlap(1, "2025-03-12", "2025-03-18", leaves)).toBeTruthy();
  });

  it("detects overlap with PENDING", () => {
    expect(findOverlap(1, "2025-04-03", "2025-04-07", leaves)).toBeTruthy();
  });

  it("ignores REJECTED", () => {
    expect(findOverlap(1, "2025-05-01", "2025-05-05", leaves)).toBeNull();
  });

  it("ignores other employees", () => {
    expect(findOverlap(1, "2025-03-10", "2025-03-15", leaves.filter(l => l.employee_id === 2))).toBeNull();
  });

  it("no overlap when ranges don't touch", () => {
    expect(findOverlap(1, "2025-03-16", "2025-03-20", leaves)).toBeNull();
  });

  it("overlap on boundary day", () => {
    expect(findOverlap(1, "2025-03-15", "2025-03-20", leaves)).toBeTruthy();
  });

  it("excludeId skips that leave", () => {
    expect(findOverlap(1, "2025-03-12", "2025-03-18", leaves, 1)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// API INTEGRATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("Leave API", () => {
  let app, db, hr, manager, emp1, emp2, empNoMgr;
  let hrCookie, mgrCookie, emp1Cookie, emp2Cookie, noMgrCookie;

  beforeEach(async () => {
    ({ app, db } = buildApp());

    // Seed default leave types
    db.prepare("INSERT INTO leave_types(code, name, annual, paid) VALUES(?,?,?,?)").run("EL", "Earned Leave", 12, 1);
    db.prepare("INSERT INTO leave_types(code, name, annual, paid) VALUES(?,?,?,?)").run("CL", "Casual Leave", 6, 1);
    db.prepare("INSERT INTO leave_types(code, name, annual, paid) VALUES(?,?,?,?)").run("SL", "Sick Leave", 6, 1);
    db.prepare("INSERT INTO leave_types(code, name, annual, paid) VALUES(?,?,?,?)").run("LWP", "Leave Without Pay", 0, 0);

    // Seed calendar settings (individual keys, matching seed.js / attendance.js)
    db.prepare("INSERT INTO settings(key, value) VALUES(?, ?)").run("weekOffs", JSON.stringify([0]));
    db.prepare("INSERT INTO settings(key, value) VALUES(?, ?)").run("satOff", JSON.stringify("2_4"));

    // Create users
    hr = await insertEmployee(db, { code: "HR01", name: "HR User", email: "hr@test.com", role: "HR", doj: "2024-01-01" });
    manager = await insertEmployee(db, { code: "MGR01", name: "Manager User", email: "mgr@test.com", role: "EMPLOYEE", doj: "2024-01-01" });
    emp1 = await insertEmployee(db, { code: "EMP01", name: "Employee One", email: "emp1@test.com", role: "EMPLOYEE", doj: "2024-01-01", manager_id: manager.id });
    // Update manager_id via DB since insertEmployee doesn't handle it
    db.prepare("UPDATE employees SET manager_id = ? WHERE id = ?").run(manager.id, emp1.id);
    emp2 = await insertEmployee(db, { code: "EMP02", name: "Employee Two", email: "emp2@test.com", role: "EMPLOYEE", doj: "2024-01-01", manager_id: manager.id });
    db.prepare("UPDATE employees SET manager_id = ? WHERE id = ?").run(manager.id, emp2.id);
    empNoMgr = await insertEmployee(db, { code: "EMP03", name: "No Manager", email: "nomgr@test.com", role: "EMPLOYEE", doj: "2024-01-01" });

    hrCookie = await loginAs(app, "hr@test.com");
    mgrCookie = await loginAs(app, "mgr@test.com");
    emp1Cookie = await loginAs(app, "emp1@test.com");
    emp2Cookie = await loginAs(app, "emp2@test.com");
    noMgrCookie = await loginAs(app, "nomgr@test.com");
  });

  // ── Apply Leave ─────────────────────────────────────────────────────────

  describe("POST /leaves — apply", () => {
    it("employee applies own leave", async () => {
      const res = await supertest(app)
        .post("/api/leaves")
        .set("Cookie", emp1Cookie)
        .send({ type: "EL", date_from: "2025-01-06", date_to: "2025-01-10", half_from: 0, half_to: 0 });
      expect(res.status).toBe(201);
      expect(res.body.employee_id).toBe(emp1.id);
      expect(res.body.days).toBe(5); // Mon-Fri
      expect(res.body.status).toBe("PENDING");
    });

    it("half-day leave", async () => {
      const res = await supertest(app)
        .post("/api/leaves")
        .set("Cookie", emp1Cookie)
        .send({ type: "EL", date_from: "2025-01-06", date_to: "2025-01-06", half_from: 1, half_to: 0 });
      expect(res.status).toBe(201);
      expect(res.body.days).toBe(0.5);
    });

    it("rejects overlap", async () => {
      await supertest(app)
        .post("/api/leaves")
        .set("Cookie", emp1Cookie)
        .send({ type: "EL", date_from: "2025-01-06", date_to: "2025-01-10" });
      const res = await supertest(app)
        .post("/api/leaves")
        .set("Cookie", emp1Cookie)
        .send({ type: "CL", date_from: "2025-01-08", date_to: "2025-01-12" });
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/overlap/i);
    });

    it("rejects no working days", async () => {
      // Sun Jan 5 + Sat Jan 4 (1st Sat, not off with 2_4)... let's use a pure weekend
      const res = await supertest(app)
        .post("/api/leaves")
        .set("Cookie", emp1Cookie)
        .send({ type: "EL", date_from: "2025-01-05", date_to: "2025-01-05" }); // Sunday
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/no working days/i);
    });

    it("rejects invalid leave type", async () => {
      const res = await supertest(app)
        .post("/api/leaves")
        .set("Cookie", emp1Cookie)
        .send({ type: "INVALID", date_from: "2025-01-06", date_to: "2025-01-06" });
      expect(res.status).toBe(400);
    });

    it("rejects to < from", async () => {
      const res = await supertest(app)
        .post("/api/leaves")
        .set("Cookie", emp1Cookie)
        .send({ type: "EL", date_from: "2025-01-10", date_to: "2025-01-06" });
      expect(res.status).toBe(400);
    });

    it("HR can apply on behalf", async () => {
      const res = await supertest(app)
        .post("/api/leaves")
        .set("Cookie", hrCookie)
        .send({ employee_id: emp1.id, type: "EL", date_from: "2025-01-06", date_to: "2025-01-10" });
      expect(res.status).toBe(201);
      expect(res.body.employee_id).toBe(emp1.id);
    });

    it("non-HR cannot apply on behalf", async () => {
      const res = await supertest(app)
        .post("/api/leaves")
        .set("Cookie", emp1Cookie)
        .send({ employee_id: emp2.id, type: "EL", date_from: "2025-01-06", date_to: "2025-01-10" });
      expect(res.status).toBe(403);
    });
  });

  // ── Over-balance at apply ───────────────────────────────────────────────
  // emp1's EL annual = 12 (doj 2024, non-joining year for 2025 → full entitlement).
  // Jan 6 (Mon) – Jan 24 (Fri) under weekOffs:[0], satOff:"2_4" = 16 working days
  // (off: 2nd Sat Jan 11, Sundays Jan 12 & 19) — i.e. 4 days over the 12-day balance.

  describe("Over-balance at apply", () => {
    it("allows apply within balance", async () => {
      const res = await supertest(app)
        .post("/api/leaves")
        .set("Cookie", emp1Cookie)
        .send({ type: "EL", date_from: "2025-01-06", date_to: "2025-01-10" }); // 5 days
      expect(res.status).toBe(201);
      expect(res.body.days).toBe(5);
    });

    it("rejects apply over balance with a clear message", async () => {
      const res = await supertest(app)
        .post("/api/leaves")
        .set("Cookie", emp1Cookie)
        .send({ type: "EL", date_from: "2025-01-06", date_to: "2025-01-24" }); // 16 days > 12
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/you have 12 el; requesting 16/i);
      expect(res.body.requiresConfirm).toBe(true);
    });

    it("allows over-balance apply with confirmOverBalance acknowledgment", async () => {
      const res = await supertest(app)
        .post("/api/leaves")
        .set("Cookie", emp1Cookie)
        .send({ type: "EL", date_from: "2025-01-06", date_to: "2025-01-24", confirmOverBalance: true });
      expect(res.status).toBe(201);
      expect(res.body.days).toBe(16);
    });

    it("LWP is never balance-gated even far over typical limits", async () => {
      const res = await supertest(app)
        .post("/api/leaves")
        .set("Cookie", emp1Cookie)
        .send({ type: "LWP", date_from: "2025-01-06", date_to: "2025-01-31" });
      expect(res.status).toBe(201);
    });

    it("HR applying on behalf is also balance-gated", async () => {
      const res = await supertest(app)
        .post("/api/leaves")
        .set("Cookie", hrCookie)
        .send({ employee_id: emp1.id, type: "EL", date_from: "2025-01-06", date_to: "2025-01-24" });
      expect(res.status).toBe(400);
      expect(res.body.requiresConfirm).toBe(true);
    });
  });

  // ── Approval chain ────────────────────────────────────────────────────

  describe("Approval chain", () => {
    let leaveId;
    beforeEach(async () => {
      const res = await supertest(app)
        .post("/api/leaves")
        .set("Cookie", emp1Cookie)
        .send({ type: "EL", date_from: "2025-02-03", date_to: "2025-02-07" });
      leaveId = res.body.id;
    });

    it("manager approves direct report's leave", async () => {
      const res = await supertest(app)
        .post(`/api/leaves/${leaveId}/approve`)
        .set("Cookie", mgrCookie)
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("APPROVED");
    });

    it("manager rejects direct report's leave", async () => {
      const res = await supertest(app)
        .post(`/api/leaves/${leaveId}/reject`)
        .set("Cookie", mgrCookie)
        .send({ comment: "Not enough coverage" });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("REJECTED");
    });

    it("HR approves any leave", async () => {
      const res = await supertest(app)
        .post(`/api/leaves/${leaveId}/approve`)
        .set("Cookie", hrCookie)
        .send({});
      expect(res.status).toBe(200);
    });

    it("employee cannot approve own leave", async () => {
      const res = await supertest(app)
        .post(`/api/leaves/${leaveId}/approve`)
        .set("Cookie", emp1Cookie)
        .send({});
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/own leave/i);
    });

    it("manager cannot act on non-reports", async () => {
      // emp2 applies leave, another non-manager employee tries to approve
      const applyRes = await supertest(app)
        .post("/api/leaves")
        .set("Cookie", noMgrCookie)
        .send({ type: "EL", date_from: "2025-02-03", date_to: "2025-02-07" });
      // Manager tries to approve empNoMgr's leave — not a direct report
      const res = await supertest(app)
        .post(`/api/leaves/${applyRes.body.id}/approve`)
        .set("Cookie", mgrCookie)
        .send({});
      expect(res.status).toBe(403);
    });

    it("no-manager leave routes to HR", async () => {
      const applyRes = await supertest(app)
        .post("/api/leaves")
        .set("Cookie", noMgrCookie)
        .send({ type: "EL", date_from: "2025-03-03", date_to: "2025-03-07" });
      // HR approves
      const res = await supertest(app)
        .post(`/api/leaves/${applyRes.body.id}/approve`)
        .set("Cookie", hrCookie)
        .send({});
      expect(res.status).toBe(200);
    });

    it("pending list: manager sees only direct reports", async () => {
      // noMgr also applies a leave
      await supertest(app)
        .post("/api/leaves")
        .set("Cookie", noMgrCookie)
        .send({ type: "EL", date_from: "2025-03-03", date_to: "2025-03-07" });

      const res = await supertest(app)
        .get("/api/leaves/pending")
        .set("Cookie", mgrCookie);
      expect(res.status).toBe(200);
      // Manager should only see emp1's leave, not noMgr's
      expect(res.body.every((l) => l.employee_id === emp1.id)).toBe(true);
    });

    it("pending list: HR sees all pending", async () => {
      await supertest(app)
        .post("/api/leaves")
        .set("Cookie", noMgrCookie)
        .send({ type: "EL", date_from: "2025-03-03", date_to: "2025-03-07" });

      const res = await supertest(app)
        .get("/api/leaves/pending")
        .set("Cookie", hrCookie);
      expect(res.status).toBe(200);
      // Should see at least 2 (emp1 + noMgr)
      expect(res.body.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── Over-balance ──────────────────────────────────────────────────────

  describe("Over-balance approval", () => {
    it("blocks approval without confirm flag", async () => {
      // Use all 12 EL days
      await supertest(app).post("/api/leaves").set("Cookie", emp1Cookie)
        .send({ type: "EL", date_from: "2025-01-06", date_to: "2025-01-17" }); // 10 days
      const apply2 = await supertest(app).post("/api/leaves").set("Cookie", emp1Cookie)
        .send({ type: "EL", date_from: "2025-02-03", date_to: "2025-02-07" }); // 5 days

      // Approve first
      await supertest(app).post(`/api/leaves/${apply2.body.id - 1}/approve`)
        .set("Cookie", mgrCookie).send({});

      // Try to approve second (total 15 > 12)
      const res = await supertest(app)
        .post(`/api/leaves/${apply2.body.id}/approve`)
        .set("Cookie", mgrCookie)
        .send({});
      expect(res.status).toBe(409);
      expect(res.body.requiresConfirm).toBe(true);
    });

    it("allows approval with confirm flag", async () => {
      await supertest(app).post("/api/leaves").set("Cookie", emp1Cookie)
        .send({ type: "EL", date_from: "2025-01-06", date_to: "2025-01-17" });
      const apply2 = await supertest(app).post("/api/leaves").set("Cookie", emp1Cookie)
        .send({ type: "EL", date_from: "2025-02-03", date_to: "2025-02-07" });

      await supertest(app).post(`/api/leaves/${apply2.body.id - 1}/approve`)
        .set("Cookie", mgrCookie).send({});

      const res = await supertest(app)
        .post(`/api/leaves/${apply2.body.id}/approve`)
        .set("Cookie", mgrCookie)
        .send({ confirmOverBalance: true });
      expect(res.status).toBe(200);
    });
  });

  // ── Cancellation ──────────────────────────────────────────────────────

  describe("Cancellation", () => {
    it("employee cancels own PENDING leave", async () => {
      const apply = await supertest(app).post("/api/leaves").set("Cookie", emp1Cookie)
        .send({ type: "EL", date_from: "2025-06-02", date_to: "2025-06-06" });
      const res = await supertest(app)
        .post(`/api/leaves/${apply.body.id}/cancel`)
        .set("Cookie", emp1Cookie);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("CANCELLED");
    });

    it("employee cannot cancel other's leave", async () => {
      const apply = await supertest(app).post("/api/leaves").set("Cookie", emp1Cookie)
        .send({ type: "EL", date_from: "2025-06-02", date_to: "2025-06-06" });
      const res = await supertest(app)
        .post(`/api/leaves/${apply.body.id}/cancel`)
        .set("Cookie", emp2Cookie);
      expect(res.status).toBe(403);
    });

    it("HR cancels any APPROVED leave", async () => {
      const apply = await supertest(app).post("/api/leaves").set("Cookie", emp1Cookie)
        .send({ type: "EL", date_from: "2025-06-02", date_to: "2025-06-06" });
      await supertest(app).post(`/api/leaves/${apply.body.id}/approve`)
        .set("Cookie", mgrCookie).send({});
      const res = await supertest(app)
        .post(`/api/leaves/${apply.body.id}/cancel`)
        .set("Cookie", hrCookie);
      expect(res.status).toBe(200);
    });

    it("cannot cancel REJECTED leave", async () => {
      const apply = await supertest(app).post("/api/leaves").set("Cookie", emp1Cookie)
        .send({ type: "EL", date_from: "2025-06-02", date_to: "2025-06-06" });
      await supertest(app).post(`/api/leaves/${apply.body.id}/reject`)
        .set("Cookie", mgrCookie).send({});
      const res = await supertest(app)
        .post(`/api/leaves/${apply.body.id}/cancel`)
        .set("Cookie", hrCookie);
      expect(res.status).toBe(400);
    });
  });

  // ── Balances API ──────────────────────────────────────────────────────

  describe("GET /leaves/balances", () => {
    it("returns own balance", async () => {
      const res = await supertest(app)
        .get(`/api/leaves/balances?year=2025&employeeId=${emp1.id}`)
        .set("Cookie", emp1Cookie);
      expect(res.status).toBe(200);
      expect(res.body.balances.EL.entitled).toBe(12);
    });

    it("employee cannot see others' balance", async () => {
      const res = await supertest(app)
        .get(`/api/leaves/balances?year=2025&employeeId=${emp2.id}`)
        .set("Cookie", emp1Cookie);
      expect(res.status).toBe(403);
    });

    it("HR sees all balances", async () => {
      const res = await supertest(app)
        .get("/api/leaves/balances?year=2025")
        .set("Cookie", hrCookie);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ── Adjustments API ───────────────────────────────────────────────────

  describe("POST /leaves/adjustments", () => {
    it("HR creates adjustment", async () => {
      const res = await supertest(app)
        .post("/api/leaves/adjustments")
        .set("Cookie", hrCookie)
        .send({ employee_id: emp1.id, year: 2025, type: "EL", delta: 3, note: "carry forward" });
      expect(res.status).toBe(201);
      expect(res.body.delta).toBe(3);
    });

    it("employee cannot create adjustment", async () => {
      const res = await supertest(app)
        .post("/api/leaves/adjustments")
        .set("Cookie", emp1Cookie)
        .send({ employee_id: emp1.id, year: 2025, type: "EL", delta: 3 });
      expect(res.status).toBe(403);
    });

    it("adjustment reflected in balance", async () => {
      await supertest(app)
        .post("/api/leaves/adjustments")
        .set("Cookie", hrCookie)
        .send({ employee_id: emp1.id, year: 2025, type: "EL", delta: 5 });
      const res = await supertest(app)
        .get(`/api/leaves/balances?year=2025&employeeId=${emp1.id}`)
        .set("Cookie", emp1Cookie);
      expect(res.body.balances.EL.available).toBe(17); // 12 + 5
    });
  });

  // ── Leave Types CRUD ──────────────────────────────────────────────────

  describe("Leave types CRUD", () => {
    it("lists types", async () => {
      const res = await supertest(app)
        .get("/api/leaves/types")
        .set("Cookie", emp1Cookie);
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(4);
    });

    it("HR creates type", async () => {
      const res = await supertest(app)
        .post("/api/leaves/types")
        .set("Cookie", hrCookie)
        .send({ code: "ML", name: "Maternity Leave", annual: 0, paid: 1 });
      expect(res.status).toBe(201);
    });

    it("rejects duplicate code", async () => {
      const res = await supertest(app)
        .post("/api/leaves/types")
        .set("Cookie", hrCookie)
        .send({ code: "EL", name: "Duplicate", annual: 12, paid: 1 });
      expect(res.status).toBe(409);
    });

    it("HR patches type", async () => {
      const res = await supertest(app)
        .patch("/api/leaves/types/EL")
        .set("Cookie", hrCookie)
        .send({ annual: 15 });
      expect(res.status).toBe(200);
      expect(res.body.annual).toBe(15);
    });

    it("employee cannot create type", async () => {
      const res = await supertest(app)
        .post("/api/leaves/types")
        .set("Cookie", emp1Cookie)
        .send({ code: "XX", name: "Test", annual: 5, paid: 1 });
      expect(res.status).toBe(403);
    });
  });

  // ── Pending count ─────────────────────────────────────────────────────

  describe("GET /leaves/pending-count", () => {
    it("returns count for HR", async () => {
      await supertest(app).post("/api/leaves").set("Cookie", emp1Cookie)
        .send({ type: "EL", date_from: "2025-01-06", date_to: "2025-01-10" });
      await supertest(app).post("/api/leaves").set("Cookie", noMgrCookie)
        .send({ type: "CL", date_from: "2025-01-06", date_to: "2025-01-07" });

      const res = await supertest(app)
        .get("/api/leaves/pending-count")
        .set("Cookie", hrCookie);
      expect(res.status).toBe(200);
      expect(res.body.count).toBe(2);
    });

    it("manager sees only direct reports count", async () => {
      await supertest(app).post("/api/leaves").set("Cookie", emp1Cookie)
        .send({ type: "EL", date_from: "2025-01-06", date_to: "2025-01-10" });
      await supertest(app).post("/api/leaves").set("Cookie", noMgrCookie)
        .send({ type: "CL", date_from: "2025-01-06", date_to: "2025-01-07" });

      const res = await supertest(app)
        .get("/api/leaves/pending-count")
        .set("Cookie", mgrCookie);
      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1); // only emp1
    });
  });

  // ── List leaves scoping ───────────────────────────────────────────────

  describe("GET /leaves — scoping", () => {
    it("employee sees own leaves only", async () => {
      await supertest(app).post("/api/leaves").set("Cookie", emp1Cookie)
        .send({ type: "EL", date_from: "2025-01-06", date_to: "2025-01-10" });
      await supertest(app).post("/api/leaves").set("Cookie", emp2Cookie)
        .send({ type: "EL", date_from: "2025-01-06", date_to: "2025-01-10" });

      const res = await supertest(app)
        .get("/api/leaves")
        .set("Cookie", emp1Cookie);
      expect(res.status).toBe(200);
      expect(res.body.data.every((l) => l.employee_id === emp1.id)).toBe(true);
    });

    it("HR sees all leaves", async () => {
      await supertest(app).post("/api/leaves").set("Cookie", emp1Cookie)
        .send({ type: "EL", date_from: "2025-01-06", date_to: "2025-01-10" });
      await supertest(app).post("/api/leaves").set("Cookie", emp2Cookie)
        .send({ type: "CL", date_from: "2025-01-06", date_to: "2025-01-10" });

      const res = await supertest(app)
        .get("/api/leaves")
        .set("Cookie", hrCookie);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });

    it("filters by status", async () => {
      const applyRes = await supertest(app).post("/api/leaves").set("Cookie", emp1Cookie)
        .send({ type: "EL", date_from: "2025-01-06", date_to: "2025-01-10" });
      await supertest(app).post(`/api/leaves/${applyRes.body.id}/approve`)
        .set("Cookie", mgrCookie).send({});

      const res = await supertest(app)
        .get("/api/leaves?status=APPROVED")
        .set("Cookie", emp1Cookie);
      expect(res.body.data.every((l) => l.status === "APPROVED")).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// REGRESSION: getSettings reads real keys (weekOffs, satOff), not 'calendar'
// ═══════════════════════════════════════════════════════════════════════════

describe("Leave getSettings regression — satOff honored", () => {
  let app, db, emp, cookie;

  beforeEach(async () => {
    ({ app, db } = buildApp());
    db.prepare("INSERT INTO leave_types(code, name, annual, paid) VALUES(?,?,?,?)").run("EL", "Earned Leave", 30, 1);
    emp = await insertEmployee(db, { code: "REG01", name: "Reg Test", email: "reg@test.com", role: "EMPLOYEE", doj: "2024-01-01" });
    cookie = await loginAs(app, "reg@test.com");
  });

  it("skips 2nd/4th Saturdays when satOff=2_4 is configured via individual keys", async () => {
    // Seed the CORRECT way (individual keys, as seed.js / attendance.js do)
    db.prepare("INSERT INTO settings(key, value) VALUES(?, ?)").run("weekOffs", JSON.stringify([0]));
    db.prepare("INSERT INTO settings(key, value) VALUES(?, ?)").run("satOff", JSON.stringify("2_4"));

    // Jan 2025: 2nd Sat = Jan 11, 4th Sat = Jan 25
    // Jan 6 (Mon) – Jan 25 (Sat): 20 calendar days
    // Sundays: 12, 19 = 2 off;  2nd Sat (11) + 4th Sat (25) = 2 off
    // Working = 20 - 2 - 2 = 16
    const res = await supertest(app).post("/api/leaves").set("Cookie", cookie)
      .send({ type: "EL", date_from: "2025-01-06", date_to: "2025-01-25", confirmOverBalance: true });
    expect(res.status).toBe(201);
    expect(res.body.days).toBe(16);
  });

  it("defaults to Sundays-only when no settings rows exist", async () => {
    // No settings seeded — fallback weekOffs:[0], satOff:"none"
    // Jan 6 (Mon) – Jan 25 (Sat): 20 calendar days
    // Sundays: 12, 19 = 2 off;  all Saturdays are working
    // Working = 20 - 2 = 18
    const res = await supertest(app).post("/api/leaves").set("Cookie", cookie)
      .send({ type: "EL", date_from: "2025-01-06", date_to: "2025-01-25", confirmOverBalance: true });
    expect(res.status).toBe(201);
    expect(res.body.days).toBe(18);
  });
});
