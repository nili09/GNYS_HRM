import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { currentYearIST } from "@hrms/shared/datetime";
import { z } from "zod";

const router = Router();

const HolidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  name: z.string().min(1).max(120),
});

// National + Maharashtra fixed holidays (seeded from v1's seedHolidays)
export const FIXED_HOLIDAYS = [
  ["01-01", "New Year's Day"],
  ["01-26", "Republic Day"],
  ["05-01", "Maharashtra Day / Labour Day"],
  ["08-15", "Independence Day"],
  ["10-02", "Gandhi Jayanti"],
  ["12-25", "Christmas"],
];

// GET /holidays[?year=YYYY]  — any authenticated user (team calendar)
router.get("/", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  let rows;
  if (req.query.year && /^\d{4}$/.test(req.query.year)) {
    rows = db
      .prepare("SELECT date, name FROM holidays WHERE date LIKE ? ORDER BY date")
      .all(`${req.query.year}-%`);
  } else {
    rows = db.prepare("SELECT date, name FROM holidays ORDER BY date").all();
  }
  res.json(rows);
});

// POST /holidays  — add one holiday (HR)
router.post("/", requireRole("HR", "ADMIN"), (req, res) => {
  const db     = req.app.locals.db;
  const parsed = HolidaySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { date, name } = parsed.data;
  try {
    db.prepare("INSERT INTO holidays(date, name) VALUES(?,?)").run(date, name);
  } catch (e) {
    if (e.code === "SQLITE_CONSTRAINT_PRIMARYKEY" || e.message?.includes("UNIQUE")) {
      return res.status(409).json({ error: "A holiday already exists on this date" });
    }
    throw e;
  }
  res.status(201).json({ date, name });
});

// DELETE /holidays/:date  — remove a holiday (HR)
router.delete("/:date", requireRole("HR", "ADMIN"), (req, res) => {
  const db = req.app.locals.db;
  const { date } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return res.status(400).json({ error: "date must be YYYY-MM-DD" });
  db.prepare("DELETE FROM holidays WHERE date=?").run(date);
  res.json({ ok: true });
});

// POST /holidays/seed?year=YYYY  — seed national + Maharashtra fixed dates (HR)
router.post("/seed", requireRole("HR", "ADMIN"), (req, res) => {
  const db = req.app.locals.db;
  const yr = req.query.year ?? String(currentYearIST());
  if (!/^\d{4}$/.test(yr)) return res.status(400).json({ error: "year must be YYYY" });

  const insert = db.prepare("INSERT OR IGNORE INTO holidays(date, name) VALUES(?,?)");
  let added = 0;
  db.transaction(() => {
    for (const [md, name] of FIXED_HOLIDAYS) {
      const r = insert.run(`${yr}-${md}`, name);
      added += r.changes;
    }
  })();

  res.json({ ok: true, year: yr, added, total: FIXED_HOLIDAYS.length });
});

export default router;
