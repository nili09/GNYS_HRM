import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Run idempotent migration against the database.
 * Called on every server boot.
 */
export function migrate(db) {
  // Enable WAL mode and foreign keys
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

  const sql = readFileSync(join(__dirname, "schema.sql"), "utf8");
  db.exec(sql);

  // Stage 8: idempotent ALTER-ADD-COLUMN for HROne extended fields
  migrateHROneFields(db);
}

/**
 * Idempotent column additions — SQLite has no IF NOT EXISTS for ALTER TABLE,
 * so we read pragma table_info and only ADD columns that are missing.
 */
function migrateHROneFields(db) {
  const existing = new Set(
    db.prepare("PRAGMA table_info(employees)").all().map(c => c.name)
  );

  const newCols = [
    ["prefix", "TEXT"],
    ["blood_group", "TEXT"],
    ["nationality", "TEXT"],
    ["employment_status", "TEXT"],
    ["other_status", "TEXT"],
    ["company", "TEXT"],
    ["business_unit", "TEXT"],
    ["sub_branch", "TEXT"],
    ["functional_manager_code", "TEXT"],
    ["personal_status", "TEXT"],
    ["education_status", "TEXT"],
    ["work_exp_status", "TEXT"],
    ["family_status", "TEXT"],
    ["health_insurance_status", "TEXT"],
    ["nominee_status", "TEXT"],
    ["dependent_status", "TEXT"],
    ["child_info_status", "TEXT"],
    ["bank_status", "TEXT"],
    ["prev_employer_status", "TEXT"],
    ["document_status", "TEXT"],
    ["resignation_type", "TEXT"],
    ["resignation_reason", "TEXT"],
    ["requestee_remarks", "TEXT"],
    ["approver_resignation_type", "TEXT"],
    ["approver_resignation_reason", "TEXT"],
    ["approver_remarks", "TEXT"],
    ["login_enabled", "INTEGER"],
    ["invite_status", "TEXT"],
    ["login_status", "TEXT"],
    ["notice_period_confirm", "INTEGER"],
    ["notice_period_probation", "INTEGER"],
    ["wedding_anniversary", "TEXT"],
    ["profile_photo_id", "INTEGER"],
  ];

  for (const [col, type] of newCols) {
    if (!existing.has(col)) {
      db.exec(`ALTER TABLE employees ADD COLUMN ${col} ${type}`);
    }
  }

  // Stage 26: resignation tracking + onboarding policy acknowledgments
  const resignCols = [
    ["resignation_status", "TEXT"],
    ["resignation_submitted_at", "TEXT"],
    ["resignation_intended_last_day", "TEXT"],
    ["resignation_acted_by", "INTEGER"],
    ["resignation_acted_at", "TEXT"],
  ];
  for (const [col, type] of resignCols) {
    if (!existing.has(col)) {
      db.exec(`ALTER TABLE employees ADD COLUMN ${col} ${type}`);
    }
  }

  db.exec(`CREATE TABLE IF NOT EXISTS onboarding_policy_acks (
    employee_id  INTEGER NOT NULL REFERENCES employees(id),
    policy_key   TEXT    NOT NULL,
    acked_at     TEXT    NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY(employee_id, policy_key)
  )`);
}
