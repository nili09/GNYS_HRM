import { describe, it, expect } from "vitest";
import {
  isWeekOff,
  holidayOn,
  empOnDate,
  leaveOn,
  attStatus,
  attDayValue,
  payableDays,
  daysInMonth,
  dowOf,
} from "@hrms/shared/attendance";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const SUN_ONLY = { weekOffs: [0], satOff: "none" };  // default: Sun off, all Sat working
const EMP      = { id: 1, doj: "2024-01-01", status: "ACTIVE" };
const EXITED   = { id: 2, doj: "2024-01-01", status: "EXITED", exit_date: "2024-12-31" };
const NOTYET   = { id: 3, doj: "2025-02-01", status: "ACTIVE" };

// Holidays: 2025-01-26 = Republic Day (falls on a Sunday in 2025)
const HOLIDAYS = [{ date: "2025-01-26", name: "Republic Day" }];

const LEAVE_TYPES = [
  { code: "EL",  paid: 1 },
  { code: "CL",  paid: 1 },
  { code: "SL",  paid: 1 },
  { code: "LWP", paid: 0 },
];

function mkLeave(overrides) {
  return {
    employee_id: 1,
    type: "EL",
    date_from: "2025-01-06",
    date_to: "2025-01-06",
    half_from: 0,
    half_to: 0,
    status: "APPROVED",
    ...overrides,
  };
}

// ── dowOf / daysInMonth ───────────────────────────────────────────────────────

describe("dowOf", () => {
  it("2025-01-01 is a Wednesday (3)", () => expect(dowOf("2025-01-01")).toBe(3));
  it("2025-01-05 is a Sunday (0)",    () => expect(dowOf("2025-01-05")).toBe(0));
  it("2025-03-01 is a Saturday (6)",  () => expect(dowOf("2025-03-01")).toBe(6));
});

describe("daysInMonth", () => {
  it("Jan 2025 = 31", () => expect(daysInMonth("2025-01")).toBe(31));
  it("Feb 2024 = 29 (leap)", () => expect(daysInMonth("2024-02")).toBe(29));
  it("Feb 2025 = 28",        () => expect(daysInMonth("2025-02")).toBe(28));
  it("Apr 2025 = 30",        () => expect(daysInMonth("2025-04")).toBe(30));
});

// ── isWeekOff — week-off rules ────────────────────────────────────────────────

describe("isWeekOff — Sunday only", () => {
  it("Sunday is off",  () => expect(isWeekOff("2025-01-05", SUN_ONLY)).toBe(true));
  it("Monday is not",  () => expect(isWeekOff("2025-01-06", SUN_ONLY)).toBe(false));
  it("Saturday not off when satOff=none", () => expect(isWeekOff("2025-03-01", SUN_ONLY)).toBe(false));
});

describe("isWeekOff — satOff=all", () => {
  const s = { weekOffs: [0], satOff: "all" };
  it("1st Sat off", () => expect(isWeekOff("2025-03-01", s)).toBe(true));
  it("2nd Sat off", () => expect(isWeekOff("2025-03-08", s)).toBe(true));
  it("5th Sat off", () => expect(isWeekOff("2025-03-29", s)).toBe(true));
  it("Friday not off", () => expect(isWeekOff("2025-03-07", s)).toBe(false));
});

describe("isWeekOff — satOff=2_4 (2nd & 4th off)", () => {
  const s = { weekOffs: [0], satOff: "2_4" };
  // March 2025: 1st=Mar1, 2nd=Mar8, 3rd=Mar15, 4th=Mar22, 5th=Mar29
  it("1st Sat → working",    () => expect(isWeekOff("2025-03-01", s)).toBe(false));
  it("2nd Sat → off",        () => expect(isWeekOff("2025-03-08", s)).toBe(true));
  it("3rd Sat → working",    () => expect(isWeekOff("2025-03-15", s)).toBe(false));
  it("4th Sat → off",        () => expect(isWeekOff("2025-03-22", s)).toBe(true));
  it("5th Sat → working",    () => expect(isWeekOff("2025-03-29", s)).toBe(false));
});

