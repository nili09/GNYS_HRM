# BUGS-FOUND.md — Genesys HRMS Bug Audit

> Generated: 2026-06-22 by systematic code audit (no app code changed).
> Existing suite: 786/786 green. Web build: clean.

---

## P0 — Critical

### BUG-001: Leave settings key mismatch — leave day counts ignore real calendar settings
- **Area:** Leave / Business Logic
- **File:** `server/src/routes/leaves.js:36`
- **Reproduce:** Configure `satOff = "2_4"` in settings (via seed or PUT /settings). Apply for leave spanning a 2nd/4th Saturday. The server counts that Saturday as a working day instead of skipping it.
- **Expected:** `getSettings()` reads the actual `weekOffs` and `satOff` settings keys (as attendance.js and payroll.js do).
- **Actual:** `getSettings()` in leaves.js reads `WHERE key = 'calendar'` — a key that does not exist anywhere in the codebase (seed.js, import-v1.js, and AdminSettings all store individual keys `weekOffs` and `satOff`). The function always falls back to `{ weekOffs: [0], satOff: "none" }`, ignoring the real Saturday-off configuration.
- **Impact:** Leave `days` count is wrong for any org with Saturday offs. Over-balance checks, working-day counts, and leave balance consumed are all miscalculated. Affects every leave application.
- **Root cause:** leaves.js was written expecting a consolidated `calendar` settings key, but every other module uses individual keys.
- **Repro test:** `server/src/tests/bug-repro.test.js` — BUG-001

### BUG-002: Leave cancel uses UTC date instead of Asia/Kolkata
- **Area:** Leave / Timezone
- **File:** `server/src/routes/leaves.js:418`
- **Reproduce:** Server running in UTC (Docker default). At 01:00 IST (19:30 UTC previous day), an employee tries to cancel an APPROVED leave that starts today (IST).
- **Expected:** Cancellation blocked because `date_from` is today, and the leave has already started.
- **Actual:** `new Date().toISOString().slice(0, 10)` returns yesterday's UTC date. `leave.date_from <= today` evaluates to false (today's date > yesterday), so the cancellation is allowed.
- **Impact:** Employees can cancel leaves that have already started, during the 00:00–05:30 IST window. Attendance records for the day may already reflect the leave.
- **Root cause:** `new Date().toISOString()` returns UTC; spec §2 says "Timezone: Asia/Kolkata fixed." Dashboard.js correctly uses `toLocaleString("en-US", { timeZone: "Asia/Kolkata" })` but leaves.js does not.
- **Repro test:** `server/src/tests/bug-repro.test.js` — BUG-002

### BUG-003: Payroll run creation is not atomic — orphan run on failure
- **Area:** Payroll / Data Integrity
- **File:** `server/src/routes/payroll.js:178-220`
- **Reproduce:** Create a payroll run for a month where `generateLines()` throws (e.g., a corrupt salary structure causing an error in `computePayLine`). The `payroll_runs` row is committed (line 178-180), then `generateLines` at line 183 throws before the lines transaction at 193-220 executes.
- **Expected:** If line generation fails, no run row should exist (atomic operation).
- **Actual:** An empty `payroll_runs` row exists with status='DRAFT' and zero lines. The same month cannot be retried (409 "Run already exists"). HR must find and delete the orphan run manually (no delete endpoint exists).
- **Impact:** Blocks payroll processing for that month until manual DB intervention.
- **Root cause:** The run INSERT, `generateLines()`, and line INSERT are three separate operations; only the line INSERT is in a transaction.
- **Repro test:** `server/src/tests/bug-repro.test.js` — BUG-003

---

## P1 — High

### BUG-004: Leave overlap check is not transactional — race condition
- **Area:** Leave / Data Integrity
- **File:** `server/src/routes/leaves.js:186-210`
- **Reproduce:** Two concurrent `POST /leaves` for the same employee with overlapping dates. Both pass the `findOverlap` check (line 187) before either's INSERT (line 204) commits.
- **Expected:** Only one request succeeds; the other is rejected with 409 overlap.
- **Actual:** Both requests succeed, creating two overlapping leaves. No DB constraint prevents this.
- **Impact:** Duplicate leave grants for the same dates. Payroll and attendance calculations affected. SQLite WAL mode serializes writes but the overlap SELECT runs outside the write lock.
- **Root cause:** Check-then-act without a transaction.

