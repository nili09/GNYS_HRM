import { describe, test, expect } from "vitest";
import { createTestDb } from "../db/test-db.js";
import {
  seedLeaveTypes, seedSettings, seedOrgLists,
  seedBadges, seedSurveyTemplates, seedHolidays, seedStarterContent,
} from "../db/seed.js";
import { insertEmployee } from "./helpers.js";

function seedBaseline(db) {
  seedLeaveTypes(db);
  seedSettings(db);
  seedOrgLists(db);
}

describe("seedBadges", () => {
  test("seeds 13 badges with name, description, and icon", () => {
    const db = createTestDb();
    seedBadges(db);
    const badges = db.prepare("SELECT * FROM badges").all();
    expect(badges).toHaveLength(13);
    for (const b of badges) {
      expect(b.name).toBeTruthy();
      expect(b.description).toBeTruthy();
      expect(b.icon).toBeTruthy();
    }
    const names = badges.map((b) => b.name);
    expect(names).toContain("Team Player");
    expect(names).toContain("Above & Beyond");
    expect(names).toContain("Welcome Aboard");
    expect(names).toContain("10-Year Anniversary");
  });

  test("is idempotent — re-running does not duplicate", () => {
    const db = createTestDb();
    seedBadges(db);
    seedBadges(db);
    expect(db.prepare("SELECT COUNT(*) AS c FROM badges").get().c).toBe(13);
  });
});

describe("seedSurveyTemplates", () => {
  test("seeds 4 DRAFT surveys with questions when admin exists", async () => {
    const db = createTestDb();
    seedBaseline(db);
    await insertEmployee(db, { role: "ADMIN", email: "admin@test.com", code: "ADM01" });

    seedSurveyTemplates(db);

    const surveys = db.prepare("SELECT * FROM surveys").all();
    expect(surveys).toHaveLength(4);
    for (const s of surveys) {
      expect(s.status).toBe("DRAFT");
    }

    const titles = surveys.map((s) => s.title);
    expect(titles).toContain("Employee Net Promoter Score (eNPS)");
    expect(titles).toContain("Monthly Pulse Check");
    expect(titles).toContain("Onboarding 30-Day Feedback");
    expect(titles).toContain("Exit Survey");

    const questions = db.prepare("SELECT * FROM survey_questions").all();
    expect(questions.length).toBeGreaterThanOrEqual(15);
    for (const q of questions) {
      expect(["RATING", "TEXT"]).toContain(q.type);
    }
  });

  test("skips gracefully when no admin exists", () => {
    const db = createTestDb();
    seedSurveyTemplates(db);
    expect(db.prepare("SELECT COUNT(*) AS c FROM surveys").get().c).toBe(0);
  });

  test("is idempotent on survey title — re-running does not duplicate", async () => {
    const db = createTestDb();
    seedBaseline(db);
    await insertEmployee(db, { role: "ADMIN", email: "admin@test.com", code: "ADM01" });

    seedSurveyTemplates(db);
    seedSurveyTemplates(db);

    expect(db.prepare("SELECT COUNT(*) AS c FROM surveys").get().c).toBe(4);
  });

  test("surveys stay DRAFT — never auto-published", async () => {
    const db = createTestDb();
    seedBaseline(db);
    await insertEmployee(db, { role: "ADMIN", email: "admin@test.com", code: "ADM01" });
    seedSurveyTemplates(db);

    const active = db.prepare("SELECT COUNT(*) AS c FROM surveys WHERE status != 'DRAFT'").get().c;
    expect(active).toBe(0);
  });
});

describe("seedHolidays", () => {
  test("seeds fixed holidays for current + next year", () => {
    const db = createTestDb();
    seedHolidays(db, 2026);

    const rows = db.prepare("SELECT * FROM holidays ORDER BY date").all();
    expect(rows.length).toBe(12); // 6 per year × 2
    expect(rows.some((r) => r.date === "2026-01-26" && r.name === "Republic Day")).toBe(true);
    expect(rows.some((r) => r.date === "2027-08-15" && r.name === "Independence Day")).toBe(true);
  });

  test("is idempotent on date — re-running does not duplicate", () => {
    const db = createTestDb();
    seedHolidays(db, 2026);
    seedHolidays(db, 2026);
    expect(db.prepare("SELECT COUNT(*) AS c FROM holidays").get().c).toBe(12);
  });
});

describe("seedStarterContent", () => {
  test("seeds expense categories, asset types, and ticket categories", () => {
    const db = createTestDb();
    seedStarterContent(db);

    const expCats = db.prepare("SELECT name FROM expense_categories ORDER BY name").all().map((r) => r.name);
    expect(expCats).toEqual(["Meals", "Office Supplies", "Software", "Travel"]);

    const assetTypes = db.prepare("SELECT name FROM asset_types ORDER BY name").all().map((r) => r.name);
    expect(assetTypes).toEqual(["Access Card", "Laptop", "Monitor", "Phone"]);

    const ticketCats = db.prepare("SELECT name FROM ticket_categories ORDER BY name").all().map((r) => r.name);
    expect(ticketCats).toEqual(["Facilities", "HR", "IT", "Payroll"]);
  });

  test("is idempotent — re-running does not duplicate", () => {
    const db = createTestDb();
    seedStarterContent(db);
    seedStarterContent(db);
    expect(db.prepare("SELECT COUNT(*) AS c FROM expense_categories").get().c).toBe(4);
    expect(db.prepare("SELECT COUNT(*) AS c FROM asset_types").get().c).toBe(4);
    expect(db.prepare("SELECT COUNT(*) AS c FROM ticket_categories").get().c).toBe(4);
  });
});

describe("reset-fresh restores default content", () => {
  test("after reset, all default content is present", async () => {
    const { resetToFresh } = await import("../db/reset-fresh.js");
    const db = createTestDb();
    seedBaseline(db);
    const admin = await insertEmployee(db, { role: "ADMIN", email: "admin@test.com", code: "ADM01" });
    seedBadges(db);
    seedHolidays(db, 2026);
    seedStarterContent(db);
    seedSurveyTemplates(db);

    // Pollute: add extra data that should survive only if it's in the reseed set
    db.prepare("INSERT INTO badges(name, description) VALUES('Custom Badge', 'should be wiped')").run();

    const result = await resetToFresh(db);

    expect(result.after.badges).toBe(13); // custom badge gone, defaults restored
    expect(result.after.asset_types).toBe(4);
    expect(result.after.ticket_categories).toBe(4);
    expect(result.after.surveys).toBe(4);
    expect(result.after.holidays).toBeGreaterThanOrEqual(12);

    // Surveys are still DRAFT
    const active = db.prepare("SELECT COUNT(*) AS c FROM surveys WHERE status != 'DRAFT'").get().c;
    expect(active).toBe(0);
  });
});
