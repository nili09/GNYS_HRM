import { Router } from "express";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import {
  requireAuth, requireHR, requireSelfOrHR, isManagerOf,
} from "../middleware/auth.js";
import { audit } from "../utils/audit.js";
import { broadcast } from "../utils/sse.js";
import { indexEntity } from "../utils/search.js";
import {
  EmployeeCreateSchema, EmployeePatchSchema, EmployeeSelfPatchSchema,
  SalaryStructureSchema, ResetPasswordSchema,
} from "@hrms/shared/schemas";
import { computeDerived, HRONE_EXPORT_HEADERS } from "@hrms/shared/import";

const router = Router();

/* ── salary fields to strip for non-HR callers ── */
const SALARY_FIELDS = [
  "pan", "aadhaar", "uan", "pf_no", "esi_no",
  "bank_name", "bank_acc", "ifsc",
  "pf_opt", "esi_opt", "pt_opt", "tds_override",
];

/* ── All HROne extended columns on the employees table ── */
const HRONE_COLS = [
  "prefix", "blood_group", "nationality",
  "employment_status", "other_status",
  "company", "business_unit", "sub_branch",
  "functional_manager_code",
  "personal_status", "education_status", "work_exp_status",
  "family_status", "health_insurance_status", "nominee_status",
  "dependent_status", "child_info_status", "bank_status",
  "prev_employer_status", "document_status",
  "resignation_type", "resignation_reason", "requestee_remarks",
  "approver_resignation_type", "approver_resignation_reason", "approver_remarks",
  "login_enabled", "invite_status", "login_status",
  "notice_period_confirm", "notice_period_probation",
  "wedding_anniversary",
];

function stripSalary(row) {
  const r = { ...row };
  for (const f of SALARY_FIELDS) delete r[f];
  delete r.password_hash;
  return r;
}

/* ──────────────────────────────────────────────────────────────────────────────
   GET /employees — list with filters (HR/ADMIN, or manager sees direct reports)
   ────────────────────────────────────────────────────────────────────────────── */
router.get("/", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const isHR = ["HR", "ADMIN"].includes(req.user.role);

  // Employees can't list — only HR/ADMIN or managers
  if (!isHR) {
    // Check if caller is a manager of anyone
    const reports = db.prepare(
      "SELECT id FROM employees WHERE manager_id = ? AND status != 'EXITED'"
    ).all(req.user.id);
    if (reports.length === 0) {
      return res.status(403).json({ error: "Forbidden" });
    }
  }

  let where = ["1=1"];
  const params = [];

  // filters
  if (req.query.q) {
    where.push("(e.name LIKE ? OR e.code LIKE ? OR e.email LIKE ?)");
    const q = `%${req.query.q}%`;
    params.push(q, q, q);
  }
  if (req.query.dept) {
    where.push("d.name = ?");
    params.push(req.query.dept);
  }
  if (req.query.status) {
    where.push("e.status = ?");
    params.push(req.query.status);
  }
  if (req.query.location) {
    where.push("l.name = ?");
    params.push(req.query.location);
  }

  // manager can only see direct reports
  if (!isHR) {
    where.push("e.manager_id = ?");
    params.push(req.user.id);
  }

  const rows = db.prepare(
    `SELECT e.id, e.code, e.name, e.email, e.role, e.status, e.doj, e.gender,
            e.phone, e.dept_id, e.desig_id, e.location_id, e.manager_id,
            d.name AS dept, ds.name AS desig, l.name AS location,
            m.name AS manager_name
     FROM employees e
     LEFT JOIN departments d  ON e.dept_id = d.id
     LEFT JOIN designations ds ON e.desig_id = ds.id
     LEFT JOIN locations l    ON e.location_id = l.id
     LEFT JOIN employees m    ON e.manager_id = m.id
     WHERE ${where.join(" AND ")}
     ORDER BY e.name`
  ).all(...params);

  // Strip salary data for non-HR callers
  if (!isHR) {
    return res.json(rows.map(stripSalary));
  }
  // HR: also attach latest salary structure
  const stmtSal = db.prepare(
    `SELECT * FROM salary_structures
     WHERE employee_id = ?
     ORDER BY effective_from DESC LIMIT 1`
  );
  const result = rows.map(r => {
    delete r.password_hash;
    const sal = stmtSal.get(r.id);
    return { ...r, salary: sal || null };
  });
  res.json(result);
});

