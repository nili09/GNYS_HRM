import { Router } from "express";
import { requireAuth, requireHR } from "../middleware/auth.js";
import {
  JobOpeningCreateSchema, JobOpeningPatchSchema,
  CandidateCreateSchema, CandidatePatchSchema,
  ApplicationCreateSchema, ApplicationPatchSchema,
  InterviewCreateSchema, InterviewPatchSchema,
  OfferCreateSchema, OfferPatchSchema,
} from "@hrms/shared/schemas";
import { broadcast } from "../utils/sse.js";
import { audit } from "../utils/audit.js";
import { notify } from "../utils/notify.js";
import { indexEntity } from "../utils/search.js";

const router = Router();

// ── Job Openings ───────────────────────────────────────────────────────────

router.get("/jobs", ...requireHR, (req, res) => {
  const db = req.app.locals.db;
  const { status } = req.query;
  let sql = `SELECT j.*, d.name as dept_name, l.name as location_name
             FROM job_openings j
             LEFT JOIN departments d ON j.dept_id = d.id
             LEFT JOIN locations l ON j.location_id = l.id WHERE 1=1`;
  const params = [];
  if (status) {
    const statuses = (Array.isArray(status) ? status : [status]).map(s => s.toUpperCase());
    sql += ` AND j.status IN (${statuses.map(() => "?").join(",")})`;
    params.push(...statuses);
  }
  sql += " ORDER BY j.created_at DESC";
  res.json(db.prepare(sql).all(...params));
});

router.post("/jobs", ...requireHR, (req, res) => {
  const parsed = JobOpeningCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const db = req.app.locals.db;
  const d = parsed.data;
  const result = db.prepare(
    `INSERT INTO job_openings(title, dept_id, location_id, description, requirements, positions, status, created_by)
     VALUES(?,?,?,?,?,?,?,?)`
  ).run(d.title, d.dept_id ?? null, d.location_id ?? null, d.description || null,
        d.requirements || null, d.positions, d.status, req.user.id);
  const id = Number(result.lastInsertRowid);
  audit(db, { actorId: req.user.id, action: "CREATE", entity: "job_opening", entityId: id, detail: d });
  broadcast({ type: "job_opening", entity: "job_openings" });
  const deptName = d.dept_id ? db.prepare("SELECT name FROM departments WHERE id=?").get(d.dept_id)?.name : null;
  indexEntity(db, "job", id, d.title,
    [d.description, d.requirements].filter(Boolean).join(" "),
    { dept: deptName, status: d.status });
  res.status(201).json({ id, ...d, created_by: req.user.id });
});

router.get("/jobs/:id", ...requireHR, (req, res) => {
  const db = req.app.locals.db;
  const job = db.prepare(
    `SELECT j.*, d.name as dept_name, l.name as location_name
     FROM job_openings j
     LEFT JOIN departments d ON j.dept_id = d.id
     LEFT JOIN locations l ON j.location_id = l.id
     WHERE j.id = ?`
  ).get(parseInt(req.params.id, 10));
  if (!job) return res.status(404).json({ error: "Job not found" });
  res.json(job);
});

