import { Router } from "express";
import { requireAuth, requireHR } from "../middleware/auth.js";
import { audit } from "../utils/audit.js";
import { broadcast } from "../utils/sse.js";
import { OnboardingDocCheckSchema, OnboardingPolicyAckSchema } from "@hrms/shared/schemas";

const router = Router();

const ONBOARDING_POLICIES = [
  { key: "code_of_conduct", label: "Code of Conduct" },
  { key: "it_security", label: "IT & Data Security Policy" },
  { key: "leave_policy", label: "Leave & Attendance Policy" },
  { key: "anti_harassment", label: "Anti-Harassment Policy" },
];

const DOC_CHECKLIST_KEYS = [
  { key: "photo", label: "Passport-size Photo" },
  { key: "id_proof", label: "Government ID Proof" },
  { key: "address_proof", label: "Address Proof" },
  { key: "pan_card", label: "PAN Card" },
  { key: "bank_proof", label: "Bank Account Proof" },
  { key: "education_cert", label: "Education Certificates" },
  { key: "experience_letter", label: "Experience / Relieving Letter" },
  { key: "medical_report", label: "Medical Fitness Report" },
];

/* ── GET /onboarding/my — joiner's full onboarding journey ── */
router.get("/my", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const emp = db.prepare("SELECT id, status, name, doj FROM employees WHERE id = ?").get(req.user.id);
  if (!emp) return res.status(404).json({ error: "Not found" });

  // Docs checklist
  const docs = db.prepare("SELECT key, done FROM docs_checklist WHERE employee_id = ?").all(req.user.id);
  const docsMap = Object.fromEntries(docs.map(d => [d.key, d.done]));
  const docChecklist = DOC_CHECKLIST_KEYS.map(d => ({
    ...d,
    done: docsMap[d.key] === 1,
  }));

  // Policy acknowledgments
  const acks = db.prepare("SELECT policy_key, acked_at FROM onboarding_policy_acks WHERE employee_id = ?").all(req.user.id);
  const acksMap = Object.fromEntries(acks.map(a => [a.policy_key, a.acked_at]));
  const policies = ONBOARDING_POLICIES.map(p => ({
    ...p,
    acked: !!acksMap[p.key],
    acked_at: acksMap[p.key] || null,
  }));

  const docsComplete = docChecklist.filter(d => d.done).length;
  const policiesComplete = policies.filter(p => p.acked).length;

  res.json({
    employee: { id: emp.id, name: emp.name, status: emp.status, doj: emp.doj },
    docs: docChecklist,
    policies,
    progress: {
      docs_done: docsComplete,
      docs_total: DOC_CHECKLIST_KEYS.length,
      policies_done: policiesComplete,
      policies_total: ONBOARDING_POLICIES.length,
      complete: docsComplete === DOC_CHECKLIST_KEYS.length && policiesComplete === ONBOARDING_POLICIES.length,
    },
  });
});

/* ── POST /onboarding/doc-check — toggle a doc checklist item ── */
router.post("/doc-check", requireAuth, (req, res) => {
  const db = req.app.locals.db;

  const parse = OnboardingDocCheckSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.issues[0].message });
  const { key, done } = parse.data;

  if (!DOC_CHECKLIST_KEYS.some(d => d.key === key)) {
    return res.status(400).json({ error: "Invalid doc checklist key" });
  }

  db.prepare(
    `INSERT INTO docs_checklist(employee_id, key, done) VALUES(?,?,?)
     ON CONFLICT(employee_id, key) DO UPDATE SET done = excluded.done`
  ).run(req.user.id, key, done);

  audit(db, {
    actorId: req.user.id,
    action: "ONBOARDING_DOC_CHECK",
    entity: "employees",
    entityId: req.user.id,
    detail: { key, done },
  });

  broadcast({ type: "mutation", entity: "employees", id: req.user.id });
  res.json({ ok: true });
});

/* ── POST /onboarding/policy-ack — acknowledge a policy ── */
router.post("/policy-ack", requireAuth, (req, res) => {
  const db = req.app.locals.db;

  const parse = OnboardingPolicyAckSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.issues[0].message });
  const { policy_key } = parse.data;

  if (!ONBOARDING_POLICIES.some(p => p.key === policy_key)) {
    return res.status(400).json({ error: "Invalid policy key" });
  }

  db.prepare(
    `INSERT OR IGNORE INTO onboarding_policy_acks(employee_id, policy_key) VALUES(?,?)`
  ).run(req.user.id, policy_key);

  audit(db, {
    actorId: req.user.id,
    action: "ONBOARDING_POLICY_ACK",
    entity: "employees",
    entityId: req.user.id,
    detail: { policy_key },
  });

  broadcast({ type: "mutation", entity: "employees", id: req.user.id });
  res.json({ ok: true });
});

/* ── GET /onboarding/hr/progress — HR sees all onboarding employees' progress ── */
router.get("/hr/progress", requireHR, (req, res) => {
  const db = req.app.locals.db;

  const emps = db.prepare(
    `SELECT id, code, name, doj, status FROM employees WHERE status = 'ONBOARDING' ORDER BY doj DESC`
  ).all();

  const docsStmt = db.prepare("SELECT key, done FROM docs_checklist WHERE employee_id = ?");
  const acksStmt = db.prepare("SELECT policy_key FROM onboarding_policy_acks WHERE employee_id = ?");

  const result = emps.map(emp => {
    const docs = docsStmt.all(emp.id);
    const docsMap = Object.fromEntries(docs.map(d => [d.key, d.done]));
    const docsDone = DOC_CHECKLIST_KEYS.filter(d => docsMap[d.key] === 1).length;

    const acks = acksStmt.all(emp.id);
    const acksSet = new Set(acks.map(a => a.policy_key));
    const policiesDone = ONBOARDING_POLICIES.filter(p => acksSet.has(p.key)).length;

    return {
      ...emp,
      docs_done: docsDone,
      docs_total: DOC_CHECKLIST_KEYS.length,
      policies_done: policiesDone,
      policies_total: ONBOARDING_POLICIES.length,
      complete: docsDone === DOC_CHECKLIST_KEYS.length && policiesDone === ONBOARDING_POLICIES.length,
    };
  });

  res.json(result);
});

export default router;
