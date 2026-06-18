import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { buildApp, insertEmployee, loginAs } from "./helpers.js";
import { sendMail, sendWelcomeEmail, _setTransportForTest, resetTransport } from "../utils/mailer.js";

let app, db;

beforeEach(async () => {
  ({ app, db } = buildApp());
  resetTransport();
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
});

afterEach(() => {
  resetTransport();
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
});

// ── Mailer util ──────────────────────────────────────────────────────────────

describe("mailer util", () => {
  it("skips gracefully when SMTP is not configured", async () => {
    const result = await sendMail({ to: "a@b.com", subject: "test", text: "hi" });
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("smtp_not_configured");
  });

  it("sends via transport when configured", async () => {
    const sent = [];
    _setTransportForTest({
      sendMail: async (opts) => { sent.push(opts); return { messageId: "123" }; },
    });
    process.env.SMTP_HOST = "smtp.test";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_FROM = "test@test.com";

    const result = await sendMail({ to: "a@b.com", subject: "test", text: "hi" });
    expect(result.status).toBe("sent");
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("a@b.com");
    expect(sent[0].subject).toBe("test");
  });

  it("returns failed on transport error without throwing", async () => {
    _setTransportForTest({
      sendMail: async () => { throw new Error("SMTP down"); },
    });
    process.env.SMTP_HOST = "smtp.test";
    process.env.SMTP_PORT = "587";

    const result = await sendMail({ to: "a@b.com", subject: "x", text: "x" });
    expect(result.status).toBe("failed");
    expect(result.reason).toContain("SMTP down");
  });

  it("sendWelcomeEmail includes credentials in body", async () => {
    const sent = [];
    _setTransportForTest({
      sendMail: async (opts) => { sent.push(opts); return {}; },
    });
    process.env.SMTP_HOST = "smtp.test";
    process.env.SMTP_PORT = "587";

    await sendWelcomeEmail({ to: "emp@igenesys.com", name: "Alice", loginEmail: "emp@igenesys.com", tempPassword: "Abc123xyz" });
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain("Abc123xyz");
    expect(sent[0].text).toContain("emp@igenesys.com");
    expect(sent[0].html).toContain("Alice");
  });
});

// ── Unique passwords in CSV import ──────────────────────────────────────────

describe("CSV import unique passwords", () => {
  it("each imported employee gets a unique password hash", async () => {
    const hr = await insertEmployee(db, { email: "hr@igenesys.com", role: "HR" });
    const cookie = await loginAs(app, "hr@igenesys.com");

    const res = await request(app)
      .post("/api/employees/import")
      .set("Cookie", cookie)
      .send({
        headers: ["Name", "Code", "Email", "DOJ", "Gender"],
        mapping: { name: 0, code: 1, email: 2, doj: 3, gender: 4 },
        rows: [
          ["Alice A", "IMP001", "alice@igenesys.com", "2024-01-01", "Female"],
          ["Bob B",   "IMP002", "bob@igenesys.com",   "2024-01-01", "Male"],
        ],
        dupMode: "skip",
      });

    expect(res.status).toBe(200);
    expect(res.body.added).toBe(2);

    const alice = db.prepare("SELECT password_hash, must_change_pw FROM employees WHERE code = 'IMP001'").get();
    const bob = db.prepare("SELECT password_hash, must_change_pw FROM employees WHERE code = 'IMP002'").get();

    expect(alice.must_change_pw).toBe(1);
    expect(bob.must_change_pw).toBe(1);
    expect(alice.password_hash).not.toBe(bob.password_hash);
    expect(alice.password_hash).not.toContain("Welcome@123");
  });

  it("import response includes emailResults", async () => {
    const hr = await insertEmployee(db, { email: "hr2@igenesys.com", role: "HR" });
    const cookie = await loginAs(app, "hr2@igenesys.com");

    const res = await request(app)
      .post("/api/employees/import")
      .set("Cookie", cookie)
      .send({
        headers: ["Name", "Code", "Email", "DOJ", "Gender"],
        mapping: { name: 0, code: 1, email: 2, doj: 3, gender: 4 },
        rows: [["Carol C", "IMP003", "carol@igenesys.com", "2024-01-01", "Female"]],
        dupMode: "skip",
      });

    expect(res.status).toBe(200);
    expect(res.body.emailResults).toBeDefined();
    expect(res.body.emailResults.skipped).toBeGreaterThanOrEqual(0);
  });

  it("no two employees share the same password", async () => {
    const hr = await insertEmployee(db, { email: "hr3@igenesys.com", role: "HR" });
    const cookie = await loginAs(app, "hr3@igenesys.com");

    await request(app)
      .post("/api/employees/import")
      .set("Cookie", cookie)
      .send({
        headers: ["Name", "Code", "Email", "DOJ", "Gender"],
        mapping: { name: 0, code: 1, email: 2, doj: 3, gender: 4 },
        rows: [
          ["D1", "IMP010", "d1@igenesys.com", "2024-01-01", "Male"],
          ["D2", "IMP011", "d2@igenesys.com", "2024-01-01", "Male"],
          ["D3", "IMP012", "d3@igenesys.com", "2024-01-01", "Male"],
        ],
        dupMode: "skip",
      });

    const hashes = db.prepare(
      "SELECT password_hash FROM employees WHERE code IN ('IMP010','IMP011','IMP012')"
    ).all().map(r => r.password_hash);

    const unique = new Set(hashes);
    expect(unique.size).toBe(3);
  });
});

