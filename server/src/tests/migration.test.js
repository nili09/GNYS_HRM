import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../db/migrate.js";

// Convenience: fresh in-memory DB for each test
function newDb() {
  return new Database(":memory:");
}

describe("Migration idempotency", () => {
  it("runs migration twice without error", () => {
    const db = newDb();
    expect(() => migrate(db)).not.toThrow();
    expect(() => migrate(db)).not.toThrow();
  });

  it("creates all required tables", () => {
    const db = newDb();
    migrate(db);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r) => r.name);

    const required = [
      "attendance",
      "audit_log",
      "departments",
      "designations",
      "docs_checklist",
      "employees",
      "holidays",
      "leave_adjustments",
      "leave_types",
      "leaves",
      "locations",
      "payroll_lines",
      "payroll_runs",
      "salary_structures",
      "settings",
    ];

    for (const t of required) {
      expect(tables, `Expected table '${t}' to exist`).toContain(t);
    }
  });

  it("foreign_keys pragma is ON after migration", () => {
    const db = newDb();
    migrate(db);
    const row = db.prepare("PRAGMA foreign_keys").get();
    // value lives under the column name key
    expect(row["foreign_keys"]).toBe(1);
  });

  it("can insert and query employees table", () => {
    const db = newDb();
    migrate(db);

    db.prepare(
      `INSERT INTO employees(code, name, email, doj, password_hash, role)
       VALUES('T001', 'Test User', 'test@example.com', '2024-01-01', 'hash', 'EMPLOYEE')`
    ).run();

    const row = db.prepare("SELECT * FROM employees WHERE code = 'T001'").get();
    expect(row.name).toBe("Test User");
    expect(row.role).toBe("EMPLOYEE");
    expect(row.must_change_pw).toBe(1); // DEFAULT 1
    expect(row.status).toBe("ONBOARDING"); // DEFAULT 'ONBOARDING'
  });

  it("employees email is UNIQUE", () => {
    const db = newDb();
    migrate(db);

    db.prepare(
      `INSERT INTO employees(code, name, email, doj, password_hash, role)
       VALUES('T001', 'User One', 'dup@example.com', '2024-01-01', 'hash', 'EMPLOYEE')`
    ).run();

    expect(() =>
      db
        .prepare(
          `INSERT INTO employees(code, name, email, doj, password_hash, role)
           VALUES('T002', 'User Two', 'dup@example.com', '2024-01-01', 'hash', 'EMPLOYEE')`
        )
        .run()
    ).toThrow();
  });

  it("leave_types can be seeded with default codes", () => {
    const db = newDb();
    migrate(db);

    const codes = ["EL", "CL", "SL", "LWP", "ML", "PL"];
    const stmt = db.prepare(
      `INSERT INTO leave_types(code, name, annual, paid, carry_fwd, max_carry) VALUES(?, ?, ?, ?, ?, ?)`
    );

    for (const code of codes) {
      expect(() => stmt.run(code, code, 7, 1, 0, 0)).not.toThrow();
    }

    const rows = db.prepare("SELECT code FROM leave_types").all();
    expect(rows.map((r) => r.code).sort()).toEqual(codes.sort());
  });

  it("settings key is PRIMARY KEY (no duplicates)", () => {
    const db = newDb();
    migrate(db);

    db.prepare("INSERT INTO settings(key, value) VALUES('testKey', '\"val1\"')").run();
    expect(() =>
      db.prepare("INSERT INTO settings(key, value) VALUES('testKey', '\"val2\"')").run()
    ).toThrow();
  });
});
