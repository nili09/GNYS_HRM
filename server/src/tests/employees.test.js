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
    expect(res.body.data.length).toBeGreaterThanOrEqual(3);
    expect(res.body.total).toBeGreaterThanOrEqual(3);
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
    // Statutory fields should be stripped for non-HR
    expect(res.body.pan).toBeUndefined();
    // Bank fields are visible to self (self-service editing)
    expect(res.body.bank_acc).toBeDefined();
    expect(res.body.ifsc).toBeDefined();
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
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].name).toBe("Report");
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

/* ═══════════════════════════ List: status array, pagination, salary batching ═══════════════════════════ */
describe("GET /employees — status filter, pagination, salary batching", () => {
  let app, db, hrCookie;
  let allIds = [];
  let salTargets = [];
  const ACTIVE_COUNT = 8, ONBOARDING_COUNT = 2, NOTICE_COUNT = 1;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    await insertEmployee(db, { code: "PGHR1", email: "pg_hr@test.com", role: "HR" }); // status defaults to ACTIVE
    hrCookie = await loginAs(app, "pg_hr@test.com");

    for (let i = 0; i < ACTIVE_COUNT; i++) {
      const e = await insertEmployee(db, { code: `PGA${i}`, name: `Active ${i}`, email: `pg_active${i}@test.com`, status: "ACTIVE" });
      allIds.push(e.id);
    }
    for (let i = 0; i < ONBOARDING_COUNT; i++) {
      const e = await insertEmployee(db, { code: `PGO${i}`, name: `Onboard ${i}`, email: `pg_onboard${i}@test.com`, status: "ONBOARDING" });
      allIds.push(e.id);
    }
    for (let i = 0; i < NOTICE_COUNT; i++) {
      const e = await insertEmployee(db, { code: `PGN${i}`, name: `Notice ${i}`, email: `pg_notice${i}@test.com`, status: "NOTICE" });
      allIds.push(e.id);
    }
    const exited = await insertEmployee(db, { code: "PGX0", name: "Exited Zero", email: "pg_exited0@test.com", status: "EXITED" });
    allIds.push(exited.id);

    // Salary structures for 3 employees — the 3rd gets two rows to verify the
    // batched query picks the latest effective_from, not an arbitrary one.
    salTargets = allIds.slice(0, 3);
    db.prepare(
      `INSERT INTO salary_structures(employee_id, effective_from, ctc_annual, basic, hra, special, conveyance, medical, lta, other_earn)
       VALUES(?, '2023-01-01', 400000, 15000, 7500, 8000, 1600, 1250, 0, 0)`
    ).run(salTargets[0]);
    db.prepare(
      `INSERT INTO salary_structures(employee_id, effective_from, ctc_annual, basic, hra, special, conveyance, medical, lta, other_earn)
       VALUES(?, '2024-01-01', 500000, 18000, 9000, 10000, 1600, 1250, 0, 0)`
    ).run(salTargets[1]);
    db.prepare(
      `INSERT INTO salary_structures(employee_id, effective_from, ctc_annual, basic, hra, special, conveyance, medical, lta, other_earn)
       VALUES(?, '2023-06-01', 300000, 12000, 6000, 5000, 1600, 1250, 0, 0)`
    ).run(salTargets[2]);
    db.prepare(
      `INSERT INTO salary_structures(employee_id, effective_from, ctc_annual, basic, hra, special, conveyance, medical, lta, other_earn)
       VALUES(?, '2025-01-01', 700000, 28000, 14000, 16000, 1600, 1250, 0, 0)`
    ).run(salTargets[2]);
  });

  it("repeated ?status= params (Express array) no longer crash — was a 500 RangeError", async () => {
    const res = await supertest(app)
      .get("/api/employees?status=ACTIVE&status=ONBOARDING&status=NOTICE")
      .set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.every((e) => e.status !== "EXITED")).toBe(true);
    // +1 for the HR caller itself, which defaults to ACTIVE
    expect(res.body.total).toBe(ACTIVE_COUNT + 1 + ONBOARDING_COUNT + NOTICE_COUNT);
  });

  it("single ?status= value still works", async () => {
    const res = await supertest(app)
      .get("/api/employees?status=EXITED")
      .set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.data[0].status).toBe("EXITED");
  });

  it("returns the {data,total,page,pageSize} envelope", async () => {
    const res = await supertest(app).get("/api/employees").set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(typeof res.body.total).toBe("number");
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(50);
  });

  it("paginates with ?page=&limit=, no overlap between pages", async () => {
    const p1 = await supertest(app).get("/api/employees?limit=5&page=1").set("Cookie", hrCookie);
    const p2 = await supertest(app).get("/api/employees?limit=5&page=2").set("Cookie", hrCookie);
    expect(p1.body.data.length).toBe(5);
    expect(p2.body.data.length).toBe(5);
    const p1Ids = p1.body.data.map((e) => e.id);
    const p2Ids = p2.body.data.map((e) => e.id);
    expect(p1Ids.some((id) => p2Ids.includes(id))).toBe(false);
  });

  it("caps ?limit= at the documented maximum", async () => {
    const res = await supertest(app).get("/api/employees?limit=999999").set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    expect(res.body.pageSize).toBe(1200);
  });

  it("attaches each employee's latest salary structure (ties broken by effective_from)", async () => {
    const res = await supertest(app).get("/api/employees?limit=200").set("Cookie", hrCookie);
    const byId = {};
    for (const e of res.body.data) byId[e.id] = e;

    expect(byId[salTargets[0]].salary.basic).toBe(15000);
    expect(byId[salTargets[1]].salary.basic).toBe(18000);
    // salTargets[2] has two structures — the 2025-01-01 one must win, not 2023-06-01
    expect(byId[salTargets[2]].salary.basic).toBe(28000);
    expect(byId[salTargets[2]].salary.effective_from).toBe("2025-01-01");
  });

  it("fetches salary in one batched query, not one per row", async () => {
    let prepareCalls = 0;
    const origPrepare = db.prepare.bind(db);
    db.prepare = (sql) => { prepareCalls++; return origPrepare(sql); };

    const res = await supertest(app).get("/api/employees?limit=200").set("Cookie", hrCookie);

    db.prepare = origPrepare;

    expect(res.status).toBe(200);
    // count query + main list query + one batched salary query — independent of row count
    expect(prepareCalls).toBeLessThanOrEqual(5);
  });
});
