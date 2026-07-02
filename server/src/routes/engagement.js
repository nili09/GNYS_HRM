/**
 * Employee Engagement routes — Announcements, Surveys, Badges, Recognitions, Dashboard.
 *
 * Mounted at /api/engagement
 *
 * Announcements
 *   GET    /announcements        — list active (all auth); HR sees all
 *   POST   /announcements        — HR creates
 *   PATCH  /announcements/:id    — HR updates
 *   DELETE /announcements/:id    — HR hard-deletes
 *
 * Surveys
 *   GET    /surveys              — ACTIVE for all auth; HR also sees DRAFT/CLOSED
 *   POST   /surveys              — HR creates (with nested questions)
 *   PATCH  /surveys/:id          — HR updates status/metadata
 *   GET    /surveys/:id/questions — questions for a survey
 *   POST   /surveys/:id/respond  — employee submits answers
 *   GET    /surveys/:id/results  — HR-only aggregate results
 *
 * Badges
 *   GET    /badges               — list all badges (all auth)
 *   POST   /badges               — HR creates
 *
 * Recognitions
 *   POST   /recognitions         — any auth user gives recognition
 *   GET    /recognitions         — own given/received (?type=given|received)
 *   GET    /recognitions/feed    — public feed, paginated
 *
 * Dashboard
 *   GET    /dashboard            — HR-only engagement stats
 */

import { Router } from "express";
import { requireAuth, requireHR } from "../middleware/auth.js";
import {
  AnnouncementCreateSchema, AnnouncementPatchSchema,
  SurveyCreateSchema, SurveyPatchSchema, SurveyRespondSchema,
  BadgeCreateSchema, BadgePatchSchema,
  RecognitionCreateSchema,
} from "@hrms/shared/schemas";
import { broadcast } from "../utils/sse.js";
import { audit } from "../utils/audit.js";
import { indexEntity, removeEntity } from "../utils/search.js";
import { notify, notifyMany } from "../utils/notify.js";

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────

function attachAnnouncementFiles(db, rows) {
  const ids = rows.map(r => r.id);
  if (!ids.length) return;
  const strIds = ids.map(String);
  const ph = strIds.map(() => "?").join(",");
  const atts = db.prepare(
    `SELECT id, owner_id, filename, mime FROM attachments WHERE owner_type='announcement' AND owner_id IN (${ph})`
  ).all(...strIds);
  const m = new Map();
  for (const a of atts) {
    const key = Number(a.owner_id);
    if (!m.has(key)) m.set(key, []);
    m.get(key).push({ id: a.id, filename: a.filename, mime: a.mime });
  }
  for (const r of rows) r.attachments = m.get(r.id) || [];
}

// ── Announcements ─────────────────────────────────────────────────────────

router.get("/announcements", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const isHR = ["HR", "ADMIN"].includes(req.user.role);

  let sql;
  if (isHR) {
    sql = `SELECT a.*, e.name as published_by_name
           FROM announcements a
           JOIN employees e ON a.published_by = e.id
           ORDER BY
             CASE a.priority WHEN 'URGENT' THEN 0 WHEN 'IMPORTANT' THEN 1 ELSE 2 END,
             a.published_at DESC`;
  } else {
    sql = `SELECT a.*, e.name as published_by_name
           FROM announcements a
           JOIN employees e ON a.published_by = e.id
           WHERE a.active = 1
             AND (a.expires_at IS NULL OR a.expires_at >= date('now'))
           ORDER BY
             CASE a.priority WHEN 'URGENT' THEN 0 WHEN 'IMPORTANT' THEN 1 ELSE 2 END,
             a.published_at DESC`;
  }
  const rows = db.prepare(sql).all();
  attachAnnouncementFiles(db, rows);
  res.json(rows);
});

