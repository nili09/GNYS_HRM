import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { migrate } from "./migrate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

let _db = null;

export function getDb() {
  if (_db) return _db;

  const dbPath = process.env.DB_PATH || join(__dirname, "../../../data/hrms.db");
  const dir = dirname(dbPath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  _db = new Database(dbPath);
  migrate(_db);
  return _db;
}

/** For tests - create an in-memory DB */
export function createInMemoryDb() {
  const db = new Database(":memory:");
  migrate(db);
  return db;
}
