import { describe, it, expect, beforeAll } from "vitest";
import supertest from "supertest";
import { buildApp, insertEmployee, loginAs } from "./helpers.js";

describe("Onboarding", () => {
  let app, db, empId, empCookie, hrCookie, activeEmpCookie;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    const hr = await insertEmployee(db, { role: "HR", email: "hr_onb@igenesys.com" });
    hrCookie = await loginAs(app, hr.email);

    // Onboarding employee
    const emp = await insertEmployee(db, { email: "new_joiner@igenesys.com", status: "ONBOARDING" });
    empId = emp.id;
    empCookie = await loginAs(app, emp.email);

    // Active employee (for testing non-onboarding access)
    const active = await insertEmployee(db, { email: "active_onb@igenesys.com" });
    activeEmpCookie = await loginAs(app, active.email);
  });

  describe("GET /onboarding/my", () => {
    it("returns journey data for onboarding employee", async () => {
      const res = await supertest(app).get("/api/onboarding/my").set("Cookie", empCookie);
      expect(res.status).toBe(200);
      expect(res.body.employee.status).toBe("ONBOARDING");
      expect(res.body.docs).toHaveLength(8);
      expect(res.body.policies).toHaveLength(4);
      expect(res.body.progress.docs_done).toBe(0);
      expect(res.body.progress.policies_done).toBe(0);
      expect(res.body.progress.complete).toBe(false);
    });

    it("returns journey data for active employee too", async () => {
      const res = await supertest(app).get("/api/onboarding/my").set("Cookie", activeEmpCookie);
      expect(res.status).toBe(200);
      expect(res.body.employee.status).toBe("ACTIVE");
    });
  });

  describe("POST /onboarding/doc-check", () => {
    it("rejects invalid key", async () => {
      const res = await supertest(app).post("/api/onboarding/doc-check")
        .set("Cookie", empCookie)
        .send({ key: "nonexistent", done: 1 });
      expect(res.status).toBe(400);
    });

    it("rejects extra fields (strict schema)", async () => {
      const res = await supertest(app).post("/api/onboarding/doc-check")
        .set("Cookie", empCookie)
        .send({ key: "photo", done: 1, hack: true });
      expect(res.status).toBe(400);
    });

    it("marks a doc as done", async () => {
      const res = await supertest(app).post("/api/onboarding/doc-check")
        .set("Cookie", empCookie)
        .send({ key: "photo", done: 1 });
      expect(res.status).toBe(200);

      const row = db.prepare("SELECT done FROM docs_checklist WHERE employee_id = ? AND key = 'photo'").get(empId);
      expect(row.done).toBe(1);
    });

    it("can uncheck a doc", async () => {
      const res = await supertest(app).post("/api/onboarding/doc-check")
        .set("Cookie", empCookie)
        .send({ key: "photo", done: 0 });
      expect(res.status).toBe(200);

      const row = db.prepare("SELECT done FROM docs_checklist WHERE employee_id = ? AND key = 'photo'").get(empId);
      expect(row.done).toBe(0);
    });

    it("reflects in journey progress", async () => {
      // Check two docs
      await supertest(app).post("/api/onboarding/doc-check").set("Cookie", empCookie)
        .send({ key: "photo", done: 1 });
      await supertest(app).post("/api/onboarding/doc-check").set("Cookie", empCookie)
        .send({ key: "id_proof", done: 1 });

      const res = await supertest(app).get("/api/onboarding/my").set("Cookie", empCookie);
      expect(res.body.progress.docs_done).toBe(2);
    });
  });

  describe("POST /onboarding/policy-ack", () => {
    it("rejects invalid policy key", async () => {
      const res = await supertest(app).post("/api/onboarding/policy-ack")
        .set("Cookie", empCookie)
        .send({ policy_key: "nonexistent" });
      expect(res.status).toBe(400);
    });

    it("rejects extra fields (strict schema)", async () => {
      const res = await supertest(app).post("/api/onboarding/policy-ack")
        .set("Cookie", empCookie)
        .send({ policy_key: "code_of_conduct", extra: "hack" });
      expect(res.status).toBe(400);
    });

    it("acknowledges a policy", async () => {
      const res = await supertest(app).post("/api/onboarding/policy-ack")
        .set("Cookie", empCookie)
        .send({ policy_key: "code_of_conduct" });
      expect(res.status).toBe(200);

      const row = db.prepare("SELECT * FROM onboarding_policy_acks WHERE employee_id = ? AND policy_key = 'code_of_conduct'").get(empId);
      expect(row).toBeDefined();
    });

    it("idempotent — second ack doesn't error", async () => {
      const res = await supertest(app).post("/api/onboarding/policy-ack")
        .set("Cookie", empCookie)
        .send({ policy_key: "code_of_conduct" });
      expect(res.status).toBe(200);
    });

    it("reflects in journey progress", async () => {
      await supertest(app).post("/api/onboarding/policy-ack").set("Cookie", empCookie)
        .send({ policy_key: "it_security" });

      const res = await supertest(app).get("/api/onboarding/my").set("Cookie", empCookie);
      expect(res.body.progress.policies_done).toBe(2);
    });
  });

  describe("Full completion", () => {
    it("marks progress complete when all done", async () => {
      // Complete remaining docs
      for (const key of ["address_proof", "pan_card", "bank_proof", "education_cert", "experience_letter", "medical_report"]) {
        await supertest(app).post("/api/onboarding/doc-check").set("Cookie", empCookie)
          .send({ key, done: 1 });
      }
      // Complete remaining policies
      for (const key of ["leave_policy", "anti_harassment"]) {
        await supertest(app).post("/api/onboarding/policy-ack").set("Cookie", empCookie)
          .send({ policy_key: key });
      }

      const res = await supertest(app).get("/api/onboarding/my").set("Cookie", empCookie);
      expect(res.body.progress.complete).toBe(true);
      expect(res.body.progress.docs_done).toBe(8);
      expect(res.body.progress.policies_done).toBe(4);
    });
  });

  describe("GET /onboarding/hr/progress", () => {
    it("HR can see onboarding progress", async () => {
      const res = await supertest(app).get("/api/onboarding/hr/progress").set("Cookie", hrCookie);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const joiner = res.body.find(e => e.id === empId);
      expect(joiner).toBeDefined();
      expect(joiner.docs_done).toBe(8);
      expect(joiner.complete).toBe(true);
    });

    it("non-HR cannot access HR progress", async () => {
      const res = await supertest(app).get("/api/onboarding/hr/progress").set("Cookie", empCookie);
      expect(res.status).toBe(403);
    });
  });

  describe("Audit trail", () => {
    it("records onboarding actions", () => {
      const logs = db.prepare("SELECT * FROM audit_log WHERE action LIKE 'ONBOARDING%'").all();
      expect(logs.length).toBeGreaterThanOrEqual(10);
    });
  });
});
