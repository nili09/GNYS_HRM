#!/usr/bin/env node
/**
 * Genesys HRMS seed script.
 * Usage:
 *   node src/db/seed.js            — seed admin + leave types + settings
 *   node src/db/seed.js --sample   — also insert 10 demo employees (stubbed)
 *
 * seedLeaveTypes/seedSettings/seedOrgLists are exported so reset-fresh.js can
 * reuse the exact default lists without duplicating them.
 */

import "dotenv/config";
import bcrypt from "bcryptjs";
import { fileURLToPath } from "url";
import { getDb } from "./index.js";
import { reindexAll } from "../utils/search.js";
import { currentYearIST } from "@hrms/shared/datetime";
import { FIXED_HOLIDAYS } from "../routes/holidays.js";

// ── 1. Default leave types ────────────────────────────────────────────────────
export function seedLeaveTypes(db) {
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
}

// ── 2. Default settings ───────────────────────────────────────────────────────
export function seedSettings(db) {
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
}

// ── 3. Default departments / designations / locations ─────────────────────────
export function seedOrgLists(db) {
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
}

// ── 4. Recognition badges ────────────────────────────────────────────────────
export function seedBadges(db) {
  const badges = [
    { name: "Star Performer",      description: "Consistently exceeds expectations",                         icon: "star" },
    { name: "Team Player",         description: "Great collaborator who lifts the whole team",                icon: "group" },
    { name: "Above & Beyond",      description: "Goes the extra mile without being asked",                   icon: "rocket_launch" },
    { name: "Customer Hero",       description: "Delivers outstanding client experiences",                   icon: "support_agent" },
    { name: "Bright Idea",         description: "Brings creative, impactful solutions",                      icon: "lightbulb" },
    { name: "Mentor",              description: "Guides and develops teammates",                              icon: "school" },
    { name: "Safety First",        description: "Champions workplace safety and well-being",                  icon: "health_and_safety" },
    { name: "Perfect Attendance",  description: "Exemplary attendance and punctuality",                       icon: "event_available" },
    { name: "1-Year Anniversary",  description: "Celebrating 1 year with the organisation",                  icon: "celebration" },
    { name: "3-Year Anniversary",  description: "Celebrating 3 years with the organisation",                 icon: "celebration" },
    { name: "5-Year Anniversary",  description: "Celebrating 5 years with the organisation",                 icon: "celebration" },
    { name: "10-Year Anniversary", description: "Celebrating a decade with the organisation",                icon: "emoji_events" },
    { name: "Welcome Aboard",      description: "Warm welcome to a new team member",                         icon: "waving_hand" },
  ];

  const upsert = db.prepare(
    `INSERT INTO badges(name, description, icon)
     VALUES(@name, @description, @icon)
     ON CONFLICT(name) DO UPDATE SET description=excluded.description, icon=excluded.icon`
  );
  for (const b of badges) upsert.run(b);
  console.log(`✓ ${badges.length} recognition badges seeded`);
}

// ── 5. Survey templates (always DRAFT) ───────────────────────────────────────
export function seedSurveyTemplates(db) {
  const admin = db.prepare("SELECT id FROM employees WHERE role = 'ADMIN' ORDER BY id LIMIT 1").get();
  if (!admin) {
    console.log("⚠  No ADMIN employee — skipping survey template seeding");
    return;
  }

  const templates = [
    {
      title: "Employee Net Promoter Score (eNPS)",
      description: "Measure how likely employees are to recommend this organisation as a workplace.",
      questions: [
        { question: "On a scale of 0–10, how likely are you to recommend this organisation as a place to work?", type: "RATING", sort_order: 1 },
        { question: "What is the primary reason for your score?", type: "TEXT", sort_order: 2 },
      ],
    },
    {
      title: "Monthly Pulse Check",
      description: "Quick monthly check-in on engagement, workload, and support.",
      questions: [
        { question: "I feel motivated and engaged in my work this month.", type: "RATING", sort_order: 1 },
        { question: "My workload is manageable.", type: "RATING", sort_order: 2 },
        { question: "I have the tools and support I need to do my job well.", type: "RATING", sort_order: 3 },
        { question: "Any feedback or suggestions for the team?", type: "TEXT", sort_order: 4 },
      ],
    },
    {
      title: "Onboarding 30-Day Feedback",
      description: "Gather new-hire impressions after their first 30 days.",
      questions: [
        { question: "My onboarding experience prepared me well for my role.", type: "RATING", sort_order: 1 },
        { question: "I feel welcomed by my team and manager.", type: "RATING", sort_order: 2 },
        { question: "The tools, access, and resources I needed were available on time.", type: "RATING", sort_order: 3 },
        { question: "What could we improve about the onboarding experience?", type: "TEXT", sort_order: 4 },
      ],
    },
    {
      title: "Exit Survey",
      description: "Understand why departing employees chose to leave.",
      questions: [
        { question: "Overall, how would you rate your experience working here?", type: "RATING", sort_order: 1 },
        { question: "My manager supported my growth and development.", type: "RATING", sort_order: 2 },
        { question: "I felt my compensation and benefits were fair.", type: "RATING", sort_order: 3 },
        { question: "What is your primary reason for leaving?", type: "TEXT", sort_order: 4 },
        { question: "What could the organisation do differently to retain employees?", type: "TEXT", sort_order: 5 },
      ],
    },
  ];

  const insertSurvey = db.prepare(
    `INSERT INTO surveys(title, description, status, created_by, anonymous)
     VALUES(@title, @description, 'DRAFT', @created_by, 1)`
  );
  const insertQuestion = db.prepare(
    `INSERT INTO survey_questions(survey_id, question, type, sort_order)
     VALUES(@survey_id, @question, @type, @sort_order)`
  );

  for (const t of templates) {
    const exists = db.prepare("SELECT id FROM surveys WHERE title = ?").get(t.title);
    if (exists) continue;
    const { lastInsertRowid } = insertSurvey.run({ title: t.title, description: t.description, created_by: admin.id });
    for (const q of t.questions) insertQuestion.run({ survey_id: lastInsertRowid, ...q });
  }
  console.log(`✓ ${templates.length} survey templates seeded (DRAFT)`);
}

