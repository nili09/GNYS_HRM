import { verifyToken, signToken } from "../utils/jwt.js";
import { getDb } from "../db/index.js";

const COOKIE_NAME = "hrms_token";

/**
 * Attach req.user from the JWT cookie.
 * Sets req.user = { id, email, role, must_change_pw } or leaves undefined.
 */
export async function attachUser(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return next();
  try {
    const payload = await verifyToken(token);
    // Re-read from DB to get fresh must_change_pw + role
    const db = req.app.locals.db || getDb();
    const row = db
      .prepare("SELECT id, email, name, role, status, must_change_pw FROM employees WHERE id = ?")
      .get(payload.sub);
    if (row) {
      req.user = row;
      // Slide the cookie (re-issue token with fresh expiry)
      const newToken = await signToken({ sub: String(row.id), role: row.role });
      res.cookie(COOKIE_NAME, newToken, cookieOpts(req));
    }
  } catch {
    // expired / invalid — clear cookie
    res.clearCookie(COOKIE_NAME);
  }
  next();
}

export function cookieOpts(req) {
  const secure = process.env.TRUST_PROXY === "1";
  return {
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: 12 * 60 * 60 * 1000,
    path: "/",
  };
}

/** Require authenticated session */
export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Unauthenticated" });
  next();
}

// Endpoints a user with a pending forced password change may still reach.
const PW_CHANGE_ALLOWLIST = new Set([
  "/api/auth/me",
  "/api/auth/change-password",
  "/api/auth/logout",
]);

/**
 * Enforce "force password change at first login" server-side. While
 * must_change_pw is set, every API call except the allowlist above is blocked,
 * so the temporary credentials cannot be used to read data or mutate state —
 * they can only be spent on setting a real password.
 */
export function enforcePasswordChange(req, res, next) {
  if (!req.user || !req.user.must_change_pw) return next();
  if (PW_CHANGE_ALLOWLIST.has(req.path)) return next();
  return res.status(403).json({ error: "Password change required", mustChangePassword: true });
}

/** Require a specific role (or array of roles) */
export function requireRole(...roles) {
  const allowed = roles.flat();
  return [
    requireAuth,
    (req, res, next) => {
      if (!allowed.includes(req.user.role))
        return res.status(403).json({ error: "Forbidden" });
      next();
    },
  ];
}

/** HR or ADMIN */
export const requireHR = requireRole("HR", "ADMIN");

/** ADMIN only */
export const requireAdmin = requireRole("ADMIN");

/**
 * Allow if req.user.id === parseInt(req.params.id)  OR  role is HR/ADMIN.
 * Attach `req.isSelf` for convenience.
 */
export function requireSelfOrHR(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Unauthenticated" });
  const targetId = parseInt(req.params.id, 10);
  const isSelf = req.user.id === targetId;
  const isHrAdmin = ["HR", "ADMIN"].includes(req.user.role);
  if (!isSelf && !isHrAdmin) return res.status(403).json({ error: "Forbidden" });
  req.isSelf = isSelf;
  next();
}

/**
 * Returns true if actorId is the direct manager of employeeId.
 */
export function isManagerOf(db, actorId, employeeId) {
  const row = db
    .prepare("SELECT manager_id FROM employees WHERE id = ? AND status != 'EXITED'")
    .get(employeeId);
  return row?.manager_id === actorId;
}

export { COOKIE_NAME };
