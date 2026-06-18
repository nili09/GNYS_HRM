/**
 * POST /employees/import — CSV import endpoint.
 * Receives pre-parsed rows + column mapping from the UI wizard.
 * Uses shared rowToEmp for field extraction.
 */
import { Router } from "express";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { requireHR } from "../middleware/auth.js";
import { audit } from "../utils/audit.js";
import { broadcast } from "../utils/sse.js";
import { sendWelcomeEmail } from "../utils/mailer.js";
import { CsvImportSchema } from "@hrms/shared/schemas";
import { rowToEmp } from "@hrms/shared/import";

const router = Router();

router.post("/", requireHR, async (req, res) => {
  const parse = CsvImportSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.issues[0].message });
  }

  const { mapping, rows, dupMode } = parse.data;
  const db = req.app.locals.db;

  // Lookup maps for dept/desig/location
  const deptMap = new Map();
  db.prepare("SELECT id, name FROM departments").all().forEach(r => deptMap.set(r.name, r.id));
  const desigMap = new Map();
  db.prepare("SELECT id, name FROM designations").all().forEach(r => desigMap.set(r.name, r.id));
  const locMap = new Map();
  db.prepare("SELECT id, name FROM locations").all().forEach(r => locMap.set(r.name, r.id));

  // Prepare statements
  const insertDept = db.prepare("INSERT INTO departments(name) VALUES(?)");
  const insertDesig = db.prepare("INSERT INTO designations(name) VALUES(?)");
  const insertLoc = db.prepare("INSERT INTO locations(name) VALUES(?)");
  const findByCode = db.prepare("SELECT id FROM employees WHERE code = ? COLLATE NOCASE");
  const findByEmail = db.prepare("SELECT id FROM employees WHERE email = ? COLLATE NOCASE");

  let added = 0, updated = 0, skipped = 0;
  const problems = [];
  const emailResults = { sent: 0, failed: 0, skipped: 0 };
  const welcomeQueue = [];

  // Next code sequence
  let nextCode = db.prepare("SELECT MAX(CAST(SUBSTR(code, 4) AS INTEGER)) AS mx FROM employees WHERE code LIKE 'GIL%'").get()?.mx || 0;
  nextCode++;

  const insertEmp = db.prepare(
    `INSERT INTO employees(
       code, name, gender, dob, phone, email, personal_email, address,
       emergency_name, emergency_phone,
       dept_id, desig_id, location_id, manager_id,
       doj, status, pan, aadhaar, uan, pf_no, esi_no,
       bank_name, bank_acc, ifsc, pf_opt, esi_opt, pt_opt,
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
     ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,1,1,'EMPLOYEE',?,1,?,
              ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );

  // Partial update: COALESCE(?, col) keeps the existing value when a CSV row
  // omits a column (incoming null), so an update-mode import can't wipe fields
  // it didn't map — and can't null out NOT NULL email.
  const updateEmp = db.prepare(
    `UPDATE employees SET
       name=COALESCE(?, name), gender=COALESCE(?, gender), dob=COALESCE(?, dob), phone=COALESCE(?, phone), email=COALESCE(?, email),
       dept_id=COALESCE(?, dept_id), desig_id=COALESCE(?, desig_id), location_id=COALESCE(?, location_id),
       doj=COALESCE(?, doj), pan=COALESCE(?, pan), aadhaar=COALESCE(?, aadhaar), uan=COALESCE(?, uan), pf_no=COALESCE(?, pf_no), esi_no=COALESCE(?, esi_no),
       bank_name=COALESCE(?, bank_name), bank_acc=COALESCE(?, bank_acc), ifsc=COALESCE(?, ifsc),
       prefix=COALESCE(?, prefix), blood_group=COALESCE(?, blood_group), nationality=COALESCE(?, nationality),
       employment_status=COALESCE(?, employment_status), other_status=COALESCE(?, other_status),
       company=COALESCE(?, company), business_unit=COALESCE(?, business_unit), sub_branch=COALESCE(?, sub_branch),
       functional_manager_code=COALESCE(?, functional_manager_code),
       personal_status=COALESCE(?, personal_status), education_status=COALESCE(?, education_status),
       work_exp_status=COALESCE(?, work_exp_status), family_status=COALESCE(?, family_status),
       health_insurance_status=COALESCE(?, health_insurance_status), nominee_status=COALESCE(?, nominee_status),
       dependent_status=COALESCE(?, dependent_status), child_info_status=COALESCE(?, child_info_status),
       bank_status=COALESCE(?, bank_status), prev_employer_status=COALESCE(?, prev_employer_status),
       document_status=COALESCE(?, document_status),
       resignation_type=COALESCE(?, resignation_type), resignation_reason=COALESCE(?, resignation_reason),
       requestee_remarks=COALESCE(?, requestee_remarks),
       approver_resignation_type=COALESCE(?, approver_resignation_type),
       approver_resignation_reason=COALESCE(?, approver_resignation_reason),
       approver_remarks=COALESCE(?, approver_remarks),
       login_enabled=COALESCE(?, login_enabled), invite_status=COALESCE(?, invite_status),
       login_status=COALESCE(?, login_status),
       notice_period_confirm=COALESCE(?, notice_period_confirm), notice_period_probation=COALESCE(?, notice_period_probation),
       wedding_anniversary=COALESCE(?, wedding_anniversary),
       updated_at=datetime('now')
     WHERE id=?`
  );

  const insertSal = db.prepare(
    `INSERT OR REPLACE INTO salary_structures(
       employee_id, effective_from, ctc_annual, basic, hra, special,
       conveyance, medical, lta, other_earn, other_earn_label
     ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`
  );

  const rowPasswords = [];
  for (let i = 0; i < rows.length; i++) {
    const tp = randomBytes(9).toString("base64url");
    rowPasswords.push({ plain: tp, hash: await bcrypt.hash(tp, 12) });
  }

  const doImport = db.transaction(() => {
    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri];
      const e = rowToEmp(row, mapping);

      if (!e.name) { skipped++; problems.push(`Row ${ri + 2}: no name`); continue; }
      if (!e.doj) {
        if (mapping.doj >= 0) {
          problems.push(`Row ${ri + 2} (${e.name}): unreadable joining date "${row[mapping.doj] || ""}" — set to today`);
        }
        e.doj = new Date().toISOString().slice(0, 10);
      }
      if (!e.code) {
        e.code = "GIL" + String(nextCode).padStart(4, "0");
        nextCode++;
      }

      // Auto-create dept/desig/location if not in DB
      let deptId = null;
      if (e.dept) {
        if (!deptMap.has(e.dept)) {
          const r = insertDept.run(e.dept);
          deptMap.set(e.dept, Number(r.lastInsertRowid));
        }
        deptId = deptMap.get(e.dept);
      }
      let desigId = null;
      if (e.desig) {
        if (!desigMap.has(e.desig)) {
          const r = insertDesig.run(e.desig);
          desigMap.set(e.desig, Number(r.lastInsertRowid));
        }
        desigId = desigMap.get(e.desig);
      }
      let locId = null;
      if (e.location) {
        if (!locMap.has(e.location)) {
          const r = insertLoc.run(e.location);
          locMap.set(e.location, Number(r.lastInsertRowid));
        }
        locId = locMap.get(e.location);
      }

      // Check for existing employee by code
      const existing = findByCode.get(e.code);

      // Resolve manager code → manager_id
      let managerId = null;
      if (e.managerCode) {
        const mgr = db.prepare("SELECT id FROM employees WHERE code = ? COLLATE NOCASE").get(e.managerCode);
        if (mgr) managerId = mgr.id;
      }

      if (existing) {
        if (dupMode === "skip") { skipped++; continue; }
        // Update
        updateEmp.run(
          e.name, e.gender, e.dob || null, e.phone || null, e.email || null,
          deptId, desigId, locId,
          e.doj, e.pan || null, e.aadhaar || null, e.uan || null,
          e.pfNo || null, e.esiNo || null,
          e.bankName || null, e.bankAcc || null, e.ifsc || null,
          e.prefix || null, e.bloodGroup || null, e.nationality || null,
          e.employmentStatus || null, e.otherStatus || null,
          e.company || null, e.businessUnit || null, e.subBranch || null,
          e.functionalManagerCode || null,
          e.personalStatus || null, e.educationStatus || null,
          e.workExpStatus || null, e.familyStatus || null,
          e.healthInsuranceStatus || null, e.nomineeStatus || null,
          e.dependentStatus || null, e.childInfoStatus || null,
          e.bankStatus || null, e.prevEmployerStatus || null,
          e.documentStatus || null,
          e.resignationType || null, e.resignationReason || null,
          e.requesteeRemarks || null,
          e.approverResignationType || null,
          e.approverResignationReason || null,
          e.approverRemarks || null,
          e.loginEnabled, e.inviteStatus || null,
          e.loginStatus || null,
          e.noticePeriodConfirm, e.noticePeriodProbation,
          e.weddingAnniversary || null,
          existing.id,
        );
        // Update salary if any salary field non-zero
        const hasSalary = e.basic || e.hra || e.special || e.conveyance || e.medical || e.lta || e.otherEarn || e.ctc;
        if (hasSalary) {
          insertSal.run(
            existing.id, e.doj, e.ctc, e.basic, e.hra, e.special,
            e.conveyance, e.medical, e.lta, e.otherEarn, "Other Allowance",
          );
        }
        updated++;
      } else {
        // Check email uniqueness
        if (e.email && findByEmail.get(e.email)) {
          problems.push(`Row ${ri + 2} (${e.name}): email "${e.email}" already in use — skipped`);
          skipped++;
          continue;
        }

        const finalEmail = e.email || `${e.code.toLowerCase()}@igenesys.com`;
        const r = insertEmp.run(
          e.code, e.name, e.gender, e.dob || null, e.phone || null,
          finalEmail,
          null, null, null, null,
          deptId, desigId, locId, managerId,
          e.doj, e.status,
          e.pan || null, e.aadhaar || null, e.uan || null,
          e.pfNo || null, e.esiNo || null,
          e.bankName || null, e.bankAcc || null, e.ifsc || null,
          rowPasswords[ri].hash, null,
          e.prefix || null, e.bloodGroup || null, e.nationality || null,
          e.employmentStatus || null, e.otherStatus || null,
          e.company || null, e.businessUnit || null, e.subBranch || null,
          e.functionalManagerCode || null,
          e.personalStatus || null, e.educationStatus || null,
          e.workExpStatus || null, e.familyStatus || null,
          e.healthInsuranceStatus || null, e.nomineeStatus || null,
          e.dependentStatus || null, e.childInfoStatus || null,
          e.bankStatus || null, e.prevEmployerStatus || null,
          e.documentStatus || null,
          e.resignationType || null, e.resignationReason || null,
          e.requesteeRemarks || null,
          e.approverResignationType || null,
          e.approverResignationReason || null,
          e.approverRemarks || null,
          e.loginEnabled, e.inviteStatus || null,
          e.loginStatus || null,
          e.noticePeriodConfirm, e.noticePeriodProbation,
          e.weddingAnniversary || null,
        );
        const empId = Number(r.lastInsertRowid);

        // Insert salary structure
        const hasSalary = e.basic || e.hra || e.special || e.conveyance || e.medical || e.lta || e.otherEarn || e.ctc;
        if (hasSalary) {
          insertSal.run(
            empId, e.doj, e.ctc, e.basic, e.hra, e.special,
            e.conveyance, e.medical, e.lta, e.otherEarn, "Other Allowance",
          );
        }
        welcomeQueue.push({ name: e.name, email: finalEmail, tempPassword: rowPasswords[ri].plain });
        added++;
      }
    }
  });

  doImport();

  for (const w of welcomeQueue) {
    if (!w.email) { emailResults.skipped++; continue; }
    try {
      const r = await sendWelcomeEmail({ to: w.email, name: w.name, loginEmail: w.email, tempPassword: w.tempPassword });
      if (r.status === "sent") emailResults.sent++;
      else if (r.status === "skipped") emailResults.skipped++;
      else emailResults.failed++;
    } catch { emailResults.failed++; }
  }

  audit(db, {
    actorId: req.user.id,
    action: "EMPLOYEE_IMPORT",
    entity: "employees",
    detail: { added, updated, skipped, problemCount: problems.length, emailResults },
  });
  broadcast({ type: "mutation", entity: "employees" });

  res.json({ added, updated, skipped, problems, emailResults });
});

export default router;
