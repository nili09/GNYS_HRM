/**
 * CSV import utilities — ported VERBATIM from Genesys-HRMS.html v1.
 * Handles Indian date formats, ₹-formatted numbers, column auto-mapping,
 * and gross-only auto-structure (40/50/balance).
 */

function pad2(n) { return String(n).padStart(2, "0"); }

/* ---- CSV parser (handles quoted fields, CRLF, BOM) ---- */
export function parseCSV(text) {
  text = String(text || "").replace(/^﻿/, "");
  const rows = []; let row = [], cell = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
      else cell += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); cell = "";
        if (row.some(c => c.trim() !== "")) rows.push(row); row = [];
      }
      else cell += ch;
    }
  }
  row.push(cell);
  if (row.some(c => c.trim() !== "")) rows.push(row);
  return rows;
}

/* ---- Normalize Indian-style dates to YYYY-MM-DD; returns "" if unparseable ---- */
export function normDate(s) {
  if (s == null) return "";
  s = String(s).trim();
  if (!s) return "";
  const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const y4 = y => { y = Number(y); if (y < 100) y += (y >= 50 ? 1900 : 2000); return y; };
  const out = (y, m, d) => {
    y = y4(y); m = Number(m); d = Number(d);
    if (!y || m < 1 || m > 12 || d < 1 || d > 31) return "";
    return y + "-" + pad2(m) + "-" + pad2(d);
  };
  let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return out(m[1], m[2], m[3]);              // ISO
  if ((m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/))) {                            // d/m/y (day-first)
    let d = Number(m[1]), mo = Number(m[2]);
    if (mo > 12 && d <= 12) { const t = d; d = mo; mo = t; }                                     // tolerate m/d/y
    return out(m[3], mo, d);
  }
  if ((m = s.match(/^(\d{1,2})[\s\-]([A-Za-z]{3,})[,\s\-]+(\d{2,4})$/))) {                       // 15 Jan 2020
    const mo = MON[m[2].slice(0, 3).toLowerCase()]; return mo ? out(m[3], mo, m[1]) : "";
  }
  if ((m = s.match(/^([A-Za-z]{3,})[\s\-](\d{1,2})[,\s\-]+(\d{2,4})$/))) {                       // Jan 15, 2020
    const mo = MON[m[1].slice(0, 3).toLowerCase()]; return mo ? out(m[3], mo, m[2]) : "";
  }
  if (/^\d{5}$/.test(s)) {                                                                       // Excel serial
    const d = new Date(Date.UTC(1899, 11, 30) + Number(s) * 864e5);
    return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
  }
  return "";
}

export function normNum(s) {
  if (s == null) return 0;
  const n = Number(String(s).replace(/[₹,\s]/g, ""));
  return isFinite(n) ? n : 0;
}

export function normGender(s) {
  s = String(s || "").trim().toLowerCase();
  if (s.startsWith("f")) return "Female";
  if (s.startsWith("m")) return "Male";
  return s ? "Other" : "Male";
}

/** Normalize yes/no/true/false/1/0/y/n → 1 or 0 */
export function normBool(s) {
  if (s == null) return null;
  const v = String(s).trim().toLowerCase();
  if (!v) return null;
  if (["yes", "true", "1", "y"].includes(v)) return 1;
  if (["no", "false", "0", "n"].includes(v)) return 0;
  return null;
}

/** Title-case a trimmed string ("probation" → "Probation") */
export function normTitleCase(s) {
  if (s == null) return "";
  s = String(s).trim();
  if (!s) return "";
  return s.replace(/\b\w/g, c => c.toUpperCase());
}

/* import target fields: [key, label, keywords for auto-guess]
   Order matches the 44 HROne export columns from `import from.csv` where applicable.
   Salary fields kept at the end for backward-compat. */