router.patch("/jobs/:id", ...requireHR, (req, res) => {
  const parsed = JobOpeningPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const db = req.app.locals.db;
  const jobId = parseInt(req.params.id, 10);
  const existing = db.prepare("SELECT * FROM job_openings WHERE id = ?").get(jobId);
  if (!existing) return res.status(404).json({ error: "Job not found" });
  const fields = parsed.data;
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) { sets.push(`${k} = ?`); vals.push(v); }
  }
  if (fields.status === "CLOSED" && existing.status !== "CLOSED") {
    sets.push("closed_at = datetime('now')");
  }
  if (sets.length === 0) return res.json(existing);
  vals.push(jobId);
  db.prepare(`UPDATE job_openings SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  audit(db, { actorId: req.user.id, action: "UPDATE", entity: "job_opening", entityId: jobId, detail: fields });
  broadcast({ type: "job_opening", entity: "job_openings" });
  const updatedJob = db.prepare(
    "SELECT j.*, d.name as dept_name FROM job_openings j LEFT JOIN departments d ON j.dept_id=d.id WHERE j.id=?"
  ).get(jobId);
  if (updatedJob) {
    indexEntity(db, "job", jobId, updatedJob.title,
      [updatedJob.description, updatedJob.requirements].filter(Boolean).join(" "),
      { dept: updatedJob.dept_name, status: updatedJob.status });
  }
  res.json({ ...existing, ...fields });
});

// ── Candidates ─────────────────────────────────────────────────────────────

router.get("/candidates", ...requireHR, (req, res) => {
  const rows = req.app.locals.db.prepare("SELECT * FROM candidates ORDER BY created_at DESC").all();
  res.json(rows);
});

router.post("/candidates", ...requireHR, (req, res) => {
  const parsed = CandidateCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const db = req.app.locals.db;
  const d = parsed.data;
  const result = db.prepare(
    "INSERT INTO candidates(name, email, phone, resume_filename, source, notes) VALUES(?,?,?,?,?,?)"
  ).run(d.name, d.email, d.phone || null, d.resume_filename || null, d.source || null, d.notes || null);
  const id = Number(result.lastInsertRowid);
  audit(db, { actorId: req.user.id, action: "CREATE", entity: "candidate", entityId: id, detail: d });
  broadcast({ type: "candidate", entity: "candidates" });
  res.status(201).json({ id, ...d });
});

router.patch("/candidates/:id", ...requireHR, (req, res) => {
  const parsed = CandidatePatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const db = req.app.locals.db;
  const candId = parseInt(req.params.id, 10);
  const existing = db.prepare("SELECT * FROM candidates WHERE id = ?").get(candId);
  if (!existing) return res.status(404).json({ error: "Candidate not found" });
  const fields = parsed.data;
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) { sets.push(`${k} = ?`); vals.push(v); }
  }
  if (sets.length === 0) return res.json(existing);
  vals.push(candId);
  db.prepare(`UPDATE candidates SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  audit(db, { actorId: req.user.id, action: "UPDATE", entity: "candidate", entityId: candId, detail: fields });
  broadcast({ type: "candidate", entity: "candidates" });
  res.json({ ...existing, ...fields });
});

// ── Applications ───────────────────────────────────────────────────────────

router.get("/applications", ...requireHR, (req, res) => {
  const db = req.app.locals.db;
  const { job_id, status } = req.query;
  let sql = `SELECT a.*, c.name as candidate_name, c.email as candidate_email, c.source,
             j.title as job_title
             FROM applications a
             JOIN candidates c ON a.candidate_id = c.id
             JOIN job_openings j ON a.job_id = j.id WHERE 1=1`;
  const params = [];
  if (job_id) { sql += " AND a.job_id = ?"; params.push(parseInt(job_id, 10)); }
  if (status) {
    const statuses = (Array.isArray(status) ? status : [status]).map(s => s.toUpperCase());
    sql += ` AND a.status IN (${statuses.map(() => "?").join(",")})`;
    params.push(...statuses);
  }
  sql += " ORDER BY a.applied_at DESC";
  res.json(db.prepare(sql).all(...params));
});

router.post("/applications", ...requireHR, (req, res) => {
  const parsed = ApplicationCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const db = req.app.locals.db;
  const d = parsed.data;
  const job = db.prepare("SELECT id, status FROM job_openings WHERE id = ?").get(d.job_id);
  if (!job) return res.status(400).json({ error: "Job not found" });
  if (job.status !== "OPEN") return res.status(400).json({ error: "Job is not open for applications" });
  const cand = db.prepare("SELECT id FROM candidates WHERE id = ?").get(d.candidate_id);
  if (!cand) return res.status(400).json({ error: "Candidate not found" });
  const dup = db.prepare("SELECT id FROM applications WHERE job_id = ? AND candidate_id = ?").get(d.job_id, d.candidate_id);
  if (dup) return res.status(409).json({ error: "Candidate already applied to this job" });
  const result = db.prepare(
    "INSERT INTO applications(job_id, candidate_id) VALUES(?,?)"
  ).run(d.job_id, d.candidate_id);
  const id = Number(result.lastInsertRowid);
  audit(db, { actorId: req.user.id, action: "CREATE", entity: "application", entityId: id, detail: d });
  broadcast({ type: "application", entity: "applications" });
  res.status(201).json({ id, ...d, status: "APPLIED" });
});

const VALID_TRANSITIONS = {
  APPLIED:    ["SCREENING", "REJECTED"],
  SCREENING:  ["INTERVIEW", "REJECTED"],
  INTERVIEW:  ["OFFERED", "REJECTED"],
  OFFERED:    ["HIRED", "REJECTED"],
};

