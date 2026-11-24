import { useState, useEffect } from "react";
import { api } from "../lib/api.js";
import EmployeePicker from "./EmployeePicker.jsx";

const TABS = ["Personal", "Job", "Statutory & Bank", "Salary", "Documents"];

const SECTION_STATUS_FIELDS = [
  ["personal_status",         "Personal"],
  ["education_status",        "Education"],
  ["work_exp_status",         "Work Exp"],
  ["family_status",           "Family"],
  ["health_insurance_status", "Health Ins"],
  ["nominee_status",          "Nominee"],
  ["dependent_status",        "Dependent"],
  ["child_info_status",       "Child Info"],
  ["bank_status",             "Bank"],
  ["prev_employer_status",    "Prev Employer"],
  ["document_status",         "Documents"],
];

const DOC_KEYS = [
  "photo", "pan_card", "aadhaar_card", "passport", "voter_id",
  "10th_marksheet", "12th_marksheet", "grad_cert", "pg_cert",
  "offer_letter", "relieving_letter", "payslips_3m",
  "bank_proof", "address_proof",
];

export default function EmployeeDrawer({ empId, isNew, departments, locations, onClose, onSaved, userRole = "HR" }) {
  const isHR = ["HR", "ADMIN"].includes(userRole);
  const [tab, setTab] = useState(0);
  const [emp, setEmp] = useState(null);
  const [form, setForm] = useState({});
  const [designations, setDesignations] = useState([]);
  const [salaryForm, setSalaryForm] = useState(emptySalary());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isNew) {
      setEmp(null);
      setForm({ gender: "Male", status: "ONBOARDING", role: "EMPLOYEE" });
      setSalaryForm(emptySalary());
      return;
    }
    (async () => {
      try {
        const d = await api.get(`/employees/${empId}`);
        setEmp(d);
        setForm(d);
        setSalaryForm(d.salary_structures?.length ? d.salary_structures[0] : emptySalary());
      } catch (e) { setError(e.message); }
    })();
  }, [empId, isNew]);

  useEffect(() => {
    (async () => {
      try {
        const desig = await api.get("/designations");
        setDesignations(desig);
      } catch {}
    })();
  }, []);

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      if (isNew) {
        const body = {
          code: form.code, name: form.name, gender: form.gender || "Male",
          email: form.email, doj: form.doj, status: form.status || "ONBOARDING",
          role: form.role || "EMPLOYEE",
          dob: form.dob || null, phone: form.phone || null,
          personal_email: form.personal_email || null, address: form.address || null,
          emergency_name: form.emergency_name || null, emergency_phone: form.emergency_phone || null,
          dept_id: form.dept_id ? Number(form.dept_id) : null,
          desig_id: form.desig_id ? Number(form.desig_id) : null,
          location_id: form.location_id ? Number(form.location_id) : null,
          manager_id: form.manager_id ? Number(form.manager_id) : null,
          pan: form.pan || null, aadhaar: form.aadhaar || null,
          uan: form.uan || null, pf_no: form.pf_no || null, esi_no: form.esi_no || null,
          bank_name: form.bank_name || null, bank_acc: form.bank_acc || null, ifsc: form.ifsc || null,
          prefix: form.prefix || null, blood_group: form.blood_group || null,
          nationality: form.nationality || null, employment_status: form.employment_status || null,
          other_status: form.other_status || null, company: form.company || null,
          business_unit: form.business_unit || null, sub_branch: form.sub_branch || null,
          functional_manager_code: form.functional_manager_code || null,
          wedding_anniversary: form.wedding_anniversary || null,
        };
        const hasSal = salaryForm.basic || salaryForm.ctc_annual;
        if (hasSal) body.salary = { ...salaryForm, effective_from: form.doj || today() };
        const created = await api.post("/employees", body);
        // The server returns a one-time temporary password — show it so HR can
        // hand it over. It is never retrievable again (only a reset can re-issue).
        if (created?.tempPassword) {
          window.alert(
            `Employee created.\n\nTemporary password for ${form.name} (${form.email}):\n` +
            `\n    ${created.tempPassword}\n\n` +
            `Share it securely. They must change it at first login.`
          );
        }
      } else {
        const body = {};
        const patchable = [
          "name", "gender", "dob", "phone", "personal_email", "address",
          "emergency_name", "emergency_phone", "dept_id", "desig_id", "location_id",
          "manager_id", "doj", "status", "pan", "aadhaar", "uan", "pf_no", "esi_no",
          "bank_name", "bank_acc", "ifsc", "notes",
          "prefix", "blood_group", "nationality", "employment_status", "other_status",
          "company", "business_unit", "sub_branch", "functional_manager_code",
          "personal_status", "education_status", "work_exp_status", "family_status",
          "health_insurance_status", "nominee_status", "dependent_status",
          "child_info_status", "bank_status", "prev_employer_status", "document_status",
          "resignation_type", "resignation_reason", "requestee_remarks",
          "approver_resignation_type", "approver_resignation_reason", "approver_remarks",
          "login_enabled", "invite_status", "login_status",
          "notice_period_confirm", "notice_period_probation", "wedding_anniversary",
        ];
        const numericFields = new Set(["notice_period_confirm", "notice_period_probation", "login_enabled"]);
        for (const k of patchable) {
          const val = form[k];
          const orig = emp[k];
          if (val !== orig && val !== undefined) {
            if (k.endsWith("_id") && val) body[k] = Number(val);
            else if (numericFields.has(k) && val !== null && val !== "") body[k] = Number(val);
            else body[k] = val || null;
          }
        }
        if (salaryForm.basic || salaryForm.ctc_annual)
          body.salary = { ...salaryForm, effective_from: salaryForm.effective_from || today() };
        if (form._docs) body.docs = form._docs;
        await api.patch(`/employees/${empId}`, body);
      }
      onSaved();
      if (isNew) onClose();
    } catch (e) {
      setError(e.data?.error || e.message);
    }
    setSaving(false);
  }

  function autoStructureFromCTC() {
    const ctc = Number(salaryForm.ctc_annual) || 0;
    if (!ctc) return;
    const monthly = Math.round(ctc / 12);
    const basic = Math.round(monthly * 0.4);
    const hra = Math.round(basic * 0.5);
    const conveyance = 1600, medical = 1250;
    const special = Math.max(0, monthly - basic - hra - conveyance - medical);
    setSalaryForm(s => ({ ...s, basic, hra, special, conveyance, medical, lta: 0, other_earn: 0 }));
  }

  function setSalField(k, v) { setSalaryForm(s => ({ ...s, [k]: Number(v) || 0 })); }

  function toggleDoc(key) {
    const docs = form._docs || {};
    const current = docs[key] ?? (emp?.docs?.find(d => d.key === key)?.done || 0);
    setForm(f => ({ ...f, _docs: { ...docs, [key]: current ? 0 : 1 } }));
  }

  function isDocChecked(key) {
    if (form._docs && form._docs[key] !== undefined) return !!form._docs[key];
    return !!(emp?.docs?.find(d => d.key === key)?.done);
  }

  const fmtRupee = n => n ? "₹" + Number(n).toLocaleString("en-IN") : "—";

  // Profile completeness
  const completeness = (() => {
    if (isNew || !emp) return null;
    const done = SECTION_STATUS_FIELDS.filter(([k]) => {
      const v = (emp[k] || "").toLowerCase();
      return v === "completed" || v === "complete";
    }).length;
    return { done, total: SECTION_STATUS_FIELDS.length, pct: Math.round((done / SECTION_STATUS_FIELDS.length) * 100) };
  })();

  return (
    <>
      {/* Overlay */}
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "var(--overlay)", zIndex: 100 }} />
      {/* Drawer */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: 580, maxWidth: "95vw",
        background: "var(--card)", zIndex: 101, display: "flex", flexDirection: "column",
        borderLeft: "1px solid var(--line)",
      }}>
        {/* Header */}
        <div style={{ padding: "18px 20px 0", borderBottom: "1px solid var(--line)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>
              {isNew ? "Add Employee" : (emp?.name || "Loading…")}
            </h3>
            <button
              onClick={onClose}
              style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "var(--text-muted)", lineHeight: 1 }}
            >×</button>
          </div>

          {/* Profile completeness strip */}
          {completeness && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--text)", textTransform: "uppercase", letterSpacing: ".05rem" }}>Profile Completeness</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: completeness.pct === 100 ? "var(--charcoal)" : "var(--badge-tan-text)" }}>{completeness.pct}%</span>
              </div>
              <div style={{ height: 4, background: "var(--line)", borderRadius: 0, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${completeness.pct}%`, background: "var(--lime)", borderRadius: 0, transition: "width .3s" }} />
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                {SECTION_STATUS_FIELDS.map(([k, label]) => {
                  const v = (emp[k] || "").toLowerCase();
                  const done = v === "completed" || v === "complete";
                  return (
                    <span key={k} className="badge" style={{
                      background: done ? "var(--lime-pale)" : "var(--badge-danger-bg)",
                      color: done ? "var(--charcoal)" : "var(--danger)",
                      fontSize: 10,
                    }}>{label}</span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tabs */}
          <div style={{ display: "flex", gap: 2 }}>
            {TABS.map((t, i) => (
              <button key={t} onClick={() => setTab(i)} style={{
                padding: "9px 13px", fontSize: 12, fontWeight: tab === i ? 700 : 400,
                color: tab === i ? "var(--ink)" : "var(--text-faint)",
                background: "none", border: "none",
                borderBottom: tab === i ? "2px solid var(--lime)" : "2px solid transparent",
                cursor: "pointer", marginBottom: -1,
                textTransform: "uppercase", letterSpacing: ".04rem",
                transition: "color .15s",
              }}>{t}</button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {error && (
            <div style={{ padding: "8px 12px", background: "var(--badge-danger-bg)", color: "var(--danger)", borderRadius: "var(--r-card)", marginBottom: 12, fontSize: 13, border: "1px solid rgba(255,53,53,.2)" }}>{error}</div>
          )}

          {tab === 0 && (
            <div style={gridStyle}>
              <Field label="Prefix"             value={form.prefix}            onChange={v => setField("prefix", v)}            disabled={!isHR} />
              <Field label="Employee Code"      value={form.code}              onChange={v => setField("code", v)}              required disabled={!isNew} />
              <Field label="Full Name"          value={form.name}              onChange={v => setField("name", v)}              required />
              <Field label="Gender"             value={form.gender}            onChange={v => setField("gender", v)}            type="select" options={["Male", "Female", "Other"]} />
              <Field label="Date of Birth"      value={form.dob}               onChange={v => setField("dob", v)}               type="date" />
              {!isNew && emp?.age && <Field label="Age (computed)"         value={emp.age}               disabled />}
              <Field label="Blood Group"        value={form.blood_group}       onChange={v => setField("blood_group", v)}       disabled={!isHR} />
              <Field label="Nationality"        value={form.nationality}       onChange={v => setField("nationality", v)}       disabled={!isHR} />
              <Field label="Wedding Anniversary" value={form.wedding_anniversary} onChange={v => setField("wedding_anniversary", v)} type="date" disabled={!isHR} />
              <Field label="Work Email (@igenesys.com)" value={form.email}  onChange={v => setField("email", v)}             type="email" required disabled={!isNew} />
              <Field label="Personal Email"     value={form.personal_email}    onChange={v => setField("personal_email", v)}    type="email" />
              <Field label="Phone"              value={form.phone}             onChange={v => setField("phone", v)} />
              <Field label="Address"            value={form.address}           onChange={v => setField("address", v)}           full />
              <Field label="Emergency Contact"  value={form.emergency_name}    onChange={v => setField("emergency_name", v)} />
              <Field label="Emergency Phone"    value={form.emergency_phone}   onChange={v => setField("emergency_phone", v)} />
            </div>
          )}

          {tab === 1 && (
            <div style={gridStyle}>
              <Field label="Company"         value={form.company}        onChange={v => setField("company", v)}        disabled={!isHR} />
              <Field label="Business Unit"   value={form.business_unit}  onChange={v => setField("business_unit", v)}  disabled={!isHR} />
              <Field label="Department"      value={form.dept_id}        onChange={v => setField("dept_id", v)}        type="select" options={departments.map(d => ({ value: d.id, label: d.name }))} />
              <Field label="Designation"     value={form.desig_id}       onChange={v => setField("desig_id", v)}       type="select" options={designations.map(d => ({ value: d.id, label: d.name }))} />
              <Field label="Location"        value={form.location_id}    onChange={v => setField("location_id", v)}    type="select" options={locations.map(l => ({ value: l.id, label: l.name }))} />
              <Field label="Sub Branch"      value={form.sub_branch}     onChange={v => setField("sub_branch", v)}     disabled={!isHR} />
              <div style={{ marginBottom: 2 }}>
                <label style={{ display: "block", fontSize: 10.5, fontWeight: 600, color: "var(--text)", marginBottom: 4, textTransform: "uppercase", letterSpacing: ".04rem" }}>
                  Manager
                </label>
                <EmployeePicker
                  value={form.manager_id ? { id: form.manager_id, name: form.manager_name || `#${form.manager_id}` } : null}
                  onChange={(mgr) => setForm(f => ({ ...f, manager_id: mgr ? mgr.id : null, manager_name: mgr ? mgr.name : null }))}
                  excludeId={empId}
                  placeholder="Search manager by name or code…"
                />
              </div>
              <Field label="Functional Mgr Code" value={form.functional_manager_code} onChange={v => setField("functional_manager_code", v)} disabled={!isHR} />
              {!isNew && emp?.functional_manager_name && <Field label="Functional Manager Name" value={emp.functional_manager_name} disabled />}
              <Field label="Date of Joining" value={form.doj}            onChange={v => setField("doj", v)}            type="date" required />
              {!isNew && emp?.work_anniversary     && <Field label="Work Anniversary"       value={emp.work_anniversary}      disabled />}
              {!isNew && emp?.tenure_to_retirement && <Field label="Tenure to Retirement"   value={emp.tenure_to_retirement}  disabled />}
              <Field label="Lifecycle Status"    value={form.status}              onChange={v => setField("status", v)}              type="select" options={["ONBOARDING", "ACTIVE", "NOTICE", "EXITED"]} />
              <Field label="Employment Status"   value={form.employment_status}   onChange={v => setField("employment_status", v)}   disabled={!isHR} />
              <Field label="Other Status"        value={form.other_status}        onChange={v => setField("other_status", v)}        disabled={!isHR} />
              <Field label="Role"                value={form.role}                onChange={v => setField("role", v)}                type="select" options={["EMPLOYEE", "HR", "ADMIN"]} disabled={!isNew} />
              <Field label="Notes"               value={form.notes}               onChange={v => setField("notes", v)}               full />

              <Divider />
              <Field label="Notice Period (Confirmed, days)"  value={form.notice_period_confirm}  onChange={v => setField("notice_period_confirm", v)}  type="number" disabled={!isHR} />
              <Field label="Notice Period (Probation, days)"  value={form.notice_period_probation} onChange={v => setField("notice_period_probation", v)} type="number" disabled={!isHR} />

              <Divider />
              <Field label="Login Enabled"   value={form.login_enabled}  onChange={v => setField("login_enabled", Number(v))} type="select" options={[{value: 1, label: "Yes"}, {value: 0, label: "No"}]} disabled={!isHR} />
              <Field label="Invite Status"   value={form.invite_status}  onChange={v => setField("invite_status", v)}  disabled={!isHR} />
              <Field label="Login Status"    value={form.login_status}   onChange={v => setField("login_status", v)}   disabled={!isHR} />

              <Divider />
              <Field label="Resignation Type"          value={form.resignation_type}          onChange={v => setField("resignation_type", v)}          disabled={!isHR} />
              <Field label="Resignation Reason"        value={form.resignation_reason}        onChange={v => setField("resignation_reason", v)}        disabled={!isHR} />
              <Field label="Requestee Remarks"         value={form.requestee_remarks}         onChange={v => setField("requestee_remarks", v)}         disabled={!isHR} full />
              <Field label="Approver Resignation Type" value={form.approver_resignation_type} onChange={v => setField("approver_resignation_type", v)} disabled={!isHR} />
              <Field label="Approver Resignation Reason" value={form.approver_resignation_reason} onChange={v => setField("approver_resignation_reason", v)} disabled={!isHR} />
              <Field label="Approver Remarks"          value={form.approver_remarks}          onChange={v => setField("approver_remarks", v)}          disabled={!isHR} full />

              <Divider />
              {SECTION_STATUS_FIELDS.map(([k, label]) => (
                <Field key={k} label={`${label} Status`} value={form[k]} onChange={v => setField(k, v)} disabled={!isHR} />
              ))}
            </div>
          )}

          {tab === 2 && (
            <div style={gridStyle}>
              <Field label="PAN"            value={form.pan}       onChange={v => setField("pan", v)} />
              <Field label="Aadhaar"        value={form.aadhaar}   onChange={v => setField("aadhaar", v)} />
              <Field label="UAN"            value={form.uan}       onChange={v => setField("uan", v)} />
              <Field label="PF Number"      value={form.pf_no}     onChange={v => setField("pf_no", v)} />
              <Field label="ESI Number"     value={form.esi_no}    onChange={v => setField("esi_no", v)} />
              <Divider />
              <Field label="Bank Name"      value={form.bank_name} onChange={v => setField("bank_name", v)} />
              <Field label="Account Number" value={form.bank_acc}  onChange={v => setField("bank_acc", v)} />
              <Field label="IFSC Code"      value={form.ifsc}      onChange={v => setField("ifsc", v)} />
            </div>
          )}

          {tab === 3 && (
            <div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 14 }}>
                <div style={{ flex: 1 }}>
                  <Field label="Annual CTC (₹)" value={salaryForm.ctc_annual} onChange={v => setSalField("ctc_annual", v)} type="number" />
                </div>
                <button
                  onClick={autoStructureFromCTC}
                  className="btn-sm"
                  style={{ whiteSpace: "nowrap", marginBottom: 0 }}
                >
                  Auto-split from CTC
                </button>
              </div>
              <Field label="Effective From" value={salaryForm.effective_from} onChange={v => setSalaryForm(s => ({ ...s, effective_from: v }))} type="date" />
              <div style={{ ...gridStyle, marginTop: 12 }}>
                {[
                  ["basic", "Basic"], ["hra", "HRA"], ["special", "Special Allowance"],
                  ["conveyance", "Conveyance"], ["medical", "Medical"], ["lta", "LTA"],
                  ["other_earn", "Other Allowance"],
                ].map(([k, l]) => (
                  <Field key={k} label={l} value={salaryForm[k]} onChange={v => setSalField(k, v)} type="number" />
                ))}
              </div>
              <div style={{ marginTop: 14, padding: "10px 14px", background: "var(--bg)", borderRadius: "var(--r-card)", fontSize: 13, border: "1px solid var(--line)" }}>
                <b>Monthly Total:</b>{" "}
                {fmtRupee((salaryForm.basic || 0) + (salaryForm.hra || 0) + (salaryForm.special || 0) +
                  (salaryForm.conveyance || 0) + (salaryForm.medical || 0) + (salaryForm.lta || 0) + (salaryForm.other_earn || 0))}
              </div>

              {emp?.salary_structures?.length > 1 && (
                <div style={{ marginTop: 18 }}>
                  <h4 style={{ fontSize: 11, fontWeight: 600, marginBottom: 10, color: "var(--text)", textTransform: "uppercase", letterSpacing: ".05rem" }}>Salary History</h4>
                  <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {["Effective", "CTC/yr", "Basic", "HRA", "Special"].map(h => (
                          <th key={h} className="table-th" style={{ padding: "6px 8px" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {emp.salary_structures.map((s, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid var(--line)" }}>
                          {[s.effective_from, fmtRupee(s.ctc_annual), fmtRupee(s.basic), fmtRupee(s.hra), fmtRupee(s.special)].map((v, j) => (
                            <td key={j} style={{ padding: "6px 8px" }}>{v}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 4 && (
            <div>
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 14 }}>Tick documents received from the employee.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {DOC_KEYS.map(key => (
                  <label
                    key={key}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: "var(--r-card)", cursor: "pointer", fontSize: 13, transition: "background .15s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--bg)"}
                    onMouseLeave={e => e.currentTarget.style.background = ""}
                  >
                    <input type="checkbox" checked={isDocChecked(key)} onChange={() => toggleDoc(key)} />
                    {key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 20px", borderTop: "1px solid var(--line)", display: "flex", justifyContent: "flex-end", gap: 8, background: "var(--bg)" }}>
          <button onClick={onClose} className="btn-secondary" style={{ padding: "8px 18px" }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary" style={{ padding: "8px 20px" }}>
            {saving ? "Saving…" : isNew ? "Create Employee" : "Save Changes"}
          </button>
        </div>
      </div>
    </>
  );
}

function Divider() {
  return <div style={{ gridColumn: "1 / -1", height: 1, background: "var(--line)", margin: "6px 0" }} />;
}

function Field({ label, value, onChange, type = "text", options, required, disabled, full }) {
  const wrapper = { ...(full ? { gridColumn: "1 / -1" } : {}), marginBottom: 2 };
  const lbl = (
    <label style={{ display: "block", fontSize: 10.5, fontWeight: 600, color: "var(--text)", marginBottom: 4, textTransform: "uppercase", letterSpacing: ".04rem" }}>
      {label}{required && <span style={{ color: "var(--danger)" }}> *</span>}
    </label>
  );
  if (type === "select") {
    const isObj = options?.length && typeof options[0] === "object";
    return (
      <div style={wrapper}>
        {lbl}
        <select value={value ?? ""} onChange={e => onChange(e.target.value)} disabled={disabled}>
          <option value="">—</option>
          {isObj
            ? options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)
            : options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    );
  }
  return (
    <div style={wrapper}>
      {lbl}
      <input type={type} value={value ?? ""} onChange={e => onChange(e.target.value)} disabled={disabled} />
    </div>
  );
}

function emptySalary() {
  return {
    effective_from: today(), ctc_annual: 0, basic: 0, hra: 0, special: 0,
    conveyance: 0, medical: 0, lta: 0, other_earn: 0, other_earn_label: "Other Allowance",
  };
}

function today() { return new Date().toISOString().slice(0, 10); }

const gridStyle = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 14px" };
