/**
 * Employee API + RBAC tests.
 * Tests: RBAC matrix (salary stripping, self-edit restrictions, 403 on cross-read),
 * org CRUD, CSV import via API, salary structures.
 */
import { describe, it, expect, beforeAll } from "vitest";
import supertest from "supertest";
import { buildApp, insertEmployee, loginAs } from "./helpers.js";

describe("Employees API & RBAC", () => {
  let app, db, hrUser, empUser1, empUser2, hrCookie, emp1Cookie, emp2Cookie;

  beforeAll(async () => {
    ({ app, db } = buildApp());

    // Insert org data
    db.prepare("INSERT INTO departments(name) VALUES('Technology')").run();
    db.prepare("INSERT INTO departments(name) VALUES('HR')").run();
    db.prepare("INSERT INTO designations(name) VALUES('Engineer')").run();
    db.prepare("INSERT INTO locations(name) VALUES('Mumbai HO')").run();

    hrUser = await insertEmployee(db, {
      code: "HR001", name: "HR Person", email: "hr@test.com", role: "HR",
    });
    empUser1 = await insertEmployee(db, {
      code: "EMP001", name: "Employee One", email: "emp1@test.com", role: "EMPLOYEE",
    });
    empUser2 = await insertEmployee(db, {
      code: "EMP002", name: "Employee Two", email: "emp2@test.com", role: "EMPLOYEE",
    });

    // Insert salary structure for empUser1
    db.prepare(
      `INSERT INTO salary_structures(employee_id, effective_from, ctc_annual, basic, hra, special, conveyance, medical, lta, other_earn)
       VALUES(?, '2024-01-01', 600000, 20000, 10000, 12000, 1600, 1250, 0, 0)`
    ).run(empUser1.id);

    // Add some statutory data to empUser1
    db.prepare(
      `UPDATE employees SET pan='ABCPX1234Z', bank_acc='1234567890', ifsc='HDFC0001', dept_id=1 WHERE id=?`
    ).run(empUser1.id);

    hrCookie = await loginAs(app, "hr@test.com");
    emp1Cookie = await loginAs(app, "emp1@test.com");
    emp2Cookie = await loginAs(app, "emp2@test.com");
  });

  /* ── List ── */
  it("HR can list all employees", async () => {
    const res = await supertest(app)
      .get("/api/employees")
      .set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(3);
  });

  it("EMPLOYEE gets 403 on list (not a manager)", async () => {
    const res = await supertest(app)
      .get("/api/employees")
      .set("Cookie", emp1Cookie);
    expect(res.status).toBe(403);
  });

  /* ── Get own profile ── */
  it("Employee can GET own profile", async () => {
    const res = await supertest(app)
      .get(`/api/employees/${empUser1.id}`)
      .set("Cookie", emp1Cookie);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Employee One");
    // Should have salary structures (own)
    expect(res.body.salary_structures).toBeDefined();
  });

  it("Employee CANNOT GET another's profile → 403", async () => {
    const res = await supertest(app)
      .get(`/api/employees/${empUser1.id}`)
      .set("Cookie", emp2Cookie);
    expect(res.status).toBe(403);
  });

  /* ── Salary stripping ── */
  it("Employee reading own profile does NOT see salary/statutory fields", async () => {
    const res = await supertest(app)
      .get(`/api/employees/${empUser1.id}`)
      .set("Cookie", emp1Cookie);
    expect(res.status).toBe(200);
    // Salary fields should be stripped for non-HR
    expect(res.body.pan).toBeUndefined();
    expect(res.body.bank_acc).toBeUndefined();
    expect(res.body.ifsc).toBeUndefined();
    // But salary_structures are visible for self
    expect(res.body.salary_structures.length).toBe(1);
  });

  it("HR reading profile DOES see salary/statutory fields", async () => {
    const res = await supertest(app)
      .get(`/api/employees/${empUser1.id}`)
      .set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    expect(res.body.pan).toBe("ABCPX1234Z");
    expect(res.body.bank_acc).toBe("1234567890");
  });

  /* ── Self-edit restrictions ── */
  it("Employee can PATCH own contact fields", async () => {
    const res = await supertest(app)
      .patch(`/api/employees/${empUser1.id}`)
      .set("Cookie", emp1Cookie)
      .send({ phone: "9876543210", address: "New Address" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("Employee CANNOT PATCH own role or salary fields", async () => {
    // Trying to send a field not in EmployeeSelfPatchSchema should fail
    const res = await supertest(app)
      .patch(`/api/employees/${empUser1.id}`)
      .set("Cookie", emp1Cookie)
      .send({ role: "ADMIN" });
    // Should get 400 because 'role' is not in EmployeeSelfPatchSchema
    expect(res.status).toBe(400);
  });

  it("Employee CANNOT PATCH another employee → 403", async () => {
    const res = await supertest(app)
      .patch(`/api/employees/${empUser1.id}`)
      .set("Cookie", emp2Cookie)
      .send({ phone: "0000000000" });
    expect(res.status).toBe(403);
  });

  /* ── HR create ── */
  it("HR can create an employee", async () => {
    const res = await supertest(app)
      .post("/api/employees")
      .set("Cookie", hrCookie)
      .send({
        code: "NEW001", name: "New Hire", gender: "Male",
        email: "newhire@igenesys.com", doj: "2024-06-01",
        salary: {
          effective_from: "2024-06-01", ctc_annual: 600000,
          basic: 20000, hra: 10000, special: 12000,
          conveyance: 1600, medical: 1250, lta: 0,
          other_earn: 0, other_earn_label: "Other",
        },
      });
    expect(res.status).toBe(201);
    expect(res.body.code).toBe("NEW001");

    // Verify salary structure was created
    const sal = db.prepare("SELECT * FROM salary_structures WHERE employee_id = ?").get(res.body.id);
    expect(sal.basic).toBe(20000);
  });

  it("Employee CANNOT create employees → 403", async () => {
    const res = await supertest(app)
      .post("/api/employees")
      .set("Cookie", emp1Cookie)
      .send({ code: "X", name: "X", email: "x@x.com", doj: "2024-01-01", gender: "Male" });
    expect(res.status).toBe(403);
  });

  /* ── Salary structure history ── */
  it("HR patching salary inserts new structure row", async () => {
    const res = await supertest(app)
      .patch(`/api/employees/${empUser1.id}`)
      .set("Cookie", hrCookie)
      .send({
        salary: {
          effective_from: "2025-04-01", ctc_annual: 750000,
          basic: 25000, hra: 12500, special: 15000,
          conveyance: 1600, medical: 1250, lta: 0,
          other_earn: 0, other_earn_label: "Other",
        },
      });
    expect(res.status).toBe(200);

    const structures = db.prepare(
      "SELECT * FROM salary_structures WHERE employee_id = ? ORDER BY effective_from"
    ).all(empUser1.id);
    expect(structures.length).toBe(2);
    expect(structures[1].basic).toBe(25000);
    expect(structures[1].effective_from).toBe("2025-04-01");
  });
});

/* ═══════════════════════════ Org CRUD ═══════════════════════════ */
describe("Org CRUD (departments/designations/locations)", () => {
  let app, db, hrCookie, empCookie;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    const hr = await insertEmployee(db, { code: "HR01", email: "hr@org.com", role: "HR" });
    const emp = await insertEmployee(db, { code: "EMP01", email: "emp@org.com", role: "EMPLOYEE" });
    hrCookie = await loginAs(app, "hr@org.com");
    empCookie = await loginAs(app, "emp@org.com");
  });

  it("HR can create a department", async () => {
    const res = await supertest(app)
      .post("/api/departments")
      .set("Cookie", hrCookie)
      .send({ name: "New Dept" });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("New Dept");
  });

  it("duplicate department name returns 409", async () => {
    await supertest(app).post("/api/departments").set("Cookie", hrCookie).send({ name: "Dup Dept" });
    const res = await supertest(app).post("/api/departments").set("Cookie", hrCookie).send({ name: "Dup Dept" });
    expect(res.status).toBe(409);
  });

  it("HR can delete an unused department", async () => {
    const cr = await supertest(app).post("/api/departments").set("Cookie", hrCookie).send({ name: "ToDelete" });
    const res = await supertest(app).delete(`/api/departments/${cr.body.id}`).set("Cookie", hrCookie);
    expect(res.status).toBe(200);
  });

  it("cannot delete department in use by an employee", async () => {
    const cr = await supertest(app).post("/api/departments").set("Cookie", hrCookie).send({ name: "InUse" });
    // Assign employee to this dept
    db.prepare("UPDATE employees SET dept_id = ? WHERE code = 'EMP01'").run(cr.body.id);
    const res = await supertest(app).delete(`/api/departments/${cr.body.id}`).set("Cookie", hrCookie);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/in use/i);
  });

  it("EMPLOYEE cannot access org CRUD → 403", async () => {
    const res = await supertest(app).get("/api/departments").set("Cookie", empCookie);
    expect(res.status).toBe(403);
  });
});

/* ═══════════════════════════ CSV Import ═══════════════════════════ */
describe("CSV Import endpoint", () => {
  let app, db, hrCookie;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    // Seed org data
    db.prepare("INSERT INTO departments(name) VALUES('Technology')").run();
    db.prepare("INSERT INTO locations(name) VALUES('Mumbai HO')").run();
    const hr = await insertEmployee(db, { code: "HR01", email: "hr@imp.com", role: "HR" });
    hrCookie = await loginAs(app, "hr@imp.com");
  });

  it("imports 3 rows via mapping payload", async () => {
    const headers = ["Employee Name", "Emp Code", "Date of Joining", "Department", "Monthly Gross"];
    const rows = [
      ["Alice Smith", "GIL0101", "15/06/2023", "Technology", "50000"],
      ["Bob Jones", "GIL0102", "01/01/2024", "Sales", "₹45,000"],
      ["Carol Lee", "GIL0103", "15 Jan 2020", "Technology", "60000"],
    ];
    const mapping = { name: 0, code: 1, doj: 2, dept: 3, gross: 4 };

    const res = await supertest(app)
      .post("/api/employees/import")
      .set("Cookie", hrCookie)
      .send({ headers, rows, mapping, dupMode: "skip" });

    expect(res.status).toBe(200);
    expect(res.body.added).toBe(3);
    expect(res.body.skipped).toBe(0);

    // Verify employees exist
    const alice = db.prepare("SELECT * FROM employees WHERE code = 'GIL0101'").get();
    expect(alice.name).toBe("Alice Smith");
    expect(alice.doj).toBe("2023-06-15");

    // Verify auto-created dept
    const sales = db.prepare("SELECT id FROM departments WHERE name = 'Sales'").get();
    expect(sales).toBeTruthy();

    // Verify salary auto-structure (Bob: gross 45000)
    const bob = db.prepare("SELECT * FROM employees WHERE code = 'GIL0102'").get();
    const bobSal = db.prepare("SELECT * FROM salary_structures WHERE employee_id = ?").get(bob.id);
    expect(bobSal.basic).toBe(18000);  // 40% of 45000
    expect(bobSal.hra).toBe(9000);     // 50% of basic
    expect(bobSal.special).toBe(18000); // 45000 - 18000 - 9000
  });

  it("skip mode skips existing employee by code", async () => {
    const res = await supertest(app)
      .post("/api/employees/import")
      .set("Cookie", hrCookie)
      .send({
        headers: ["Name", "Code", "DOJ"],
        rows: [["Alice Updated", "GIL0101", "2024-01-01"]],
        mapping: { name: 0, code: 1, doj: 2 },
        dupMode: "skip",
      });
    expect(res.body.skipped).toBe(1);
    expect(res.body.added).toBe(0);
    // Name should NOT have changed
    const alice = db.prepare("SELECT name FROM employees WHERE code = 'GIL0101'").get();
    expect(alice.name).toBe("Alice Smith");
  });

  it("update mode updates existing employee by code", async () => {
    const res = await supertest(app)
      .post("/api/employees/import")
      .set("Cookie", hrCookie)
      .send({
        headers: ["Name", "Code", "DOJ"],
        rows: [["Alice Updated", "GIL0101", "2024-01-01"]],
        mapping: { name: 0, code: 1, doj: 2 },
        dupMode: "update",
      });
    expect(res.body.updated).toBe(1);
    const alice = db.prepare("SELECT name FROM employees WHERE code = 'GIL0101'").get();
    expect(alice.name).toBe("Alice Updated");
  });
});

