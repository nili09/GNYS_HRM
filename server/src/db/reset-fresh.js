#!/usr/bin/env node
/**
 * Genesys HRMS — reset-to-fresh script.
 *
 * Wipes ALL data except ADMIN account(s), reseeds the same default leave
 * types / settings / org lists a brand-new install gets (via seed.js), clears
 * uploaded files, and prints a handoff summary — so the project can be handed
 * to another engineer with zero real/PII/test data.
 *
 * Usage:
 *   npm run reset:fresh -- --yes
 *   npm run reset:fresh -- --yes --force            (required if NODE_ENV=production)
 *   npm run reset:fresh -- --yes --reset-admin-pw    (reset preserved admin's
 *                                                      password to ADMIN_PASSWORD
 *                                                      from .env, must_change_pw=1)
 * Without --yes, prints what WOULD happen and exits without changing anything.
 */

import "dotenv/config";
import bcrypt from "bcryptjs";
import { existsSync, mkdirSync, readdirSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { getDb } from "./index.js";
import { seedLeaveTypes, seedSettings, seedOrgLists } from "./seed.js";
import { reindexAll } from "../utils/search.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Mirrors index.js's own DB_PATH default (server/src/db -> up 3 -> hrms/) so
// these resolve correctly regardless of the cwd the script is invoked from.
// (attachments.js's UPLOAD_DIR default is cwd-relative, which silently
// differs between `npm run dev` (cwd=hrms/server) and Docker (cwd=/app) —
// anchoring here avoids clearing the wrong, empty directory.)
const BACKUPS_DIR = join(__dirname, "../../../backups");
const DEFAULT_UPLOAD_DIR = join(__dirname, "../../../data/uploads");

// Tables whose default rows are reseeded from seed.js after the wipe — every
// other table ends up at zero rows.
const RESEED_TABLE_NAMES = new Set(["leave_types", "settings", "departments", "designations", "locations"]);

/**
 * Enumerate every data table actually present in the schema (sqlite_master),
 * not a hand-maintained list — so newly added tables (and ones added outside
 * schema.sql, like onboarding_policy_acks in migrate.js) are never missed.
 */
export function getResetTablePlan(db) {
  const all = db
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'search_index%'`
    )
    .all()
    .map((r) => r.name);

  const wipe = all.filter((t) => t !== "employees" && !RESEED_TABLE_NAMES.has(t));
  const reseed = all.filter((t) => RESEED_TABLE_NAMES.has(t));
  return { wipe, reseed };
}

function countRows(db, { wipe, reseed }) {
  const counts = {};
  for (const t of [...wipe, ...reseed]) {
    counts[t] = db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c;
  }
  counts.employees = db.prepare(`SELECT COUNT(*) AS c FROM employees`).get().c;
  counts.employees_admin = db.prepare(`SELECT COUNT(*) AS c FROM employees WHERE role = 'ADMIN'`).get().c;
  counts.search_index = db.prepare(`SELECT COUNT(*) AS c FROM search_index`).get().c;
  return counts;
}

/** Read-only preview of what a reset would do — used for the --yes dry-run gate. */
export function previewReset(db) {
  const plan = getResetTablePlan(db);
  return { ...plan, counts: countRows(db, plan) };
}

/**
 * The actual wipe + reseed, factored out so it's unit-testable against any
 * db handle (in-memory or file-backed). Does NOT touch the filesystem
 * (backup, uploads dir) — that's the CLI's job, since it needs a real file.
 */
export async function resetToFresh(db, { resetAdminPw = false, adminPassword } = {}) {
  if (resetAdminPw && !adminPassword) {
    throw new Error("resetAdminPw requested but no adminPassword provided");
  }

  const plan = getResetTablePlan(db);
  const before = countRows(db, plan);

  if (before.employees_admin === 0) {
    throw new Error(
      "Refusing to reset: no ADMIN-role employee exists. Reset would leave the system with no way to log in."
    );
  }

  // bcrypt is async; better-sqlite3 transactions must be synchronous, so the
  // hash is computed up front (same pattern as import.js's CSV import).
  const adminPwHash = resetAdminPw ? await bcrypt.hash(adminPassword, 12) : null;

  db.exec("PRAGMA foreign_keys = OFF");
  const wipe = db.transaction(() => {
    db.prepare(`DELETE FROM employees WHERE role != 'ADMIN'`).run();
    for (const t of plan.wipe) db.prepare(`DELETE FROM ${t}`).run();
    for (const t of plan.reseed) db.prepare(`DELETE FROM ${t}`).run();
    db.prepare(`DELETE FROM search_index`).run();

    // IDs start fresh for every wiped/reseeded table; employees' counter is
    // floored at the highest surviving (admin) id instead of zeroed, so the
    // next new employee can never collide with a preserved admin id.
    db.prepare(`DELETE FROM sqlite_sequence WHERE name != 'employees'`).run();
    db.prepare(
      `UPDATE sqlite_sequence SET seq = (SELECT COALESCE(MAX(id), 0) FROM employees) WHERE name = 'employees'`
    ).run();

    seedLeaveTypes(db);
    seedSettings(db);
    seedOrgLists(db);

    if (resetAdminPw) {
      db.prepare(`UPDATE employees SET password_hash = ?, must_change_pw = 1 WHERE role = 'ADMIN'`).run(adminPwHash);
    }
  });
  wipe();
  db.exec("PRAGMA foreign_keys = ON");

  // Informational only: if a preserved admin referenced a non-default
  // dept/designation/location that wasn't recreated, surface it rather than
  // silently mutating the admin row (which is explicitly out of scope).
  const fkViolations = db.pragma("foreign_key_check");

  reindexAll(db);

  const after = countRows(db, plan);
  const preservedAdmins = db.prepare("SELECT id, code, email FROM employees WHERE role = 'ADMIN'").all();

  return { ...plan, before, after, fkViolations, preservedAdmins };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function printSummary(label, counts, tables) {
  console.log(`\n${label}`);
  for (const t of tables) console.log(`  ${t}: ${counts[t]}`);
}

function printTableDiff(before, after, plan) {
  console.log("\nTable                            Before   After");
  console.log("-".repeat(46));
  for (const t of [...plan.wipe, ...plan.reseed].sort()) {
    console.log(`${t.padEnd(33)} ${String(before[t]).padStart(6)}  ${String(after[t]).padStart(6)}`);
  }
  console.log(`${"search_index".padEnd(33)} ${String(before.search_index).padStart(6)}  ${String(after.search_index).padStart(6)}`);
  console.log(`${"employees (total)".padEnd(33)} ${String(before.employees).padStart(6)}  ${String(after.employees).padStart(6)}`);
  console.log(`${"employees (ADMIN, preserved)".padEnd(33)} ${String(before.employees_admin).padStart(6)}  ${String(after.employees_admin).padStart(6)}`);
}

async function main() {
  const args = process.argv.slice(2);
  const YES = args.includes("--yes");
  const FORCE = args.includes("--force");
  const RESET_ADMIN_PW = args.includes("--reset-admin-pw");

  if (process.env.NODE_ENV === "production" && !FORCE) {
    console.error("Refusing to run: NODE_ENV=production. Pass --force as well if this is really intended.");
    process.exit(1);
  }

  const db = getDb();
  const preview = previewReset(db);

  if (preview.counts.employees_admin === 0) {
    console.error("Refusing to run: no ADMIN-role employee exists. Reset would leave the system with no way to log in.");
    process.exit(1);
  }

  if (!YES) {
    console.log("DRY RUN — nothing was changed. Pass --yes to actually run the reset.");
    printSummary("Would DELETE all rows from:", preview.counts, preview.wipe.sort());
    printSummary("Would DELETE then RESEED with defaults:", preview.counts, preview.reseed.sort());
    console.log(`\nWould DELETE ${preview.counts.employees - preview.counts.employees_admin} non-ADMIN employee(s).`);
    console.log(`Would PRESERVE ${preview.counts.employees_admin} ADMIN employee(s) untouched.`);
    console.log(`Would clear and rebuild the FTS search index (currently ${preview.counts.search_index} row(s)).`);
    process.exit(1);
  }

  if (RESET_ADMIN_PW && !process.env.ADMIN_PASSWORD) {
    console.error("--reset-admin-pw requires ADMIN_PASSWORD to be set in .env");
    process.exit(1);
  }

  mkdirSync(BACKUPS_DIR, { recursive: true });
  const backupPath = join(BACKUPS_DIR, `hrms-prereset-${timestamp()}.db`);
  await db.backup(backupPath);
  console.log(`✓ Pre-reset backup written: ${backupPath}`);

  const result = await resetToFresh(db, {
    resetAdminPw: RESET_ADMIN_PW,
    adminPassword: process.env.ADMIN_PASSWORD,
  });

  printTableDiff(result.before, result.after, result);

  if (result.fkViolations.length) {
    console.warn(
      `\n⚠  ${result.fkViolations.length} foreign-key reference(s) on preserved admin row(s) now point to wiped data ` +
        `(e.g. a non-default department/designation/location). Left as-is — admin row is never modified.`
    );
  }

  console.log(`\n✓ Preserved ${result.preservedAdmins.length} ADMIN account(s): ${result.preservedAdmins.map((a) => a.email).join(", ")}`);
  if (RESET_ADMIN_PW) {
    console.log("✓ Admin password reset to ADMIN_PASSWORD from .env; must_change_pw=1 (forced change at next login).");
  }

  const uploadDir = process.env.UPLOAD_DIR || DEFAULT_UPLOAD_DIR;
  let filesCleared = 0;
  if (existsSync(uploadDir)) {
    for (const f of readdirSync(uploadDir)) {
      rmSync(join(uploadDir, f), { recursive: true, force: true });
      filesCleared++;
    }
  }
  console.log(`✓ Cleared ${filesCleared} entr(y/ies) from uploads dir: ${uploadDir}`);

  console.log(`
────────────────────────────────────────────────────────────────────
HANDOFF — this database is now safe to share with another engineer.

Share:
  - The repository, without node_modules (npm install rebuilds it)
  - server/.env.example (NOT your real .env)
  - This freshened database file: ${db.name}

Do NOT share:
  - Your real server/.env (JWT_SECRET, ADMIN_PASSWORD, SMTP creds)
  - backups/ (contains the pre-reset snapshot with real data)
  - Any other copy of the database taken before this reset
  - Any files that were in the uploads directory before this run
────────────────────────────────────────────────────────────────────`);

  process.exit(0);
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