router.post("/announcements", ...requireHR, (req, res) => {
  const parsed = AnnouncementCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const db = req.app.locals.db;
  const d = parsed.data;
  const result = db.prepare(
    "INSERT INTO announcements(title, body, priority, published_by, expires_at) VALUES(?,?,?,?,?)"
  ).run(d.title, d.body, d.priority, req.user.id, d.expires_at ?? null);
  const id = Number(result.lastInsertRowid);
  audit(db, { actorId: req.user.id, action: "CREATE", entity: "announcement", entityId: id, detail: d });
  broadcast({ type: "mutation", entity: "announcements" });
  indexEntity(db, "announcement", id, d.title, d.body, { priority: d.priority });

  const activeEmps = db.prepare("SELECT id FROM employees WHERE status = 'ACTIVE' AND id != ?").all(req.user.id);
  if (activeEmps.length > 0) {
    notifyMany(db, activeEmps.map(e => e.id), {
      type: "announcement", title: "New announcement",
      body: d.title,
      link: "/engagement/announcements", entity: "announcement", entityId: id,
    });
  }

  res.status(201).json({ id, ...d, published_by: req.user.id });
});

router.patch("/announcements/:id", ...requireHR, (req, res) => {
  const parsed = AnnouncementPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const db = req.app.locals.db;
  const annId = parseInt(req.params.id, 10);
  const existing = db.prepare("SELECT * FROM announcements WHERE id = ?").get(annId);
  if (!existing) return res.status(404).json({ error: "Announcement not found" });
  const fields = parsed.data;
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) { sets.push(`${k} = ?`); vals.push(v); }
  }
  if (sets.length === 0) return res.json(existing);
  vals.push(annId);
  db.prepare(`UPDATE announcements SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  audit(db, { actorId: req.user.id, action: "UPDATE", entity: "announcement", entityId: annId, detail: fields });
  broadcast({ type: "mutation", entity: "announcements" });
  const merged = { ...existing, ...fields };
  if (merged.active) {
    indexEntity(db, "announcement", annId, merged.title, merged.body, { priority: merged.priority });
  } else {
    removeEntity(db, "announcement", annId);
  }
  res.json(merged);
});

router.delete("/announcements/:id", ...requireHR, (req, res) => {
  const db = req.app.locals.db;
  const annId = parseInt(req.params.id, 10);
  const existing = db.prepare("SELECT * FROM announcements WHERE id = ?").get(annId);
  if (!existing) return res.status(404).json({ error: "Announcement not found" });
  db.prepare("DELETE FROM announcements WHERE id = ?").run(annId);
  audit(db, { actorId: req.user.id, action: "DELETE", entity: "announcement", entityId: annId, detail: { title: existing.title } });
  broadcast({ type: "mutation", entity: "announcements" });
  removeEntity(db, "announcement", annId);
  res.json({ ok: true });
});

// ── Surveys ───────────────────────────────────────────────────────────────

router.get("/surveys/my-count", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const { c } = db
    .prepare(
      `SELECT COUNT(*) as c FROM surveys s
       WHERE s.status = 'ACTIVE'
       AND s.id NOT IN (SELECT survey_id FROM survey_responses WHERE employee_id = ?)`
    )
    .get(req.user.id);
  res.json({ count: c });
});

router.get("/surveys", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const isHR = ["HR", "ADMIN"].includes(req.user.role);

  let sql = `SELECT s.*, e.name as created_by_name
             FROM surveys s
             JOIN employees e ON s.created_by = e.id`;
  if (!isHR) {
    sql += " WHERE s.status = 'ACTIVE'";
  }
  sql += " ORDER BY s.created_at DESC";
  res.json(db.prepare(sql).all());
});

router.post("/surveys", ...requireHR, (req, res) => {
  const parsed = SurveyCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const db = req.app.locals.db;
  const d = parsed.data;

  const insertSurvey = db.prepare(
    "INSERT INTO surveys(title, description, closes_at, anonymous, created_by) VALUES(?,?,?,?,?)"
  );
  const insertQuestion = db.prepare(
    "INSERT INTO survey_questions(survey_id, question, type, options, sort_order) VALUES(?,?,?,?,?)"
  );

  const txn = db.transaction(() => {
    const result = insertSurvey.run(
      d.title, d.description ?? null, d.closes_at ?? null, d.anonymous, req.user.id
    );
    const surveyId = Number(result.lastInsertRowid);
    const questionIds = [];
    for (const q of d.questions) {
      const qr = insertQuestion.run(surveyId, q.question, q.type, q.options ?? null, q.sort_order);
      questionIds.push(Number(qr.lastInsertRowid));
    }
    return { surveyId, questionIds };
  });

  const { surveyId, questionIds } = txn();
  audit(db, { actorId: req.user.id, action: "CREATE", entity: "survey", entityId: surveyId, detail: { title: d.title, questionCount: d.questions.length } });
  broadcast({ type: "mutation", entity: "surveys" });
  res.status(201).json({
    id: surveyId,
    title: d.title,
    description: d.description ?? null,
    status: "DRAFT",
    anonymous: d.anonymous,
    created_by: req.user.id,
    questions: d.questions.map((q, i) => ({ id: questionIds[i], ...q })),
  });
});

router.patch("/surveys/:id", ...requireHR, (req, res) => {
  const parsed = SurveyPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const db = req.app.locals.db;
  const surveyId = parseInt(req.params.id, 10);
  const existing = db.prepare("SELECT * FROM surveys WHERE id = ?").get(surveyId);
  if (!existing) return res.status(404).json({ error: "Survey not found" });

  const fields = parsed.data;

  // ACTIVE surveys can only be CLOSED, nothing else
  if (existing.status === "ACTIVE") {
    if (fields.status && fields.status !== "CLOSED") {
      return res.status(400).json({ error: "Active surveys can only be closed" });
    }
    const nonStatusKeys = Object.keys(fields).filter(k => k !== "status");
    if (nonStatusKeys.length > 0) {
      return res.status(400).json({ error: "Active surveys can only be closed, not edited" });
    }
  }

  // CLOSED surveys cannot be edited
  if (existing.status === "CLOSED") {
    return res.status(400).json({ error: "Closed surveys cannot be edited" });
  }

  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) { sets.push(`${k} = ?`); vals.push(v); }
  }
  if (sets.length === 0) return res.json(existing);
  vals.push(surveyId);
  db.prepare(`UPDATE surveys SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  audit(db, { actorId: req.user.id, action: "UPDATE", entity: "survey", entityId: surveyId, detail: fields });
  broadcast({ type: "mutation", entity: "surveys" });
  res.json({ ...existing, ...fields });
});