### BUG-005: Leave balance over-balance check has same race condition
- **Area:** Leave / Data Integrity
- **File:** `server/src/routes/leaves.js:192-201`
- **Reproduce:** Employee has 2 CL remaining. Two concurrent requests each apply for 2 CL. Both see 2 available, both succeed, balance goes to -2.
- **Expected:** One succeeds, the other gets the over-balance warning.
- **Actual:** Both succeed silently.
- **Root cause:** Same check-then-act pattern as BUG-004.

### BUG-006: Array query params crash or silently fail on multiple routes
- **Area:** Web Layer / Input Validation
- **Files:** Multiple routes (see details)
- **Reproduce:** `GET /leaves?status=PENDING&status=APPROVED` — Express delivers `req.query.status` as `["PENDING", "APPROVED"]`. Code calls `.toUpperCase()` on the array, producing `"PENDING,APPROVED"` which matches nothing.
- **Expected:** Either handle as array (like employees.js does) or reject with 400.
- **Actual:** Silently returns empty results.
- **Affected routes:**
  - `leaves.js:297` — `status.toUpperCase()`
  - `expenses.js:195,334` — `status.toUpperCase()`
  - `recruitment.js:27,151,237` — `status.toUpperCase()`
  - `helpdesk.js:63` — `status` used directly
  - `performance.js:22` — `status.toUpperCase()`
- **Note:** `employees.js:88` correctly handles this with `Array.isArray()`.
- **Repro test:** `server/src/tests/bug-repro.test.js` — BUG-006

### BUG-007: Payroll salary structure tiebreaker missing — nondeterministic for same effective_from
- **Area:** Payroll / Business Logic
- **File:** `server/src/routes/payroll.js:60-64`
- **Reproduce:** Create two salary structures for the same employee with the same `effective_from` date but different amounts. Run payroll.
- **Expected:** Deterministic result — pick the most recently inserted structure (`ORDER BY effective_from DESC, id DESC`).
- **Actual:** `ORDER BY effective_from DESC LIMIT 1` — SQLite returns an arbitrary row when `effective_from` values tie.
- **Impact:** Payroll amounts are unpredictable when HR corrects a salary structure with the same effective date.
- **Repro test:** `server/src/tests/bug-repro.test.js` — BUG-007

### BUG-008: GET /leaves has no pagination — unbounded result set
- **Area:** Leave / Performance
- **File:** `server/src/routes/leaves.js:273-306`
- **Reproduce:** HR calls `GET /leaves` with no filters on an org with years of leave history.
- **Expected:** Paginated response with LIMIT/OFFSET (like GET /employees).
- **Actual:** Returns all leave records. For 1000 employees × 10 leaves/year × 3 years = 30,000 rows in a single response.
- **Impact:** Slow response, high memory usage, potential timeout for large datasets.

### BUG-009: Leave balances N+1 query pattern
- **Area:** Leave / Performance
- **File:** `server/src/routes/leaves.js:464-483`
- **Reproduce:** HR calls `GET /leave-balances` with no targetId (all employees). For each of N employees, two queries run (`getEmployeeLeaves` + `getAdjustments`).
- **Expected:** Batched queries (like the salary query fix in Stage 31).
- **Actual:** 2N+1 queries. With 1050 employees, that's 2101 queries per request.
- **Impact:** Slow response for HR leave management page.

---

## P2 — Medium

### BUG-010: PUT /settings has no schema validation
- **Area:** Settings / Input Validation
- **File:** `server/src/routes/settings.js:24-29`
- **Reproduce:** ADMIN sends `PUT /settings` with `{ "weekOffs": "not-an-array", "badKey": 42 }`.
- **Expected:** Rejected with a validation error — only known setting keys allowed, with correct types.
- **Actual:** Accepted and stored. Any key-value pair can be written to the settings table.
- **Impact:** Settings corruption. ADMIN-only so not externally exploitable, but accidental typos persist.

### BUG-011: Default year in leave-balances and holidays uses server timezone
- **Area:** Leave, Holidays / Timezone
- **Files:** `leaves.js:446`, `holidays.js:67`
- **Reproduce:** Server in UTC, 00:30 IST on Jan 1 2027. `GET /leave-balances` defaults to `new Date().getFullYear()` = 2026 (UTC is still Dec 31).
- **Expected:** Defaults to 2027 (IST year).
- **Actual:** Returns 2026 balances.
- **Impact:** Wrong year's balance/holiday data shown around midnight IST in Jan/Dec.

