# Graph Report - hrms  (2026-06-18)

## Corpus Check
- 133 files · ~123,997 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 826 nodes · 1434 edges · 58 communities (54 shown, 4 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8c33e029`
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
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]

## God Nodes (most connected - your core abstractions)
1. `useAuth()` - 39 edges
2. `api` - 38 edges
3. `buildApp()` - 27 edges
4. `insertEmployee()` - 25 edges
5. `loginAs()` - 24 edges
6. `requireAuth()` - 19 edges
7. `audit()` - 17 edges
8. `useIsMobile()` - 17 edges
9. `broadcast()` - 16 edges
10. `requireHR` - 14 edges

## Surprising Connections (you probably didn't know these)
- `generateLines()` --calls--> `payableDays()`  [INFERRED]
  server/src/routes/payroll.js → shared/src/attendance.js
- `generateLines()` --calls--> `computePayLine()`  [INFERRED]
  server/src/routes/payroll.js → shared/src/payroll.js
- `generateLines()` --calls--> `monthlyGross()`  [INFERRED]
  server/src/routes/payroll.js → shared/src/payroll.js
- `loginAs()` --calls--> `request()`  [INFERRED]
  server/src/tests/auth.test.js → web/src/lib/api.js
- `AnnouncementsTab()` --calls--> `useAuth()`  [EXTRACTED]
  web/src/pages/HREngagement.jsx → web/src/hooks/useAuth.jsx

## Import Cycles
- None detected.

## Communities (58 total, 4 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.03
Nodes (61): AdvanceActSchema, AdvanceRequestCreateSchema, AnnouncementCreateSchema, AnnouncementPatchSchema, ApplicationCreateSchema, ApplicationPatchSchema, AssetAssignSchema, AssetCreateSchema (+53 more)

### Community 1 - "Community 1"
Cohesion: 0.09
Nodes (10): createTestDb(), request(), createAuthRouter(), seedLeaveTypes(), seedSettings(), setup(), loginAs(), buildApp() (+2 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (41): args, counts, db, deptMap, desigMap, emailCounts, fullPath, locMap (+33 more)

### Community 3 - "Community 3"
Cohesion: 0.14
Nodes (19): useAuth(), Announcements(), ChangePassword(), HREngagement(), Login(), MyAssets(), MyLeave(), MyPerformance() (+11 more)

### Community 4 - "Community 4"
Cohesion: 0.08
Nodes (25): dependencies, bcryptjs, better-sqlite3, cookie-parser, dotenv, express, express-rate-limit, helmet (+17 more)

### Community 5 - "Community 5"
Cohesion: 0.11
Nodes (17): fmt(), fmtMonth(), HRPayroll(), navBtnStyle, primaryBtnStyle, secondaryBtnStyle, STATUS_BADGE, tdStyle (+9 more)

### Community 6 - "Community 6"
Cohesion: 0.20
Nodes (16): enforcePasswordChange(), requireHR, router, router, departmentsRouter, designationsRouter, locationsRouter, orgRouter() (+8 more)

### Community 7 - "Community 7"
Cohesion: 0.09
Nodes (22): dependencies, @hrms/shared, react, react-dom, react-router-dom, zod, devDependencies, autoprefixer (+14 more)

### Community 8 - "Community 8"
Cohesion: 0.09
Nodes (15): AnnouncementsTab(), btnDanger, btnPrimary, btnSmall, cardStyle, inputStyle, labelStyle, PRIORITY_BG (+7 more)

### Community 9 - "Community 9"
Cohesion: 0.16
Nodes (11): AppShell(), NotificationBell(), ENTITY_META, SearchBar(), useIsMobile(), ThemeContext, ThemeProvider(), useTheme() (+3 more)

### Community 10 - "Community 10"
Cohesion: 0.15
Nodes (11): isManagerOf(), router, canActOnExpense(), router, canActOnLeave(), router, getInsert(), insertStmt (+3 more)

### Community 11 - "Community 11"
Cohesion: 0.13
Nodes (13): FileUpload(), btnStyle(), fmtAmount(), inputStyle, labelStyle, MyExpenses(), STATUS_BADGE, tdStyle (+5 more)

### Community 12 - "Community 12"
Cohesion: 0.13
Nodes (9): AuthContext, AuthProvider(), auth, PRIORITY_BG, PRIORITY_COLORS, STATUS_BADGE, btnPrimary, inputStyle (+1 more)

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
Cohesion: 0.15
Nodes (11): DOC_KEYS, EmployeeDrawer(), emptySalary(), gridStyle, SECTION_STATUS_FIELDS, TABS, today(), IMP_FIELDS (+3 more)

### Community 17 - "Community 17"
Cohesion: 0.12
Nodes (6): requireRole(), MarksSchema, router, FIXED_HOLIDAYS, HolidaySchema, router

### Community 18 - "Community 18"
Cohesion: 0.28
Nodes (13): attDayValue(), attStatus(), daysInMonth(), dowOf(), empOnDate(), holidayOn(), isWeekOff(), leaveOn() (+5 more)

### Community 19 - "Community 19"
Cohesion: 0.13
Nodes (8): AdminSettings(), DAYS, inputS, lS, SAT_OPTS, smallBtnS, tdS, thS

### Community 20 - "Community 20"
Cohesion: 0.14
Nodes (13): dependencies, @rollup/rollup-linux-x64-gnu, devDependencies, concurrently, name, private, scripts, build (+5 more)

### Community 21 - "Community 21"
Cohesion: 0.15
Nodes (8): ALLOWED_MIME, router, storage, upload, router, addClient(), allClients, userClients

### Community 22 - "Community 22"
Cohesion: 0.21
Nodes (9): HRONE_EXPORT_HEADERS, IMP_FIELDS, normBool(), normDate(), normGender(), normNum(), normTitleCase(), pad2() (+1 more)

### Community 23 - "Community 23"
Cohesion: 0.17
Nodes (10): ProfilePhoto(), btnCancel, btnEdit, btnPrimary, card, CONTACT_FIELDS, DOC_KEYS, fldStyle (+2 more)

### Community 24 - "Community 24"
Cohesion: 0.15
Nodes (12): dependencies, zod, exports, ./attendance, ./import, ./leave, ./payroll, ./schemas (+4 more)

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
Cohesion: 0.33
Nodes (8): router, applyRBAC(), formatResult(), indexEntity(), reindexAll(), removeEntity(), safeParse(), search()

### Community 29 - "Community 29"
Cohesion: 0.17
Nodes (11): Attendance, Authentication & Access Control, Dashboards, Data Migration, Employee Management, Genesys HRMS — UAT Checklist, Leave Management, Ops & Recovery (+3 more)

### Community 30 - "Community 30"
Cohesion: 0.18
Nodes (3): requireAuth(), router, router

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
Cohesion: 0.20
Nodes (5): inputStyle, labelStyle, STATUS_BADGE, tdStyle, thStyle

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
Cohesion: 0.32
Nodes (5): ATT_LABEL, CODE_COLORS, fmtMonth(), MyAttendance(), thisMonth()

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
Cohesion: 0.29
Nodes (4): requireSelfOrHR(), HRONE_COLS, router, SALARY_FIELDS

### Community 44 - "Community 44"
Cohesion: 0.29
Nodes (4): btnPrimary, HRPerformance(), inputStyle, STATUS_BADGE

### Community 45 - "Community 45"
Cohesion: 0.33
Nodes (5): __dirname, link, linkDir, pkg, target

### Community 47 - "Community 47"
Cohesion: 0.40
Nodes (4): fmtDate(), HRHelpdesk(), PRIORITY_BADGE, STATUS_BADGE

### Community 48 - "Community 48"
Cohesion: 0.33
Nodes (4): btnPrimary, inputStyle, MyInterviews(), STATUS_BADGE

### Community 49 - "Community 49"
Cohesion: 0.33
Nodes (3): btnPrimary, inputStyle, STATUS_BADGE

## Knowledge Gaps
- **332 isolated node(s):** `__dirname`, `target`, `linkDir`, `link`, `pkg` (+327 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `request()` connect `Community 1` to `Community 12`?**
  _High betweenness centrality (0.264) - this node is a cross-community bridge._
- **Why does `generateLines()` connect `Community 14` to `Community 18`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **What connects `__dirname`, `target`, `linkDir` to the rest of the system?**
  _332 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.03225806451612903 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.08853410740203194 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.050980392156862744 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.13675213675213677 - nodes in this community are weakly interconnected._