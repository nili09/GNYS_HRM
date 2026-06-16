/**
 * Test-only in-memory database.
 * Uses better-sqlite3 — the SAME driver as production (spec §2) — so tests
 * exercise identical driver behavior. Native prebuilt binaries ship for
 * Windows/Linux/macOS on supported Node versions; no compile step expected.
 */
import Database from "better-sqlite3";
import { migrate } from "./migrate.js";

export function createTestDb() {
  const db = new Database(":memory:");
  migrate(db);
  return db;
}
