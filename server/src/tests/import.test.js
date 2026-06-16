/**
 * Import utilities test — ported from v1's verified edge-case suite.
 * Tests: Indian dates (DD/MM/YYYY, "15 Jan 2020", 2-digit years, Excel serials),
 * ₹1,45,000 numbers, gross-only auto-structure 40/50/balance, dup modes.
 */
import { describe, it, expect } from "vitest";
import { parseCSV, normDate, normNum, normGender, guessMap, rowToEmp, IMP_FIELDS } from "@hrms/shared/import";

/* ═══════════════════════════ normDate ═══════════════════════════ */
describe("normDate", () => {
  it("parses ISO YYYY-MM-DD", () => {
    expect(normDate("2024-06-15")).toBe("2024-06-15");
  });

  it("parses DD/MM/YYYY (Indian style)", () => {
    expect(normDate("15/06/2024")).toBe("2024-06-15");
    expect(normDate("01/01/2020")).toBe("2020-01-01");
  });

  it("parses DD-MM-YYYY", () => {
    expect(normDate("15-06-2024")).toBe("2024-06-15");
  });

  it("parses DD.MM.YYYY", () => {
    expect(normDate("15.06.2024")).toBe("2024-06-15");
  });

  it("tolerates M/D/Y when month > 12", () => {
    // 15/6/2024 is unambiguous (15 can't be a month)
    expect(normDate("15/6/2024")).toBe("2024-06-15");
    // 6/15/2024 — month=15>12, so swap: day=15, month=6
    expect(normDate("6/15/2024")).toBe("2024-06-15");
  });

  it("parses '15 Jan 2020' style", () => {
    expect(normDate("15 Jan 2020")).toBe("2020-01-15");
    expect(normDate("1 December 2023")).toBe("2023-12-01");
  });

  it("parses 'Jan 15, 2020' style", () => {
    expect(normDate("Jan 15, 2020")).toBe("2020-01-15");
    expect(normDate("December 1, 2023")).toBe("2023-12-01");
  });

  it("handles 2-digit years (>=50 → 1900s, <50 → 2000s)", () => {
    expect(normDate("15/06/99")).toBe("1999-06-15");
    expect(normDate("15/06/02")).toBe("2002-06-15");
    expect(normDate("15/06/49")).toBe("2049-06-15");
    expect(normDate("15/06/50")).toBe("1950-06-15");
  });

  it("parses Excel serial numbers", () => {
    // 44927 = 2023-01-01 in Excel
    expect(normDate("44927")).toBe("2023-01-01");
    // 45292 = 2024-01-01
    expect(normDate("45292")).toBe("2024-01-01");
  });

  it("returns empty string for unparseable input", () => {
    expect(normDate("")).toBe("");
    expect(normDate(null)).toBe("");
    expect(normDate(undefined)).toBe("");
    expect(normDate("not a date")).toBe("");
  });
});

/* ═══════════════════════════ normNum ═══════════════════════════ */
describe("normNum", () => {
  it("strips ₹, commas, spaces", () => {
    expect(normNum("₹1,45,000")).toBe(145000);
    expect(normNum("₹ 25,000")).toBe(25000);
    expect(normNum("1,00,000")).toBe(100000);
  });

  it("handles plain numbers", () => {
    expect(normNum("50000")).toBe(50000);
    expect(normNum(30000)).toBe(30000);
  });

  it("returns 0 for nullish / non-numeric", () => {
    expect(normNum(null)).toBe(0);
    expect(normNum(undefined)).toBe(0);
    expect(normNum("abc")).toBe(0);
    expect(normNum("")).toBe(0);
  });
});

/* ═══════════════════════════ normGender ═══════════════════════════ */
describe("normGender", () => {
  it("normalizes male/female/other", () => {
    expect(normGender("Male")).toBe("Male");
    expect(normGender("male")).toBe("Male");
    expect(normGender("M")).toBe("Male");
    expect(normGender("Female")).toBe("Female");
    expect(normGender("female")).toBe("Female");
    expect(normGender("F")).toBe("Female");
    expect(normGender("Other")).toBe("Other");
    expect(normGender("")).toBe("Male"); // default
  });
});

