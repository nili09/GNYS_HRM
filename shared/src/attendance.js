/**
 * Pure calendar/attendance functions — ported verbatim from Genesys-HRMS.html (v1).
 * Stateless: callers supply pre-fetched data. No DB imports.
 *
 * Settings shape:  { weekOffs: number[], satOff: 'none'|'all'|'2_4'|'1_3' }
 * Employee shape:  { id, doj: 'YYYY-MM-DD', status: string, exit_date?: string }
 * Leave shape:     { employee_id, type, date_from, date_to, half_from, half_to, status }
 * LeaveType shape: { code, paid: 0|1 }
 * Holiday shape:   { date: 'YYYY-MM-DD', name: string }
 * AttCode:         'P'|'A'|'HD'|'WFH'|'OD'|null
 */

/** Zero-pad to 2 digits. */
export function pad2(n) {
  return String(n).padStart(2, "0");
}

/** Day-of-week for a YYYY-MM-DD string (0=Sun … 6=Sat). UTC to avoid TZ shifts. */
export function dowOf(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Number of calendar days in a YYYY-MM string. */
export function daysInMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * Is this date a week-off?
 * nth-Saturday: week = ceil(dayOfMonth / 7), exactly as v1.
 */
export function isWeekOff(dateStr, settings) {
  const dow = dowOf(dateStr);
  if (settings.weekOffs.includes(dow)) return true;
  if (dow === 6) {
    const d = Number(dateStr.slice(8));
    const wk = Math.ceil(d / 7);
    if (settings.satOff === "all") return true;
    if (settings.satOff === "2_4" && (wk === 2 || wk === 4)) return true;
    if (settings.satOff === "1_3" && (wk === 1 || wk === 3)) return true;
  }
  return false;
}

/** Find a holiday on the given date, or undefined. */
export function holidayOn(dateStr, holidays) {
  return holidays.find((h) => h.date === dateStr);
}

/** Is the employee employed on this date? */
export function empOnDate(emp, dateStr) {
  if (emp.doj && dateStr < emp.doj) return false;
  if (emp.status === "EXITED" && emp.exit_date && dateStr > emp.exit_date) return false;
  return true;
}

/** Find an APPROVED leave covering this date for this employee, or undefined. */
export function leaveOn(employeeId, dateStr, leaves) {
  return leaves.find(
    (l) =>
      l.employee_id === employeeId &&
      l.status === "APPROVED" &&
      l.date_from <= dateStr &&
      dateStr <= l.date_to
  );
}

/**
 * Resolved attendance status for an employee on a date.
 * Priority order (spec §4):
 *   1. Not employed → ""
 *   2. Approved leave → "L"
 *   3. Holiday → "H"
 *   4. Week-off → "WO"
 *   5. Manual mark → code
 *   6. Unmarked → ""
 *
 * @param {{ id, doj, status, exit_date }} emp
 * @param {string} dateStr
 * @param {{ settings, holidays, leaves, attCode: string|null }} opts
 */
export function attStatus(emp, dateStr, { settings, holidays, leaves, attCode }) {
  if (!empOnDate(emp, dateStr)) return "";
  if (leaveOn(emp.id, dateStr, leaves)) return "L";
  if (holidayOn(dateStr, holidays)) return "H";
  if (isWeekOff(dateStr, settings)) return "WO";
  return attCode || "";
}

/**
 * Payable value of one calendar day: 0, 0.5, or 1.
 * P / WFH / OD / H / WO = 1
 * HD = 0.5
 * Approved paid leave = 1
 * Approved LWP = 0 (or 0.5 if half-day LWP)
 * A / unmarked = 0
 * Not employed = 0
 *
 * @param {{ id, doj, status, exit_date }} emp
 * @param {string} dateStr
 * @param {{ settings, holidays, leaves, attCode, leaveTypes }} opts
 */
export function attDayValue(emp, dateStr, { settings, holidays, leaves, attCode, leaveTypes }) {
  if (!empOnDate(emp, dateStr)) return 0;
  const lv = leaveOn(emp.id, dateStr, leaves);
  if (lv) {
    const lt = leaveTypes.find((t) => t.code === lv.type);
    const isHalf =
      (dateStr === lv.date_from && lv.half_from) ||
      (dateStr === lv.date_to && lv.half_to);
    if (!lt || !lt.paid) return isHalf ? 0.5 : 0; // LWP: half-day = 0.5
    return 1;                                       // paid leave = full
  }
  if (holidayOn(dateStr, holidays) || isWeekOff(dateStr, settings)) return 1;
  if (attCode === "P" || attCode === "WFH" || attCode === "OD") return 1;
  if (attCode === "HD") return 0.5;
  return 0; // A or unmarked
}

/**
 * Sum of payable day values for all calendar days in a month.
 *
 * @param {{ id, doj, status, exit_date }} emp
 * @param {string} ym - YYYY-MM
 * @param {{ settings, holidays, leaves, leaveTypes }} opts
 * @param {function(string): string|null} getAttCode - (dateStr) => code or null
 */
export function payableDays(emp, ym, opts, getAttCode) {
  const n = daysInMonth(ym);
  let sum = 0;
  for (let i = 1; i <= n; i++) {
    const dateStr = `${ym}-${pad2(i)}`;
    sum += attDayValue(emp, dateStr, { ...opts, attCode: getAttCode(dateStr) });
  }
  return sum;
}
