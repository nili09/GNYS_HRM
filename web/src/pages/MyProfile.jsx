import { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth.jsx";
import { api } from "../lib/api.js";

const CONTACT_FIELDS = [
  { key: "phone", label: "Phone" },
  { key: "personal_email", label: "Personal Email" },
  { key: "address", label: "Address" },
  { key: "emergency_name", label: "Emergency Contact" },
  { key: "emergency_phone", label: "Emergency Phone" },
];

export default function MyProfile() {
  const { user } = useAuth();
  const [emp, setEmp] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const d = await api.get(`/employees/${user.id}`);
        setEmp(d);
      } catch (e) {
        setMsg(e.message);
      }
    })();
  }, [user]);

  function startEdit() {
    setForm({
      phone: emp.phone || "",
      personal_email: emp.personal_email || "",
      address: emp.address || "",
      emergency_name: emp.emergency_name || "",
      emergency_phone: emp.emergency_phone || "",
    });
    setEditing(true);
    setMsg("");
  }

  async function handleSave() {
    setSaving(true);
    setMsg("");
    try {
      const body = {};
      for (const f of CONTACT_FIELDS) {
        if (form[f.key] !== (emp[f.key] || "")) {
          body[f.key] = form[f.key] || null;
        }
      }
      if (Object.keys(body).length) {
        await api.patch(`/employees/${user.id}`, body);
        const d = await api.get(`/employees/${user.id}`);
        setEmp(d);
      }
      setEditing(false);
      setMsg("Updated successfully.");
    } catch (e) {
      setMsg(e.data?.error || e.message);
    }
    setSaving(false);
  }

  if (!emp) {
    return <div style={{ padding: 30, color: "var(--text-faint)", fontSize: 14 }}>{msg || "Loading…"}</div>;
  }

  const fmtRupee = n => n ? "₹" + Number(n).toLocaleString("en-IN") : "—";
  const latestSal = emp.salary_structures?.[0];

  return (
    <div>
      <h2 style={{ fontSize: 17, fontWeight: 650, marginBottom: 16 }}>My Profile</h2>

      {msg && <div style={{ padding: "8px 12px", background: msg.includes("success") ? "var(--lime-pale)" : "var(--badge-danger-bg)", color: msg.includes("success") ? "var(--charcoal)" : "var(--danger)", borderRadius: "var(--r-card)", marginBottom: 12, fontSize: 13 }}>{msg}</div>}

      {/* Header card */}
      <div style={{ ...card, display: "flex", alignItems: "center", gap: 18, marginBottom: 16 }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--ink)", color: "var(--lime)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, flexShrink: 0 }}>
          {emp.name?.charAt(0)}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{emp.name}</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{emp.code} · {emp.desig_name || "—"} · {emp.dept_name || "—"}</div>
          <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 2 }}>Joined {emp.doj || "—"} · {emp.location_name || "—"}</div>
        </div>
        <span style={{ padding: "4px 12px", borderRadius: "var(--r-pill)", fontSize: 12, fontWeight: 600, background: emp.status === "ACTIVE" ? "var(--lime-pale)" : "var(--badge-tan-bg)", color: emp.status === "ACTIVE" ? "var(--charcoal)" : "var(--badge-tan-text)" }}>
          {emp.status}
        </span>
      </div>

      {/* Two-column layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Personal info */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <h3 style={sectionTitle}>Contact Information</h3>
            {!editing && <button onClick={startEdit} style={btnEdit}>Edit</button>}
          </div>
          {editing ? (
            <>
              {CONTACT_FIELDS.map(f => (
                <div key={f.key} style={{ marginBottom: 8 }}>
                  <label style={labelStyle}>{f.label}</label>
                  <input value={form[f.key] || ""} onChange={e => setForm(fm => ({ ...fm, [f.key]: e.target.value }))}
                    style={fldStyle} />
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button onClick={handleSave} disabled={saving} style={btnPrimary}>{saving ? "Saving…" : "Save"}</button>
                <button onClick={() => setEditing(false)} style={btnCancel}>Cancel</button>
              </div>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Row label="Work Email" value={emp.email} />
              <Row label="Phone" value={emp.phone} />
              <Row label="Personal Email" value={emp.personal_email} />
              <Row label="Address" value={emp.address} />
              <Row label="Emergency Contact" value={emp.emergency_name} />
              <Row label="Emergency Phone" value={emp.emergency_phone} />
            </div>
          )}
        </div>

        {/* Job info */}
        <div style={card}>
          <h3 style={sectionTitle}>Job Details</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Row label="Gender" value={emp.gender} />
            <Row label="Date of Birth" value={emp.dob} />
            <Row label="Department" value={emp.dept_name} />
            <Row label="Designation" value={emp.desig_name} />
            <Row label="Location" value={emp.location_name} />
            <Row label="Manager" value={emp.manager_name} />
            <Row label="Date of Joining" value={emp.doj} />
          </div>
        </div>

        {/* Current salary */}
        {latestSal && (
          <div style={{ ...card, gridColumn: "1 / -1" }}>
            <h3 style={sectionTitle}>Current Salary Structure</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
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
            <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 8 }}>Effective from {latestSal.effective_from}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: "flex", fontSize: 13 }}>
      <span style={{ width: 140, color: "var(--text-muted)", fontWeight: 500, flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value || "—"}</span>
    </div>
  );
}

const card = {
  background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r-card)",
  padding: "16px 20px", boxShadow: "var(--shadow-card)",
};
const sectionTitle = { margin: 0, fontSize: 14, fontWeight: 650 };
const labelStyle = { display: "block", fontSize: 11.5, fontWeight: 600, color: "var(--text-muted)", marginBottom: 3 };
const fldStyle = { width: "100%", padding: "7px 10px", border: "1px solid var(--line)", borderRadius: "var(--r-card)", fontSize: 13, outline: "none", boxSizing: "border-box" };

const btnPrimary = {
  padding: "7px 16px", background: "var(--ink)", color: "var(--lime)",
  border: "none", borderRadius: "var(--r-pill)", fontSize: 13, fontWeight: 600, cursor: "pointer",
};
const btnCancel = {
  padding: "7px 16px", background: "var(--bg)", color: "var(--text-muted)",
  border: "1px solid var(--line)", borderRadius: "var(--r-pill)", fontSize: 13, fontWeight: 600, cursor: "pointer",
};
const btnEdit = {
  padding: "5px 12px", background: "var(--bg)", color: "var(--charcoal)",
  border: "1px solid var(--line)", borderRadius: "var(--r-card)", fontSize: 12, fontWeight: 600, cursor: "pointer",
};
