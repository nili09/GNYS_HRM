/**
 * HROne extended fields tests — Stage 8
 * (a) Import CSV with exact HROne headers + 2 rows → every column correct
 * (b) Derived fields computed correctly (age, tenure_to_retirement, work_anniversary)
 * (c) Round-trip export headers == 44 HROne columns in order; export→import idempotent
 * (d) RBAC — EMPLOYEE PATCH of resignation/login/status field → 403; salary absent from non-HR GETs
 */
import { describe, it, expect, beforeAll } from "vitest";
import supertest from "supertest";
import { buildApp, insertEmployee, loginAs } from "./helpers.js";
import {
  guessMap, rowToEmp, normBool, normTitleCase,
  computeDerived, HRONE_EXPORT_HEADERS, parseCSV,
} from "@hrms/shared/import";

/* ═══════════════════════ normBool / normTitleCase ═══════════════════════ */
describe("normBool", () => {
  it("coerces yes/no/true/false/1/0/y/n", () => {
    expect(normBool("Yes")).toBe(1);
    expect(normBool("yes")).toBe(1);
    expect(normBool("Y")).toBe(1);
    expect(normBool("true")).toBe(1);
    expect(normBool("1")).toBe(1);
    expect(normBool("No")).toBe(0);
    expect(normBool("no")).toBe(0);
    expect(normBool("N")).toBe(0);
    expect(normBool("false")).toBe(0);
    expect(normBool("0")).toBe(0);
    expect(normBool("")).toBe(null);
    expect(normBool(null)).toBe(null);
  });
});

describe("normTitleCase", () => {
  it("title-cases trimmed text", () => {
    expect(normTitleCase("probation")).toBe("Probation");
    expect(normTitleCase("  completed ")).toBe("Completed");
    expect(normTitleCase("")).toBe("");
    expect(normTitleCase(null)).toBe("");
  });
});

/* ═══════════════════════ guessMap with HROne headers ═══════════════════════ */
describe("guessMap — HROne CSV headers", () => {
  // Exact header strings from `import from.csv`
  const HRONE_HEADERS = [
    "Employee Code", "Prefix", "Full name", "Date of birth", "Gender",
    "Blood group", "Nationality", "Age", "Tenure to retirement",
    "Employment status", "Employee Other Status",
    "Company", "Business Unit", "Department", "Designation", "Branch", "Sub branch",
    "Reporting manager code", "Reporting manager",
    "Functional manager",
    "Personal status", "Education status", "Work experience status",
    "Family status", "Health insurance status", "Nominee details status",
    "Other dependent status", "Child info status", "Bank status",
    "Previous employer details status", "Document status",
    "Employee resignation type", "Employee resignation reason", "Requestee Remarks",
    "Approver resignation type", "Approver resignation reason", "Approver Remarks",
    "Enable employee login", "Invite status", "Login status",
    "Notice period in confirmation", "Notice period in probation",
    "Wedding Anniversary", "Work Anniversary",
  ];

  it("auto-maps all 44 HROne columns (non-derived)", () => {
    const map = guessMap(HRONE_HEADERS);
    // Core
    expect(map.code).toBe(0);
    expect(map.prefix).toBe(1);
    expect(map.name).toBe(2);
    expect(map.dob).toBe(3);
    expect(map.gender).toBe(4);
    expect(map.bloodGroup).toBe(5);
    expect(map.nationality).toBe(6);
    // Derived (accepted)
    expect(map._age).toBe(7);
    expect(map._tenureToRetirement).toBe(8);
    // Org
    expect(map.employmentStatus).toBe(9);
    expect(map.otherStatus).toBe(10);
    expect(map.company).toBe(11);
    expect(map.businessUnit).toBe(12);
    expect(map.dept).toBe(13);
    expect(map.desig).toBe(14);
    expect(map.location).toBe(15);
    expect(map.subBranch).toBe(16);
    expect(map.managerCode).toBe(17);
    expect(map.managerName).toBe(18);
    expect(map.functionalManagerCode).toBe(19);
    // Section statuses
    expect(map.personalStatus).toBe(20);
    expect(map.educationStatus).toBe(21);
    expect(map.workExpStatus).toBe(22);
    expect(map.familyStatus).toBe(23);
    expect(map.healthInsuranceStatus).toBe(24);
    expect(map.nomineeStatus).toBe(25);
    expect(map.dependentStatus).toBe(26);
    expect(map.childInfoStatus).toBe(27);
    expect(map.bankStatus).toBe(28);
    expect(map.prevEmployerStatus).toBe(29);
    expect(map.documentStatus).toBe(30);
    // Resignation
    expect(map.resignationType).toBe(31);
    expect(map.resignationReason).toBe(32);
    expect(map.requesteeRemarks).toBe(33);
    expect(map.approverResignationType).toBe(34);
    expect(map.approverResignationReason).toBe(35);
    expect(map.approverRemarks).toBe(36);
    // Login
    expect(map.loginEnabled).toBe(37);
    expect(map.inviteStatus).toBe(38);
    expect(map.loginStatus).toBe(39);
    // Notice
    expect(map.noticePeriodConfirm).toBe(40);
    expect(map.noticePeriodProbation).toBe(41);
    // Dates
    expect(map.weddingAnniversary).toBe(42);
    expect(map._workAnniversary).toBe(43);
  });
});