router.get("/surveys/:id/questions", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const surveyId = parseInt(req.params.id, 10);
  const survey = db.prepare("SELECT * FROM surveys WHERE id = ?").get(surveyId);
  if (!survey) return res.status(404).json({ error: "Survey not found" });

  const isHR = ["HR", "ADMIN"].includes(req.user.role);
  if (!isHR && survey.status !== "ACTIVE") {
    return res.status(403).json({ error: "Forbidden" });
  }

  const questions = db.prepare(
    "SELECT * FROM survey_questions WHERE survey_id = ? ORDER BY sort_order, id"
  ).all(surveyId);
  res.json(questions);
});

router.post("/surveys/:id/respond", requireAuth, (req, res) => {
  const parsed = SurveyRespondSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const db = req.app.locals.db;
  const surveyId = parseInt(req.params.id, 10);
  const survey = db.prepare("SELECT * FROM surveys WHERE id = ?").get(surveyId);
  if (!survey) return res.status(404).json({ error: "Survey not found" });
  if (survey.status !== "ACTIVE") {
    return res.status(400).json({ error: "Survey is not active" });
  }

  // Check for duplicate submission — always use real employee_id
  const alreadyResponded = db.prepare(
    "SELECT 1 FROM survey_responses WHERE survey_id = ? AND employee_id = ? LIMIT 1"
  ).get(surveyId, req.user.id);
  if (alreadyResponded) {
    return res.status(409).json({ error: "Already responded to this survey" });
  }

  // Validate all question_ids belong to this survey
  const validQuestionIds = new Set(
    db.prepare("SELECT id FROM survey_questions WHERE survey_id = ?")
      .all(surveyId)
      .map(r => r.id)
  );
  for (const a of parsed.data.answers) {
    if (!validQuestionIds.has(a.question_id)) {
      return res.status(400).json({ error: `Question ${a.question_id} does not belong to this survey` });
    }
  }

  const insertResponse = db.prepare(
    "INSERT INTO survey_responses(survey_id, employee_id, question_id, answer) VALUES(?,?,?,?)"
  );

  const txn = db.transaction(() => {
    for (const a of parsed.data.answers) {
      insertResponse.run(surveyId, req.user.id, a.question_id, a.answer);
    }
  });
  txn();

  audit(db, { actorId: req.user.id, action: "CREATE", entity: "survey_response", entityId: String(surveyId), detail: { answersCount: parsed.data.answers.length } });
  broadcast({ type: "mutation", entity: "survey_responses" });
  res.status(201).json({ ok: true, survey_id: surveyId });
});

