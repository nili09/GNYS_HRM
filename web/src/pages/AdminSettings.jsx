import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SAT_OPTS = [
  { value: "none", label: "Working" },
  { value: "all", label: "All Saturdays off" },
  { value: "2_4", label: "2nd & 4th off" },
  { value: "1_3", label: "1st & 3rd off" },
];

export default function AdminSettings() {
  const [settings, setSettings] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  // Form state for company
  const [companyName, setCompanyName] = useState("");
  const [cin, setCin] = useState("");
  const [pfCode, setPfCode] = useState("");
  const [esiCode, setEsiCode] = useState("");
  const [tan, setTan] = useState("");
  const [address, setAddress] = useState("");

  // Form state for work week
  const [weekOffs, setWeekOffs] = useState([0]);
  const [satOff, setSatOff] = useState("none");
  const [pfEnabled, setPfEnabled] = useState(true);
  const [pfCapWages, setPfCapWages] = useState(true);
  const [esiEnabled, setEsiEnabled] = useState(true);
  const [ptEnabled, setPtEnabled] = useState(true);

  // Password reset modal
  const [resetModal, setResetModal] = useState(null);
  const [newPw, setNewPw] = useState("");

  // Role change modal
  const [roleModal, setRoleModal] = useState(null);
  const [newRole, setNewRole] = useState("EMPLOYEE");

  function showToast(msg, err) {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 3000);
  }

  const load = useCallback(async () => {
    try {
      const [s, empRes] = await Promise.all([
        api.get("/settings"),
        api.get("/employees?status=ACTIVE&status=ONBOARDING&status=NOTICE&limit=500"),
      ]);
      setSettings(s);
      setCompanyName(s.companyName || "");
      setCin(s.cin || "");
      setPfCode(s.pfCode || "");
      setEsiCode(s.esiCode || "");
      setTan(s.tan || "");
      setAddress(s.address || "");
      setWeekOffs(s.weekOffs || [0]);
      setSatOff(s.satOff || "none");
      setPfEnabled(s.pfEnabled ?? true);
      setPfCapWages(s.pfCapWages ?? true);
      setEsiEnabled(s.esiEnabled ?? true);
      setPtEnabled(s.ptEnabled ?? true);
      setUsers(empRes.data || empRes || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function saveCompany() {
    setSaving(true);
    try {
      await api.put("/settings", { companyName, cin, pfCode, esiCode, tan, address });
      showToast("Company info saved");
    } catch (e) { showToast(e.message, true); }
    setSaving(false);
  }

  async function saveWorkWeek() {
    setSaving(true);
    try {
      await api.put("/settings", { weekOffs, satOff, pfEnabled, pfCapWages, esiEnabled, ptEnabled });
      showToast("Work week & statutory saved");
    } catch (e) { showToast(e.message, true); }
    setSaving(false);
  }

  function toggleWeekOff(dayIdx) {
    if (dayIdx === 6) return; // Saturday managed via satOff
    setWeekOffs((wo) => wo.includes(dayIdx) ? wo.filter((d) => d !== dayIdx) : [...wo, dayIdx]);
  }

  async function handleResetPw() {
    if (!newPw || newPw.length < 8) { showToast("Password must be ≥8 chars", true); return; }
    try {
      await api.post(`/employees/${resetModal.id}/reset-password`, { password: newPw, forceChange: true });
      showToast(`Password reset for ${resetModal.name}`);
      setResetModal(null);
      setNewPw("");
    } catch (e) { showToast(e.message, true); }
  }

  async function handleRoleChange() {
    try {
      await api.patch(`/employees/${roleModal.id}`, { role: newRole });
      showToast(`Role updated to ${newRole} for ${roleModal.name}`);
      setRoleModal(null);
      load();
    } catch (e) { showToast(e.message, true); }
  }

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--text-faint)" }}>Loading…</div>;

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 18 }}>Settings</h1>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 16, right: 16, zIndex: 999,
          padding: "10px 20px", borderRadius: "var(--r-pill)", fontSize: 13, fontWeight: 600,
          background: toast.err ? "var(--badge-danger-bg)" : "var(--lime-pale)",
          color: toast.err ? "var(--danger)" : "var(--charcoal)",
          border: `1px solid ${toast.err ? "var(--badge-danger-bg)" : "var(--badge-green-bg)"}`,
          
        }}>{toast.msg}</div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Left: Company + Work Week */}
        <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
          {/* Company */}
          <Card title="Company">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Company name" value={companyName} onChange={setCompanyName} />
              <Field label="CIN" value={cin} onChange={setCin} />
              <Field label="PF establishment code" value={pfCode} onChange={setPfCode} />
              <Field label="ESI code" value={esiCode} onChange={setEsiCode} />
              <Field label="TAN" value={tan} onChange={setTan} />
              <Field label="PT state" value="Maharashtra" disabled />
            </div>
            <div style={{ marginTop: 10 }}>
              <label style={lS}>Registered address</label>
              <textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} style={{ ...inputS, resize: "vertical" }} />
            </div>
            <Btn label="Save company" onClick={saveCompany} disabled={saving} />
          </Card>

          {/* Work week + statutory */}
          <Card title="Working Week & Statutory">
            <label style={lS}>Weekly offs</label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
              {DAYS.map((d, i) => (
                <label key={i} style={{ display: "flex", gap: 5, alignItems: "center", fontSize: 13, cursor: i === 6 ? "default" : "pointer", color: i === 6 ? "var(--text-faint)" : "var(--charcoal)" }}>
                  <input type="checkbox" checked={weekOffs.includes(i)} onChange={() => toggleWeekOff(i)} disabled={i === 6} />
                  {d.slice(0, 3)}
                </label>
              ))}
            </div>

            <label style={lS}>Saturdays</label>
            <select value={satOff} onChange={(e) => setSatOff(e.target.value)} style={{ ...inputS, marginBottom: 14 }}>
              {SAT_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>

            <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12, display: "flex", gap: 18, flexWrap: "wrap" }}>
              <Check label="PF enabled" checked={pfEnabled} onChange={setPfEnabled} />
              <Check label="Cap PF wages at 15K" checked={pfCapWages} onChange={setPfCapWages} />
              <Check label="ESI enabled" checked={esiEnabled} onChange={setEsiEnabled} />
              <Check label="Professional tax" checked={ptEnabled} onChange={setPtEnabled} />
            </div>
            <Btn label="Save settings" onClick={saveWorkWeek} disabled={saving} />
            <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-faint)", lineHeight: 1.6 }}>
              Rates baked in: PF 12%+12% (EPS 8.33% capped); ESI 0.75%/3.25% up to 21K gross; Maharashtra PT 200/mo (300 Feb), women exempt to 25K; TDS new-regime FY 2026-27 slabs.
            </div>
          </Card>
        </div>

        {/* Right: Users & roles */}
        <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
          <Card title="Users & Roles">
            <div style={{ maxHeight: 400, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--line)", textAlign: "left" }}>
                    <th style={thS}>Name</th>
                    <th style={thS}>Email</th>
                    <th style={thS}>Role</th>
                    <th style={thS}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(Array.isArray(users) ? users : []).map((u) => (
                    <tr key={u.id} style={{ borderBottom: "1px solid var(--line)" }}>
                      <td style={tdS}>{u.name}</td>
                      <td style={tdS}><span style={{ color: "var(--text-muted)" }}>{u.email}</span></td>
                      <td style={tdS}><RoleBadge role={u.role} /></td>
                      <td style={tdS}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => { setRoleModal(u); setNewRole(u.role); }} style={smallBtnS}>Role</button>
                          <button onClick={() => { setResetModal(u); setNewPw(""); }} style={smallBtnS}>Reset PW</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-faint)", lineHeight: 1.6 }}>
              Roles — ADMIN: everything incl. settings &amp; audit. HR: manage people, attendance, leave, payroll. EMPLOYEE: self-service only.
            </div>
          </Card>

          <Card title="About">
            <div style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.7 }}>
              Genesys HRMS — internal HR system for {companyName || "Genesys International"}.<br />
              Modules: Core HR, Attendance, Leave, Payroll (India/Maharashtra).<br />
              Payroll figures are estimates for internal processing; statutory filings remain with Finance/compliance.
            </div>
          </Card>
        </div>
      </div>

      {/* Password reset modal */}
      {resetModal && (
        <Modal title={`Reset password — ${resetModal.name}`} onClose={() => setResetModal(null)}>
          <Field label="New password (≥8 chars)" value={newPw} onChange={setNewPw} type="password" />
          <div style={{ fontSize: 11, color: "var(--text-faint)", margin: "6px 0" }}>User will be forced to change on next login.</div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <Btn label="Reset" onClick={handleResetPw} />
            <Btn label="Cancel" secondary onClick={() => setResetModal(null)} />
          </div>
        </Modal>
      )}

      {/* Role change modal */}
      {roleModal && (
        <Modal title={`Change role — ${roleModal.name}`} onClose={() => setRoleModal(null)}>
          <label style={lS}>Role</label>
          <select value={newRole} onChange={(e) => setNewRole(e.target.value)} style={inputS}>
            {["EMPLOYEE", "HR", "ADMIN"].map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <Btn label="Save" onClick={handleRoleChange} />
            <Btn label="Cancel" secondary onClick={() => setRoleModal(null)} />
          </div>
        </Modal>
      )}
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r-card)", padding: "16px 18px", boxShadow: "var(--shadow-card)" }}>
      <h4 style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 10, color: "var(--charcoal)" }}>{title}</h4>
      {children}
    </div>
  );
}