router.patch("/applications/:id", ...requireHR, (req, res) => {
  const parsed = ApplicationPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const db = req.app.locals.db;
  const appId = parseInt(req.params.id, 10);
  const existing = db.prepare("SELECT * FROM applications WHERE id = ?").get(appId);
  if (!existing) return res.status(404).json({ error: "Application not found" });
  const newStatus = parsed.data.status;
  if (existing.status === "HIRED" || existing.status === "REJECTED") {
    return res.status(400).json({ error: `Cannot change status from ${existing.status}` });
  }
  const allowed = VALID_TRANSITIONS[existing.status];
  if (!allowed || !allowed.includes(newStatus)) {
    return res.status(400).json({ error: `Invalid transition: ${existing.status} → ${newStatus}` });
  }
  db.prepare(
    "UPDATE applications SET status = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(newStatus, appId);
  audit(db, { actorId: req.user.id, action: "UPDATE_STATUS", entity: "application", entityId: appId, detail: { from: existing.status, to: newStatus } });
  broadcast({ type: "application", entity: "applications" });
  res.json({ ok: true, status: newStatus });
});

// ── Interviews ─────────────────────────────────────────────────────────────

router.get("/interviews/my-count", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const { c } = db
    .prepare("SELECT COUNT(*) as c FROM interviews WHERE interviewer_id = ?")
    .get(req.user.id);
  res.json({ count: c });
});

router.get("/interviews", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const isHR = ["HR", "ADMIN"].includes(req.user.role);
  let sql = `SELECT i.*, a.status as app_status, c.name as candidate_name, j.title as job_title,
             e.name as interviewer_name
             FROM interviews i
             JOIN applications a ON i.application_id = a.id
             JOIN candidates c ON a.candidate_id = c.id
             JOIN job_openings j ON a.job_id = j.id
             JOIN employees e ON i.interviewer_id = e.id WHERE 1=1`;
  const params = [];
  if (!isHR) {
    sql += " AND i.interviewer_id = ?";
    params.push(req.user.id);
  }
  if (req.query.application_id) {
    sql += " AND i.application_id = ?";
    params.push(parseInt(req.query.application_id, 10));
  }
  if (req.query.status) {
    const statuses = (Array.isArray(req.query.status) ? req.query.status : [req.query.status]).map(s => s.toUpperCase());
    sql += ` AND i.status IN (${statuses.map(() => "?").join(",")})`;
    params.push(...statuses);
  }
  sql += " ORDER BY i.scheduled_at ASC";
  res.json(db.prepare(sql).all(...params));
});

router.post("/interviews", ...requireHR, (req, res) => {
  const parsed = InterviewCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const db = req.app.locals.db;
  const d = parsed.data;
  const app = db.prepare("SELECT id FROM applications WHERE id = ?").get(d.application_id);
  if (!app) return res.status(400).json({ error: "Application not found" });
  const interviewer = db.prepare("SELECT id FROM employees WHERE id = ? AND status != 'EXITED'").get(d.interviewer_id);
  if (!interviewer) return res.status(400).json({ error: "Interviewer not found or inactive" });
  const result = db.prepare(
    "INSERT INTO interviews(application_id, interviewer_id, scheduled_at, duration_mins, mode) VALUES(?,?,?,?,?)"
  ).run(d.application_id, d.interviewer_id, d.scheduled_at, d.duration_mins, d.mode);
  const id = Number(result.lastInsertRowid);
  audit(db, { actorId: req.user.id, action: "CREATE", entity: "interview", entityId: id, detail: d });
  broadcast({ type: "interview", entity: "interviews" });

  // Notify the interviewer they have been scheduled
  const candidate = db.prepare(
    `SELECT c.name FROM candidates c
     JOIN applications a ON c.id = a.candidate_id
     WHERE a.id = ?`
  ).get(d.application_id);
  const dt = new Date(d.scheduled_at).toLocaleString("en-IN", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata",
  });
  notify(db, {
    userId: d.interviewer_id, type: "interview_scheduled", title: "Interview scheduled",
    body: `You are scheduled to interview ${candidate?.name || "a candidate"} on ${dt}`,
    link: "/my/interviews", entity: "interview", entityId: id,
  });

  res.status(201).json({ id, ...d, status: "SCHEDULED" });
});