export const IMP_FIELDS = [
  // ── Core employee ──
  ["code", "Employee code", "employee code,emp code,emp id,employee id,employee no,code"],
  ["prefix", "Prefix", "prefix,salutation,title,mr,mrs,ms"],
  ["name", "Full name *", "full name,employee name,name"],
  ["dob", "Date of birth", "date of birth,dob,birth"],
  ["gender", "Gender", "gender,sex"],
  ["bloodGroup", "Blood group", "blood group,blood type"],
  ["nationality", "Nationality", "nationality,citizen"],
  // ── Derived (accepted & ignored on import) ──
  ["_age", "Age (derived)", "age"],
  ["_tenureToRetirement", "Tenure to retirement (derived)", "tenure to retirement,retirement tenure"],
  // ── Employment / org ──
  ["employmentStatus", "Employment status", "employment status,confirmation status,probation"],
  ["otherStatus", "Employee other status", "employee other status,other status"],
  ["company", "Company", "company,company name,organisation,organization"],
  ["businessUnit", "Business unit", "business unit,bu,business division"],
  ["dept", "Department", "department,dept"],
  ["desig", "Designation", "designation,job title,title,role"],
  ["location", "Location / branch", "branch,location,office,work location"],
  ["subBranch", "Sub branch", "sub branch,sub-branch,sub location"],
  ["managerCode", "Reporting manager code", "reporting manager code,manager code,rm code"],
  ["managerName", "Reporting manager", "reporting manager,manager name,rm name"],
  ["functionalManagerCode", "Functional manager", "functional manager,functional manager code,fm code"],
  // ── Section statuses ──
  ["personalStatus", "Personal status", "personal status"],
  ["educationStatus", "Education status", "education status"],
  ["workExpStatus", "Work experience status", "work experience status,work exp status"],
  ["familyStatus", "Family status", "family status"],
  ["healthInsuranceStatus", "Health insurance status", "health insurance status"],
  ["nomineeStatus", "Nominee details status", "nominee details status,nominee status"],
  ["dependentStatus", "Other dependent status", "other dependent status,dependent status"],
  ["childInfoStatus", "Child info status", "child info status,children status"],
  ["bankStatus", "Bank status", "bank status"],
  ["prevEmployerStatus", "Previous employer details status", "previous employer details status,prev employer status"],
  ["documentStatus", "Document status", "document status,doc status"],
  // ── Resignation ──
  ["resignationType", "Employee resignation type", "employee resignation type,resignation type"],
  ["resignationReason", "Employee resignation reason", "employee resignation reason,resignation reason"],
  ["requesteeRemarks", "Requestee Remarks", "requestee remarks,requestee comment"],
  ["approverResignationType", "Approver resignation type", "approver resignation type"],
  ["approverResignationReason", "Approver resignation reason", "approver resignation reason"],
  ["approverRemarks", "Approver Remarks", "approver remarks,approver comment"],
  // ── Login ──
  ["loginEnabled", "Enable employee login", "enable employee login,login enabled,enable login"],
  ["inviteStatus", "Invite status", "invite status,invitation status"],
  ["loginStatus", "Login status", "login status"],
  // ── Notice period ──
  ["noticePeriodConfirm", "Notice period in confirmation", "notice period in confirmation,notice period confirm"],
  ["noticePeriodProbation", "Notice period in probation", "notice period in probation,notice probation"],
  // ── Dates ──
  ["weddingAnniversary", "Wedding Anniversary", "wedding anniversary"],
  ["_workAnniversary", "Work Anniversary (derived)", "work anniversary"],
  // ── Existing core ──
  ["phone", "Mobile", "mobile,phone,contact"],
  ["email", "Work email", "official email,work email,company email,email"],
  ["doj", "Date of joining *", "date of joining,doj,joining,hire date,date of hire"],
  ["pan", "PAN", "pan"],
  ["aadhaar", "Aadhaar", "aadhaar,aadhar"],
  ["uan", "UAN", "uan,universal account"],
  ["pfNo", "PF number", "pf number,pf no,pf account,epf"],
  ["esiNo", "ESI number", "esi number,esi no,esic,ip number"],
  ["bankName", "Bank name", "bank name,bank"],
  ["bankAcc", "Account number", "account number,account no,bank account,a/c"],
  ["ifsc", "IFSC", "ifsc"],
  // ── Salary (kept for backward compat) ──
  ["ctc", "Annual CTC", "annual ctc,ctc"],
  ["gross", "Monthly gross (auto-structure)", "monthly gross,gross salary,gross pay,gross"],
  ["basic", "Basic (monthly)", "basic"],
  ["hra", "HRA", "hra,house rent"],
  ["conveyance", "Conveyance", "conveyance,transport"],
  ["medical", "Medical allowance", "medical"],
  ["lta", "LTA", "lta,leave travel"],
  ["special", "Special allowance", "special"],
  ["otherEarn", "Other allowance", "other allowance,other earning"],
];

