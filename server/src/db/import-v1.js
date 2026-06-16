#!/usr/bin/env node
/**
 * Genesys HRMS — v1 JSON data migration.
 * Usage: node src/db/import-v1.js <path-to-v1-export.json>
 *        npm run import:v1 -- path/to/file.json
 *
 * Maps the v1 single-file app's JSON (defaultDB shape) into SQLite.
 * Idempotent: uses INSERT OR IGNORE / ON CONFLICT for employees (by code),
 * holidays (by date), attendance (by date+employee), etc.
 * Prints a summary at the end.
 */

import "dotenv/config";
import { readFileSync } from "fs";
import { resolve } from "path";
import bcrypt from "bcryptjs";
import { getDb } from "./index.js";

const args = process.argv.slice(2);
const filePath = args[0];

if (!filePath) {
  console.error("Usage: node src/db/import-v1.js <path-to-v1-export.json>");
  process.exit(1);
}

const fullPath = resolve(filePath);
let v1;
try {
  const raw = readFileSync(fullPath, "utf-8");
  v1 = JSON.parse(raw);
} catch (e) {
  console.error(`Failed to read/parse ${fullPath}: ${e.message}`);
  process.exit(1);
}

console.log(`\nImporting v1 data from: ${fullPath}`);
console.log(`  meta.ver: ${v1.meta?.ver || "unknown"}`);
console.log(`  company:  ${v1.company?.name || "unknown"}\n`);

const db = getDb();
const counts = { departments: 0, designations: 0, locations: 0, leaveTypes: 0, employees: 0, salaryStructures: 0, holidays: 0, attendance: 0, leaves: 0, leaveAdj: 0, settings: 0 };

// ── Helper: status mapping v1→v2 ────────────────────────────────────────────
function mapStatus(v1Status) {
  const m = { "Active": "ACTIVE", "Onboarding": "ONBOARDING", "On Notice": "NOTICE", "Exited": "EXITED" };
  return m[v1Status] || "ACTIVE";
}

// ── 1. Departments ──────────────────────────────────────────────────────────
if (v1.departments?.length) {
  const ins = db.prepare("INSERT INTO departments(name) VALUES(?) ON CONFLICT(name) DO NOTHING");
  for (const d of v1.departments) { if (ins.run(d).changes) counts.departments++; }
  console.log(`✓ Departments: ${counts.departments} new`);
}

// ── 2. Designations ─────────────────────────────────────────────────────────
if (v1.designations?.length) {
  const ins = db.prepare("INSERT INTO designations(name) VALUES(?) ON CONFLICT(name) DO NOTHING");
  for (const d of v1.designations) { if (ins.run(d).changes) counts.designations++; }
  console.log(`✓ Designations: ${counts.designations} new`);
}

// ── 3. Locations ────────────────────────────────────────────────────────────
if (v1.locations?.length) {
  const ins = db.prepare("INSERT INTO locations(name) VALUES(?) ON CONFLICT(name) DO NOTHING");
  for (const l of v1.locations) { if (ins.run(l).changes) counts.locations++; }
  console.log(`✓ Locations: ${counts.locations} new`);
}

// ── 4. Leave types ──────────────────────────────────────────────────────────
if (v1.leaveTypes?.length) {
  const ins = db.prepare(
    `INSERT INTO leave_types(code, name, annual, paid, carry_fwd, max_carry)
     VALUES(?, ?, ?, ?, ?, ?)
     ON CONFLICT(code) DO UPDATE SET name=excluded.name, annual=excluded.annual, paid=excluded.paid, carry_fwd=excluded.carry_fwd, max_carry=excluded.max_carry`
  );
  for (const lt of v1.leaveTypes) {
    ins.run(lt.code, lt.name, lt.annual, lt.paid ? 1 : 0, lt.carryFwd ? 1 : 0, lt.maxCarry || 0);
    counts.leaveTypes++;
  }
  console.log(`✓ Leave types: ${counts.leaveTypes} upserted`);
}

// ── 5. Holidays ─────────────────────────────────────────────────────────────
if (v1.holidays?.length) {
  const ins = db.prepare("INSERT INTO holidays(date, name) VALUES(?, ?) ON CONFLICT(date) DO NOTHING");
  for (const h of v1.holidays) { if (ins.run(h.date, h.name).changes) counts.holidays++; }
  console.log(`✓ Holidays: ${counts.holidays} new`);
}