function Field({ label, value, onChange, disabled, type }) {
  return (
    <div>
      <label style={lS}>{label}</label>
      <input type={type || "text"} value={value} onChange={(e) => onChange?.(e.target.value)} disabled={disabled} style={{ ...inputS, background: disabled ? "var(--bg)" : "var(--card)" }} />
    </div>
  );
}

function Check({ label, checked, onChange }) {
  return (
    <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function Btn({ label, onClick, disabled, secondary }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      marginTop: 12, padding: "7px 18px", border: secondary ? "1px solid var(--line)" : "none",
      borderRadius: "var(--r-card)", cursor: "pointer", fontSize: 12.5, fontWeight: 600,
      background: secondary ? "var(--card)" : "var(--ink)", color: secondary ? "var(--charcoal)" : "var(--lime-light)",
      opacity: disabled ? 0.5 : 1,
    }}>{label}</button>
  );
}

function RoleBadge({ role }) {
  const colors = { ADMIN: { bg: "var(--badge-amber-bg)", c: "var(--badge-amber-text)" }, HR: { bg: "rgba(25,25,112,.12)", c: "var(--charcoal)" }, EMPLOYEE: { bg: "var(--bg)", c: "var(--text-muted)" } };
  const { bg, c } = colors[role] || colors.EMPLOYEE;
  return <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: "var(--r-pill)", background: bg, color: c }}>{role}</span>;
}

function Modal({ title, children, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "var(--overlay)" }} />
      <div style={{ position: "relative", background: "var(--card)", borderRadius: "var(--r-card)", padding: "20px 24px", width: 360, boxShadow: "var(--shadow-card)" }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>{title}</h3>
        {children}
      </div>
    </div>
  );
}

const lS = { display: "block", fontSize: 11.5, fontWeight: 600, color: "var(--text-muted)", marginBottom: 3 };
const inputS = { width: "100%", padding: "7px 10px", border: "1px solid var(--line)", borderRadius: "var(--r-card)", fontSize: 13, outline: "none", boxSizing: "border-box" };
const thS = { padding: "6px 8px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)" };
const tdS = { padding: "6px 8px" };
const smallBtnS = { background: "var(--bg)", border: "1px solid var(--line)", borderRadius: "var(--r-pill)", padding: "3px 10px", cursor: "pointer", fontSize: 11, fontWeight: 500 };
