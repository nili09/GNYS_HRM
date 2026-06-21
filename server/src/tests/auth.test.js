import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { buildApp, insertEmployee } from "./helpers.js";

let app, db;

beforeEach(async () => {
  ({ app, db } = buildApp());
});

// Helper: login and return the cookie header string ready for .set("Cookie", ...)
async function loginAs(email, password = "TestPass@123") {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email, password });
  // set-cookie is an array; extract just name=value pairs for the Cookie header
  const cookieHeader = (res.headers["set-cookie"] || [])
    .map((c) => c.split(";")[0])
    .join("; ");
  return { res, cookieHeader };
}

// ── Login ─────────────────────────────────────────────────────────────────────

describe("POST /api/auth/login", () => {
  it("returns 401 for unknown email", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: "wrong" });
    expect(res.status).toBe(401);
  });

  it("returns 401 for wrong password", async () => {
    await insertEmployee(db, { email: "alice@example.com" });
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "alice@example.com", password: "WrongPass" });
    expect(res.status).toBe(401);
  });

  it("returns 200 + sets httpOnly cookie on correct credentials", async () => {
    await insertEmployee(db, { email: "alice@example.com", must_change_pw: 0 });
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "alice@example.com", password: "TestPass@123" });
    expect(res.status).toBe(200);
    expect(res.body.email).toBe("alice@example.com");
    const cookies = res.headers["set-cookie"];
    expect(cookies).toBeDefined();
    expect(cookies.some((c) => c.startsWith("hrms_token="))).toBe(true);
    expect(cookies.some((c) => /httponly/i.test(c))).toBe(true);
  });

  it("returns must_change_pw: true when flag is set", async () => {
    await insertEmployee(db, { email: "new@example.com", must_change_pw: 1 });
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "new@example.com", password: "TestPass@123" });
    expect(res.status).toBe(200);
    expect(res.body.must_change_pw).toBe(true);
  });

  it("returns 400 for missing fields", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "x@example.com" });
    expect(res.status).toBe(400);
  });
});

// ── /me ───────────────────────────────────────────────────────────────────────

describe("GET /api/auth/me", () => {
  it("returns 401 without cookie", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns user info when authenticated", async () => {
    await insertEmployee(db, { email: "bob@example.com", must_change_pw: 0 });
    const { cookieHeader } = await loginAs("bob@example.com");

    const meRes = await request(app)
      .get("/api/auth/me")
      .set("Cookie", cookieHeader);
    expect(meRes.status).toBe(200);
    expect(meRes.body.email).toBe("bob@example.com");
  });
});

// ── Logout ────────────────────────────────────────────────────────────────────

describe("POST /api/auth/logout", () => {
  it("returns 401 without cookie", async () => {
    const res = await request(app).post("/api/auth/logout");
    expect(res.status).toBe(401);
  });

  it("clears the cookie", async () => {
    await insertEmployee(db, { email: "charlie@example.com", must_change_pw: 0 });
    const { cookieHeader } = await loginAs("charlie@example.com");

    const logoutRes = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", cookieHeader);
    expect(logoutRes.status).toBe(200);

    const setCookie = logoutRes.headers["set-cookie"];
    if (setCookie) {
      expect(
        setCookie.some(
          (c) =>
            c.includes("hrms_token=;") ||
            c.includes("Expires=Thu, 01 Jan 1970") ||
            c.includes("Max-Age=0")
        )
      ).toBe(true);
    }
  });
});

// ── Change password ───────────────────────────────────────────────────────────

