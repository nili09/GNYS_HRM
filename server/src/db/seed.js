#!/usr/bin/env node
/**
 * Genesys HRMS seed script.
 * Usage:
 *   node src/db/seed.js            — seed admin + leave types + settings
 *   node src/db/seed.js --sample   — also insert 10 demo employees (stubbed)
 */

import "dotenv/config";
import bcrypt from "bcryptjs";
import { getDb } from "./index.js";

const args = process.argv.slice(2);
const SAMPLE = args.includes("--sample");

const db = getDb();

// ── 1. Default leave types ────────────────────────────────────────────────────
const leaveTypes = [
  { code: "EL",  name: "Earned / Privilege Leave",  annual: 21,  paid: 1, carry_fwd: 1, max_carry: 30 },
  { code: "CL",  name: "Casual Leave",               annual: 7,   paid: 1, carry_fwd: 0, max_carry: 0  },
  { code: "SL",  name: "Sick Leave",                 annual: 7,   paid: 1, carry_fwd: 0, max_carry: 0  },
  { code: "LWP", name: "Leave Without Pay",          annual: 0,   paid: 0, carry_fwd: 0, max_carry: 0  },
  { code: "ML",  name: "Maternity Leave",            annual: 182, paid: 1, carry_fwd: 0, max_carry: 0  },
  { code: "PL",  name: "Paternity Leave",            annual: 5,   paid: 1, carry_fwd: 0, max_carry: 0  },
];

const upsertLeaveType = db.prepare(
  `INSERT INTO leave_types(code, name, annual, paid, carry_fwd, max_carry)
   VALUES(@code, @name, @annual, @paid, @carry_fwd, @max_carry)
   ON CONFLICT(code) DO UPDATE SET
     name=excluded.name, annual=excluded.annual, paid=excluded.paid,
     carry_fwd=excluded.carry_fwd, max_carry=excluded.max_carry`
);

for (const lt of leaveTypes) upsertLeaveType.run(lt);
console.log(`✓ ${leaveTypes.length} leave types seeded`);

// ── 2. Default settings ───────────────────────────────────────────────────────
const defaults = {
  weekOffs:    JSON.stringify([0]),         // Sunday
  satOff:      JSON.stringify("none"),
  pfEnabled:   JSON.stringify(true),
  pfCapWages:  JSON.stringify(true),
  esiEnabled:  JSON.stringify(true),
  ptEnabled:   JSON.stringify(true),
  company: JSON.stringify({
    name:    "Genesys International Corporation Ltd",
    address: "Mumbai, Maharashtra, India",
    cin:     "",
    pfCode:  "",
    esiCode: "",
    tan:     "",
  }),
};

const upsertSetting = db.prepare(
  `INSERT INTO settings(key, value) VALUES(?, ?)
   ON CONFLICT(key) DO NOTHING`
);

for (const [key, value] of Object.entries(defaults)) {
  upsertSetting.run(key, value);
}
console.log(`✓ Default settings seeded`);

// ── 3. Default departments / designations / locations ─────────────────────────
const departments = [
  "Geospatial Services", "Survey & Mapping", "Engineering", "Technology",
  "Human Resources", "Finance & Accounts", "Sales & BD", "Admin & Facilities",
];
const designations = [
  "GIS Analyst", "Sr. GIS Analyst", "Survey Engineer", "Project Manager",
  "Software Engineer", "Sr. Software Engineer", "Team Lead", "HR Executive",
  "HR Manager", "Accounts Executive", "Finance Manager", "BD Manager",
  "Office Admin", "VP", "Director",
];
const locations = ["Mumbai HO", "Bengaluru", "Delhi NCR", "Hyderabad", "Site Office"];

const upsertDept  = db.prepare(`INSERT INTO departments(name)  VALUES(?) ON CONFLICT(name) DO NOTHING`);
const upsertDesig = db.prepare(`INSERT INTO designations(name) VALUES(?) ON CONFLICT(name) DO NOTHING`);
const upsertLoc   = db.prepare(`INSERT INTO locations(name)    VALUES(?) ON CONFLICT(name) DO NOTHING`);

for (const d of departments)  upsertDept.run(d);
for (const d of designations) upsertDesig.run(d);
for (const l of locations)    upsertLoc.run(l);
console.log(`✓ Departments / designations / locations seeded`);

// ── 4. Expense policies & categories ──────────────────────────────────────
const expensePolicies = [
  { name: "Standard Travel Policy", per_diem_limit: 5000, requires_receipt: 1 },
  { name: "Office Supplies Policy", per_diem_limit: null, requires_receipt: 0 },
];

const upsertPolicy = db.prepare(
  `INSERT INTO expense_policies(name, per_diem_limit, requires_receipt)
   VALUES(@name, @per_diem_limit, @requires_receipt)
   ON CONFLICT(name) DO NOTHING`
);

for (const p of expensePolicies) upsertPolicy.run(p);
console.log(`✓ ${expensePolicies.length} expense policies seeded`);

const travelPolicyId = db.prepare("SELECT id FROM expense_policies WHERE name = 'Standard Travel Policy'").get()?.id;
const officePolicyId = db.prepare("SELECT id FROM expense_policies WHERE name = 'Office Supplies Policy'").get()?.id;

const expenseCategories = [
  { name: "Travel — Local Conveyance", policy_id: travelPolicyId },
  { name: "Travel — Hotel / Lodging", policy_id: travelPolicyId },
  { name: "Travel — Meals & Food", policy_id: travelPolicyId },
  { name: "Office Supplies", policy_id: officePolicyId },
  { name: "Client Entertainment", policy_id: null },
];

const upsertCategory = db.prepare(
  `INSERT INTO expense_categories(name, policy_id)
   VALUES(@name, @policy_id)
   ON CONFLICT(name) DO NOTHING`
);

for (const c of expenseCategories) upsertCategory.run(c);
console.log(`✓ ${expenseCategories.length} expense categories seeded`);

// ── 5. Admin user ─────────────────────────────────────────────────────────────
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_NAME     = process.env.ADMIN_NAME || "HR Admin";

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.warn("⚠  ADMIN_EMAIL / ADMIN_PASSWORD not set in .env — skipping admin creation");
} else {
  const existing = db.prepare("SELECT id FROM employees WHERE email = ?").get(ADMIN_EMAIL);
  if (existing) {
    console.log(`✓ Admin already exists (${ADMIN_EMAIL})`);
  } else {
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    const hrDeptId = db.prepare("SELECT id FROM departments WHERE name = 'Human Resources'").get()?.id;

    db.prepare(
      `INSERT INTO employees(code, name, gender, email, doj, status, role, password_hash, must_change_pw, dept_id)
       VALUES(?, ?, 'Male', ?, date('now'), 'ACTIVE', 'ADMIN', ?, 1, ?)`
    ).run("ADMIN001", ADMIN_NAME, ADMIN_EMAIL, hash, hrDeptId ?? null);

    console.log(`✓ Admin created: ${ADMIN_EMAIL} (must change password on first login)`);
  }
}

// ── 6. Sample data (--sample flag) ────────────────────────────────────────────
if (SAMPLE) {
  console.log("ℹ  --sample flag noted — sample employee generation stubbed for Stage 2");
}

console.log("✅ Seed complete");
process.exit(0);