/* ═══════════════════════════ parseCSV ═══════════════════════════ */
describe("parseCSV", () => {
  it("parses simple CSV", () => {
    const rows = parseCSV("a,b,c\n1,2,3\n4,5,6");
    expect(rows).toEqual([["a", "b", "c"], ["1", "2", "3"], ["4", "5", "6"]]);
  });

  it("handles quoted fields with commas", () => {
    const rows = parseCSV('name,address\n"Smith, John","123 Main St"');
    expect(rows[1][0]).toBe("Smith, John");
  });

  it("handles quoted fields with escaped quotes", () => {
    const rows = parseCSV('a\n"he said ""hello"""');
    expect(rows[1][0]).toBe('he said "hello"');
  });

  it("strips BOM", () => {
    const rows = parseCSV("﻿a,b\n1,2");
    expect(rows[0][0]).toBe("a");
  });

  it("handles CRLF line endings", () => {
    const rows = parseCSV("a,b\r\n1,2\r\n3,4");
    expect(rows.length).toBe(3);
  });

  it("skips blank rows", () => {
    const rows = parseCSV("a,b\n\n1,2\n\n");
    expect(rows.length).toBe(2);
  });
});

/* ═══════════════════════════ guessMap ═══════════════════════════ */
describe("guessMap", () => {
  it("auto-maps common HR column names", () => {
    const headers = ["Employee Name", "Emp Code", "Date of Joining", "Department", "Monthly Gross"];
    const map = guessMap(headers);
    expect(map.name).toBe(0);
    expect(map.code).toBe(1);
    expect(map.doj).toBe(2);
    expect(map.dept).toBe(3);
    expect(map.gross).toBe(4);
  });

  it("maps HROne-style headers", () => {
    const headers = ["Employee Code", "Employee Name", "Date of Birth", "Official Email", "Basic", "HRA"];
    const map = guessMap(headers);
    expect(map.code).toBe(0);
    expect(map.name).toBe(1);
    expect(map.dob).toBe(2);
    expect(map.email).toBe(3);
    expect(map.basic).toBe(4);
    expect(map.hra).toBe(5);
  });
});

/* ═══════════════════════════ rowToEmp ═══════════════════════════ */
describe("rowToEmp", () => {
  it("extracts fields from a mapped row", () => {
    const row = ["John Doe", "GIL001", "15/06/2023", "Technology", "50000"];
    const map = { name: 0, code: 1, doj: 2, dept: 3, gross: 4 };
    const e = rowToEmp(row, map);
    expect(e.name).toBe("John Doe");
    expect(e.code).toBe("GIL001");
    expect(e.doj).toBe("2023-06-15");
    expect(e.dept).toBe("Technology");
  });

  it("auto-structures from gross: basic=40%, HRA=50% of basic, rest=special", () => {
    const row = ["Test", "", "2024-01-01", "", "50000"];
    const map = { name: 0, code: 1, doj: 2, dept: 3, gross: 4 };
    const e = rowToEmp(row, map);
    expect(e.basic).toBe(20000);    // 40% of 50000
    expect(e.hra).toBe(10000);      // 50% of basic
    expect(e.special).toBe(20000);  // 50000 - 20000 - 10000
  });

  it("does NOT auto-structure if basic is explicitly given", () => {
    const row = ["Test", "", "2024-01-01", "60000", "25000"];
    const map = { name: 0, code: 1, doj: 2, gross: 3, basic: 4 };
    const e = rowToEmp(row, map);
    expect(e.basic).toBe(25000); // explicit, not 40% of 60000
    expect(e.special).toBe(0);   // no auto-structure
  });

  it("handles ₹-formatted salary values", () => {
    const row = ["Test", "", "2024-01-01", "₹1,45,000"];
    const map = { name: 0, code: 1, doj: 2, gross: 3 };
    const e = rowToEmp(row, map);
    expect(e.basic).toBe(58000);   // 40% of 145000
    expect(e.hra).toBe(29000);     // 50% of basic
    expect(e.special).toBe(58000); // 145000 - 58000 - 29000
  });

  it("normalizes date and gender fields", () => {
    const row = ["Jane", "F", "15 Jan 2020"];
    const map = { name: 0, gender: 1, doj: 2 };
    const e = rowToEmp(row, map);
    expect(e.gender).toBe("Female");
    expect(e.doj).toBe("2020-01-15");
  });

  it("uppercases PAN and IFSC", () => {
    const row = ["Test", "abcpx1234z", "hdfc0001234"];
    const map = { name: 0, pan: 1, ifsc: 2 };
    const e = rowToEmp(row, map);
    expect(e.pan).toBe("ABCPX1234Z");
    expect(e.ifsc).toBe("HDFC0001234");
  });
});