/* ──────────────────────────────────────────────────────────────────────────────
   GET /employees/export — CSV export (HR only) — all 44 HROne columns
   ────────────────────────────────────────────────────────────────────────────── */
router.get("/export", requireHR, (req, res) => {
  const db = req.app.locals.db;

  const retirementAge = (() => {
    try {
      const s = db.prepare("SELECT value FROM settings WHERE key = 'retirementAge'").get();
      return s ? JSON.parse(s.value) : 58;
    } catch { return 58; }
  })();

  const rows = db.prepare(
    `SELECT e.*,
            d.name AS dept_name, ds.name AS desig_name, l.name AS location_name,
            m.name AS manager_name, m.code AS manager_code
     FROM employees e
     LEFT JOIN departments d  ON e.dept_id = d.id
     LEFT JOIN designations ds ON e.desig_id = ds.id
     LEFT JOIN locations l    ON e.location_id = l.id
     LEFT JOIN employees m    ON e.manager_id = m.id
     ORDER BY e.code`
  ).all();

  // Resolve functional manager display names in bulk
  const fmStmt = db.prepare("SELECT name FROM employees WHERE code = ? COLLATE NOCASE");

  function csvEscape(val) {
    if (val == null || val === "") return "";
    const s = String(val);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  const lines = [HRONE_EXPORT_HEADERS.map(csvEscape).join(",")];

  for (const r of rows) {
    const derived = computeDerived(r, retirementAge);
    const fmName = r.functional_manager_code ? (fmStmt.get(r.functional_manager_code)?.name || "") : "";

    const vals = [
      r.code,
      r.prefix,
      r.name,
      r.dob,
      r.gender,
      r.blood_group,
      r.nationality,
      derived.age,
      derived.tenureToRetirement,
      r.employment_status,
      r.other_status,
      r.company,
      r.business_unit,
      r.dept_name,
      r.desig_name,
      r.location_name,
      r.sub_branch,
      r.manager_code,
      r.manager_name,
      fmName,
      r.personal_status,
      r.education_status,
      r.work_exp_status,
      r.family_status,
      r.health_insurance_status,
      r.nominee_status,
      r.dependent_status,
      r.child_info_status,
      r.bank_status,
      r.prev_employer_status,
      r.document_status,
      r.resignation_type,
      r.resignation_reason,
      r.requestee_remarks,
      r.approver_resignation_type,
      r.approver_resignation_reason,
      r.approver_remarks,
      r.login_enabled != null ? (r.login_enabled ? "Yes" : "No") : "",
      r.invite_status,
      r.login_status,
      r.notice_period_confirm != null ? r.notice_period_confirm : "",
      r.notice_period_probation != null ? r.notice_period_probation : "",
      r.wedding_anniversary,
      derived.workAnniversary,
    ];

    lines.push(vals.map(csvEscape).join(","));
  }

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="employees-export.csv"');
  res.send(lines.join("\r\n") + "\r\n");
});

/* ──────────────────────────────────────────────────────────────────────────────
   GET /employees/:id — detail
   ────────────────────────────────────────────────────────────────────────────── */
router.get("/:id", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const targetId = parseInt(req.params.id, 10);
  const isHR = ["HR", "ADMIN"].includes(req.user.role);
  const isSelf = req.user.id === targetId;
  const isManager = !isSelf && !isHR && isManagerOf(db, req.user.id, targetId);

  if (!isSelf && !isHR && !isManager) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const row = db.prepare(
    `SELECT e.*,
            d.name AS dept_name, ds.name AS desig_name, l.name AS location_name,
            m.name AS manager_name
     FROM employees e
     LEFT JOIN departments d  ON e.dept_id = d.id
     LEFT JOIN designations ds ON e.desig_id = ds.id
     LEFT JOIN locations l    ON e.location_id = l.id
     LEFT JOIN employees m    ON e.manager_id = m.id
     WHERE e.id = ?`
  ).get(targetId);
  if (!row) return res.status(404).json({ error: "Not found" });

  delete row.password_hash;

  // Resolve functional_manager_code → display name
  if (row.functional_manager_code) {
    const fm = db.prepare(
      "SELECT name FROM employees WHERE code = ? COLLATE NOCASE"
    ).get(row.functional_manager_code);
    row.functional_manager_name = fm ? fm.name : null;
  }

  // Compute derived fields
  const retirementAge = (() => {
    try {
      const s = db.prepare("SELECT value FROM settings WHERE key = 'retirementAge'").get();
      return s ? JSON.parse(s.value) : 58;
    } catch { return 58; }
  })();
  const derived = computeDerived(row, retirementAge);
  row.age = derived.age;
  row.tenure_to_retirement = derived.tenureToRetirement;
  row.work_anniversary = derived.workAnniversary;

  // Strip salary/statutory for non-HR (manager or self-employee)
  if (!isHR) {
    for (const f of SALARY_FIELDS) delete row[f];
  }

  // Attach salary structures for HR, or just current for self
  if (isHR) {
    row.salary_structures = db.prepare(
      "SELECT * FROM salary_structures WHERE employee_id = ? ORDER BY effective_from DESC"
    ).all(targetId);
  } else if (isSelf) {
    // self can see own salary (current structure only)
    const sal = db.prepare(
      `SELECT * FROM salary_structures WHERE employee_id = ?
       ORDER BY effective_from DESC LIMIT 1`
    ).all(targetId);
    row.salary_structures = sal;
  }

  // Attach docs checklist
  row.docs = db.prepare(
    "SELECT key, done FROM docs_checklist WHERE employee_id = ?"
  ).all(targetId);

  res.json(row);
});

