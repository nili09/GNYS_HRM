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

-- ── Expense & Reimbursement ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS expense_policies (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  name    TEXT    NOT NULL UNIQUE,
  per_diem_limit  INTEGER,
  requires_receipt INTEGER NOT NULL DEFAULT 1,
  active  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS expense_categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL UNIQUE,
  policy_id  INTEGER REFERENCES expense_policies(id),
  active     INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS expenses (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id      INTEGER NOT NULL REFERENCES employees(id),
  category_id      INTEGER NOT NULL REFERENCES expense_categories(id),
  amount           INTEGER NOT NULL,
  date             TEXT    NOT NULL,
  description      TEXT,
  receipt_filename TEXT,
  status           TEXT    NOT NULL DEFAULT 'PENDING'
                   CHECK(status IN ('PENDING','APPROVED','REJECTED','SETTLED')),
  applied_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  acted_by         INTEGER REFERENCES employees(id),
  acted_at         TEXT,
  act_comment      TEXT,
  settled_in_month TEXT
);

CREATE TABLE IF NOT EXISTS advance_requests (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id  INTEGER NOT NULL REFERENCES employees(id),
  amount       INTEGER NOT NULL,
  reason       TEXT,
  status       TEXT    NOT NULL DEFAULT 'PENDING'
               CHECK(status IN ('PENDING','APPROVED','REJECTED','SETTLED')),
  applied_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  acted_by     INTEGER REFERENCES employees(id),
  acted_at     TEXT
);

-- ── Recruitment ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS job_openings (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT    NOT NULL,
  dept_id      INTEGER REFERENCES departments(id),
  location_id  INTEGER REFERENCES locations(id),
  description  TEXT,
  requirements TEXT,
  positions    INTEGER NOT NULL DEFAULT 1,
  status       TEXT    NOT NULL DEFAULT 'DRAFT'
               CHECK(status IN ('DRAFT','OPEN','ON_HOLD','CLOSED')),
  created_by   INTEGER REFERENCES employees(id),
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  closed_at    TEXT
);

CREATE TABLE IF NOT EXISTS candidates (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT    NOT NULL,
  email            TEXT    NOT NULL,
  phone            TEXT,
  resume_filename  TEXT,
  source           TEXT,
  notes            TEXT,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS applications (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id        INTEGER NOT NULL REFERENCES job_openings(id),
  candidate_id  INTEGER NOT NULL REFERENCES candidates(id),
  status        TEXT    NOT NULL DEFAULT 'APPLIED'
                CHECK(status IN ('APPLIED','SCREENING','INTERVIEW','OFFERED','HIRED','REJECTED')),
  applied_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS interviews (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id  INTEGER NOT NULL REFERENCES applications(id),
  interviewer_id  INTEGER NOT NULL REFERENCES employees(id),
  scheduled_at    TEXT    NOT NULL,
  duration_mins   INTEGER NOT NULL DEFAULT 60,
  mode            TEXT    NOT NULL DEFAULT 'IN_PERSON'
                  CHECK(mode IN ('IN_PERSON','VIDEO','PHONE')),
  feedback        TEXT,
  rating          INTEGER CHECK(rating IS NULL OR (rating >= 1 AND rating <= 5)),
  status          TEXT    NOT NULL DEFAULT 'SCHEDULED'
                  CHECK(status IN ('SCHEDULED','COMPLETED','CANCELLED'))
);

CREATE TABLE IF NOT EXISTS offer_letters (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id  INTEGER NOT NULL UNIQUE REFERENCES applications(id),
  ctc_offered     INTEGER NOT NULL,
  joining_date    TEXT    NOT NULL,
  status          TEXT    NOT NULL DEFAULT 'DRAFT'
                  CHECK(status IN ('DRAFT','SENT','ACCEPTED','DECLINED')),
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ── Performance Management ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS review_cycles (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  year        INTEGER NOT NULL,
  quarter     INTEGER CHECK(quarter IS NULL OR (quarter >= 1 AND quarter <= 4)),
  start_date  TEXT    NOT NULL,
  end_date    TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'DRAFT'
              CHECK(status IN ('DRAFT','ACTIVE','CLOSED')),
  created_by  INTEGER REFERENCES employees(id),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS goals (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id     INTEGER NOT NULL REFERENCES employees(id),
  cycle_id        INTEGER NOT NULL REFERENCES review_cycles(id),
  title           TEXT    NOT NULL,
  description     TEXT,
  weight          REAL    NOT NULL DEFAULT 1.0,
  target_value    TEXT,
  actual_value    TEXT,
  status          TEXT    NOT NULL DEFAULT 'PENDING'
                  CHECK(status IN ('PENDING','IN_PROGRESS','COMPLETED','DEFERRED')),
  self_rating     INTEGER CHECK(self_rating IS NULL OR (self_rating >= 1 AND self_rating <= 5)),
  manager_rating  INTEGER CHECK(manager_rating IS NULL OR (manager_rating >= 1 AND manager_rating <= 5)),
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reviews (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id   INTEGER NOT NULL REFERENCES employees(id),
  cycle_id      INTEGER NOT NULL REFERENCES review_cycles(id),
  reviewer_id   INTEGER NOT NULL REFERENCES employees(id),
  relationship  TEXT    NOT NULL DEFAULT 'MANAGER'
                CHECK(relationship IN ('SELF','MANAGER','PEER','SKIP_LEVEL')),
  overall_rating INTEGER CHECK(overall_rating IS NULL OR (overall_rating >= 1 AND overall_rating <= 5)),
  strengths     TEXT,
  improvements  TEXT,
  comments      TEXT,
  status        TEXT    NOT NULL DEFAULT 'PENDING'
                CHECK(status IN ('PENDING','SUBMITTED')),
  submitted_at  TEXT
);

CREATE TABLE IF NOT EXISTS one_on_ones (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  manager_id  INTEGER NOT NULL REFERENCES employees(id),
  date        TEXT    NOT NULL,
  notes       TEXT,
  action_items TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ── Employee Engagement ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS announcements (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT    NOT NULL,
  body          TEXT    NOT NULL,
  priority      TEXT    NOT NULL DEFAULT 'NORMAL'
                CHECK(priority IN ('NORMAL','IMPORTANT','URGENT')),
  published_by  INTEGER NOT NULL REFERENCES employees(id),
  published_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  expires_at    TEXT,
  active        INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS surveys (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  description TEXT,
  status      TEXT    NOT NULL DEFAULT 'DRAFT'
              CHECK(status IN ('DRAFT','ACTIVE','CLOSED')),
  created_by  INTEGER NOT NULL REFERENCES employees(id),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  closes_at   TEXT,
  anonymous   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS survey_questions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  survey_id  INTEGER NOT NULL REFERENCES surveys(id),
  question   TEXT    NOT NULL,
  type       TEXT    NOT NULL DEFAULT 'RATING'
             CHECK(type IN ('RATING','TEXT','CHOICE')),
  options    TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS survey_responses (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  survey_id    INTEGER NOT NULL REFERENCES surveys(id),
  employee_id  INTEGER REFERENCES employees(id),
  question_id  INTEGER NOT NULL REFERENCES survey_questions(id),
  answer       TEXT    NOT NULL,
  submitted_at TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(survey_id, employee_id, question_id)
);

CREATE TABLE IF NOT EXISTS badges (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE,
  description TEXT,
  icon        TEXT    NOT NULL DEFAULT 'star'
);

CREATE TABLE IF NOT EXISTS recognitions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  from_employee  INTEGER NOT NULL REFERENCES employees(id),
  to_employee    INTEGER NOT NULL REFERENCES employees(id),
  badge_id       INTEGER NOT NULL REFERENCES badges(id),
  message        TEXT    NOT NULL,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ── Asset Management ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS asset_types (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  name    TEXT    NOT NULL UNIQUE,
  active  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS vendors (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT    NOT NULL,
  contact_email  TEXT,
  contact_phone  TEXT,
  active         INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS assets (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_type_id  INTEGER NOT NULL REFERENCES asset_types(id),
  name           TEXT    NOT NULL,
  serial_no      TEXT    UNIQUE,
  purchase_date  TEXT,
  purchase_cost  INTEGER,
  vendor_id      INTEGER REFERENCES vendors(id),
  status         TEXT    NOT NULL DEFAULT 'AVAILABLE'
                 CHECK(status IN ('AVAILABLE','ASSIGNED','IN_REPAIR','RETIRED')),
  notes          TEXT,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS asset_assignments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id      INTEGER NOT NULL REFERENCES assets(id),
  employee_id   INTEGER NOT NULL REFERENCES employees(id),
  assigned_by   INTEGER NOT NULL REFERENCES employees(id),
  assigned_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  returned_at   TEXT,
  is_temporary  INTEGER NOT NULL DEFAULT 0,
  notes         TEXT
);

-- ── Helpdesk ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ticket_categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE,
  assigned_to INTEGER REFERENCES employees(id),
  active      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS tickets (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id  INTEGER NOT NULL REFERENCES employees(id),
  category_id  INTEGER NOT NULL REFERENCES ticket_categories(id),
  subject      TEXT    NOT NULL,
  description  TEXT    NOT NULL,
  priority     TEXT    NOT NULL DEFAULT 'MEDIUM'
               CHECK(priority IN ('LOW','MEDIUM','HIGH','URGENT')),
  status       TEXT    NOT NULL DEFAULT 'OPEN'
               CHECK(status IN ('OPEN','IN_PROGRESS','RESOLVED','CLOSED')),
  assigned_to  INTEGER REFERENCES employees(id),
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  resolved_at  TEXT
);

CREATE TABLE IF NOT EXISTS ticket_comments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id   INTEGER NOT NULL REFERENCES tickets(id),
  author_id   INTEGER NOT NULL REFERENCES employees(id),
  body        TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
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
CREATE INDEX IF NOT EXISTS idx_expenses_employee    ON expenses(employee_id);
CREATE INDEX IF NOT EXISTS idx_expenses_status      ON expenses(status);
CREATE INDEX IF NOT EXISTS idx_advance_employee     ON advance_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_advance_status       ON advance_requests(status);
CREATE INDEX IF NOT EXISTS idx_job_openings_status  ON job_openings(status);
CREATE INDEX IF NOT EXISTS idx_applications_job     ON applications(job_id);
CREATE INDEX IF NOT EXISTS idx_applications_cand    ON applications(candidate_id);
CREATE INDEX IF NOT EXISTS idx_interviews_app       ON interviews(application_id);
CREATE INDEX IF NOT EXISTS idx_interviews_viewer    ON interviews(interviewer_id);
CREATE INDEX IF NOT EXISTS idx_goals_employee       ON goals(employee_id);
CREATE INDEX IF NOT EXISTS idx_goals_cycle          ON goals(cycle_id);
CREATE INDEX IF NOT EXISTS idx_reviews_employee     ON reviews(employee_id);
CREATE INDEX IF NOT EXISTS idx_reviews_cycle        ON reviews(cycle_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer     ON reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_one_on_ones_emp      ON one_on_ones(employee_id);
CREATE INDEX IF NOT EXISTS idx_one_on_ones_mgr      ON one_on_ones(manager_id);
CREATE INDEX IF NOT EXISTS idx_announcements_active  ON announcements(active);
CREATE INDEX IF NOT EXISTS idx_surveys_status        ON surveys(status);
CREATE INDEX IF NOT EXISTS idx_survey_responses_survey ON survey_responses(survey_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_emp  ON survey_responses(employee_id);
CREATE INDEX IF NOT EXISTS idx_recognitions_to       ON recognitions(to_employee);
CREATE INDEX IF NOT EXISTS idx_recognitions_from     ON recognitions(from_employee);
CREATE INDEX IF NOT EXISTS idx_recognitions_created  ON recognitions(created_at);
CREATE INDEX IF NOT EXISTS idx_assets_type           ON assets(asset_type_id);
CREATE INDEX IF NOT EXISTS idx_assets_status         ON assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_vendor         ON assets(vendor_id);
CREATE INDEX IF NOT EXISTS idx_asset_assign_asset    ON asset_assignments(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_assign_emp      ON asset_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_tickets_employee      ON tickets(employee_id);
CREATE INDEX IF NOT EXISTS idx_tickets_category      ON tickets(category_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status        ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned      ON tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket ON ticket_comments(ticket_id);

-- ── Full-Text Search ──────────────────────────────────────────────────────
CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
  entity,
  entity_id,
  title,
  body,
  meta,
  tokenize='porter unicode61'
);
