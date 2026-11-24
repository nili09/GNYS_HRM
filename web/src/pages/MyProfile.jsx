import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../hooks/useAuth.jsx";
import { api } from "../lib/api.js";
import { useIsMobile } from "../hooks/useIsMobile.jsx";
import ProfilePhoto from "../components/ProfilePhoto.jsx";
import FileUpload from "../components/FileUpload.jsx";

const PERSONAL_EDITABLE = [
  { key: "prefix", label: "Prefix", type: "text" },
  { key: "phone", label: "Phone", type: "text" },
  { key: "personal_email", label: "Personal Email", type: "email" },
  { key: "address", label: "Address", type: "text" },
  { key: "blood_group", label: "Blood Group", type: "select", options: ["", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] },
  { key: "nationality", label: "Nationality", type: "text" },
  { key: "wedding_anniversary", label: "Wedding Anniversary", type: "date" },
  { key: "emergency_name", label: "Emergency Contact Name", type: "text" },
  { key: "emergency_phone", label: "Emergency Contact Phone", type: "text" },
];

const BANK_EDITABLE = [
  { key: "bank_name", label: "Bank Name", type: "text" },
  { key: "bank_acc", label: "Account Number", type: "text" },
  { key: "ifsc", label: "IFSC Code", type: "text" },
];

const JOB_READONLY = [
  { key: "code", label: "Employee Code" },
  { key: "email", label: "Work Email" },
  { key: "gender", label: "Gender" },
  { key: "dob", label: "Date of Birth" },
  { key: "dept_name", label: "Department" },
  { key: "desig_name", label: "Designation" },
  { key: "location_name", label: "Location" },
  { key: "manager_name", label: "Manager" },
  { key: "doj", label: "Date of Joining" },
  { key: "status", label: "Status" },
  { key: "employment_status", label: "Employment Status" },
  { key: "company", label: "Company" },
  { key: "business_unit", label: "Business Unit" },
];

const SUB_ENTITY_CONFIGS = {
  emergency_contacts: {
    label: "Emergency Contacts",
    fields: [
      { key: "name", label: "Name", required: true },
      { key: "phone", label: "Phone", required: true },
      { key: "relationship", label: "Relationship" },
    ],
  },
  family: {
    label: "Family & Dependents",
    fields: [
      { key: "name", label: "Name", required: true },
      { key: "relationship", label: "Relationship", required: true },
      { key: "dob", label: "Date of Birth", type: "date" },
      { key: "is_dependent", label: "Dependent", type: "checkbox" },
    ],
  },
  nominees: {
    label: "Nominees",
    fields: [
      { key: "name", label: "Name", required: true },
      { key: "relationship", label: "Relationship", required: true },
      { key: "share_pct", label: "Share %", type: "number" },
    ],
  },
  education: {
    label: "Education",
    fields: [
      { key: "degree", label: "Degree / Qualification", required: true },
      { key: "institution", label: "Institution" },
      { key: "year", label: "Year", type: "number" },
      { key: "grade", label: "Grade / CGPA" },
    ],
  },
  prev_employers: {
    label: "Previous Employment",
    fields: [
      { key: "company", label: "Company", required: true },
      { key: "designation", label: "Designation" },
      { key: "from_date", label: "From", type: "date" },
      { key: "to_date", label: "To", type: "date" },
      { key: "reason_leaving", label: "Reason for Leaving" },
    ],
  },
};

const DOC_KEYS = [
  { key: "pan_card", label: "PAN Card" },
  { key: "aadhaar", label: "Aadhaar Card" },
  { key: "passport", label: "Passport" },
  { key: "degree_certificate", label: "Degree Certificate" },
  { key: "offer_letter", label: "Offer Letter" },
  { key: "relieving_letter", label: "Relieving Letter" },
];