export function guessMap(headers) {
  const map = {};
  const used = new Set();
  IMP_FIELDS.forEach(([key, , kws]) => {
    const kwList = kws.split(",");
    for (const kw of kwList) {
      const idx = headers.findIndex((h, i) => !used.has(i) && String(h).trim().toLowerCase().includes(kw));
      if (idx >= 0) { map[key] = idx; used.add(idx); return; }
    }
  });
  return map;
}

/**
 * Build a flat employee-data object from a CSV row using a mapping {field: colIndex}.
 * Returns a plain object (not a DB row) — caller inserts into DB.
 * Derived columns (_age, _tenureToRetirement, _workAnniversary) are silently ignored.
 */
export function rowToEmp(row, map) {
  const get = k => map[k] != null && map[k] >= 0 ? String(row[map[k]] || "").trim() : "";
  const e = {
    // ── Core ──
    name: get("name"),
    code: get("code"),
    gender: normGender(get("gender")),
    dob: normDate(get("dob")),
    phone: get("phone"),
    email: get("email"),
    dept: get("dept"),
    desig: get("desig"),
    location: get("location"),
    doj: normDate(get("doj")),
    pan: get("pan").toUpperCase(),
    aadhaar: get("aadhaar"),
    uan: get("uan"),
    pfNo: get("pfNo"),
    esiNo: get("esiNo"),
    bankName: get("bankName"),
    bankAcc: get("bankAcc"),
    ifsc: get("ifsc").toUpperCase(),
    status: "ACTIVE",
    // ── HROne extended fields ──
    prefix: normTitleCase(get("prefix")),
    bloodGroup: get("bloodGroup").toUpperCase() || "",
    nationality: normTitleCase(get("nationality")),
    employmentStatus: normTitleCase(get("employmentStatus")),
    otherStatus: normTitleCase(get("otherStatus")),
    company: get("company"),
    businessUnit: get("businessUnit"),
    subBranch: get("subBranch"),
    managerCode: get("managerCode"),
    functionalManagerCode: get("functionalManagerCode"),
    // Section statuses
    personalStatus: normTitleCase(get("personalStatus")),
    educationStatus: normTitleCase(get("educationStatus")),
    workExpStatus: normTitleCase(get("workExpStatus")),
    familyStatus: normTitleCase(get("familyStatus")),
    healthInsuranceStatus: normTitleCase(get("healthInsuranceStatus")),
    nomineeStatus: normTitleCase(get("nomineeStatus")),
    dependentStatus: normTitleCase(get("dependentStatus")),
    childInfoStatus: normTitleCase(get("childInfoStatus")),
    bankStatus: normTitleCase(get("bankStatus")),
    prevEmployerStatus: normTitleCase(get("prevEmployerStatus")),
    documentStatus: normTitleCase(get("documentStatus")),
    // Resignation
    resignationType: get("resignationType"),
    resignationReason: get("resignationReason"),
    requesteeRemarks: get("requesteeRemarks"),
    approverResignationType: get("approverResignationType"),
    approverResignationReason: get("approverResignationReason"),
    approverRemarks: get("approverRemarks"),
    // Login
    loginEnabled: normBool(get("loginEnabled")),
    inviteStatus: normTitleCase(get("inviteStatus")),
    loginStatus: normTitleCase(get("loginStatus")),
    // Notice period (days)
    noticePeriodConfirm: get("noticePeriodConfirm") ? normNum(get("noticePeriodConfirm")) : null,
    noticePeriodProbation: get("noticePeriodProbation") ? normNum(get("noticePeriodProbation")) : null,
    // Dates
    weddingAnniversary: normDate(get("weddingAnniversary")),
    // salary fields
    ctc: normNum(get("ctc")),
    basic: normNum(get("basic")),
    hra: normNum(get("hra")),
    conveyance: normNum(get("conveyance")),
    medical: normNum(get("medical")),
    lta: normNum(get("lta")),
    special: normNum(get("special")),
    otherEarn: normNum(get("otherEarn")),
  };
  // only gross given → auto-structure (40/50/balance per v1)
  const gross = normNum(get("gross"));
  if (gross > 0 && e.basic === 0) {
    e.basic = Math.round(gross * 0.4);
    e.hra = Math.round(e.basic * 0.5);
    e.special = Math.max(0, Math.round(gross - e.basic - e.hra));
  }
  return e;
}

