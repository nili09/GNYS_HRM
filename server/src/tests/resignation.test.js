import { describe, it, expect, beforeAll } from "vitest";
import supertest from "supertest";
import { buildApp, insertEmployee, loginAs } from "./helpers.js";

describe("Resignation", () => {
  let app, db, empId, empCookie, hrCookie, mgrId, mgrCookie;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    // HR user
    const hr = await insertEmployee(db, { role: "HR", email: "hr_res@igenesys.com" });
    hrCookie = await loginAs(app, hr.email);

    // Manager
    const mgr = await insertEmployee(db, { email: "mgr_res@igenesys.com" });
    mgrId = mgr.id;
    mgrCookie = await loginAs(app, mgr.email);

    // Employee reporting to manager
    const emp = await insertEmployee(db, { email: "emp_res@igenesys.com", manager_id: mgrId });
    empId = emp.id;
    empCookie = await loginAs(app, emp.email);
  });

  describe("POST /resignation/submit", () => {
    it("rejects if not active", async () => {
      const onb = await insertEmployee(db, { email: "onb_res@igenesys.com", status: "ONBOARDING" });
      const cookie = await loginAs(app, onb.email);
      const res = await supertest(app).post("/api/resignation/submit")
        .set("Cookie", cookie)
        .send({ resignation_type: "Voluntary", resignation_reason: "Personal", intended_last_day: "2026-07-18" });
      expect(res.status).toBe(400);
    });

    it("rejects invalid schema (extra fields)", async () => {
      const res = await supertest(app).post("/api/resignation/submit")
        .set("Cookie", empCookie)
        .send({ resignation_type: "Voluntary", resignation_reason: "Personal", intended_last_day: "2026-07-18", status: "NOTICE" });
      expect(res.status).toBe(400);
    });

    it("submits resignation successfully", async () => {
      const res = await supertest(app).post("/api/resignation/submit")
        .set("Cookie", empCookie)
        .send({
          resignation_type: "Voluntary",
          resignation_reason: "Better opportunity",
          intended_last_day: "2026-08-18",
          requestee_remarks: "Thanks for everything",
        });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      const emp = db.prepare("SELECT resignation_status, resignation_type, status FROM employees WHERE id = ?").get(empId);
      expect(emp.resignation_status).toBe("PENDING");
      expect(emp.resignation_type).toBe("Voluntary");
      expect(emp.status).toBe("ACTIVE");
    });

    it("rejects duplicate submission", async () => {
      const res = await supertest(app).post("/api/resignation/submit")
        .set("Cookie", empCookie)
        .send({ resignation_type: "Voluntary", resignation_reason: "Again", intended_last_day: "2026-08-18" });
      expect(res.status).toBe(409);
    });

    it("creates notifications for manager and HR", async () => {
      const notifs = db.prepare("SELECT * FROM notifications WHERE entity = 'employees' AND entity_id = ? AND type = 'RESIGNATION'").all(empId);
      expect(notifs.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("GET /resignation/my", () => {
    it("returns resignation status for employee", async () => {
      const res = await supertest(app).get("/api/resignation/my").set("Cookie", empCookie);
      expect(res.status).toBe(200);
      expect(res.body.resignation_status).toBe("PENDING");
      expect(res.body.resignation_type).toBe("Voluntary");
    });
  });

  describe("GET /resignation/pending", () => {
    it("HR can see pending resignations", async () => {
      const res = await supertest(app).get("/api/resignation/pending").set("Cookie", hrCookie);
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0].name).toBeDefined();
    });

    it("manager can see their report's pending resignation", async () => {
      const res = await supertest(app).get("/api/resignation/pending").set("Cookie", mgrCookie);
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    it("random employee cannot see pending", async () => {
      const rando = await insertEmployee(db, { email: "rando_res@igenesys.com" });
      const cookie = await loginAs(app, rando.email);
      const res = await supertest(app).get("/api/resignation/pending").set("Cookie", cookie);
      expect(res.status).toBe(403);
    });
  });

  describe("POST /resignation/:id/act", () => {
    it("random employee cannot approve", async () => {
      const rando = await insertEmployee(db, { email: "rando2_res@igenesys.com" });
      const cookie = await loginAs(app, rando.email);
      const res = await supertest(app).post(`/api/resignation/${empId}/act`)
        .set("Cookie", cookie)
        .send({ action: "APPROVE" });
      expect(res.status).toBe(403);
    });

    it("rejects invalid action schema", async () => {
      const res = await supertest(app).post(`/api/resignation/${empId}/act`)
        .set("Cookie", hrCookie)
        .send({ action: "APPROVE", sneaky_field: "hack" });
      expect(res.status).toBe(400);
    });

    it("manager can approve resignation → status becomes NOTICE", async () => {
      const res = await supertest(app).post(`/api/resignation/${empId}/act`)
        .set("Cookie", mgrCookie)
        .send({ action: "APPROVE", approver_remarks: "Best of luck", last_working_day: "2026-08-31" });
      expect(res.status).toBe(200);

      const emp = db.prepare("SELECT status, resignation_status, exit_date FROM employees WHERE id = ?").get(empId);
      expect(emp.status).toBe("NOTICE");
      expect(emp.resignation_status).toBe("APPROVED");
      expect(emp.exit_date).toBe("2026-08-31");
    });

    it("cannot approve already-approved resignation", async () => {
      const res = await supertest(app).post(`/api/resignation/${empId}/act`)
        .set("Cookie", hrCookie)
        .send({ action: "APPROVE" });
      expect(res.status).toBe(400);
    });

    it("HR can reject a pending resignation", async () => {
      const emp3 = await insertEmployee(db, { email: "emp3_res@igenesys.com" });
      const cookie3 = await loginAs(app, emp3.email);
      await supertest(app).post("/api/resignation/submit").set("Cookie", cookie3)
        .send({ resignation_type: "Voluntary", resignation_reason: "Leaving", intended_last_day: "2026-09-01" });

      const res = await supertest(app).post(`/api/resignation/${emp3.id}/act`)
        .set("Cookie", hrCookie)
        .send({ action: "REJECT", approver_remarks: "Please reconsider" });
      expect(res.status).toBe(200);

      const row = db.prepare("SELECT resignation_status, status FROM employees WHERE id = ?").get(emp3.id);
      expect(row.resignation_status).toBe("REJECTED");
      expect(row.status).toBe("ACTIVE");
    });

    it("employee receives notification after approval", async () => {
      const notifs = db.prepare("SELECT * FROM notifications WHERE user_id = ? AND type = 'RESIGNATION' AND title LIKE '%approved%'").all(empId);
      expect(notifs.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("POST /resignation/cancel", () => {
    it("employee can cancel pending resignation", async () => {
      const emp2 = await insertEmployee(db, { email: "emp2_res@igenesys.com", manager_id: mgrId });
      const cookie2 = await loginAs(app, emp2.email);

      await supertest(app).post("/api/resignation/submit").set("Cookie", cookie2)
        .send({ resignation_type: "Voluntary", resignation_reason: "Leaving", intended_last_day: "2026-09-01" });

      const res = await supertest(app).post("/api/resignation/cancel").set("Cookie", cookie2);
      expect(res.status).toBe(200);

      const row = db.prepare("SELECT resignation_status FROM employees WHERE id = ?").get(emp2.id);
      expect(row.resignation_status).toBe("WITHDRAWN");
    });

    it("cannot cancel non-pending resignation", async () => {
      const emp4 = await insertEmployee(db, { email: "emp4_res@igenesys.com" });
      const cookie4 = await loginAs(app, emp4.email);
      // No resignation submitted — resignation_status is null
      const res = await supertest(app).post("/api/resignation/cancel").set("Cookie", cookie4);
      expect(res.status).toBe(400);
    });
  });

  describe("Audit trail", () => {
    it("records resignation submit, approve actions", () => {
      const logs = db.prepare("SELECT * FROM audit_log WHERE entity = 'employees' AND action LIKE 'RESIGNATION%'").all();
      expect(logs.length).toBeGreaterThanOrEqual(3);
    });
  });
});