router.patch("/interviews/:id", requireAuth, (req, res) => {
  const parsed = InterviewPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const db = req.app.locals.db;
  const intId = parseInt(req.params.id, 10);
  const existing = db.prepare("SELECT * FROM interviews WHERE id = ?").get(intId);
  if (!existing) return res.status(404).json({ error: "Interview not found" });
  const isHR = ["HR", "ADMIN"].includes(req.user.role);
  const isInterviewer = existing.interviewer_id === req.user.id;
  if (!isHR && !isInterviewer) return res.status(403).json({ error: "Forbidden" });
  if (!isHR) {
    const allowed = new Set(["feedback", "rating", "status"]);
    for (const k of Object.keys(parsed.data)) {
      if (!allowed.has(k)) return res.status(403).json({ error: `Interviewers cannot modify ${k}` });
    }
  }
  const fields = parsed.data;
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) { sets.push(`${k} = ?`); vals.push(v); }
  }
  if (sets.length === 0) return res.json(existing);
  vals.push(intId);
  db.prepare(`UPDATE interviews SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  audit(db, { actorId: req.user.id, action: "UPDATE", entity: "interview", entityId: intId, detail: fields });
  broadcast({ type: "interview", entity: "interviews" });
  res.json({ ...existing, ...fields });
});

// ── Offers ─────────────────────────────────────────────────────────────────

router.get("/offers/:applicationId", ...requireHR, (req, res) => {
  const db = req.app.locals.db;
  const offer = db.prepare("SELECT * FROM offer_letters WHERE application_id = ?")
    .get(parseInt(req.params.applicationId, 10));
  if (!offer) return res.status(404).json({ error: "No offer for this application" });
  res.json(offer);
});

router.post("/offers/:applicationId", ...requireHR, (req, res) => {
  const parsed = OfferCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const db = req.app.locals.db;
  const appId = parseInt(req.params.applicationId, 10);
  const app = db.prepare("SELECT * FROM applications WHERE id = ?").get(appId);
  if (!app) return res.status(404).json({ error: "Application not found" });
  const existing = db.prepare("SELECT id FROM offer_letters WHERE application_id = ?").get(appId);
  if (existing) return res.status(409).json({ error: "Offer already exists for this application" });
  const d = parsed.data;
  const result = db.prepare(
    "INSERT INTO offer_letters(application_id, ctc_offered, joining_date, status) VALUES(?,?,?,?)"
  ).run(appId, d.ctc_offered, d.joining_date, d.status);
  const id = Number(result.lastInsertRowid);
  audit(db, { actorId: req.user.id, action: "CREATE", entity: "offer_letter", entityId: id, detail: { ...d, application_id: appId } });
  broadcast({ type: "offer_letter", entity: "offer_letters" });
  res.status(201).json({ id, application_id: appId, ...d });
});

router.patch("/offers/:id", ...requireHR, (req, res) => {
  const parsed = OfferPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const db = req.app.locals.db;
  const offerId = parseInt(req.params.id, 10);
  const existing = db.prepare("SELECT * FROM offer_letters WHERE id = ?").get(offerId);
  if (!existing) return res.status(404).json({ error: "Offer not found" });
  const fields = parsed.data;
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) { sets.push(`${k} = ?`); vals.push(v); }
  }
  if (sets.length === 0) return res.json(existing);
  vals.push(offerId);
  db.prepare(`UPDATE offer_letters SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  audit(db, { actorId: req.user.id, action: "UPDATE", entity: "offer_letter", entityId: offerId, detail: fields });
  broadcast({ type: "offer_letter", entity: "offer_letters" });
  res.json({ ...existing, ...fields });
});

// ── Dashboard ──────────────────────────────────────────────────────────────

router.get("/dashboard", ...requireHR, (req, res) => {
  const db = req.app.locals.db;
  const openJobs = db.prepare("SELECT COUNT(*) as c FROM job_openings WHERE status = 'OPEN'").get().c;
  const totalPositions = db.prepare("SELECT COALESCE(SUM(positions),0) as c FROM job_openings WHERE status = 'OPEN'").get().c;
  const byStage = db.prepare(
    `SELECT a.status, COUNT(*) as count FROM applications a
     JOIN job_openings j ON a.job_id = j.id
     WHERE j.status IN ('OPEN','ON_HOLD')
     GROUP BY a.status`
  ).all();
  const recentHires = db.prepare(
    `SELECT a.id, c.name, j.title, a.updated_at
     FROM applications a JOIN candidates c ON a.candidate_id = c.id JOIN job_openings j ON a.job_id = j.id
     WHERE a.status = 'HIRED' ORDER BY a.updated_at DESC LIMIT 5`
  ).all();
  const avgTimeToHire = db.prepare(
    `SELECT AVG(JULIANDAY(a.updated_at) - JULIANDAY(a.applied_at)) as avg_days
     FROM applications a WHERE a.status = 'HIRED'`
  ).get()?.avg_days;
  res.json({
    openJobs,
    totalPositions,
    candidatesByStage: byStage,
    recentHires,
    avgTimeToHire: avgTimeToHire ? Math.round(avgTimeToHire) : null,
  });
});

export default router;
