/**
 * Regression tests for the security-review hardening:
 *  - terminated / disabled accounts cannot authenticate
 *  - newly-created employees get a random temp password (never the code)
 *  - forced password change is enforced server-side
 *  - holiday list requires authentication
 */
import { describe, test, expect, beforeAll } from "vitest";
import supertest from "supertest";
import bcrypt from "bcryptjs";
import { buildApp, insertEmployee, loginAs } from "./helpers.js";

describe("Auth hardening — disabled accounts", () => {
  let app, db;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    await insertEmployee(db, { email: "exited@test.com", code: "EX1", status: "EXITED", exit_date: "2025-01-01" });
    await insertEmployee(db, { email: "disabled@test.com", code: "DIS1", login_enabled: 0 });
    await insertEmployee(db, { email: "active@test.com", code: "ACT1", status: "ACTIVE" });
  });

  test("EXITED employee cannot log in (403)", async () => {
    const res = await supertest(app).post("/api/auth/login")
      .send({ email: "exited@test.com", password: "TestPass@123" });
    expect(res.status).toBe(403);
  });

  test("login_enabled=0 employee cannot log in (403)", async () => {
    const res = await supertest(app).post("/api/auth/login")
      .send({ email: "disabled@test.com", password: "TestPass@123" });
    expect(res.status).toBe(403);
  });

  test("ACTIVE employee with login_enabled NULL can still log in", async () => {
    const res = await supertest(app).post("/api/auth/login")
      .send({ email: "active@test.com", password: "TestPass@123" });
    expect(res.status).toBe(200);
  });

  test("wrong password on a disabled account still returns 401 (no state oracle)", async () => {
    const res = await supertest(app).post("/api/auth/login")
      .send({ email: "exited@test.com", password: "WrongPass" });
    expect(res.status).toBe(401);
  });
});

describe("Auth hardening — initial password is random, not the code", () => {
  let app, db, hrCookie;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    await insertEmployee(db, { email: "hr@hard.com", code: "HRH1", role: "HR" });
    hrCookie = await loginAs(app, "hr@hard.com");
  });

  test("create returns a temp password that is NOT the employee code", async () => {
    const res = await supertest(app).post("/api/employees").set("Cookie", hrCookie)
      .send({ code: "GIL9001", name: "Fresh Hire", gender: "Male", email: "fresh@igenesys.com", doj: "2025-01-01" });
    expect(res.status).toBe(201);
    expect(res.body.tempPassword).toBeTruthy();
    expect(res.body.tempPassword).not.toBe("GIL9001");

    // The code must NOT be a valid password; the returned temp password must be.
    const row = db.prepare("SELECT password_hash, must_change_pw FROM employees WHERE code='GIL9001'").get();
    expect(await bcrypt.compare("GIL9001", row.password_hash)).toBe(false);
    expect(await bcrypt.compare(res.body.tempPassword, row.password_hash)).toBe(true);
    expect(row.must_change_pw).toBe(1);
  });
});

describe("Auth hardening — forced password change is enforced", () => {
  let app, db;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    await insertEmployee(db, { email: "force@test.com", code: "FRC1", role: "HR", must_change_pw: 1 });
  });

  test("a must_change_pw user is blocked from data endpoints but can change password", async () => {
    const cookie = await loginAs(app, "force@test.com");

    // Blocked from a normal endpoint…
    const blocked = await supertest(app).get("/api/employees").set("Cookie", cookie);
    expect(blocked.status).toBe(403);
    expect(blocked.body.mustChangePassword).toBe(true);

    // …but /auth/me and change-password are reachable.
    const me = await supertest(app).get("/api/auth/me").set("Cookie", cookie);
    expect(me.status).toBe(200);

    const changed = await supertest(app).post("/api/auth/change-password").set("Cookie", cookie)
      .send({ current: "TestPass@123", newPassword: "BrandNew@999" });
    expect(changed.status).toBe(200);

    // After changing, the same session can reach data endpoints.
    const ok = await supertest(app).get("/api/employees").set("Cookie", cookie);
    expect(ok.status).toBe(200);
  });
});

describe("Auth hardening — holiday list requires auth", () => {
  test("GET /api/holidays without a cookie is rejected", async () => {
    const { app } = buildApp();
    const res = await supertest(app).get("/api/holidays");
    expect(res.status).toBe(401);
  });
});