/**
 * Canonical HROne export column order — the exact 44 header strings
 * from `import from.csv`. Used by the export endpoint.
 */
export const HRONE_EXPORT_HEADERS = [
  "Employee Code", "Prefix", "Full name", "Date of birth", "Gender",
  "Blood group", "Nationality", "Age", "Tenure to retirement",
  "Employment status", "Employee Other Status",
  "Company", "Business Unit", "Department", "Designation", "Branch", "Sub branch",
  "Reporting manager code", "Reporting manager",
  "Functional manager",
  "Personal status", "Education status", "Work experience status",
  "Family status", "Health insurance status", "Nominee details status",
  "Other dependent status", "Child info status", "Bank status",
  "Previous employer details status", "Document status",
  "Employee resignation type", "Employee resignation reason", "Requestee Remarks",
  "Approver resignation type", "Approver resignation reason", "Approver Remarks",
  "Enable employee login", "Invite status", "Login status",
  "Notice period in confirmation", "Notice period in probation",
  "Wedding Anniversary", "Work Anniversary",
];

/**
 * Compute derived fields from employee data.
 * - age: from dob, whole years
 * - tenure_to_retirement: years until retirement age (default 58)
 * - work_anniversary: doj formatted as YYYY-MM-DD (the anniversary date)
 */
export function computeDerived(emp, retirementAge = 58) {
  const today = new Date();
  const result = { age: "", tenureToRetirement: "", workAnniversary: "" };

  if (emp.dob) {
    const dob = new Date(emp.dob);
    if (!isNaN(dob)) {
      let age = today.getFullYear() - dob.getFullYear();
      const m = today.getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
      result.age = String(Math.max(0, age));

      const retireYear = dob.getFullYear() + retirementAge;
      const retireDate = new Date(retireYear, dob.getMonth(), dob.getDate());
      const diffMs = retireDate - today;
      if (diffMs > 0) {
        const yrs = Math.floor(diffMs / (365.25 * 864e5));
        const remainder = diffMs - yrs * 365.25 * 864e5;
        const mos = Math.floor(remainder / (30.44 * 864e5));
        result.tenureToRetirement = `${yrs} Years ${mos} Months`;
      } else {
        result.tenureToRetirement = "Retired";
      }
    }
  }

  if (emp.doj) {
    const doj = new Date(emp.doj);
    if (!isNaN(doj)) {
      result.workAnniversary = emp.doj;
    }
  }

  return result;
}