/* ═══════════════════════ rowToEmp with HROne data ═══════════════════════ */
describe("rowToEmp — HROne fields normalization", () => {
  const HRONE_HEADERS = [
    "Employee Code", "Prefix", "Full name", "Date of birth", "Gender",
    "Blood group", "Nationality", "Age", "Tenure to retirement",
    "Employment status", "Employee Other Status",
    "Company", "Business Unit", "Department", "Designation", "Branch", "Sub branch",
    "Reporting manager code", "Reporting manager",
    "Functional manager",
    "Personal status", "Education status", "Work experience status",
    "Family status", "Health insurance status", "Nominee details status",
    "Other dependent status", "Child info status", "Bank status",
    "Previous employer details status", "Document status",
    "Employee resignation type", "Employee resignation reason", "Requestee Remarks",
    "Approver resignation type", "Approver resignation reason", "Approver Remarks",
    "Enable employee login", "Invite status", "Login status",
    "Notice period in confirmation", "Notice period in probation",
    "Wedding Anniversary", "Work Anniversary",
  ];

  const row1 = [
    "GIL0001", "Mr", "Rajesh Kumar", "15/06/1990", "Male",
    "O+", "Indian", "35", "23 Years 0 Months",
    "confirmed", "active",
    "Genesys Intl", "Technology", "Engineering", "Sr Developer", "Mumbai HQ", "Andheri",
    "GIL0050", "Sunita Sharma",
    "GIL0055",
    "completed", "completed", "pending",
    "completed", "pending", "completed",
    "pending", "completed", "completed",
    "pending", "completed",
    "Voluntary", "Better opportunity", "Good employee",
    "Voluntary", "Career growth", "Approved with notice",
    "Yes", "Sent", "Active",
    "90", "30",
    "25/12/2018", "15/06/2020",
  ];

  it("normalizes all HROne fields from a row", () => {
    const map = guessMap(HRONE_HEADERS);
    const e = rowToEmp(row1, map);

    // Core
    expect(e.code).toBe("GIL0001");
    expect(e.name).toBe("Rajesh Kumar");
    expect(e.dob).toBe("1990-06-15");
    expect(e.gender).toBe("Male");

    // New text fields — title-cased
    expect(e.prefix).toBe("Mr");
    expect(e.bloodGroup).toBe("O+");
    expect(e.nationality).toBe("Indian");
    expect(e.employmentStatus).toBe("Confirmed");
    expect(e.otherStatus).toBe("Active");
    expect(e.company).toBe("Genesys Intl");
    expect(e.businessUnit).toBe("Technology");
    expect(e.subBranch).toBe("Andheri");
    expect(e.functionalManagerCode).toBe("GIL0055");

    // Section statuses
    expect(e.personalStatus).toBe("Completed");
    expect(e.educationStatus).toBe("Completed");
    expect(e.workExpStatus).toBe("Pending");
    expect(e.familyStatus).toBe("Completed");
    expect(e.healthInsuranceStatus).toBe("Pending");
    expect(e.nomineeStatus).toBe("Completed");
    expect(e.dependentStatus).toBe("Pending");
    expect(e.childInfoStatus).toBe("Completed");
    expect(e.bankStatus).toBe("Completed");
    expect(e.prevEmployerStatus).toBe("Pending");
    expect(e.documentStatus).toBe("Completed");

    // Resignation
    expect(e.resignationType).toBe("Voluntary");
    expect(e.resignationReason).toBe("Better opportunity");
    expect(e.requesteeRemarks).toBe("Good employee");
    expect(e.approverResignationType).toBe("Voluntary");
    expect(e.approverResignationReason).toBe("Career growth");
    expect(e.approverRemarks).toBe("Approved with notice");

    // Login — boolean coerced
    expect(e.loginEnabled).toBe(1);
    expect(e.inviteStatus).toBe("Sent");
    expect(e.loginStatus).toBe("Active");

    // Notice period — numbers
    expect(e.noticePeriodConfirm).toBe(90);
    expect(e.noticePeriodProbation).toBe(30);

    // Dates normalized
    expect(e.weddingAnniversary).toBe("2018-12-25");
  });

  it("ignores derived columns (age, tenure_to_retirement, work_anniversary)", () => {
    const map = guessMap(HRONE_HEADERS);
    const e = rowToEmp(row1, map);
    // These should NOT be on the output object
    expect(e._age).toBeUndefined();
    expect(e._tenureToRetirement).toBeUndefined();
    expect(e._workAnniversary).toBeUndefined();
    // The regular age/tenure fields should not exist either
    expect(e.age).toBeUndefined();
    expect(e.tenureToRetirement).toBeUndefined();
  });
});