router.get("/surveys/:id/results", ...requireHR, (req, res) => {
  const db = req.app.locals.db;
  const surveyId = parseInt(req.params.id, 10);
  const survey = db.prepare("SELECT * FROM surveys WHERE id = ?").get(surveyId);
  if (!survey) return res.status(404).json({ error: "Survey not found" });

  const questions = db.prepare(
    "SELECT * FROM survey_questions WHERE survey_id = ? ORDER BY sort_order, id"
  ).all(surveyId);

  const isAnonymous = survey.anonymous === 1;

  const results = questions.map((q) => {
    const responses = db.prepare(
      "SELECT sr.*, e.name as employee_name FROM survey_responses sr LEFT JOIN employees e ON sr.employee_id = e.id WHERE sr.survey_id = ? AND sr.question_id = ?"
    ).all(surveyId, q.id);

    const result = { question_id: q.id, question: q.question, type: q.type, totalResponses: responses.length };

    if (q.type === "RATING") {
      const ratings = responses.map(r => parseFloat(r.answer)).filter(n => !isNaN(n));
      const avg = ratings.length > 0 ? ratings.reduce((s, v) => s + v, 0) / ratings.length : 0;
      const distribution = {};
      for (const r of ratings) {
        const key = String(Math.round(r));
        distribution[key] = (distribution[key] || 0) + 1;
      }
      result.avg = Math.round(avg * 100) / 100;
      result.distribution = distribution;
    } else if (q.type === "CHOICE") {
      const counts = {};
      for (const r of responses) {
        counts[r.answer] = (counts[r.answer] || 0) + 1;
      }
      result.counts = counts;
    } else {
      // TEXT
      if (isAnonymous) {
        result.answers = responses.map(r => ({ answer: r.answer }));
      } else {
        result.answers = responses.map(r => ({
          answer: r.answer,
          employee_id: r.employee_id,
          employee_name: r.employee_name,
        }));
      }
    }

    if (!isAnonymous && q.type !== "TEXT") {
      result.respondents = responses.map(r => ({
        employee_id: r.employee_id,
        employee_name: r.employee_name,
        answer: r.answer,
      }));
    }

    return result;
  });

  const totalRespondents = db.prepare(
    "SELECT COUNT(DISTINCT employee_id) as c FROM survey_responses WHERE survey_id = ?"
  ).get(surveyId).c;

  res.json({ survey_id: surveyId, title: survey.title, anonymous: isAnonymous, totalRespondents, questions: results });
});

// ── Badges ────────────────────────────────────────────────────────────────

router.get("/badges", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  res.json(db.prepare("SELECT * FROM badges ORDER BY name").all());
});

router.post("/badges", ...requireHR, (req, res) => {
  const parsed = BadgeCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const db = req.app.locals.db;
  const d = parsed.data;
  const result = db.prepare(
    "INSERT INTO badges(name, description, icon) VALUES(?,?,?)"
  ).run(d.name, d.description ?? null, d.icon);
  const id = Number(result.lastInsertRowid);
  audit(db, { actorId: req.user.id, action: "CREATE", entity: "badge", entityId: id, detail: d });
  broadcast({ type: "mutation", entity: "badges" });
  res.status(201).json({ id, ...d });
});

