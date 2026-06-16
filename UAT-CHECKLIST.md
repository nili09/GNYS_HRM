# Genesys HRMS — UAT Checklist

Pilot acceptance tests for the HR team. Each check should be performed on the production deployment. Mark ✅ when passed, ❌ when failed (note the issue).

## Authentication & Access Control

| # | Check | Status |
|---|---|---|
| 1 | Login with admin credentials → redirected to HR Dashboard | ☐ |
| 2 | Login with employee credentials → redirected to My Space | ☐ |
| 3 | Employee cannot access /hr/* or /admin/* routes (403 or redirect) | ☐ |
| 4 | Session persists on page reload (cookie survives) | ☐ |
| 5 | Logout clears session, back-button does not re-enter | ☐ |

## Employee Management

| # | Check | Status |
|---|---|---|
| 6 | HR creates a new employee with all required fields → employee appears in list | ☐ |
| 7 | CSV import: upload a 10-row CSV → all employees created, preview shown before confirm | ☐ |
| 8 | Edit employee details (name, department, designation) → changes reflected | ☐ |
| 9 | Deactivate an employee → employee hidden from active views, cannot login | ☐ |
| 10 | Search/filter employees by department and status | ☐ |

## Attendance

| # | Check | Status |
|---|---|---|
| 11 | HR marks attendance for today (P, A, WO, HD, L) for 5+ employees → saved | ☐ |
| 12 | Monthly attendance view shows correct day-wise grid with color coding | ☐ |
| 13 | Employee views own attendance for current month → matches HR's marks | ☐ |
| 14 | Manager views team attendance → only direct reports shown | ☐ |
| 15 | Weekend / work-off days correctly displayed based on working-week settings | ☐ |

## Leave Management

| # | Check | Status |
|---|---|---|
| 16 | Employee applies for Casual Leave (2 days) → appears in pending | ☐ |
| 17 | Manager approves the leave → employee balance deducted, status = APPROVED | ☐ |
| 18 | HR applies leave on behalf of an employee → balance updated | ☐ |
| 19 | Leave rejection with reason → employee sees rejection reason | ☐ |
| 20 | Leave balance check: cannot apply more days than available balance | ☐ |

## Payroll

| # | Check | Status |
|---|---|---|
| 21 | HR drafts payroll for current month → draft payslips generated for active employees | ☐ |
| 22 | Payslip breakdown matches manual calculation: basic, HRA, DA, PF, ESI, PT, TDS | ☐ |
| 23 | Cross-check one employee's net pay against the v1 system's payroll register | ☐ |
| 24 | HR finalizes payroll → payslips locked, status = FINALIZED | ☐ |
| 25 | Employee views own payslip → correct figures, can see only own data | ☐ |

## Dashboards

| # | Check | Status |
|---|---|---|
| 26 | HR Dashboard: headcount, today's attendance %, on-leave count, pending approvals visible | ☐ |
| 27 | Manager Dashboard: team count, out-today list, pending approvals for direct reports | ☐ |
| 28 | Employee Dashboard: leave balances, attendance summary, last payslip, pending requests | ☐ |

## Real-Time Updates

| # | Check | Status |
|---|---|---|
| 29 | Two browsers side by side (HR + employee): employee applies leave → appears on HR dashboard within 2 seconds | ☐ |
| 30 | HR approves leave → employee's balance and leave status update within 2 seconds | ☐ |

## Settings & Admin

| # | Check | Status |
|---|---|---|
| 31 | Admin updates company name → reflected across the app | ☐ |
| 32 | Admin changes working week (e.g., toggle Saturday off) → attendance grid adjusts | ☐ |
| 33 | Admin resets an employee's password → employee forced to change on next login | ☐ |
| 34 | Admin changes a user's role (EMPLOYEE → HR) → new permissions active immediately | ☐ |
| 35 | Audit log shows entries for all admin/HR actions with timestamps | ☐ |

## Data Migration

| # | Check | Status |
|---|---|---|
| 36 | Run `npm run import:v1 -- v1-data.json` → employees, leaves, attendance imported | ☐ |
| 37 | Spot-check 3 migrated employees: salary structure, leave balances, attendance match v1 | ☐ |

## Ops & Recovery

| # | Check | Status |
|---|---|---|
| 38 | Backup script runs without stopping the server (`./scripts/backup.sh`) | ☐ |
| 39 | Restore from backup: stop server → copy backup → start server → data intact | ☐ |

---

**Sign-off**

| Role | Name | Date | Signature |
|---|---|---|---|
| HR Head | | | |
| IT Admin | | | |
| Employee Rep | | | |
