import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { getDb } from "./db/index.js";
import { attachUser, enforcePasswordChange } from "./middleware/auth.js";
import authRouter from "./routes/auth.js";
import employeesRouter from "./routes/employees.js";
import importRouter from "./routes/import.js";
import { departmentsRouter, designationsRouter, locationsRouter } from "./routes/org.js";
import attendanceRouter from "./routes/attendance.js";
import holidaysRouter from "./routes/holidays.js";
import leavesRouter from "./routes/leaves.js";
import eventsRouter from "./routes/events.js";
import auditRouter from "./routes/audit.js";
import payrollRouter from "./routes/payroll.js";
import dashboardRouter from "./routes/dashboard.js";
import settingsRouter from "./routes/settings.js";
import expensesRouter from "./routes/expenses.js";

// ── Guard: refuse to boot with default/missing JWT_SECRET ────────────────────
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === "changeme") {
  console.error("❌  JWT_SECRET is missing or set to the default value 'changeme'.");
  console.error("   Set a strong secret in your .env file and restart.");
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 8321;

// Trust proxy for secure cookies behind nginx/caddy
if (process.env.TRUST_PROXY === "1") {
  app.set("trust proxy", 1);
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === "production" ? undefined : false,
}));
app.use(express.json({ limit: "5mb" })); // CSV payloads can be large
app.use(cookieParser());

// ── Request logging ─────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    if (req.path !== "/api/events" && req.path !== "/api/health") {
      console.log(`${req.method} ${req.path} ${res.statusCode} ${ms}ms${req.user ? ` user=${req.user.id}` : ""}`);
    }
  });
  next();
});

// Attach DB to app.locals so routes can use req.app.locals.db
app.locals.db = getDb();

// Attach user on every request
app.use(attachUser);
// Block everything but password-change endpoints while a reset is pending
app.use(enforcePasswordChange);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/auth", authRouter);
// Mount the more-specific /import route BEFORE /api/employees so a GET to
// /api/employees/import would never accidentally hit the `/:id` handler.
app.use("/api/employees/import", importRouter);
app.use("/api/employees", employeesRouter);
app.use("/api/departments", departmentsRouter);
app.use("/api/designations", designationsRouter);
app.use("/api/locations", locationsRouter);
app.use("/api/attendance", attendanceRouter);
app.use("/api/holidays",    holidaysRouter);
app.use("/api/leaves",      leavesRouter);
app.use("/api/events", eventsRouter);
app.use("/api/audit", auditRouter);
app.use("/api/payroll", payrollRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/expenses", expensesRouter);

// Health check
app.get("/api/health", (req, res) => res.json({ ok: true }));

// ── Static web app (production) ───────────────────────────────────────────────
if (process.env.NODE_ENV === "production") {
  const { default: path } = await import("path");
  const { fileURLToPath } = await import("url");
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const webDist = path.join(__dirname, "../../web/dist");
  app.use(express.static(webDist));
  app.get("*", (req, res) => {
    res.sendFile(path.join(webDist, "index.html"));
  });
}

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Genesys HRMS server running on port ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || "development"}`);
});

export default app;