// ── Employee Directory (lightweight, all auth) ───────────────────────────

router.get("/employee-search", requireAuth, (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) return res.json([]);
  const db = req.app.locals.db;
  const pattern = `%${q}%`;
  const rows = db.prepare(
    `SELECT e.id, e.code, e.name,
            d.name AS dept_name, ds.name AS desig_name
       FROM employees e
       LEFT JOIN departments d  ON d.id = e.dept_id
       LEFT JOIN designations ds ON ds.id = e.desig_id
      WHERE e.status = 'ACTIVE'
        AND (e.name LIKE ? COLLATE NOCASE OR e.code LIKE ? COLLATE NOCASE)
      LIMIT 20`
  ).all(pattern, pattern);
  res.json(rows);
});

// ── Recognitions ──────────────────────────────────────────────────────────

router.post("/recognitions", requireAuth, (req, res) => {
  const parsed = RecognitionCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const db = req.app.locals.db;
  const d = parsed.data;

  // Resolve to_employee_code → to_employee id
  if (d.to_employee_code && !d.to_employee) {
    const code = d.to_employee_code.trim().toUpperCase();
    const emp = db.prepare("SELECT id FROM employees WHERE UPPER(code) = ? AND status = 'ACTIVE'").get(code);
    if (!emp) return res.status(400).json({ error: `No active employee with code ${code}` });
    d.to_employee = emp.id;
  }

  // No self-recognition
  if (d.to_employee === req.user.id) {
    return res.status(400).json({ error: "Cannot recognize yourself" });
  }

  // Validate badge exists
  const badge = db.prepare("SELECT id FROM badges WHERE id = ?").get(d.badge_id);
  if (!badge) return res.status(400).json({ error: "Badge not found" });

  // Validate recipient exists and is active
  const recipient = db.prepare("SELECT id FROM employees WHERE id = ? AND status = 'ACTIVE'").get(d.to_employee);
  if (!recipient) return res.status(400).json({ error: "Recipient not found or inactive" });

  const result = db.prepare(
    "INSERT INTO recognitions(from_employee, to_employee, badge_id, message) VALUES(?,?,?,?)"
  ).run(req.user.id, d.to_employee, d.badge_id, d.message);
  const id = Number(result.lastInsertRowid);
  audit(db, { actorId: req.user.id, action: "CREATE", entity: "recognition", entityId: id, detail: { ...d, from_employee: req.user.id } });
  broadcast({ type: "mutation", entity: "recognitions" });

  const giver = db.prepare("SELECT name FROM employees WHERE id = ?").get(req.user.id);
  const badgeInfo = db.prepare("SELECT name FROM badges WHERE id = ?").get(d.badge_id);
  notify(db, {
    userId: d.to_employee, type: "recognition", title: "You received a recognition!",
    body: `${giver?.name || "Someone"} gave you the "${badgeInfo?.name || "badge"}" badge: ${d.message}`,
    link: "/recognition", entity: "recognition", entityId: id,
  });

  res.status(201).json({ id, from_employee: req.user.id, ...d });
});

router.get("/recognitions/feed", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const total = db.prepare("SELECT COUNT(*) as c FROM recognitions").get().c;
  const rows = db.prepare(
    `SELECT r.*, fe.name as from_name, te.name as to_name,
            b.name as badge_name, b.icon as badge_icon
     FROM recognitions r
     JOIN employees fe ON r.from_employee = fe.id
     JOIN employees te ON r.to_employee = te.id
     JOIN badges b ON r.badge_id = b.id
     ORDER BY r.created_at DESC
     LIMIT ? OFFSET ?`
  ).all(limit, offset);

  res.json({ data: rows, page, limit, total, totalPages: Math.ceil(total / limit) });
});