// ── 6. Fixed-date holidays for current + next year ───────────────────────────
export function seedHolidays(db, year) {
  // Movable festivals (Diwali, Holi, Eid, Ganesh Chaturthi, etc.) shift
  // every year — HR should add those manually via the holidays UI.
  // Only fixed-date national + Maharashtra holidays are seeded here.
  const yr = year ?? currentYearIST();
  const years = [yr, yr + 1];
  const insert = db.prepare("INSERT OR IGNORE INTO holidays(date, name) VALUES(?,?)");
  let added = 0;
  for (const y of years) {
    for (const [md, name] of FIXED_HOLIDAYS) {
      added += insert.run(`${y}-${md}`, name).changes;
    }
  }
  console.log(`✓ Holidays seeded for ${years.join(", ")} (${added} new, ${years.length * FIXED_HOLIDAYS.length - added} already existed)`);
}

// ── 7. Starter content for empty modules ─────────────────────────────────────
export function seedStarterContent(db) {
  // Expense policies + categories
  const upsertPolicy = db.prepare(
    `INSERT INTO expense_policies(name, per_diem_limit, requires_receipt)
     VALUES(@name, @per_diem_limit, @requires_receipt)
     ON CONFLICT(name) DO NOTHING`
  );
  for (const p of [
    { name: "Standard Travel Policy", per_diem_limit: 5000, requires_receipt: 1 },
    { name: "Office Supplies Policy", per_diem_limit: null, requires_receipt: 0 },
  ]) upsertPolicy.run(p);

  const travelPolicyId = db.prepare("SELECT id FROM expense_policies WHERE name = 'Standard Travel Policy'").get()?.id;
  const officePolicyId = db.prepare("SELECT id FROM expense_policies WHERE name = 'Office Supplies Policy'").get()?.id;

  const upsertExpCat = db.prepare(
    `INSERT INTO expense_categories(name, policy_id) VALUES(@name, @policy_id) ON CONFLICT(name) DO NOTHING`
  );
  for (const c of [
    { name: "Travel", policy_id: travelPolicyId },
    { name: "Meals", policy_id: travelPolicyId },
    { name: "Office Supplies", policy_id: officePolicyId },
    { name: "Software", policy_id: null },
  ]) upsertExpCat.run(c);

  // Asset types
  const upsertAssetType = db.prepare("INSERT INTO asset_types(name) VALUES(?) ON CONFLICT(name) DO NOTHING");
  for (const t of ["Laptop", "Monitor", "Phone", "Access Card"]) upsertAssetType.run(t);

  // Ticket categories
  const upsertTicketCat = db.prepare("INSERT INTO ticket_categories(name) VALUES(?) ON CONFLICT(name) DO NOTHING");
  for (const t of ["IT", "HR", "Payroll", "Facilities"]) upsertTicketCat.run(t);

  console.log("✓ Starter content seeded (expense categories, asset types, ticket categories)");
}

async function main() {
  const args = process.argv.slice(2);
  const SAMPLE = args.includes("--sample");

  const db = getDb();

  seedLeaveTypes(db);
  seedSettings(db);
  seedOrgLists(db);

  seedBadges(db);
  seedHolidays(db);
  seedStarterContent(db);

  // ── Admin user (must exist before survey templates, which need created_by) ──
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

  seedSurveyTemplates(db);

  // ── Rebuild search index ─────────────────────────────────────────────────────
  reindexAll(db);
  console.log("✓ Search index rebuilt");

  // ── 8. Sample data (--sample flag) ────────────────────────────────────────────
  if (SAMPLE) {
    console.log("ℹ  --sample flag noted — sample employee generation stubbed for Stage 2");
  }

  console.log("✅ Seed complete");
  process.exit(0);
}

// Run only when executed directly (`node src/db/seed.js`), not when imported
// for its exported functions (e.g. by reset-fresh.js).
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