/* ═══════════════════════════ Manager RBAC ═══════════════════════════ */
describe("Manager RBAC", () => {
  let app, db, mgrCookie, reportCookie, otherCookie;
  let mgrId, reportId, otherId;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    const mgr = await insertEmployee(db, { code: "MGR01", name: "Manager", email: "mgr@test.com", role: "EMPLOYEE" });
    const report = await insertEmployee(db, { code: "REP01", name: "Report", email: "rep@test.com", role: "EMPLOYEE" });
    const other = await insertEmployee(db, { code: "OTH01", name: "Other", email: "oth@test.com", role: "EMPLOYEE" });

    mgrId = mgr.id; reportId = report.id; otherId = other.id;

    // Set manager_id
    db.prepare("UPDATE employees SET manager_id = ? WHERE id = ?").run(mgrId, reportId);

    // Add salary data to report
    db.prepare("UPDATE employees SET pan = 'ABCPX9999Z', bank_acc = '999999' WHERE id = ?").run(reportId);
    db.prepare(
      `INSERT INTO salary_structures(employee_id, effective_from, ctc_annual, basic, hra, special, conveyance, medical, lta, other_earn)
       VALUES(?, '2024-01-01', 500000, 18000, 9000, 10000, 1600, 1250, 0, 0)`
    ).run(reportId);

    mgrCookie = await loginAs(app, "mgr@test.com");
    reportCookie = await loginAs(app, "rep@test.com");
    otherCookie = await loginAs(app, "oth@test.com");
  });

  it("manager can list (sees direct reports only)", async () => {
    const res = await supertest(app).get("/api/employees").set("Cookie", mgrCookie);
    expect(res.status).toBe(200);
    // Should see only direct report
    expect(res.body.length).toBe(1);
    expect(res.body[0].name).toBe("Report");
  });

  it("manager can GET direct report's profile", async () => {
    const res = await supertest(app).get(`/api/employees/${reportId}`).set("Cookie", mgrCookie);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Report");
  });

  it("manager CANNOT see salary fields on direct report", async () => {
    const res = await supertest(app).get(`/api/employees/${reportId}`).set("Cookie", mgrCookie);
    expect(res.status).toBe(200);
    expect(res.body.pan).toBeUndefined();
    expect(res.body.bank_acc).toBeUndefined();
  });

  it("manager CANNOT GET non-report employee → 403", async () => {
    const res = await supertest(app).get(`/api/employees/${otherId}`).set("Cookie", mgrCookie);
    expect(res.status).toBe(403);
  });
});