describe("POST /api/auth/change-password", () => {
  it("changes password and clears must_change_pw", async () => {
    await insertEmployee(db, { email: "diana@example.com", must_change_pw: 1 });
    const { cookieHeader } = await loginAs("diana@example.com");

    const changeRes = await request(app)
      .post("/api/auth/change-password")
      .set("Cookie", cookieHeader)
      .send({ current: "TestPass@123", newPassword: "NewSecure@456" });
    expect(changeRes.status).toBe(200);

    const row = db.prepare("SELECT must_change_pw FROM employees WHERE email = ?").get("diana@example.com");
    expect(row.must_change_pw).toBe(0);

    const loginOld = await request(app)
      .post("/api/auth/login")
      .send({ email: "diana@example.com", password: "TestPass@123" });
    expect(loginOld.status).toBe(401);

    const loginNew = await request(app)
      .post("/api/auth/login")
      .send({ email: "diana@example.com", password: "NewSecure@456" });
    expect(loginNew.status).toBe(200);
  });

  it("rejects wrong current password", async () => {
    await insertEmployee(db, { email: "eve@example.com", must_change_pw: 0 });
    const { cookieHeader } = await loginAs("eve@example.com");

    const res = await request(app)
      .post("/api/auth/change-password")
      .set("Cookie", cookieHeader)
      .send({ current: "WrongCurrent", newPassword: "NewSecure@456" });
    expect(res.status).toBe(400);
  });

  it("rejects short new password", async () => {
    await insertEmployee(db, { email: "frank@example.com", must_change_pw: 0 });
    const { cookieHeader } = await loginAs("frank@example.com");

    const res = await request(app)
      .post("/api/auth/change-password")
      .set("Cookie", cookieHeader)
      .send({ current: "TestPass@123", newPassword: "short" });
    expect(res.status).toBe(400);
  });
});

// ── Role gates ────────────────────────────────────────────────────────────────

describe("RBAC role gates", () => {
  it("EMPLOYEE cannot access GET /api/employees (HR-only list)", async () => {
    await insertEmployee(db, { email: "emp@example.com", role: "EMPLOYEE", must_change_pw: 0 });
    const { cookieHeader } = await loginAs("emp@example.com");

    const res = await request(app)
      .get("/api/employees")
      .set("Cookie", cookieHeader);
    expect(res.status).toBe(403);
  });

  it("HR can access GET /api/employees", async () => {
    await insertEmployee(db, { email: "hr@example.com", role: "HR", must_change_pw: 0 });
    const { cookieHeader } = await loginAs("hr@example.com");

    const res = await request(app)
      .get("/api/employees")
      .set("Cookie", cookieHeader);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("ADMIN can access GET /api/employees", async () => {
    await insertEmployee(db, { email: "admin@example.com", role: "ADMIN", must_change_pw: 0 });
    const { cookieHeader } = await loginAs("admin@example.com");

    const res = await request(app)
      .get("/api/employees")
      .set("Cookie", cookieHeader);
    expect(res.status).toBe(200);
  });

  it("EMPLOYEE can access their own profile", async () => {
    const emp = await insertEmployee(db, { email: "self@example.com", role: "EMPLOYEE", must_change_pw: 0 });
    const { cookieHeader } = await loginAs("self@example.com");

    const res = await request(app)
      .get(`/api/employees/${emp.id}`)
      .set("Cookie", cookieHeader);
    expect(res.status).toBe(200);
  });

  it("EMPLOYEE cannot access another employee's profile", async () => {
    await insertEmployee(db, { code: "EMP_A", email: "empA@example.com", role: "EMPLOYEE", must_change_pw: 0 });
    const emp2 = await insertEmployee(db, { code: "EMP_B", email: "empB@example.com", role: "EMPLOYEE", must_change_pw: 0 });
    const { cookieHeader } = await loginAs("empA@example.com");

    const res = await request(app)
      .get(`/api/employees/${emp2.id}`)
      .set("Cookie", cookieHeader);
    expect(res.status).toBe(403);
  });
});

// ── Rate limiting ─────────────────────────────────────────────────────────────

describe("Login rate limiting", () => {
  it("blocks after 3 failed attempts (rate-limit app with max=3)", async () => {
    // Use a dedicated app with a tight limit so we don't exhaust the shared-test limit.
    const { app: rlApp, db: rlDb } = buildApp({ rateLimitMax: 3 });
    const email = "ratelimit@example.com";
    await insertEmployee(rlDb, { email, must_change_pw: 0 });

    for (let i = 0; i < 3; i++) {
      await request(rlApp)
        .post("/api/auth/login")
        .send({ email, password: "wrong" });
    }

    const res = await request(rlApp)
      .post("/api/auth/login")
      .send({ email, password: "wrong" });
    expect(res.status).toBe(429);
  });
});