/* ──────────────────────────────────────────────────────────────────────────────
   POST /employees — create (HR only)
   ────────────────────────────────────────────────────────────────────────────── */
router.post("/", requireHR, async (req, res) => {
  const parse = EmployeeCreateSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.issues[0].message });
  }

  const db = req.app.locals.db;
  const d = parse.data;

  // Check unique constraints
  if (db.prepare("SELECT id FROM employees WHERE email = ?").get(d.email)) {
    return res.status(409).json({ error: "Email already in use" });
  }
  if (db.prepare("SELECT id FROM employees WHERE code = ?").get(d.code)) {
    return res.status(409).json({ error: "Employee code already in use" });
  }

  // Initial password: a cryptographically-random one-time secret (NEVER the
  // employee code — codes are non-secret and appear in listings/exports, so
  // deriving the password from them is an account-takeover vector). HR receives
  // it once in the response and must relay it; must_change_pw forces a reset.
  const tempPassword = randomBytes(9).toString("base64url"); // 12 chars
  const hash = await bcrypt.hash(tempPassword, 12);

  const result = db.prepare(
    `INSERT INTO employees(
       code, name, gender, dob, phone, email, personal_email, address,
       emergency_name, emergency_phone,
       dept_id, desig_id, location_id, manager_id,
       doj, status, exit_date, exit_reason,
       pan, aadhaar, uan, pf_no, esi_no,
       bank_name, bank_acc, ifsc,
       pf_opt, esi_opt, pt_opt, tds_override,
       role, password_hash, must_change_pw, notes,
       prefix, blood_group, nationality,
       employment_status, other_status,
       company, business_unit, sub_branch,
       functional_manager_code,
       personal_status, education_status, work_exp_status,
       family_status, health_insurance_status, nominee_status,
       dependent_status, child_info_status, bank_status,
       prev_employer_status, document_status,
       resignation_type, resignation_reason, requestee_remarks,
       approver_resignation_type, approver_resignation_reason, approver_remarks,
       login_enabled, invite_status, login_status,
       notice_period_confirm, notice_period_probation,
       wedding_anniversary
     ) VALUES(
       ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,
       ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
     )`
  ).run(
    d.code, d.name, d.gender, d.dob ?? null, d.phone ?? null,
    d.email, d.personal_email ?? null, d.address ?? null,
    d.emergency_name ?? null, d.emergency_phone ?? null,
    d.dept_id ?? null, d.desig_id ?? null, d.location_id ?? null, d.manager_id ?? null,
    d.doj, d.status, d.exit_date ?? null, d.exit_reason ?? null,
    d.pan ?? null, d.aadhaar ?? null, d.uan ?? null, d.pf_no ?? null, d.esi_no ?? null,
    d.bank_name ?? null, d.bank_acc ?? null, d.ifsc ?? null,
    d.pf_opt ?? 1, d.esi_opt ?? 1, d.pt_opt ?? 1, d.tds_override ?? null,
    d.role, hash, d.notes ?? null,
    d.prefix ?? null, d.blood_group ?? null, d.nationality ?? null,
    d.employment_status ?? null, d.other_status ?? null,
    d.company ?? null, d.business_unit ?? null, d.sub_branch ?? null,
    d.functional_manager_code ?? null,
    d.personal_status ?? null, d.education_status ?? null, d.work_exp_status ?? null,
    d.family_status ?? null, d.health_insurance_status ?? null, d.nominee_status ?? null,
    d.dependent_status ?? null, d.child_info_status ?? null, d.bank_status ?? null,
    d.prev_employer_status ?? null, d.document_status ?? null,
    d.resignation_type ?? null, d.resignation_reason ?? null, d.requestee_remarks ?? null,
    d.approver_resignation_type ?? null, d.approver_resignation_reason ?? null, d.approver_remarks ?? null,
    d.login_enabled ?? null, d.invite_status ?? null, d.login_status ?? null,
    d.notice_period_confirm ?? null, d.notice_period_probation ?? null,
    d.wedding_anniversary ?? null,
  );

  const empId = Number(result.lastInsertRowid);

  // Insert initial salary structure if salary fields provided
  if (req.body.salary) {
    const salParse = SalaryStructureSchema.safeParse(req.body.salary);
    if (salParse.success) {
      const s = salParse.data;
      db.prepare(
        `INSERT INTO salary_structures(employee_id, effective_from, ctc_annual,
           basic, hra, special, conveyance, medical, lta, other_earn, other_earn_label)
         VALUES(?,?,?,?,?,?,?,?,?,?,?)`
      ).run(empId, s.effective_from, s.ctc_annual, s.basic, s.hra, s.special,
        s.conveyance, s.medical, s.lta, s.other_earn, s.other_earn_label);
    }
  }

  audit(db, {
    actorId: req.user.id,
    action: "EMPLOYEE_CREATE",
    entity: "employees",
    entityId: empId,
    detail: { code: d.code, name: d.name },
  });
  broadcast({ type: "mutation", entity: "employees", id: empId });

  const dept = d.dept_id ? db.prepare("SELECT name FROM departments WHERE id=?").get(d.dept_id)?.name : null;
  const desig = d.desig_id ? db.prepare("SELECT name FROM designations WHERE id=?").get(d.desig_id)?.name : null;
  indexEntity(db, "employee", empId, d.name,
    [d.code, d.email, dept, desig].filter(Boolean).join(" "),
    { dept, status: d.status || "ACTIVE", role: d.role || "EMPLOYEE" });

  // tempPassword is returned exactly once, here, so HR can hand it over.
  res.status(201).json({ id: empId, code: d.code, tempPassword });
});

