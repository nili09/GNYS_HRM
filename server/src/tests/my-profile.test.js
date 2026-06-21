/**
 * MyProfile self-service tests — Stage 25
 * (a) Expanded self-patch: employee can update bank, blood_group, nationality, etc.
 * (b) Self-patch STILL rejects HR-only fields (code, doj, role, salary, status, resignation, etc.)
 * (c) Sub-entity CRUD (emergency contacts, family, nominees, education, prev employers)
 * (d) RBAC: cross-employee sub-entity access blocked; HR can access any
 * (e) Audit log written for self-edits
 */
import { describe, it, expect, beforeAll } from "vitest";
import supertest from "supertest";
import { buildApp, insertEmployee, loginAs } from "./helpers.js";

let app, db, empA, empB, hrUser, cookieA, cookieB, cookieHR;

beforeAll(async () => {
  ({ app, db } = buildApp());

  empA = await insertEmployee(db, {
    email: "alice@igenesys.com",
    name: "Alice Test",
    bank_name: "SBI",
    bank_acc: "1234567890",
    ifsc: "SBIN0001234",
  });
  empB = await insertEmployee(db, { email: "bob@igenesys.com", name: "Bob Test" });
  hrUser = await insertEmployee(db, { email: "hr@igenesys.com", name: "HR Admin", role: "HR" });

  cookieA = await loginAs(app, "alice@igenesys.com");
  cookieB = await loginAs(app, "bob@igenesys.com");
  cookieHR = await loginAs(app, "hr@igenesys.com");
});

// ═══════════════════════ Expanded Self-Patch ═══════════════════════

describe("Employee self-patch — allowed fields", () => {
  it("can update bank details", async () => {
    const res = await supertest(app)
      .patch(`/api/employees/${empA.id}`)
      .set("Cookie", cookieA)
      .send({ bank_name: "HDFC", bank_acc: "9999888877", ifsc: "HDFC0001234" });
    expect(res.status).toBe(200);

    const profile = await supertest(app)
      .get(`/api/employees/${empA.id}`)
      .set("Cookie", cookieA);
    expect(profile.body.bank_name).toBe("HDFC");
    expect(profile.body.bank_acc).toBe("9999888877");
    expect(profile.body.ifsc).toBe("HDFC0001234");
  });

  it("can update blood_group, nationality, wedding_anniversary, prefix", async () => {
    const res = await supertest(app)
      .patch(`/api/employees/${empA.id}`)
      .set("Cookie", cookieA)
      .send({
        blood_group: "O+",
        nationality: "Indian",
        wedding_anniversary: "2020-06-15",
        prefix: "Ms",
      });
    expect(res.status).toBe(200);

    const profile = await supertest(app)
      .get(`/api/employees/${empA.id}`)
      .set("Cookie", cookieA);
    expect(profile.body.blood_group).toBe("O+");
    expect(profile.body.nationality).toBe("Indian");
    expect(profile.body.wedding_anniversary).toBe("2020-06-15");
    expect(profile.body.prefix).toBe("Ms");
  });

  it("can still update original contact fields", async () => {
    const res = await supertest(app)
      .patch(`/api/employees/${empA.id}`)
      .set("Cookie", cookieA)
      .send({ phone: "9876543210", personal_email: "alice@personal.com" });
    expect(res.status).toBe(200);
  });
});

