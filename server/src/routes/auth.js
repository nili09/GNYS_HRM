import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { signToken } from "../utils/jwt.js";
import { audit } from "../utils/audit.js";
import { requireAuth, cookieOpts, COOKIE_NAME } from "../middleware/auth.js";
import { LoginSchema, ChangePasswordSchema } from "@hrms/shared/schemas";

/**
 * Factory — creates a fresh router with its own rate-limiter instance.
 * Call without arguments for production; pass { rateLimitMax } in tests
 * to avoid the shared-module-level limiter problem.
 */
export function createAuthRouter(opts = {}) {
  const router = Router();

  // Each factory call gets a fresh MemoryStore → no cross-test contamination.
  const loginLimiter = rateLimit({
    windowMs: 60_000,
    max: opts.rateLimitMax ?? 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many login attempts. Try again in a minute." },
    keyGenerator: (req) => req.ip,
  });

  /* POST /auth/login */
  router.post("/login", loginLimiter, async (req, res) => {
    let loginBody = req.body;
    if (loginBody?.email && !loginBody.email.includes("@")) {
      loginBody = { ...loginBody, email: loginBody.email + "@igenesys.com" };
    }
    const parse = LoginSchema.safeParse(loginBody);
    if (!parse.success) return res.status(400).json({ error: "Invalid input" });

    const { email, password } = parse.data;
    const db = req.app.locals.db;

    const employee = db
      .prepare("SELECT * FROM employees WHERE email = ?")
      .get(email);

    if (!employee) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, employee.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Deny access to terminated or explicitly-disabled accounts. Checked AFTER
    // the password verifies so the response can't be used to enumerate which
    // emails map to disabled accounts. login_enabled is NULL for most rows
    // (treated as enabled); only an explicit 0 disables login.
    if (employee.status === "EXITED" || employee.login_enabled === 0) {
      return res.status(403).json({ error: "Account is disabled. Contact HR." });
    }

    const token = await signToken({ sub: String(employee.id), role: employee.role });
    res.cookie(COOKIE_NAME, token, cookieOpts(req));

    audit(db, {
      actorId: employee.id,
      action: "LOGIN",
      entity: "employees",
      entityId: employee.id,
    });

    res.json({
      id: employee.id,
      name: employee.name,
      email: employee.email,
      role: employee.role,
      must_change_pw: !!employee.must_change_pw,
    });
  });

  /* POST /auth/logout */
  router.post("/logout", requireAuth, (req, res) => {
    audit(req.app.locals.db, {
      actorId: req.user.id,
      action: "LOGOUT",
      entity: "employees",
      entityId: req.user.id,
    });
    res.clearCookie(COOKIE_NAME, { path: "/" });
    res.json({ ok: true });
  });

  /* GET /auth/me */
  router.get("/me", requireAuth, (req, res) => {
    res.json({
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      must_change_pw: !!req.user.must_change_pw,
    });
  });

  /* POST /auth/change-password — own password change */
  router.post("/change-password", requireAuth, async (req, res) => {
    const parse = ChangePasswordSchema.safeParse(req.body);
    if (!parse.success)
      return res.status(400).json({ error: parse.error.issues[0].message });

    const { current, newPassword } = parse.data;
    const db = req.app.locals.db;

    const row = db
      .prepare("SELECT password_hash FROM employees WHERE id = ?")
      .get(req.user.id);

    const valid = await bcrypt.compare(current, row.password_hash);
    if (!valid) return res.status(400).json({ error: "Current password is incorrect" });

    const hash = await bcrypt.hash(newPassword, 12);
    db.prepare(
      "UPDATE employees SET password_hash = ?, must_change_pw = 0, updated_at = datetime('now') WHERE id = ?"
    ).run(hash, req.user.id);

    audit(db, {
      actorId: req.user.id,
      action: "CHANGE_PASSWORD",
      entity: "employees",
      entityId: req.user.id,
    });

    res.json({ ok: true });
  });

  return router;
}

// Production default export — one router, one limiter, created at module load.
export default createAuthRouter();
