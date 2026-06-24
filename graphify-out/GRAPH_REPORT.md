# Graph Report - hrms  (2026-06-24)

## Corpus Check
- 154 files · ~144,949 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 941 nodes · 1709 edges · 58 communities (52 shown, 6 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 6 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a800626b`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]

## God Nodes (most connected - your core abstractions)
1. `useAuth()` - 43 edges
2. `api` - 41 edges
3. `insertEmployee()` - 36 edges
4. `buildApp()` - 35 edges
5. `loginAs()` - 32 edges
6. `requireAuth()` - 22 edges
7. `audit()` - 20 edges
8. `broadcast()` - 19 edges
9. `useIsMobile()` - 17 edges
10. `requireHR` - 16 edges

## Surprising Connections (you probably didn't know these)
- `overBalanceCheck()` --calls--> `leaveBalance()`  [INFERRED]
  server/src/routes/leaves.js → shared/src/leave.js
- `generateLines()` --calls--> `payableDays()`  [INFERRED]
  server/src/routes/payroll.js → shared/src/attendance.js
- `generateLines()` --calls--> `computePayLine()`  [INFERRED]
  server/src/routes/payroll.js → shared/src/payroll.js
- `generateLines()` --calls--> `monthlyGross()`  [INFERRED]
  server/src/routes/payroll.js → shared/src/payroll.js
- `loginAs()` --calls--> `request()`  [INFERRED]
  server/src/tests/auth.test.js → web/src/lib/api.js

## Import Cycles
- None detected.

## Communities (58 total, 6 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.03
Nodes (70): AdvanceActSchema, AdvanceRequestCreateSchema, AnnouncementCreateSchema, AnnouncementPatchSchema, ApplicationCreateSchema, ApplicationPatchSchema, AssetAssignSchema, AssetCreateSchema (+62 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (11): request(), createAuthRouter(), seedLeaveTypes(), seedSettings(), setup(), loginAs(), buildApp(), insertEmployee() (+3 more)

### Community 2 - "Community 2"
Cohesion: 0.13
Nodes (16): args, counts, db, deptMap, desigMap, emailCounts, fullPath, locMap (+8 more)

### Community 3 - "Community 3"
Cohesion: 0.10
Nodes (21): AuthContext, AuthProvider(), useAuth(), Announcements(), PRIORITY_BG, PRIORITY_COLORS, HREngagement(), Login() (+13 more)

### Community 4 - "Community 4"
Cohesion: 0.07
Nodes (26): dependencies, bcryptjs, better-sqlite3, cookie-parser, dotenv, express, express-rate-limit, helmet (+18 more)

### Community 5 - "Community 5"
Cohesion: 0.11
Nodes (17): fmt(), fmtMonth(), HRPayroll(), navBtnStyle, primaryBtnStyle, secondaryBtnStyle, STATUS_BADGE, tdStyle (+9 more)

### Community 6 - "Community 6"
Cohesion: 0.10
Nodes (20): enforcePasswordChange(), requireAuth(), requireRole(), router, TABLES, router, router, FIXED_HOLIDAYS (+12 more)

### Community 7 - "Community 7"
Cohesion: 0.09
Nodes (22): dependencies, @hrms/shared, react, react-dom, react-router-dom, zod, devDependencies, autoprefixer (+14 more)

### Community 8 - "Community 8"
Cohesion: 0.09
Nodes (15): AnnouncementsTab(), btnDanger, btnPrimary, btnSmall, cardStyle, inputStyle, labelStyle, PRIORITY_BG (+7 more)

### Community 9 - "Community 9"
Cohesion: 0.12
Nodes (14): AppShell(), NotificationBell(), useIsMobile(), ThemeContext, ThemeProvider(), useTheme(), ATT_LABEL, CODE_COLORS (+6 more)

### Community 10 - "Community 10"
Cohesion: 0.21
Nodes (10): isManagerOf(), canActOnExpense(), router, canActOnLeave(), getAdjustments(), getEmployee(), getEmployeeLeaves(), getLeaveTypes() (+2 more)

### Community 11 - "Community 11"
Cohesion: 0.07
Nodes (25): FileUpload(), ProfilePhoto(), btnStyle(), fmtAmount(), inputStyle, labelStyle, MyExpenses(), STATUS_BADGE (+17 more)

### Community 12 - "Community 12"
Cohesion: 0.05
Nodes (55): activeEmps, allEmps, assignManagers, attTransaction, codes, db, depts, desigs (+47 more)

### Community 13 - "Community 13"
Cohesion: 0.10
Nodes (19): Admin Tasks, Architecture, Backup (online, no downtime), Backup & Restore, Change a user's role, Create a user, Environment Variables, Genesys HRMS (+11 more)

### Community 14 - "Community 14"
Cohesion: 0.18
Nodes (18): generateLines(), getActiveSalary(), getApprovedLeaves(), getAttendanceForMonth(), getEligibleEmployees(), getHolidays(), getLeaveTypes(), getSettings() (+10 more)

### Community 15 - "Community 15"
Cohesion: 0.13
Nodes (13): ATT_CODES, ATT_LABEL, CODE_COLORS, DailyRegister(), downloadCSV(), fmtMonth(), HRAttendance(), MonthlyGrid() (+5 more)

### Community 16 - "Community 16"
Cohesion: 0.24
Nodes (7): DOC_KEYS, EmployeeDrawer(), emptySalary(), gridStyle, SECTION_STATUS_FIELDS, TABS, today()

### Community 18 - "Community 18"
Cohesion: 0.28
Nodes (13): attDayValue(), attStatus(), daysInMonth(), dowOf(), empOnDate(), holidayOn(), isWeekOff(), leaveOn() (+5 more)

### Community 19 - "Community 19"
Cohesion: 0.12
Nodes (9): AdminSettings(), DAYS, inputS, lS, SAT_OPTS, smallBtnS, tdS, thS (+1 more)

### Community 20 - "Community 20"
Cohesion: 0.13
Nodes (14): dependencies, @rollup/rollup-linux-x64-gnu, devDependencies, concurrently, name, private, scripts, build (+6 more)

### Community 21 - "Community 21"
Cohesion: 0.29
Nodes (4): ALLOWED_MIME, router, storage, upload

### Community 22 - "Community 22"
Cohesion: 0.23
Nodes (9): HRONE_EXPORT_HEADERS, IMP_FIELDS, normBool(), normDate(), normGender(), normNum(), normTitleCase(), pad2() (+1 more)

### Community 23 - "Community 23"
Cohesion: 0.09
Nodes (21): Areas confirmed clean after real probing, BUG-001: Leave settings key mismatch — leave day counts ignore real calendar settings, BUG-002: Leave cancel uses UTC date instead of Asia/Kolkata, BUG-003: Payroll run creation is not atomic — orphan run on failure, BUG-004: Leave overlap check is not transactional — race condition, BUG-005: Leave balance over-balance check has same race condition, BUG-006: Array query params crash or silently fail on multiple routes, BUG-007: Payroll salary structure tiebreaker missing — nondeterministic for same effective_from (+13 more)

### Community 24 - "Community 24"
Cohesion: 0.14
Nodes (13): dependencies, zod, exports, ./attendance, ./datetime, ./import, ./leave, ./payroll (+5 more)

### Community 25 - "Community 25"
Cohesion: 0.33
Nodes (8): attachUser(), cookieOpts(), PW_CHANGE_ALLOWLIST, requireAdmin, router, getSecret(), signToken(), verifyToken()

### Community 26 - "Community 26"
Cohesion: 0.17
Nodes (7): HRExpenses(), inputStyle, labelStyle, smallBtn, STATUS_BADGE, tdStyle, thStyle

### Community 27 - "Community 27"
Cohesion: 0.17
Nodes (9): btnStyle, HRLeave(), inputStyle, labelStyle, modalStyle, overlayStyle, STATUS_BADGE, tdStyle (+1 more)

### Community 28 - "Community 28"
Cohesion: 0.16
Nodes (16): router, router, router, VALID_TRANSITIONS, router, getInsert(), insertStmt, notify() (+8 more)

### Community 29 - "Community 29"
Cohesion: 0.17
Nodes (11): Attendance, Authentication & Access Control, Dashboards, Data Migration, Employee Management, Genesys HRMS — UAT Checklist, Leave Management, Ops & Recovery (+3 more)

### Community 31 - "Community 31"
Cohesion: 0.20
Nodes (3): fmt(), HRDashboard(), LEAVE_BADGE

### Community 32 - "Community 32"
Cohesion: 0.24
Nodes (8): btnStyle, daysInMonth(), fmtMonthLabel(), STATUS_BADGE, tdStyle, TeamApprovals(), thisMonth(), thStyle

### Community 33 - "Community 33"
Cohesion: 0.20
Nodes (6): AuditLog(), ENTITIES, lS, selS, tdS, thS

### Community 34 - "Community 34"
Cohesion: 0.24
Nodes (3): fmt(), fmtMonth(), MyDashboard()

### Community 35 - "Community 35"
Cohesion: 0.18
Nodes (6): inputStyle, labelStyle, MyLeave(), STATUS_BADGE, tdStyle, thStyle

### Community 36 - "Community 36"
Cohesion: 0.22
Nodes (4): btnPrimary, HRRecruitment(), inputStyle, STATUS_BADGE

### Community 37 - "Community 37"
Cohesion: 0.31
Nodes (7): ATT_LABEL, CODE_COLORS, downloadCSV(), fmtMonth(), TeamAttendance(), thisMonth(), toCSV()

### Community 38 - "Community 38"
Cohesion: 0.22
Nodes (4): STATUS_BADGE, tdStyle, TeamExpenses(), thStyle

### Community 39 - "Community 39"
Cohesion: 0.27
Nodes (9): requireHR, DOC_CHECKLIST_KEYS, ONBOARDING_POLICIES, router, orgRouter(), audit(), allClients, broadcast() (+1 more)

### Community 40 - "Community 40"
Cohesion: 0.32
Nodes (4): fmtMonth(), STATUS_STYLE, TeamCalendar(), thisMonth()

### Community 41 - "Community 41"
Cohesion: 0.29
Nodes (6): __dirname, ensureSharedLink(), link, linkDir, root, sharedPkg

### Community 42 - "Community 42"
Cohesion: 0.25
Nodes (6): EMP, EXITED, HOLIDAYS, LEAVE_TYPES, NOTYET, SUN_ONLY

### Community 43 - "Community 43"
Cohesion: 0.25
Nodes (5): requireSelfOrHR(), BANK_FIELDS, HRONE_COLS, router, SALARY_FIELDS

### Community 44 - "Community 44"
Cohesion: 0.09
Nodes (15): Icon(), ENTITY_META, SearchBar(), btnPrimary, HRPerformance(), inputStyle, STATUS_BADGE, btnPrimary (+7 more)

### Community 45 - "Community 45"
Cohesion: 0.33
Nodes (5): __dirname, link, linkDir, pkg, target

### Community 46 - "Community 46"
Cohesion: 0.12
Nodes (14): EmployeePicker(), IMP_FIELDS, ImportWizard(), api, auth, ChangePassword(), HRAssets(), STATUS_BADGE (+6 more)

### Community 47 - "Community 47"
Cohesion: 0.40
Nodes (4): fmtDate(), MyTickets(), PRIORITY_BADGE, STATUS_BADGE

### Community 49 - "Community 49"
Cohesion: 0.29
Nodes (4): btnPrimary, inputStyle, MyPerformance(), STATUS_BADGE

### Community 52 - "Community 52"
Cohesion: 0.50
Nodes (3): currentYearIST(), pad2(), todayIST()

## Knowledge Gaps
- **383 isolated node(s):** `__dirname`, `target`, `linkDir`, `link`, `pkg` (+378 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `request()` connect `Community 1` to `Community 46`?**
  _High betweenness centrality (0.339) - this node is a cross-community bridge._
- **Why does `insertEmployee()` connect `Community 1` to `Community 2`, `Community 12`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **What connects `__dirname`, `target`, `linkDir` to the rest of the system?**
  _383 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.028169014084507043 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.08141321044546851 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.10476190476190476 - nodes in this community are weakly interconnected._