describe("isWeekOff — satOff=1_3 (1st & 3rd off)", () => {
  const s = { weekOffs: [0], satOff: "1_3" };
  it("1st Sat → off",     () => expect(isWeekOff("2025-03-01", s)).toBe(true));
  it("2nd Sat → working", () => expect(isWeekOff("2025-03-08", s)).toBe(false));
  it("3rd Sat → off",     () => expect(isWeekOff("2025-03-15", s)).toBe(true));
  it("4th Sat → working", () => expect(isWeekOff("2025-03-22", s)).toBe(false));
  it("5th Sat → working", () => expect(isWeekOff("2025-03-29", s)).toBe(false));
});

describe("isWeekOff — nth-Saturday wk=ceil(day/7) verified on Nov 2025", () => {
  // Nov 1 2025 is a Saturday → week 1 (ceil(1/7)=1)
  const s24 = { weekOffs: [0], satOff: "2_4" };
  const s13 = { weekOffs: [0], satOff: "1_3" };
  it("Nov 1 (1st Sat): not in 2/4", () => expect(isWeekOff("2025-11-01", s24)).toBe(false));
  it("Nov 1 (1st Sat): in 1/3",     () => expect(isWeekOff("2025-11-01", s13)).toBe(true));
  it("Nov 8 (2nd Sat): in 2/4",     () => expect(isWeekOff("2025-11-08", s24)).toBe(true));
  it("Nov 15 (3rd Sat): in 1/3",    () => expect(isWeekOff("2025-11-15", s13)).toBe(true));
  it("Nov 22 (4th Sat): in 2/4",    () => expect(isWeekOff("2025-11-22", s24)).toBe(true));
  it("Nov 29 (5th Sat): not in 2/4",() => expect(isWeekOff("2025-11-29", s24)).toBe(false));
});

// ── holidayOn ─────────────────────────────────────────────────────────────────

describe("holidayOn", () => {
  it("finds a holiday",          () => expect(holidayOn("2025-01-26", HOLIDAYS)?.name).toBe("Republic Day"));
  it("returns undefined for non", () => expect(holidayOn("2025-01-27", HOLIDAYS)).toBeUndefined());
  it("empty list → undefined",   () => expect(holidayOn("2025-01-26", [])).toBeUndefined());
});

// ── empOnDate ─────────────────────────────────────────────────────────────────

describe("empOnDate", () => {
  it("before doj → not employed",     () => expect(empOnDate(EMP, "2023-12-31")).toBe(false));
  it("on doj → employed",             () => expect(empOnDate(EMP, "2024-01-01")).toBe(true));
  it("after doj → employed",          () => expect(empOnDate(EMP, "2025-06-01")).toBe(true));
  it("exited: on exit_date → ok",     () => expect(empOnDate(EXITED, "2024-12-31")).toBe(true));
  it("exited: after exit_date → not", () => expect(empOnDate(EXITED, "2025-01-01")).toBe(false));
  it("future doj → not employed",     () => expect(empOnDate(NOTYET, "2025-01-31")).toBe(false));
  it("future doj: on doj → ok",       () => expect(empOnDate(NOTYET, "2025-02-01")).toBe(true));
});

// ── attStatus — priority chain ────────────────────────────────────────────────

describe("attStatus priority chain", () => {
  // 2025-01-26 = Republic Day (Sunday)
  const leave = mkLeave({ date_from: "2025-01-26", date_to: "2025-01-26" });

  it("1. blank if not employed (pre-doj)", () => {
    expect(attStatus(NOTYET, "2025-01-26", { settings: SUN_ONLY, holidays: HOLIDAYS, leaves: [leave], attCode: "P" })).toBe("");
  });
  it("1. blank if exited", () => {
    const l = { ...leave, employee_id: 2 };
    expect(attStatus(EXITED, "2025-01-26", { settings: SUN_ONLY, holidays: HOLIDAYS, leaves: [l], attCode: "P" })).toBe("");
  });
  it("2. L beats H, WO, and manual", () => {
    // Jan 26 is Sunday (WO) + Holiday + has leave
    expect(attStatus(EMP, "2025-01-26", { settings: SUN_ONLY, holidays: HOLIDAYS, leaves: [leave], attCode: "P" })).toBe("L");
  });
  it("3. H beats WO and manual (no leave)", () => {
    expect(attStatus(EMP, "2025-01-26", { settings: SUN_ONLY, holidays: HOLIDAYS, leaves: [], attCode: "P" })).toBe("H");
  });
  it("4. WO beats manual (no holiday, no leave)", () => {
    expect(attStatus(EMP, "2025-01-26", { settings: SUN_ONLY, holidays: [], leaves: [], attCode: "P" })).toBe("WO");
  });
  it("5. manual mark on a working day", () => {
    expect(attStatus(EMP, "2025-01-27", { settings: SUN_ONLY, holidays: [], leaves: [], attCode: "P" })).toBe("P");
    expect(attStatus(EMP, "2025-01-27", { settings: SUN_ONLY, holidays: [], leaves: [], attCode: "HD" })).toBe("HD");
    expect(attStatus(EMP, "2025-01-27", { settings: SUN_ONLY, holidays: [], leaves: [], attCode: "WFH" })).toBe("WFH");
    expect(attStatus(EMP, "2025-01-27", { settings: SUN_ONLY, holidays: [], leaves: [], attCode: "OD" })).toBe("OD");
    expect(attStatus(EMP, "2025-01-27", { settings: SUN_ONLY, holidays: [], leaves: [], attCode: "A" })).toBe("A");
  });
  it("6. empty string if no manual mark", () => {
    expect(attStatus(EMP, "2025-01-27", { settings: SUN_ONLY, holidays: [], leaves: [], attCode: null })).toBe("");
  });
  it("pending leave does NOT count as L", () => {
    const pending = mkLeave({ status: "PENDING", date_from: "2025-01-27", date_to: "2025-01-27" });
    expect(attStatus(EMP, "2025-01-27", { settings: SUN_ONLY, holidays: [], leaves: [pending], attCode: null })).toBe("");
  });
});