router.get("/recognitions", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const { type } = req.query;

  let sql;
  const params = [];

  if (type === "given") {
    sql = `SELECT r.*, te.name as to_name, b.name as badge_name, b.icon as badge_icon
           FROM recognitions r
           JOIN employees te ON r.to_employee = te.id
           JOIN badges b ON r.badge_id = b.id
           WHERE r.from_employee = ?
           ORDER BY r.created_at DESC`;
    params.push(req.user.id);
  } else if (type === "received") {
    sql = `SELECT r.*, fe.name as from_name, b.name as badge_name, b.icon as badge_icon
           FROM recognitions r
           JOIN employees fe ON r.from_employee = fe.id
           JOIN badges b ON r.badge_id = b.id
           WHERE r.to_employee = ?
           ORDER BY r.created_at DESC`;
    params.push(req.user.id);
  } else {
    // Both given and received
    sql = `SELECT r.*, fe.name as from_name, te.name as to_name,
                  b.name as badge_name, b.icon as badge_icon
           FROM recognitions r
           JOIN employees fe ON r.from_employee = fe.id
           JOIN employees te ON r.to_employee = te.id
           JOIN badges b ON r.badge_id = b.id
           WHERE r.from_employee = ? OR r.to_employee = ?
           ORDER BY r.created_at DESC`;
    params.push(req.user.id, req.user.id);
  }

  res.json(db.prepare(sql).all(...params));
});

// ── Dashboard ─────────────────────────────────────────────────────────────

router.get("/dashboard", ...requireHR, (req, res) => {
  const db = req.app.locals.db;

  // Surveys
  const totalSurveys = db.prepare("SELECT COUNT(*) as c FROM surveys").get().c;
  const activeSurveys = db.prepare("SELECT COUNT(*) as c FROM surveys WHERE status = 'ACTIVE'").get().c;

  let avgParticipation = 0;
  if (activeSurveys > 0) {
    const activeEmployeeCount = db.prepare(
      "SELECT COUNT(*) as c FROM employees WHERE status = 'ACTIVE'"
    ).get().c;
    if (activeEmployeeCount > 0) {
      // Average across active surveys: for each active survey, what % of active employees responded
      const participationRows = db.prepare(
        `SELECT s.id,
                COUNT(DISTINCT sr.employee_id) as respondents
         FROM surveys s
         LEFT JOIN survey_responses sr ON sr.survey_id = s.id
         WHERE s.status = 'ACTIVE'
         GROUP BY s.id`
      ).all();
      const totalPct = participationRows.reduce(
        (sum, r) => sum + (r.respondents / activeEmployeeCount) * 100, 0
      );
      avgParticipation = Math.round(totalPct / participationRows.length);
    }
  }

  // Recognitions
  const recThisWeek = db.prepare(
    "SELECT COUNT(*) as c FROM recognitions WHERE created_at >= datetime('now', '-7 days')"
  ).get().c;
  const recThisMonth = db.prepare(
    "SELECT COUNT(*) as c FROM recognitions WHERE created_at >= datetime('now', 'start of month')"
  ).get().c;
  const topReceivers = db.prepare(
    `SELECT e.name, COUNT(*) as count
     FROM recognitions r
     JOIN employees e ON r.to_employee = e.id
     GROUP BY r.to_employee
     ORDER BY count DESC
     LIMIT 5`
  ).all();

  // Announcements
  const activeAnnouncements = db.prepare(
    "SELECT COUNT(*) as c FROM announcements WHERE active = 1 AND (expires_at IS NULL OR expires_at >= date('now'))"
  ).get().c;
  const expiringSoon = db.prepare(
    "SELECT COUNT(*) as c FROM announcements WHERE active = 1 AND expires_at BETWEEN date('now') AND date('now', '+7 days')"
  ).get().c;

  res.json({
    surveys: { total: totalSurveys, active: activeSurveys, avgParticipation },
    recognitions: { thisWeek: recThisWeek, thisMonth: recThisMonth, topReceivers },
    announcements: { active: activeAnnouncements, expiringSoon },
  });
});

export default router;