/* ──────────────────────────────────────────────────────────────────────────────
   PATCH /employees/:id — update (HR, or self contact-only)
   ────────────────────────────────────────────────────────────────────────────── */
router.patch("/:id", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const targetId = parseInt(req.params.id, 10);
  const isHR = ["HR", "ADMIN"].includes(req.user.role);
  const isSelf = req.user.id === targetId;

  if (!isSelf && !isHR) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const emp = db.prepare("SELECT * FROM employees WHERE id = ?").get(targetId);
  if (!emp) return res.status(404).json({ error: "Not found" });

  if (isSelf && !isHR) {
    // Employee can only patch contact fields
    const parse = EmployeeSelfPatchSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: parse.error.issues[0].message });
    }
    const d = parse.data;
    const sets = [];
    const vals = [];
    for (const [k, v] of Object.entries(d)) {
      if (v !== undefined) {
        sets.push(`${k} = ?`);
        vals.push(v ?? null);
      }
    }
    if (sets.length === 0) return res.json({ ok: true });
    sets.push("updated_at = datetime('now')");
    db.prepare(`UPDATE employees SET ${sets.join(", ")} WHERE id = ?`).run(...vals, targetId);

    audit(db, {
      actorId: req.user.id,
      action: "EMPLOYEE_EDIT",
      entity: "employees",
      entityId: targetId,
      detail: { fields: Object.keys(d), self: true },
    });
    broadcast({ type: "mutation", entity: "employees", id: targetId });
    return res.json({ ok: true });
  }

  // HR/ADMIN full patch
  const parse = EmployeePatchSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.issues[0].message });
  }
  const d = parse.data;

  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(d)) {
    if (v !== undefined) {
      sets.push(`${k} = ?`);
      vals.push(v ?? null);
    }
  }
  if (sets.length > 0) {
    sets.push("updated_at = datetime('now')");
    db.prepare(`UPDATE employees SET ${sets.join(", ")} WHERE id = ?`).run(...vals, targetId);
  }

  // Handle salary structure: if salary object provided, check if changed,
  // insert new structure row
  if (req.body.salary) {
    const salParse = SalaryStructureSchema.safeParse(req.body.salary);
    if (salParse.success) {
      const s = salParse.data;
      // Check if values actually changed from latest structure
      const latest = db.prepare(
        `SELECT * FROM salary_structures WHERE employee_id = ?
         ORDER BY effective_from DESC LIMIT 1`
      ).get(targetId);

      const changed = !latest ||
        latest.ctc_annual !== s.ctc_annual ||
        latest.basic !== s.basic ||
        latest.hra !== s.hra ||
        latest.special !== s.special ||
        latest.conveyance !== s.conveyance ||
        latest.medical !== s.medical ||
        latest.lta !== s.lta ||
        latest.other_earn !== s.other_earn;

      if (changed) {
        // Use INSERT OR REPLACE to handle same effective_from
        db.prepare(
          `INSERT OR REPLACE INTO salary_structures(
             employee_id, effective_from, ctc_annual,
             basic, hra, special, conveyance, medical, lta, other_earn, other_earn_label
           ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`
        ).run(targetId, s.effective_from, s.ctc_annual, s.basic, s.hra, s.special,
          s.conveyance, s.medical, s.lta, s.other_earn, s.other_earn_label);
      }
    }
  }

  // Handle docs checklist
  if (req.body.docs && typeof req.body.docs === "object") {
    const upsertDoc = db.prepare(
      `INSERT INTO docs_checklist(employee_id, key, done) VALUES(?,?,?)
       ON CONFLICT(employee_id, key) DO UPDATE SET done = excluded.done`
    );
    for (const [key, done] of Object.entries(req.body.docs)) {
      upsertDoc.run(targetId, key, done ? 1 : 0);
    }
  }

  audit(db, {
    actorId: req.user.id,
    action: "EMPLOYEE_EDIT",
    entity: "employees",
    entityId: targetId,
    detail: { fields: Object.keys(d) },
  });
  broadcast({ type: "mutation", entity: "employees", id: targetId });

  const updated = db.prepare(
    `SELECT e.name, e.code, e.email, e.status, e.role, d.name as dept_name, des.name as desig_name
     FROM employees e LEFT JOIN departments d ON e.dept_id=d.id LEFT JOIN designations des ON e.desig_id=des.id
     WHERE e.id=?`
  ).get(targetId);
  if (updated) {
    indexEntity(db, "employee", targetId, updated.name,
      [updated.code, updated.email, updated.dept_name, updated.desig_name].filter(Boolean).join(" "),
      { dept: updated.dept_name, status: updated.status, role: updated.role });
  }

  res.json({ ok: true });
});

/* ──────────────────────────────────────────────────────────────────────────────
   POST /employees/:id/reset-password — HR only
   ────────────────────────────────────────────────────────────────────────────── */
router.post("/:id/reset-password", requireHR, async (req, res) => {
  const parse = ResetPasswordSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.issues[0].message });
  }

  const db = req.app.locals.db;
  const empId = parseInt(req.params.id, 10);
  const emp = db.prepare("SELECT id FROM employees WHERE id = ?").get(empId);
  if (!emp) return res.status(404).json({ error: "Employee not found" });

  const hash = await bcrypt.hash(parse.data.newPassword, 12);
  db.prepare(
    "UPDATE employees SET password_hash = ?, must_change_pw = 1, updated_at = datetime('now') WHERE id = ?"
  ).run(hash, empId);

  audit(db, {
    actorId: req.user.id,
    action: "RESET_PASSWORD",
    entity: "employees",
    entityId: empId,
  });

  res.json({ ok: true });
});

export default router;