// ── attDayValue — payable values ──────────────────────────────────────────────

describe("attDayValue — working day marks", () => {
  // Jan 6 2025 = Monday (working day)
  const opts = { settings: SUN_ONLY, holidays: [], leaves: [], leaveTypes: LEAVE_TYPES };

  it("P → 1",   () => expect(attDayValue(EMP, "2025-01-06", { ...opts, attCode: "P" })).toBe(1));
  it("WFH → 1", () => expect(attDayValue(EMP, "2025-01-06", { ...opts, attCode: "WFH" })).toBe(1));
  it("OD → 1",  () => expect(attDayValue(EMP, "2025-01-06", { ...opts, attCode: "OD" })).toBe(1));
  it("HD → 0.5",() => expect(attDayValue(EMP, "2025-01-06", { ...opts, attCode: "HD" })).toBe(0.5));
  it("A → 0",   () => expect(attDayValue(EMP, "2025-01-06", { ...opts, attCode: "A" })).toBe(0));
  it("null (unmarked) → 0", () => expect(attDayValue(EMP, "2025-01-06", { ...opts, attCode: null })).toBe(0));
});

describe("attDayValue — holiday / weekoff", () => {
  // Jan 26 2025 = Sunday + Republic Day
  const opts = { settings: SUN_ONLY, holidays: HOLIDAYS, leaves: [], leaveTypes: LEAVE_TYPES };

  it("holiday → 1 (regardless of mark)", () =>
    expect(attDayValue(EMP, "2025-01-26", { ...opts, attCode: null })).toBe(1));
  it("week-off → 1", () =>
    expect(attDayValue(EMP, "2025-01-05", { settings: SUN_ONLY, holidays: [], leaves: [], leaveTypes: LEAVE_TYPES, attCode: null })).toBe(1));
});

describe("attDayValue — leaves", () => {
  const base = { settings: SUN_ONLY, holidays: [], leaveTypes: LEAVE_TYPES };

  it("approved paid leave (EL) → 1", () => {
    const leaves = [mkLeave({ type: "EL", date_from: "2025-01-06", date_to: "2025-01-06" })];
    expect(attDayValue(EMP, "2025-01-06", { ...base, leaves, attCode: null })).toBe(1);
  });
  it("approved LWP full day → 0", () => {
    const leaves = [mkLeave({ type: "LWP", date_from: "2025-01-06", date_to: "2025-01-06" })];
    expect(attDayValue(EMP, "2025-01-06", { ...base, leaves, attCode: null })).toBe(0);
  });
  it("half-day LWP (half_from=1) → 0.5", () => {
    const leaves = [mkLeave({ type: "LWP", date_from: "2025-01-06", date_to: "2025-01-06", half_from: 1 })];
    expect(attDayValue(EMP, "2025-01-06", { ...base, leaves, attCode: null })).toBe(0.5);
  });
  it("half-day LWP (half_to=1 on last day) → 0.5", () => {
    const leaves = [mkLeave({ type: "LWP", date_from: "2025-01-06", date_to: "2025-01-07", half_from: 0, half_to: 1 })];
    expect(attDayValue(EMP, "2025-01-07", { ...base, leaves, attCode: null })).toBe(0.5);
    expect(attDayValue(EMP, "2025-01-06", { ...base, leaves, attCode: null })).toBe(0); // middle day full LWP
  });
  it("not employed → 0 even with P mark", () => {
    const leaves = [{ ...mkLeave(), employee_id: 2 }];
    expect(attDayValue(EXITED, "2025-01-06", { ...base, leaves, attCode: "P" })).toBe(0);
  });
});

