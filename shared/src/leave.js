/**
 * Pure leave functions — ported from Genesys-HRMS.html (v1).
 * Stateless: callers supply pre-fetched data. No DB imports.
 *
 * Settings shape:  { weekOffs: number[], satOff: 'none'|'all'|'2_4'|'1_3' }
 * Holiday shape:   { date: 'YYYY-MM-DD' }
 * Leave shape:     { employee_id, type, date_from, date_to, half_from, half_to, days, status }
 * LeaveType shape: { code, name, annual, paid, carry_fwd, max_carry }
 * Adjustment shape:{ employee_id, year, type, delta }
 */

import { isWeekOff, holidayOn, pad2 } from "./attendance.js";

// ── Date helpers ────────────────────────────────────────────────────────────

/** Iterate YYYY-MM-DD strings from `from` to `to` inclusive. */
export function* dateRange(from, to) {
  const [y0, m0, d0] = from.split("-").map(Number);
  const cur = new Date(Date.UTC(y0, m0 - 1, d0));
  const end = to;
  while (true) {
    const s = `${cur.getUTCFullYear()}-${pad2(cur.getUTCMonth() + 1)}-${pad2(cur.getUTCDate())}`;
    if (s > end) break;
    yield s;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
}

// ── Working-day counting (with half-day flags) ──────────────────────────────

/**
 * Count working days in a leave range, skipping week-offs and holidays.
 * Half-day flags on first/last day subtract 0.5 each.
 * Ported verbatim from v1's `calcLeaveDays()`.
 *
 * @param {string} from       YYYY-MM-DD
 * @param {string} to         YYYY-MM-DD
 * @param {boolean|number} halfFrom  half-day on first day
 * @param {boolean|number} halfTo    half-day on last day
 * @param {object} settings   { weekOffs, satOff }
 * @param {Array}  holidays   [{ date }]
 * @returns {number} working days (may be 0.5 increments)
 */
export function countWorkingDays(from, to, halfFrom, halfTo, settings, holidays) {
  if (!from || !to || to < from) return 0;
  let d = 0;
  for (const day of dateRange(from, to)) {
    if (isWeekOff(day, settings) || holidayOn(day, holidays)) continue;
    let v = 1;
    if (day === from && halfFrom) v -= 0.5;
    if (day === to && halfTo) v -= 0.5;
    d += Math.max(0, v);
  }
  return d;
}

// ── Proration ───────────────────────────────────────────────────────────────

/**
 * Prorate annual entitlement by joining month in the joining year.
 * `monthsLeft = 12 - joiningMonth(0-based)`, entitled = round(annual * monthsLeft/12 * 2)/2
 * For non-joining years, returns annual unchanged.
 *
 * @param {number} annual   full-year entitlement
 * @param {string} doj      YYYY-MM-DD
 * @param {number} year     the year to compute for
 * @returns {number} prorated entitlement (rounded to nearest 0.5)
 */
export function prorateDays(annual, doj, year) {
  if (annual <= 0) return annual;
  const [dojY, dojM] = doj.split("-").map(Number);
  if (dojY !== year) return annual;
  const monthsLeft = 12 - (dojM - 1); // dojM is 1-based, need 0-based month index
  return Math.round((annual * monthsLeft / 12) * 2) / 2;
}

// ── Balance ─────────────────────────────────────────────────────────────────

/**
 * Compute leave balance for one employee, one year, all types.
 * Ported from v1's `leaveBalances()`.
 *
 * @param {number} employeeId
 * @param {number} year
 * @param {string} doj          employee's date of joining YYYY-MM-DD
 * @param {Array}  leaveTypes   [{ code, annual, ... }]
 * @param {Array}  leaves       all leaves for this employee (any year/status)
 * @param {Array}  adjustments  all adjustments for this employee (any year)
 * @returns {Object} { [typeCode]: { entitled, adj, used, available } }
 */
export function leaveBalance(employeeId, year, doj, leaveTypes, leaves, adjustments) {
  const out = {};
  for (const t of leaveTypes) {
    const entitled = prorateDays(t.annual, doj, year);
    const adj = adjustments
      .filter((a) => a.employee_id === employeeId && a.year === year && a.type === t.code)
      .reduce((s, a) => s + a.delta, 0);
    const used = leaves
      .filter(
        (l) =>
          l.employee_id === employeeId &&
          l.type === t.code &&
          l.status === "APPROVED" &&
          l.date_from.slice(0, 4) === String(year)
      )
      .reduce((s, l) => s + l.days, 0);
    out[t.code] = {
      entitled,
      adj,
      used,
      available: Math.round((entitled + adj - used) * 2) / 2,
    };
  }
  return out;
}

// ── Overlap detection ───────────────────────────────────────────────────────

/**
 * Check if a proposed leave range overlaps any existing PENDING/APPROVED leave.
 * Ported from v1: `l.from <= to && from <= l.to`.
 *
 * @param {number} employeeId
 * @param {string} from   YYYY-MM-DD
 * @param {string} to     YYYY-MM-DD
 * @param {Array}  leaves existing leaves
 * @param {number|null} excludeId  leave id to exclude (for edits)
 * @returns {object|null} the overlapping leave, or null
 */
export function findOverlap(employeeId, from, to, leaves, excludeId = null) {
  return (
    leaves.find(
      (l) =>
        l.employee_id === employeeId &&
        (excludeId == null || l.id !== excludeId) &&
        ["PENDING", "APPROVED"].includes(l.status) &&
        l.date_from <= to &&
        from <= l.date_to
    ) || null
  );
}