export default function MyProfile() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [emp, setEmp] = useState(null);
  const [msg, setMsg] = useState("");

  const reload = useCallback(async () => {
    if (!user) return;
    try {
      const d = await api.get(`/employees/${user.id}`);
      setEmp(d);
    } catch (e) {
      setMsg(e.message);
    }
  }, [user]);

  useEffect(() => { reload(); }, [reload]);

  if (!emp) {
    return <div style={{ padding: 30, color: "var(--text-faint)", fontSize: 14 }}>{msg || "Loading…"}</div>;
  }

  const fmtRupee = n => n ? "₹" + Number(n).toLocaleString("en-IN") : "—";
  const latestSal = emp.salary_structures?.[0];

  return (
    <div>
      <h2 className="page-title" style={{ marginBottom: 16 }}>My Profile</h2>

      {msg && <MsgBanner msg={msg} />}

      {/* Header card */}
      <div style={{ ...card, display: "flex", alignItems: "center", gap: isMobile ? 12 : 18, marginBottom: 16, flexWrap: isMobile ? "wrap" : "nowrap" }}>
        <ProfilePhoto employee={emp} size={isMobile ? 44 : 56} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: isMobile ? 16 : 18, fontWeight: 700 }}>{emp.prefix ? `${emp.prefix} ` : ""}{emp.name}</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: isMobile ? "normal" : "nowrap" }}>{emp.code} · {emp.desig_name || "—"} · {emp.dept_name || "—"}</div>
          <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 2 }}>Joined {fmtDate(emp.doj)} · {emp.location_name || "—"}</div>
        </div>
        <span style={{ padding: "4px 12px", borderRadius: "var(--r-pill)", fontSize: 12, fontWeight: 600, background: emp.status === "ACTIVE" ? "var(--lime-pale)" : "var(--badge-tan-bg)", color: emp.status === "ACTIVE" ? "var(--charcoal)" : "var(--badge-tan-text)" }}>
          {emp.status}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Personal Information — editable */}
        <EditableSection
          title="Personal Information"
          fields={PERSONAL_EDITABLE}
          data={emp}
          employeeId={emp.id}
          onSave={reload}
          onMsg={setMsg}
          isMobile={isMobile}
        />

        {/* Job Details — read-only */}
        <div style={card}>
          <h3 style={sectionTitle}>Job Details</h3>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8, marginTop: 8 }}>
            {JOB_READONLY.map(f => (
              <Row key={f.key} label={f.label} value={f.key === "dob" || f.key === "doj" ? fmtDate(emp[f.key]) : emp[f.key]} />
            ))}
            {emp.age != null && <Row label="Age" value={`${emp.age} years`} />}
            {emp.work_anniversary && <Row label="Work Anniversary" value={fmtDate(emp.work_anniversary)} />}
          </div>
        </div>

        {/* Bank Details — editable */}
        <EditableSection
          title="Bank Details"
          fields={BANK_EDITABLE}
          data={emp}
          employeeId={emp.id}
          onSave={reload}
          onMsg={setMsg}
          isMobile={isMobile}
        />

        {/* Sub-entity sections */}
        {Object.entries(SUB_ENTITY_CONFIGS).map(([type, cfg]) => (
          <SubEntitySection
            key={type}
            type={type}
            config={cfg}
            employeeId={emp.id}
            data={emp[type] || []}
            onReload={reload}
            onMsg={setMsg}
            isMobile={isMobile}
          />
        ))}

        {/* Current salary — read-only */}
        {latestSal && (
          <div style={card}>
            <h3 style={sectionTitle}>Current Salary Structure</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginTop: 8 }}>
              {[
                ["Annual CTC", latestSal.ctc_annual],
                ["Basic", latestSal.basic], ["HRA", latestSal.hra],
                ["Special", latestSal.special], ["Conveyance", latestSal.conveyance],
                ["Medical", latestSal.medical], ["LTA", latestSal.lta],
              ].map(([l, v]) => (
                <div key={l} style={{ padding: "10px 14px", background: "var(--bg)", borderRadius: "var(--r-pill)" }}>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>{l}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>{fmtRupee(v)}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 8 }}>Effective from {fmtDate(latestSal.effective_from)}</div>
          </div>
        )}

        {/* Profile photo */}
        <div style={card}>
          <h3 style={sectionTitle}>Profile Photo</h3>
          <FileUpload ownerType="profile_photo" ownerId={String(emp.id)} accept="image/jpeg,image/png,image/webp" label="Upload a profile photo (JPEG, PNG, or WebP)" />
        </div>

        {/* Documents */}
        <div style={card}>
          <h3 style={sectionTitle}>Documents</h3>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, marginTop: 8 }}>
            {DOC_KEYS.map(dk => (
              <div key={dk.key} style={{ padding: "10px 14px", background: "var(--bg)", borderRadius: "var(--r-card)" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4 }}>{dk.label}</div>
                <FileUpload ownerType="doc_checklist" ownerId={`${emp.id}:${dk.key}`} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function EditableSection({ title, fields, data, employeeId, onSave, onMsg, isMobile }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  function startEdit() {
    const f = {};
    for (const fld of fields) f[fld.key] = data[fld.key] || "";
    setForm(f);
    setEditing(true);
    onMsg("");
  }

  async function handleSave() {
    setSaving(true);
    onMsg("");
    try {
      const body = {};
      for (const fld of fields) {
        const newVal = form[fld.key];
        const oldVal = data[fld.key] || "";
        if (newVal !== oldVal) {
          body[fld.key] = newVal || null;
        }
      }
      if (Object.keys(body).length) {
        await api.patch(`/employees/${employeeId}`, body);
        await onSave();
      }
      setEditing(false);
      onMsg("Updated successfully.");
    } catch (e) {
      onMsg(e.data?.error || e.message);
    }
    setSaving(false);
  }

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <h3 style={sectionTitle}>{title}</h3>
        {!editing && <button onClick={startEdit} style={btnEdit}>Edit</button>}
      </div>
      {editing ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
            {fields.map(f => (
              <div key={f.key}>
                <label style={labelStyle}>{f.label}</label>
                {f.type === "select" ? (
                  <select value={form[f.key] || ""} onChange={e => setForm(fm => ({ ...fm, [f.key]: e.target.value }))} style={fldStyle}>
                    {f.options.map(o => <option key={o} value={o}>{o || "—"}</option>)}
                  </select>
                ) : (
                  <input
                    type={f.type === "date" ? "date" : f.type === "email" ? "email" : "text"}
                    value={form[f.key] || ""}
                    onChange={e => setForm(fm => ({ ...fm, [f.key]: e.target.value }))}
                    style={fldStyle}
                  />
                )}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={handleSave} disabled={saving} style={btnPrimary}>{saving ? "Saving…" : "Save"}</button>
            <button onClick={() => setEditing(false)} style={btnCancel}>Cancel</button>
          </div>
        </>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8 }}>
          {fields.map(f => (
            <Row key={f.key} label={f.label} value={f.key.includes("date") || f.key === "wedding_anniversary" ? fmtDate(data[f.key]) : data[f.key]} />
          ))}
        </div>
      )}
    </div>
  );
}

function SubEntitySection({ type, config, employeeId, data, onReload, onMsg, isMobile }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  function startAdd() {
    const f = {};
    for (const fld of config.fields) f[fld.key] = fld.type === "number" ? "" : fld.type === "checkbox" ? 0 : "";
    setForm(f);
    setAdding(true);
    onMsg("");
  }

  async function handleAdd() {
    setSaving(true);
    onMsg("");
    try {
      const body = {};
      for (const fld of config.fields) {
        const v = form[fld.key];
        if (fld.type === "number" && v !== "") body[fld.key] = Number(v);
        else if (fld.type === "checkbox") body[fld.key] = v ? 1 : 0;
        else body[fld.key] = v || null;
      }
      await api.post(`/employees/${employeeId}/details/${type}`, body);
      await onReload();
      setAdding(false);
      onMsg(`${config.label} entry added.`);
    } catch (e) {
      onMsg(e.data?.error || e.message);
    }
    setSaving(false);
  }

  async function handleDelete(rowId) {
    onMsg("");
    try {
      await api.delete(`/employees/${employeeId}/details/${type}/${rowId}`);
      await onReload();
      onMsg(`${config.label} entry removed.`);
    } catch (e) {
      onMsg(e.data?.error || e.message);
    }
  }

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <h3 style={sectionTitle}>{config.label}</h3>
        {!adding && <button onClick={startAdd} style={btnEdit}>+ Add</button>}
      </div>

      {data.length === 0 && !adding && (
        <div style={{ fontSize: 13, color: "var(--text-faint)", padding: "8px 0" }}>No entries yet.</div>
      )}

      {data.map(row => (
        <div key={row.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
          <div style={{ flex: 1, display: "grid", gridTemplateColumns: isMobile ? "1fr" : `repeat(${Math.min(config.fields.length, 3)}, 1fr)`, gap: 6 }}>
            {config.fields.map(f => (
              <div key={f.key} style={{ fontSize: 13 }}>
                <span style={{ color: "var(--text-muted)", fontSize: 11, fontWeight: 500 }}>{f.label}: </span>
                <span style={{ fontWeight: 500 }}>
                  {f.type === "checkbox" ? (row[f.key] ? "Yes" : "No") :
                   f.type === "date" ? fmtDate(row[f.key]) :
                   row[f.key] || "—"}
                </span>
              </div>
            ))}
          </div>
          <button onClick={() => handleDelete(row.id)} style={{ ...btnDanger, flexShrink: 0 }}>Remove</button>
        </div>
      ))}

      {adding && (
        <div style={{ marginTop: 8, padding: "12px", background: "var(--bg)", borderRadius: "var(--r-card)" }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
            {config.fields.map(f => (
              <div key={f.key}>
                <label style={labelStyle}>{f.label}{f.required ? " *" : ""}</label>
                {f.type === "checkbox" ? (
                  <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                    <input type="checkbox" checked={!!form[f.key]} onChange={e => setForm(fm => ({ ...fm, [f.key]: e.target.checked ? 1 : 0 }))} />
                    Yes
                  </label>
                ) : (
                  <input
                    type={f.type === "date" ? "date" : f.type === "number" ? "number" : "text"}
                    value={form[f.key] ?? ""}
                    onChange={e => setForm(fm => ({ ...fm, [f.key]: e.target.value }))}
                    style={fldStyle}
                    required={f.required}
                  />
                )}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={handleAdd} disabled={saving} style={btnPrimary}>{saving ? "Saving…" : "Add"}</button>
            <button onClick={() => setAdding(false)} style={btnCancel}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function MsgBanner({ msg }) {
  const isSuccess = msg.includes("success") || msg.includes("added") || msg.includes("removed");
  return (
    <div style={{
      padding: "8px 12px",
      background: isSuccess ? "var(--lime-pale)" : "var(--badge-danger-bg)",
      color: isSuccess ? "var(--charcoal)" : "var(--danger)",
      borderRadius: "var(--r-card)", marginBottom: 12, fontSize: 13,
    }}>{msg}</div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", fontSize: 13, gap: 1 }}>
      <span style={{ color: "var(--text-muted)", fontWeight: 500, fontSize: 12 }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value || "—"}</span>
    </div>
  );
}

function fmtDate(d) {
  if (!d) return "—";
  try {
    const dt = new Date(d + "T00:00:00");
    return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch { return d; }
}

const card = {
  background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r-card)",
  padding: "16px 20px", boxShadow: "var(--shadow-card)",
};
const sectionTitle = { margin: 0, fontSize: 14, fontWeight: 650 };
const labelStyle = { display: "block", fontSize: 11.5, fontWeight: 600, color: "var(--text-muted)", marginBottom: 3 };
const fldStyle = { width: "100%", padding: "10px 12px", border: "1px solid var(--line)", borderRadius: "var(--r-card)", fontSize: 14, outline: "none", boxSizing: "border-box" };

const btnPrimary = {
  padding: "10px 20px", background: "var(--text)", color: "var(--bg)",
  border: "none", borderRadius: "var(--r-pill)", fontSize: 13, fontWeight: 600, cursor: "pointer", minHeight: 40,
};
const btnCancel = {
  padding: "10px 20px", background: "var(--bg)", color: "var(--text-muted)",
  border: "1px solid var(--line)", borderRadius: "var(--r-pill)", fontSize: 13, fontWeight: 600, cursor: "pointer", minHeight: 40,
};
const btnEdit = {
  padding: "8px 14px", background: "var(--bg)", color: "var(--charcoal)",
  border: "1px solid var(--line)", borderRadius: "var(--r-card)", fontSize: 12, fontWeight: 600, cursor: "pointer", minHeight: 36,
};
const btnDanger = {
  padding: "4px 10px", background: "transparent", color: "var(--danger)",
  border: "1px solid var(--danger)", borderRadius: "var(--r-card)", fontSize: 11, fontWeight: 600, cursor: "pointer",
};