### BUG-012: Import default DOJ uses UTC date
- **Area:** Import / Timezone
- **File:** `server/src/routes/import.js:131`
- **Reproduce:** CSV import with missing DOJ field, server running in UTC, at 01:00 IST.
- **Expected:** Default DOJ = today in IST.
- **Actual:** Default DOJ = yesterday (UTC).
- **Impact:** Imported employee gets wrong joining date, affecting leave proration, attendance, payroll.

### BUG-013: Search RBAC leaks job openings to all employees
- **Area:** Search / Authorization
- **File:** `server/src/utils/search.js:73`
- **Reproduce:** Employee calls `GET /search?q=senior+engineer`. Job openings indexed by the recruitment module appear in results.
- **Expected:** Job openings should only be visible to HR (matching `GET /recruitment/jobs` RBAC).
- **Actual:** The search RBAC filter on line 73 allows all authenticated users to see `job` entity results.
- **Impact:** Internal job postings leak to all employees via search.

### BUG-014: Payroll regenerate has same atomicity issue as create
- **Area:** Payroll / Data Integrity
- **File:** `server/src/routes/payroll.js:244-300`
- **Reproduce:** During `POST /runs/:id/regenerate`, `DELETE FROM payroll_lines` (line 253) executes outside the transaction that re-inserts lines (lines 263-290). If the re-insert transaction fails, all old lines are deleted with no new ones.
- **Expected:** DELETE + re-INSERT should be atomic.
- **Actual:** Can leave a run with zero lines on failure.

### BUG-015: Pending leave count (HR) counts orphaned leaves
- **Area:** Leave / Data Integrity
- **File:** `server/src/routes/leaves.js:521`
- **Reproduce:** Delete an employee directly from the DB (bypassing the app). Their PENDING leaves remain. HR's pending count includes these orphaned leaves.
- **Expected:** JOIN with employees table to filter out orphans (like the manager query at line 523-527 does).
- **Actual:** `SELECT COUNT(*) FROM leaves WHERE status = 'PENDING'` — no JOIN.
- **Impact:** HR sees inflated pending count, including leaves that can't be acted on.
- **Note:** Previously diagnosed in Session 34 (PROGRESS.md) but never fixed.

### BUG-016: Payroll finalize response returns JS Date instead of SQLite datetime
- **Area:** Payroll / API
- **File:** `server/src/routes/payroll.js:340`
- **Reproduce:** `POST /runs/:id/finalize` — response body contains `finalized_at: new Date().toISOString()` (JS ISO string with time+zone).
- **Expected:** Consistent with DB value (SQLite's `datetime('now')` which is `YYYY-MM-DD HH:MM:SS` format).
- **Actual:** Response has `2026-06-22T14:30:00.000Z` format while DB has `2026-06-22 14:30:00`. Clients that compare or display this get inconsistent formats between the finalize response and subsequent GET responses.

---

## Areas confirmed clean after real probing

- **Payroll engine calculations** (PF, ESI, PT, TDS): All test vectors pass. Proration, half-day, mid-month joiner/exiter all correct. ESI eligibility correctly uses full gross. `tds_override` works.
- **Attendance priority chain**: leave > holiday > weekoff > manual — correctly implemented in shared/src/attendance.js.
- **nth-Saturday logic**: `Math.ceil(d/7)` correctly identifies week numbers for 2_4 and 1_3 patterns.
- **RBAC on core endpoints**: Employee CRUD, payroll, settings, audit all properly gated. No privilege escalation found.
- **Password hash exposure**: Correctly stripped in all API responses. `SELECT e.*` used but `delete row.password_hash` applied consistently.
- **Manager scope**: `isManagerOf()` correctly checks direct reports only (not transitive).
- **Self-edit restrictions**: `EmployeeSelfPatchSchema.strict()` correctly rejects role, status, code, doj, manager_id, and statutory fields.
- **CSV import idempotency**: Duplicate handling (skip/update by code) works correctly.
- **Seed idempotency**: All operations use ON CONFLICT — safe to re-run.
- **FK enforcement**: `PRAGMA foreign_keys = ON` set on boot. No DELETE /employees endpoint exists (soft delete via status).
- **Attendance bulk mark**: Correctly wrapped in transaction.