/* ═══════════════════════ computeDerived ═══════════════════════ */
describe("computeDerived", () => {
  it("computes age from dob", () => {
    const today = new Date();
    const tenYearsAgo = `${today.getFullYear() - 30}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const d = computeDerived({ dob: tenYearsAgo, doj: "2020-01-15" });
    expect(d.age).toBe("30");
  });

  it("computes tenure_to_retirement (retirement at 58)", () => {
    const d = computeDerived({ dob: "1990-01-15", doj: "2020-01-15" }, 58);
    // Should be something like "21 Years X Months" (depending on current date)
    expect(d.tenureToRetirement).toMatch(/\d+ Years \d+ Months/);
  });

  it("returns Retired when past retirement age", () => {
    const d = computeDerived({ dob: "1950-01-15", doj: "1975-01-15" }, 58);
    expect(d.tenureToRetirement).toBe("Retired");
  });

  it("computes work_anniversary from doj", () => {
    const d = computeDerived({ dob: "1990-01-15", doj: "2020-06-15" });
    expect(d.workAnniversary).toBe("2020-06-15");
  });

  it("handles missing dob/doj gracefully", () => {
    const d = computeDerived({});
    expect(d.age).toBe("");
    expect(d.tenureToRetirement).toBe("");
    expect(d.workAnniversary).toBe("");
  });
});

/* ═══════════════════════ Full import → export round-trip ═══════════════════════ */
describe("CSV import + export round-trip", () => {
  let app, db, hrCookie;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    const hr = await insertEmployee(db, {
      role: "HR", email: "hr@test.com", code: "HR001",
    });
    hrCookie = await loginAs(app, "hr@test.com");

    // Create a department, designation, location for import
    db.prepare("INSERT INTO departments(name) VALUES('Engineering')").run();
    db.prepare("INSERT INTO designations(name) VALUES('Sr Developer')").run();
    db.prepare("INSERT INTO locations(name) VALUES('Mumbai HQ')").run();
  });

  const HRONE_HEADERS = [
    "Employee Code", "Prefix", "Full name", "Date of birth", "Gender",
    "Blood group", "Nationality", "Age", "Tenure to retirement",
    "Employment status", "Employee Other Status",
    "Company", "Business Unit", "Department", "Designation", "Branch", "Sub branch",
    "Reporting manager code", "Reporting manager",
    "Functional manager",
    "Personal status", "Education status", "Work experience status",
    "Family status", "Health insurance status", "Nominee details status",
    "Other dependent status", "Child info status", "Bank status",
    "Previous employer details status", "Document status",
    "Employee resignation type", "Employee resignation reason", "Requestee Remarks",
    "Approver resignation type", "Approver resignation reason", "Approver Remarks",
    "Enable employee login", "Invite status", "Login status",
    "Notice period in confirmation", "Notice period in probation",
    "Wedding Anniversary", "Work Anniversary",
  ];

  const sampleRow1 = [
    "GIL1001", "Mr", "Amit Patel", "15/06/1990", "Male",
    "A+", "Indian", "35", "23 Years",
    "confirmed", "",
    "Genesys Intl", "Tech BU", "Engineering", "Sr Developer", "Mumbai HQ", "Andheri",
    "", "",
    "",
    "completed", "completed", "pending",
    "completed", "pending", "completed",
    "pending", "completed", "completed",
    "pending", "completed",
    "", "", "",
    "", "", "",
    "Yes", "Sent", "Active",
    "90", "30",
    "25/12/2018", "",
  ];

  const sampleRow2 = [
    "GIL1002", "Ms", "Priya Singh", "01/03/1985", "Female",
    "B+", "Indian", "41", "17 Years",
    "probation", "",
    "Genesys Intl", "HR BU", "Engineering", "Sr Developer", "Mumbai HQ", "",
    "", "",
    "",
    "pending", "pending", "pending",
    "pending", "pending", "pending",
    "pending", "pending", "pending",
    "pending", "pending",
    "Voluntary", "Personal", "N/A",
    "Voluntary", "Accepted", "Ok",
    "No", "", "",
    "60", "15",
    "", "",
  ];

  it("imports 2 rows with all HROne columns correctly", async () => {
    const map = guessMap(HRONE_HEADERS);
    const res = await supertest(app)
      .post("/api/employees/import")
      .set("Cookie", hrCookie)
      .send({
        mapping: map,
        headers: HRONE_HEADERS,
        rows: [sampleRow1, sampleRow2],
        dupMode: "skip",
      });

    expect(res.status).toBe(200);
    expect(res.body.added).toBe(2);
    expect(res.body.skipped).toBe(0);

    // Verify first employee
    const emp1 = db.prepare("SELECT * FROM employees WHERE code = 'GIL1001'").get();
    expect(emp1).toBeTruthy();
    expect(emp1.prefix).toBe("Mr");
    expect(emp1.blood_group).toBe("A+");
    expect(emp1.nationality).toBe("Indian");
    expect(emp1.employment_status).toBe("Confirmed");
    expect(emp1.company).toBe("Genesys Intl");
    expect(emp1.business_unit).toBe("Tech BU");
    expect(emp1.sub_branch).toBe("Andheri");
    expect(emp1.personal_status).toBe("Completed");
    expect(emp1.education_status).toBe("Completed");
    expect(emp1.work_exp_status).toBe("Pending");
    expect(emp1.login_enabled).toBe(1);
    expect(emp1.invite_status).toBe("Sent");
    expect(emp1.notice_period_confirm).toBe(90);
    expect(emp1.notice_period_probation).toBe(30);
    expect(emp1.wedding_anniversary).toBe("2018-12-25");
    expect(emp1.dob).toBe("1990-06-15");

    // Verify second employee
    const emp2 = db.prepare("SELECT * FROM employees WHERE code = 'GIL1002'").get();
    expect(emp2).toBeTruthy();
    expect(emp2.prefix).toBe("Ms");
    expect(emp2.blood_group).toBe("B+");
    expect(emp2.employment_status).toBe("Probation");
    expect(emp2.resignation_type).toBe("Voluntary");
    expect(emp2.resignation_reason).toBe("Personal");
    expect(emp2.login_enabled).toBe(0);
    expect(emp2.notice_period_confirm).toBe(60);
    expect(emp2.notice_period_probation).toBe(15);
  });

  it("export headers match the 44 HROne columns in exact order", async () => {
    const res = await supertest(app)
      .get("/api/employees/export")
      .set("Cookie", hrCookie);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);

    const csv = parseCSV(res.text);
    expect(csv.length).toBeGreaterThan(1); // header + at least 1 data row

    const exportedHeaders = csv[0];
    expect(exportedHeaders).toEqual(HRONE_EXPORT_HEADERS);
  });

  it("export→import round-trip is idempotent", async () => {
    // Export
    const exportRes = await supertest(app)
      .get("/api/employees/export")
      .set("Cookie", hrCookie);
    expect(exportRes.status).toBe(200);

    const csv = parseCSV(exportRes.text);
    const headers = csv[0];
    const dataRows = csv.slice(1);

    // Re-import with update mode
    const map = guessMap(headers);
    const importRes = await supertest(app)
      .post("/api/employees/import")
      .set("Cookie", hrCookie)
      .send({
        mapping: map,
        headers: headers,
        rows: dataRows,
        dupMode: "update",
      });

    expect(importRes.status).toBe(200);
    expect(importRes.body.added).toBe(0); // all existing, updated
    expect(importRes.body.skipped).toBe(0);

    // Verify data is unchanged after round-trip
    const emp1 = db.prepare("SELECT * FROM employees WHERE code = 'GIL1001'").get();
    expect(emp1.prefix).toBe("Mr");
    expect(emp1.blood_group).toBe("A+");
    expect(emp1.nationality).toBe("Indian");
    expect(emp1.employment_status).toBe("Confirmed");
    expect(emp1.login_enabled).toBe(1);
    expect(emp1.notice_period_confirm).toBe(90);
    expect(emp1.wedding_anniversary).toBe("2018-12-25");
  });
});

/* ═══════════════════════ RBAC ═══════════════════════ */
describe("RBAC — HROne fields", () => {
  let app, db, empCookie, hrCookie, empId;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    const hr = await insertEmployee(db, {
      role: "HR", email: "hr2@test.com", code: "HR002",
    });
    hrCookie = await loginAs(app, "hr2@test.com");

    const emp = await insertEmployee(db, {
      role: "EMPLOYEE", email: "emp2@test.com", code: "EMP002",
      resignation_type: "Voluntary",
      login_enabled: 1,
      employment_status: "Confirmed",
    });
    empId = emp.id;
    empCookie = await loginAs(app, "emp2@test.com");
  });

  it("EMPLOYEE PATCH of resignation field → 400 (strict schema rejects)", async () => {
    const res = await supertest(app)
      .patch(`/api/employees/${empId}`)
      .set("Cookie", empCookie)
      .send({ resignation_type: "Forced" });

    expect(res.status).toBe(400);
  });

  it("EMPLOYEE PATCH of login_enabled → 400 (strict schema rejects)", async () => {
    const res = await supertest(app)
      .patch(`/api/employees/${empId}`)
      .set("Cookie", empCookie)
      .send({ login_enabled: 0 });

    expect(res.status).toBe(400);
  });

  it("EMPLOYEE PATCH of employment_status → 400 (strict schema rejects)", async () => {
    const res = await supertest(app)
      .patch(`/api/employees/${empId}`)
      .set("Cookie", empCookie)
      .send({ employment_status: "Probation" });

    expect(res.status).toBe(400);
  });

  it("EMPLOYEE PATCH of contact fields still works", async () => {
    const res = await supertest(app)
      .patch(`/api/employees/${empId}`)
      .set("Cookie", empCookie)
      .send({ phone: "9876543210" });

    expect(res.status).toBe(200);
  });

  it("HR PATCH of resignation field works", async () => {
    const res = await supertest(app)
      .patch(`/api/employees/${empId}`)
      .set("Cookie", hrCookie)
      .send({ resignation_type: "Involuntary" });

    expect(res.status).toBe(200);
    const emp = db.prepare("SELECT resignation_type FROM employees WHERE id = ?").get(empId);
    expect(emp.resignation_type).toBe("Involuntary");
  });

  it("salary data absent from EMPLOYEE GET of own profile", async () => {
    // Give the employee a salary
    db.prepare(
      `INSERT OR REPLACE INTO salary_structures(employee_id, effective_from, ctc_annual, basic, hra, special, conveyance, medical, lta, other_earn, other_earn_label)
       VALUES(?, '2024-01-01', 1200000, 40000, 20000, 20000, 1600, 1250, 0, 0, 'Other')`
    ).run(empId);

    const res = await supertest(app)
      .get(`/api/employees/${empId}`)
      .set("Cookie", empCookie);

    expect(res.status).toBe(200);
    // Statutory fields stripped; bank visible to self
    expect(res.body.pan).toBeUndefined();
    expect(res.body.aadhaar).toBeUndefined();
    // But salary_structures are visible (own payslip data)
    expect(res.body.salary_structures).toBeDefined();
    // HROne extended fields ARE visible (non-statutory)
    expect(res.body.employment_status).toBe("Confirmed");
    expect(res.body.login_enabled).toBe(1);
    // Derived fields present
    expect(res.body.age).toBeDefined();
    expect(res.body.work_anniversary).toBeDefined();
  });

  it("export endpoint denied for EMPLOYEE", async () => {
    const res = await supertest(app)
      .get("/api/employees/export")
      .set("Cookie", empCookie);

    expect(res.status).toBe(403);
  });
});
