-- Genesys HRMS — SQLite schema (idempotent: all CREATE TABLE IF NOT EXISTS)
-- Run on every boot; WAL mode set before this runs.

CREATE TABLE IF NOT EXISTS departments (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  name    TEXT    NOT NULL UNIQUE,
  active  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS designations (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  name    TEXT    NOT NULL UNIQUE,
  active  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS locations (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  name    TEXT    NOT NULL UNIQUE,
  active  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS employees (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  code             TEXT    NOT NULL UNIQUE,
  name             TEXT    NOT NULL,
  gender           TEXT    NOT NULL DEFAULT 'Male',
  dob              TEXT,
  phone            TEXT,
  email            TEXT    NOT NULL UNIQUE,
  personal_email   TEXT,
  address          TEXT,
  emergency_name   TEXT,
  emergency_phone  TEXT,
  dept_id          INTEGER REFERENCES departments(id),
  desig_id         INTEGER REFERENCES designations(id),
  location_id      INTEGER REFERENCES locations(id),
  manager_id       INTEGER REFERENCES employees(id),
  doj              TEXT    NOT NULL,
  status           TEXT    NOT NULL DEFAULT 'ONBOARDING'
                   CHECK(status IN ('ONBOARDING','ACTIVE','NOTICE','EXITED')),
  exit_date        TEXT,
  exit_reason      TEXT,
  pan              TEXT,
  aadhaar          TEXT,
  uan              TEXT,
  pf_no            TEXT,
  esi_no           TEXT,
  bank_name        TEXT,
  bank_acc         TEXT,
  ifsc             TEXT,
  pf_opt           INTEGER NOT NULL DEFAULT 1,
  esi_opt          INTEGER NOT NULL DEFAULT 1,
  pt_opt           INTEGER NOT NULL DEFAULT 1,
  tds_override     INTEGER,
  role             TEXT    NOT NULL DEFAULT 'EMPLOYEE'
                   CHECK(role IN ('EMPLOYEE','HR','ADMIN')),
  password_hash    TEXT    NOT NULL,
  must_change_pw   INTEGER NOT NULL DEFAULT 1,
  notes            TEXT,
  -- HROne extended fields (Stage 8)
  prefix                    TEXT,
  blood_group               TEXT,
  nationality               TEXT,
  employment_status         TEXT,    -- HROne confirmation state: Probation/Confirmed (NOT lifecycle status)
  other_status              TEXT,
  company                   TEXT,
  business_unit             TEXT,
  sub_branch                TEXT,
  functional_manager_code   TEXT,
  personal_status           TEXT,
  education_status          TEXT,
  work_exp_status           TEXT,
  family_status             TEXT,
  health_insurance_status   TEXT,
  nominee_status            TEXT,
  dependent_status          TEXT,
  child_info_status         TEXT,
  bank_status               TEXT,
  prev_employer_status      TEXT,
  document_status           TEXT,
  resignation_type          TEXT,
  resignation_reason        TEXT,
  requestee_remarks         TEXT,
  approver_resignation_type TEXT,
  approver_resignation_reason TEXT,
  approver_remarks          TEXT,
  login_enabled             INTEGER,
  invite_status             TEXT,
  login_status              TEXT,
  notice_period_confirm     INTEGER,  -- days
  notice_period_probation   INTEGER,  -- days
  wedding_anniversary       TEXT,     -- DATE
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS salary_structures (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id     INTEGER NOT NULL REFERENCES employees(id),
  effective_from  TEXT    NOT NULL,
  ctc_annual      INTEGER NOT NULL DEFAULT 0,
  basic           INTEGER NOT NULL DEFAULT 0,
  hra             INTEGER NOT NULL DEFAULT 0,
  special         INTEGER NOT NULL DEFAULT 0,
  conveyance      INTEGER NOT NULL DEFAULT 0,
  medical         INTEGER NOT NULL DEFAULT 0,
  lta             INTEGER NOT NULL DEFAULT 0,
  other_earn      INTEGER NOT NULL DEFAULT 0,
  other_earn_label TEXT   NOT NULL DEFAULT 'Other Allowance',
  UNIQUE(employee_id, effective_from)
);

CREATE TABLE IF NOT EXISTS leave_types (
  code       TEXT    PRIMARY KEY,
  name       TEXT    NOT NULL,
  annual     REAL    NOT NULL DEFAULT 0,
  paid       INTEGER NOT NULL DEFAULT 1,
  carry_fwd  INTEGER NOT NULL DEFAULT 0,
  max_carry  REAL    NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS leaves (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id  INTEGER NOT NULL REFERENCES employees(id),
  type         TEXT    NOT NULL REFERENCES leave_types(code),
  date_from    TEXT    NOT NULL,
  date_to      TEXT    NOT NULL,
  half_from    INTEGER NOT NULL DEFAULT 0,
  half_to      INTEGER NOT NULL DEFAULT 0,
  days         REAL    NOT NULL,
  reason       TEXT,
  status       TEXT    NOT NULL DEFAULT 'PENDING'
               CHECK(status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
  applied_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  acted_by     INTEGER REFERENCES employees(id),
  acted_at     TEXT,
  act_comment  TEXT
);

CREATE TABLE IF NOT EXISTS leave_adjustments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  year        INTEGER NOT NULL,
  type        TEXT    NOT NULL REFERENCES leave_types(code),
  delta       REAL    NOT NULL,
  note        TEXT,
  created_by  INTEGER REFERENCES employees(id),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS holidays (
  date  TEXT PRIMARY KEY,
  name  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attendance (
  date         TEXT    NOT NULL,
  employee_id  INTEGER NOT NULL REFERENCES employees(id),
  code         TEXT    NOT NULL CHECK(code IN ('P','A','HD','WFH','OD')),
  marked_by    INTEGER REFERENCES employees(id),
  marked_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(date, employee_id)
);

CREATE TABLE IF NOT EXISTS payroll_runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  month         TEXT    NOT NULL UNIQUE,
  status        TEXT    NOT NULL DEFAULT 'DRAFT'
                CHECK(status IN ('DRAFT','FINAL')),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  finalized_at  TEXT
);

CREATE TABLE IF NOT EXISTS payroll_lines (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id       INTEGER NOT NULL REFERENCES payroll_runs(id),
  employee_id  INTEGER NOT NULL REFERENCES employees(id),
  payable      REAL    NOT NULL DEFAULT 0,
  month_days   INTEGER NOT NULL DEFAULT 0,
  earn_basic   INTEGER NOT NULL DEFAULT 0,
  earn_hra     INTEGER NOT NULL DEFAULT 0,
  earn_conv    INTEGER NOT NULL DEFAULT 0,
  earn_medical INTEGER NOT NULL DEFAULT 0,
  earn_lta     INTEGER NOT NULL DEFAULT 0,
  earn_special INTEGER NOT NULL DEFAULT 0,
  earn_other   INTEGER NOT NULL DEFAULT 0,
  gross        INTEGER NOT NULL DEFAULT 0,
  ded_pf       INTEGER NOT NULL DEFAULT 0,
  ded_esi      INTEGER NOT NULL DEFAULT 0,
  ded_pt       INTEGER NOT NULL DEFAULT 0,
  ded_tds      INTEGER NOT NULL DEFAULT 0,
  net          INTEGER NOT NULL DEFAULT 0,
  er_epf       INTEGER NOT NULL DEFAULT 0,
  er_eps       INTEGER NOT NULL DEFAULT 0,
  er_esi       INTEGER NOT NULL DEFAULT 0,
  esi_covered  INTEGER NOT NULL DEFAULT 0,
  UNIQUE(run_id, employee_id)
);

CREATE TABLE IF NOT EXISTS settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL  -- stored as JSON
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  at         TEXT    NOT NULL DEFAULT (datetime('now')),
  actor_id   INTEGER REFERENCES employees(id),
  action     TEXT    NOT NULL,
  entity     TEXT    NOT NULL,
  entity_id  TEXT,
  detail     TEXT    -- JSON
);

CREATE TABLE IF NOT EXISTS docs_checklist (
  employee_id  INTEGER NOT NULL REFERENCES employees(id),
  key          TEXT    NOT NULL,
  done         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(employee_id, key)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_employees_email      ON employees(email);
CREATE INDEX IF NOT EXISTS idx_employees_manager    ON employees(manager_id);
CREATE INDEX IF NOT EXISTS idx_employees_status     ON employees(status);
CREATE INDEX IF NOT EXISTS idx_leaves_employee      ON leaves(employee_id);
CREATE INDEX IF NOT EXISTS idx_leaves_status        ON leaves(status);
CREATE INDEX IF NOT EXISTS idx_attendance_employee  ON attendance(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date      ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_payroll_lines_run    ON payroll_lines(run_id);
CREATE INDEX IF NOT EXISTS idx_salary_employee      ON salary_structures(employee_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity         ON audit_log(entity, entity_id);