describe("Employee self-patch — restricted fields rejected", () => {
  it("rejects code change", async () => {
    const res = await supertest(app)
      .patch(`/api/employees/${empA.id}`)
      .set("Cookie", cookieA)
      .send({ code: "HACKED" });
    expect(res.status).toBe(400);
  });

  it("rejects role change", async () => {
    const res = await supertest(app)
      .patch(`/api/employees/${empA.id}`)
      .set("Cookie", cookieA)
      .send({ role: "ADMIN" });
    expect(res.status).toBe(400);
  });

  it("rejects doj change", async () => {
    const res = await supertest(app)
      .patch(`/api/employees/${empA.id}`)
      .set("Cookie", cookieA)
      .send({ doj: "2020-01-01" });
    expect(res.status).toBe(400);
  });

  it("rejects status change", async () => {
    const res = await supertest(app)
      .patch(`/api/employees/${empA.id}`)
      .set("Cookie", cookieA)
      .send({ status: "EXITED" });
    expect(res.status).toBe(400);
  });

  it("rejects manager_id change", async () => {
    const res = await supertest(app)
      .patch(`/api/employees/${empA.id}`)
      .set("Cookie", cookieA)
      .send({ manager_id: 999 });
    expect(res.status).toBe(400);
  });

  it("rejects resignation fields", async () => {
    const res = await supertest(app)
      .patch(`/api/employees/${empA.id}`)
      .set("Cookie", cookieA)
      .send({ resignation_type: "Voluntary" });
    expect(res.status).toBe(400);
  });

  it("rejects pan/aadhaar (statutory IDs)", async () => {
    const res = await supertest(app)
      .patch(`/api/employees/${empA.id}`)
      .set("Cookie", cookieA)
      .send({ pan: "ABCDE1234F" });
    expect(res.status).toBe(400);
  });

  it("rejects dept_id/desig_id", async () => {
    const res = await supertest(app)
      .patch(`/api/employees/${empA.id}`)
      .set("Cookie", cookieA)
      .send({ dept_id: 1 });
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════ Sub-entity CRUD ═══════════════════════

describe("Emergency contacts — self-service CRUD", () => {
  let contactId;

  it("adds an emergency contact", async () => {
    const res = await supertest(app)
      .post(`/api/employees/${empA.id}/details/emergency_contacts`)
      .set("Cookie", cookieA)
      .send({ name: "John Doe", phone: "1112223333", relationship: "Spouse", is_primary: 1 });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("John Doe");
    contactId = res.body.id;
  });

  it("lists emergency contacts", async () => {
    const res = await supertest(app)
      .get(`/api/employees/${empA.id}/details/emergency_contacts`)
      .set("Cookie", cookieA);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body.some(c => c.name === "John Doe")).toBe(true);
  });

  it("deletes an emergency contact", async () => {
    const res = await supertest(app)
      .delete(`/api/employees/${empA.id}/details/emergency_contacts/${contactId}`)
      .set("Cookie", cookieA);
    expect(res.status).toBe(200);
  });
});

describe("Family members — self-service CRUD", () => {
  it("adds a family member", async () => {
    const res = await supertest(app)
      .post(`/api/employees/${empA.id}/details/family`)
      .set("Cookie", cookieA)
      .send({ name: "Jane Doe", relationship: "Spouse", dob: "1990-05-10", is_dependent: 1 });
    expect(res.status).toBe(201);
    expect(res.body.relationship).toBe("Spouse");
  });
});

describe("Nominees — self-service CRUD", () => {
  it("adds a nominee", async () => {
    const res = await supertest(app)
      .post(`/api/employees/${empA.id}/details/nominees`)
      .set("Cookie", cookieA)
      .send({ name: "Jane Doe", relationship: "Spouse", share_pct: 100 });
    expect(res.status).toBe(201);
    expect(res.body.share_pct).toBe(100);
  });
});

describe("Education — self-service CRUD", () => {
  it("adds an education record", async () => {
    const res = await supertest(app)
      .post(`/api/employees/${empA.id}/details/education`)
      .set("Cookie", cookieA)
      .send({ degree: "B.Tech", institution: "IIT Mumbai", year: 2015, grade: "8.5 CGPA" });
    expect(res.status).toBe(201);
    expect(res.body.degree).toBe("B.Tech");
  });
});

describe("Previous employers — self-service CRUD", () => {
  it("adds a previous employer", async () => {
    const res = await supertest(app)
      .post(`/api/employees/${empA.id}/details/prev_employers`)
      .set("Cookie", cookieA)
      .send({ company: "Acme Corp", designation: "Engineer", from_date: "2015-06-01", to_date: "2020-12-31" });
    expect(res.status).toBe(201);
    expect(res.body.company).toBe("Acme Corp");
  });
});

// ═══════════════════════ RBAC ═══════════════════════

describe("Sub-entity RBAC", () => {
  it("blocks cross-employee access (Bob cannot read Alice's contacts)", async () => {
    const res = await supertest(app)
      .get(`/api/employees/${empA.id}/details/emergency_contacts`)
      .set("Cookie", cookieB);
    expect(res.status).toBe(403);
  });

  it("blocks cross-employee write (Bob cannot add to Alice's family)", async () => {
    const res = await supertest(app)
      .post(`/api/employees/${empA.id}/details/family`)
      .set("Cookie", cookieB)
      .send({ name: "Hacker", relationship: "None" });
    expect(res.status).toBe(403);
  });

  it("HR can read any employee's details", async () => {
    const res = await supertest(app)
      .get(`/api/employees/${empA.id}/details/education`)
      .set("Cookie", cookieHR);
    expect(res.status).toBe(200);
  });

  it("HR can add to any employee's details", async () => {
    const res = await supertest(app)
      .post(`/api/employees/${empB.id}/details/education`)
      .set("Cookie", cookieHR)
      .send({ degree: "MBA", institution: "IIM" });
    expect(res.status).toBe(201);
  });

  it("rejects unknown detail type", async () => {
    const res = await supertest(app)
      .get(`/api/employees/${empA.id}/details/bogus`)
      .set("Cookie", cookieA);
    expect(res.status).toBe(400);
  });

  it("requires auth", async () => {
    const res = await supertest(app)
      .get(`/api/employees/${empA.id}/details/family`);
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════ Profile GET includes sub-entities ═══════════════════════

describe("GET /employees/:id includes sub-entities for self", () => {
  it("includes emergency_contacts, family, nominees, education, prev_employers", async () => {
    const res = await supertest(app)
      .get(`/api/employees/${empA.id}`)
      .set("Cookie", cookieA);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.emergency_contacts)).toBe(true);
    expect(Array.isArray(res.body.family)).toBe(true);
    expect(Array.isArray(res.body.nominees)).toBe(true);
    expect(Array.isArray(res.body.education)).toBe(true);
    expect(Array.isArray(res.body.prev_employers)).toBe(true);
  });

  it("self can see own bank details", async () => {
    const res = await supertest(app)
      .get(`/api/employees/${empA.id}`)
      .set("Cookie", cookieA);
    expect(res.body.bank_name).toBeDefined();
  });
});

// ═══════════════════════ Audit log ═══════════════════════

describe("Audit log for self-edits", () => {
  it("logs self-patch with self: true", async () => {
    await supertest(app)
      .patch(`/api/employees/${empA.id}`)
      .set("Cookie", cookieA)
      .send({ phone: "1111111111" });

    const log = db.prepare(
      "SELECT * FROM audit_log WHERE entity = 'employees' AND entity_id = ? AND action = 'EMPLOYEE_EDIT' ORDER BY id DESC LIMIT 1"
    ).get(String(empA.id));
    expect(log).toBeDefined();
    const detail = JSON.parse(log.detail);
    expect(detail.self).toBe(true);
  });

  it("logs sub-entity add with self flag", async () => {
    await supertest(app)
      .post(`/api/employees/${empA.id}/details/emergency_contacts`)
      .set("Cookie", cookieA)
      .send({ name: "Audit Test", phone: "0000000000" });

    const log = db.prepare(
      "SELECT * FROM audit_log WHERE entity = 'employee_emergency_contacts' AND action = 'EMPLOYEE_DETAIL_ADD' ORDER BY id DESC LIMIT 1"
    ).get();
    expect(log).toBeDefined();
    const detail = JSON.parse(log.detail);
    expect(detail.self).toBe(true);
    expect(detail.employee_id).toBe(empA.id);
  });
});