// ── 6. Settings ─────────────────────────────────────────────────────────────
if (v1.settings) {
  const ups = db.prepare("INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
  const s = v1.settings;
  if (s.weekOffs != null)   { ups.run("weekOffs",   JSON.stringify(s.weekOffs));   counts.settings++; }
  if (s.satOff != null)     { ups.run("satOff",      JSON.stringify(s.satOff));     counts.settings++; }
  if (s.pfEnabled != null)  { ups.run("pfEnabled",   JSON.stringify(s.pfEnabled));  counts.settings++; }
  if (s.pfCapWages != null) { ups.run("pfCapWages",  JSON.stringify(s.pfCapWages)); counts.settings++; }
  if (s.esiEnabled != null) { ups.run("esiEnabled",  JSON.stringify(s.esiEnabled)); counts.settings++; }
  if (s.ptEnabled != null)  { ups.run("ptEnabled",   JSON.stringify(s.ptEnabled));  counts.settings++; }
}
if (v1.company) {
  const ups = db.prepare("INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
  const c = v1.company;
  if (c.name)    ups.run("companyName", JSON.stringify(c.name));
  if (c.address) ups.run("address",     JSON.stringify(c.address));
  if (c.cin)     ups.run("cin",         JSON.stringify(c.cin));
  if (c.pfCode)  ups.run("pfCode",      JSON.stringify(c.pfCode));
  if (c.esiCode) ups.run("esiCode",     JSON.stringify(c.esiCode));
  if (c.tan)     ups.run("tan",         JSON.stringify(c.tan));
  counts.settings++;
}
console.log(`✓ Settings: ${counts.settings} keys updated`);

// ── 7. Employees + salary structures ────────────────────────────────────────
// Build lookup maps for dept/desig/loc
const deptMap  = Object.fromEntries(db.prepare("SELECT name, id FROM departments").all().map(r => [r.name, r.id]));
const desigMap = Object.fromEntries(db.prepare("SELECT name, id FROM designations").all().map(r => [r.name, r.id]));
const locMap   = Object.fromEntries(db.prepare("SELECT name, id FROM locations").all().map(r => [r.name, r.id]));

// v1 employees use string IDs; build a v1id→sqlite-id map
const v1ToSqlite = {};
const defaultHash = await bcrypt.hash("Welcome@123", 12);

if (v1.employees?.length) {
  const insEmp = db.prepare(
    `INSERT INTO employees(code, name, gender, dob, phone, email, personal_email, address,
       emergency_name, emergency_phone, dept_id, desig_id, location_id, doj, status,
       exit_date, exit_reason, pan, aadhaar, uan, pf_no, esi_no,
       bank_name, bank_acc, ifsc, pf_opt, esi_opt, pt_opt, tds_override,
       role, password_hash, must_change_pw, notes)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(code) DO NOTHING`
  );

  for (const e of v1.employees) {
    const email = e.email || `${e.code.toLowerCase()}@genesys.in`;
    const result = insEmp.run(
      e.code, e.name, e.gender || "Male", e.dob || null, e.phone || null,
      email, e.personalEmail || null, e.address || null,
      e.emergencyName || null, e.emergencyPhone || null,
      deptMap[e.dept] || null, desigMap[e.desig] || null, locMap[e.location] || null,
      e.doj || null, mapStatus(e.status),
      e.exitDate || null, e.exitReason || null,
      (e.pan || "").toUpperCase() || null, e.aadhaar || null,
      e.uan || null, e.pfNo || null, e.esiNo || null,
      e.bankName || null, e.bankAcc || null, (e.ifsc || "").toUpperCase() || null,
      e.pfOpt ? 1 : 0, e.esiOpt ? 1 : 0, e.ptOpt ? 1 : 0,
      e.tdsOverride !== "" && e.tdsOverride != null ? Number(e.tdsOverride) : null,
      "EMPLOYEE", defaultHash, 1, e.notes || null
    );

    // Look up the sqlite id (whether just inserted or already existed)
    const row = db.prepare("SELECT id FROM employees WHERE code = ?").get(e.code);
    if (row) v1ToSqlite[e.id] = row.id;
    if (result.changes) counts.employees++;

    // Salary structure
    if (e.salary && (e.salary.ctc > 0 || e.salary.basic > 0)) {
      const s = e.salary;
      const sqliteId = v1ToSqlite[e.id];
      if (sqliteId) {
        const existing = db.prepare(
          "SELECT id FROM salary_structures WHERE employee_id = ? AND effective_from = ?"
        ).get(sqliteId, e.doj || "2024-01-01");
        if (!existing) {
          db.prepare(
            `INSERT INTO salary_structures(employee_id, effective_from, ctc_annual, basic, hra, special, conveyance, medical, lta, other_earn, other_earn_label)
             VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            sqliteId, e.doj || "2024-01-01",
            Math.round(s.ctc || 0), Math.round(s.basic || 0), Math.round(s.hra || 0),
            Math.round(s.special || 0), Math.round(s.conveyance || 0),
            Math.round(s.medical || 0), Math.round(s.lta || 0),
            Math.round(s.otherEarn || 0), s.otherEarnLabel || ""
          );
          counts.salaryStructures++;
        }
      }
    }
  }

  // Second pass: set manager_id relationships
  for (const e of v1.employees) {
    if (e.managerId && v1ToSqlite[e.managerId] && v1ToSqlite[e.id]) {
      db.prepare("UPDATE employees SET manager_id = ? WHERE id = ?")
        .run(v1ToSqlite[e.managerId], v1ToSqlite[e.id]);
    }
  }

  console.log(`✓ Employees: ${counts.employees} new (${v1.employees.length} total in file)`);
  console.log(`✓ Salary structures: ${counts.salaryStructures} created`);
}

// ── 8. Attendance ───────────────────────────────────────────────────────────
if (v1.attendance && typeof v1.attendance === "object") {
  const ins = db.prepare(
    `INSERT INTO attendance(date, employee_id, code, marked_by)
     VALUES(?, ?, ?, 0)
     ON CONFLICT(date, employee_id) DO NOTHING`
  );
  for (const [date, marks] of Object.entries(v1.attendance)) {
    if (typeof marks !== "object") continue;
    for (const [v1EmpId, code] of Object.entries(marks)) {
      const sqliteId = v1ToSqlite[v1EmpId];
      if (sqliteId && code) {
        if (ins.run(date, sqliteId, code).changes) counts.attendance++;
      }
    }
  }
  console.log(`✓ Attendance: ${counts.attendance} records`);
}

// ── 9. Leaves ───────────────────────────────────────────────────────────────
if (v1.leaves?.length) {
  const ins = db.prepare(
    `INSERT INTO leaves(employee_id, type, date_from, date_to, half_from, half_to, days, reason, status, applied_at, acted_by, acted_at)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  // Track which v1 leave IDs we've imported to avoid re-import on second run
  const existingCount = db.prepare("SELECT COUNT(*) as c FROM leaves").get().c;
  if (existingCount === 0) {
    for (const l of v1.leaves) {
      const sqliteId = v1ToSqlite[l.empId];
      if (!sqliteId) continue;
      const status = (l.status || "pending").toUpperCase();
      const mappedStatus = status === "APPROVED" || status === "REJECTED" || status === "CANCELLED" || status === "PENDING" ? status : "PENDING";
      ins.run(
        sqliteId, l.type, l.from, l.to,
        l.halfFrom ? 1 : 0, l.halfTo ? 1 : 0,
        l.days, l.reason || null, mappedStatus,
        l.appliedOn || null,
        l.actedBy ? (v1ToSqlite[l.actedBy] || null) : null,
        l.actedOn || null
      );
      counts.leaves++;
    }
    console.log(`✓ Leaves: ${counts.leaves} imported`);
  } else {
    console.log(`✓ Leaves: skipped (${existingCount} already in DB)`);
  }
}

// ── 10. Leave adjustments ───────────────────────────────────────────────────
if (v1.leaveAdjust?.length) {
  const existingAdj = db.prepare("SELECT COUNT(*) as c FROM leave_adjustments").get().c;
  if (existingAdj === 0) {
    const ins = db.prepare(
      `INSERT INTO leave_adjustments(employee_id, year, type, delta, note, created_by, created_at)
       VALUES(?, ?, ?, ?, ?, 0, datetime('now'))`
    );
    for (const a of v1.leaveAdjust) {
      const sqliteId = v1ToSqlite[a.empId];
      if (!sqliteId) continue;
      ins.run(sqliteId, a.year, a.type, a.delta, a.note || "v1 import");
      counts.leaveAdj++;
    }
    console.log(`✓ Leave adjustments: ${counts.leaveAdj} imported`);
  } else {
    console.log(`✓ Leave adjustments: skipped (${existingAdj} already in DB)`);
  }
}

// ── Summary ─────────────────────────────────────────────────────────────────
console.log("\n═══ Import Summary ═══");
console.log(`  Departments:        ${counts.departments} new`);
console.log(`  Designations:       ${counts.designations} new`);
console.log(`  Locations:          ${counts.locations} new`);
console.log(`  Leave types:        ${counts.leaveTypes} upserted`);
console.log(`  Employees:          ${counts.employees} new`);
console.log(`  Salary structures:  ${counts.salaryStructures} created`);
console.log(`  Holidays:           ${counts.holidays} new`);
console.log(`  Attendance records: ${counts.attendance}`);
console.log(`  Leaves:             ${counts.leaves}`);
console.log(`  Leave adjustments:  ${counts.leaveAdj}`);
console.log(`  Settings keys:      ${counts.settings} updated`);
console.log("\n✅ v1 import complete\n");

process.exit(0);