// ── payableDays — month vectors ───────────────────────────────────────────────

describe("payableDays", () => {
  const base = { settings: SUN_ONLY, holidays: [], leaves: [], leaveTypes: LEAVE_TYPES };

  it("Jan 2025, all P marks → 31 payable (27 P + 4 WO)", () => {
    const pd = payableDays(EMP, "2025-01", base, () => "P");
    expect(pd).toBe(31);
  });

  it("Jan 2025, all unmarked → 4 payable (4 WOs only)", () => {
    // Jan 2025 Sundays: 5,12,19,26 — all 4 are WOs
    const pd = payableDays(EMP, "2025-01", base, () => null);
    expect(pd).toBe(4);
  });

  it("Jan 2025, one HD on working day → 4.5", () => {
    // Jan 6 = Monday, mark HD; rest unmarked
    const pd = payableDays(EMP, "2025-01", base, (d) => d === "2025-01-06" ? "HD" : null);
    expect(pd).toBe(4.5);
  });

  it("LWP does not add to payable", () => {
    const leaves = [mkLeave({ type: "LWP", date_from: "2025-01-06", date_to: "2025-01-06" })];
    const pd = payableDays(EMP, "2025-01", { ...base, leaves }, () => null);
    expect(pd).toBe(4); // 4 WOs, LWP day = 0
  });

  it("paid leave (EL) counts as 1", () => {
    const leaves = [mkLeave({ type: "EL", date_from: "2025-01-06", date_to: "2025-01-06" })];
    const pd = payableDays(EMP, "2025-01", { ...base, leaves }, () => null);
    expect(pd).toBe(5); // 4 WOs + 1 EL
  });

  it("holiday adds 1 even if unmarked", () => {
    // Republic Day Jan 26 is also a Sunday (already a WO) → no extra; add another holiday
    const holidays = [{ date: "2025-01-14", name: "Makar Sankranti" }]; // Tuesday
    const pd = payableDays(EMP, "2025-01", { ...base, holidays }, () => null);
    expect(pd).toBe(5); // 4 WOs + 1 holiday
  });

  it("February 2025 (28 days, 4 Sundays): all P → 28", () => {
    // Feb 2025 Sundays: 2,9,16,23
    const pd = payableDays(EMP, "2025-02", base, () => "P");
    expect(pd).toBe(28);
  });

  it("HD = 0.5 contribution to monthly total", () => {
    // Give every day HD (27 working + 4 WO in Jan 2025)
    // WO = 1, HD = 0.5 → 4×1 + 27×0.5 = 4 + 13.5 = 17.5
    const pd = payableDays(EMP, "2025-01", base, (d) => {
      const dow = new Date(d + "T00:00:00Z").getUTCDay();
      return dow === 0 ? null : "HD"; // WO on Sunday, HD on working days
    });
    expect(pd).toBe(17.5);
  });

  it("exited employee: all days after exit = 0", () => {
    // EXITED left 2024-12-31; in Jan 2025 they should have 0 payable
    const pd = payableDays(EXITED, "2025-01", base, () => "P");
    expect(pd).toBe(0);
  });

  it("pre-doj employee: 0 payable", () => {
    // NOTYET doj = 2025-02-01; check Jan 2025
    const pd = payableDays(NOTYET, "2025-01", base, () => "P");
    expect(pd).toBe(0);
  });

  it("satOff=2_4: extra 2 Saturdays off in March 2025", () => {
    const settings = { weekOffs: [0], satOff: "2_4" };
    // March 2025: 31 days, 5 Sundays (2,9,16,23,30), 2nd+4th Sat off (Mar8, Mar22)
    // Sundays off=5, 2nd+4th Sat off=2, total WO=7, working=24
    // With all P: 31 payable
    const pd = payableDays(EMP, "2025-03", { ...base, settings }, () => "P");
    expect(pd).toBe(31);
  });
});