// ── Employee create welcome email ───────────────────────────────────────────

describe("employee create emailStatus", () => {
  it("returns emailStatus in create response", async () => {
    const hr = await insertEmployee(db, { email: "hr4@igenesys.com", role: "HR" });
    const cookie = await loginAs(app, "hr4@igenesys.com");

    const res = await request(app)
      .post("/api/employees")
      .set("Cookie", cookie)
      .send({
        code: "NEW001",
        name: "New Employee",
        email: "new001@igenesys.com",
        gender: "Male",
        doj: "2024-06-01",
        role: "EMPLOYEE",
      });

    expect(res.status).toBe(201);
    expect(res.body.emailStatus).toBeDefined();
    expect(res.body.tempPassword).toBeTruthy();
    expect(res.body.tempPassword.length).toBeGreaterThanOrEqual(8);
  });
});

// ── Import with mock transport ──────────────────────────────────────────────

describe("CSV import with mock SMTP", () => {
  it("sends welcome emails and reports counts", async () => {
    const sent = [];
    _setTransportForTest({
      sendMail: async (opts) => { sent.push(opts); return {}; },
    });
    process.env.SMTP_HOST = "smtp.test";
    process.env.SMTP_PORT = "587";

    const hr = await insertEmployee(db, { email: "hr5@igenesys.com", role: "HR" });
    const cookie = await loginAs(app, "hr5@igenesys.com");

    const res = await request(app)
      .post("/api/employees/import")
      .set("Cookie", cookie)
      .send({
        headers: ["Name", "Code", "Email", "DOJ", "Gender"],
        mapping: { name: 0, code: 1, email: 2, doj: 3, gender: 4 },
        rows: [
          ["Eve E", "IMP020", "eve@igenesys.com", "2024-01-01", "Female"],
          ["Frank F", "IMP021", "frank@igenesys.com", "2024-01-01", "Male"],
        ],
        dupMode: "skip",
      });

    expect(res.status).toBe(200);
    expect(res.body.emailResults.sent).toBe(2);
    expect(sent).toHaveLength(2);
    expect(sent[0].to).toBe("eve@igenesys.com");
    expect(sent[1].to).toBe("frank@igenesys.com");
    expect(sent[0].subject).toContain("account is ready");
  });

  it("reports failed emails without blocking import", async () => {
    let callCount = 0;
    _setTransportForTest({
      sendMail: async () => {
        callCount++;
        if (callCount === 1) throw new Error("Connection refused");
        return {};
      },
    });
    process.env.SMTP_HOST = "smtp.test";
    process.env.SMTP_PORT = "587";

    const hr = await insertEmployee(db, { email: "hr6@igenesys.com", role: "HR" });
    const cookie = await loginAs(app, "hr6@igenesys.com");

    const res = await request(app)
      .post("/api/employees/import")
      .set("Cookie", cookie)
      .send({
        headers: ["Name", "Code", "Email", "DOJ", "Gender"],
        mapping: { name: 0, code: 1, email: 2, doj: 3, gender: 4 },
        rows: [
          ["Gail G", "IMP030", "gail@igenesys.com", "2024-01-01", "Female"],
          ["Hank H", "IMP031", "hank@igenesys.com", "2024-01-01", "Male"],
        ],
        dupMode: "skip",
      });

    expect(res.status).toBe(200);
    expect(res.body.added).toBe(2);
    expect(res.body.emailResults.failed).toBe(1);
    expect(res.body.emailResults.sent).toBe(1);

    const gail = db.prepare("SELECT id FROM employees WHERE code = 'IMP030'").get();
    const hank = db.prepare("SELECT id FROM employees WHERE code = 'IMP031'").get();
    expect(gail).toBeTruthy();
    expect(hank).toBeTruthy();
  });
});
