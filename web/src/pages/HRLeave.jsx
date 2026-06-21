import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";

const STATUS_BADGE = {
  PENDING:   { bg: "var(--badge-tan-bg)", color: "var(--badge-tan-text)" },
  APPROVED:  { bg: "var(--lime-pale)", color: "var(--charcoal)" },
  REJECTED:  { bg: "var(--badge-danger-bg)", color: "var(--danger)" },
  CANCELLED: { bg: "var(--bg)", color: "var(--text-muted)" },
};

function Badge({ status }) {
  const s = STATUS_BADGE[status] || STATUS_BADGE.PENDING;
  return (
    <span style={{
      padding: "2px 10px", borderRadius: "var(--r-pill)", fontSize: 10.5, fontWeight: 700, letterSpacing: ".04rem", textTransform: "uppercase",
      background: s.bg, color: s.color,
    }}>{status}</span>
  );
}

function fmtDate(d) {
  if (!d) return "";
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function HRLeave() {
  const [tab, setTab] = useState("requests");
  const [leaves, setLeaves] = useState([]);
  const [types, setTypes] = useState([]);
  const [balanceData, setBalanceData] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(null);

  // Adjust modal
  const [adjustModal, setAdjustModal] = useState(null); // { empId, empName }
  const [adjForm, setAdjForm] = useState({ type: "", delta: "", note: "" });
  const [adjHistory, setAdjHistory] = useState([]);

  // Leave type edit
  const [editType, setEditType] = useState(null);
  const [typeForm, setTypeForm] = useState({});

  const year = new Date().getFullYear();

  const fetchData = useCallback(async () => {
    try {
      const [l, t, b, e] = await Promise.all([
        api.get("/leaves"),
        api.get("/leaves/types"),
        api.get(`/leaves/balances?year=${year}`),
        // /leaves/balances returns one row per active employee with no name —
        // this needs the whole roster to resolve names, not a search picker.
        api.get("/employees?limit=5000"),
      ]);
      setLeaves(l);
      setTypes(t);
      setBalanceData(b);
      setEmployees(e.data || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [year]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // SSE + 30s polling fallback
  useEffect(() => {
    const es = new EventSource("/api/events", { withCredentials: true });
    es.onmessage = () => fetchData();
    const poll = setInterval(fetchData, 30000);
    return () => { es.close(); clearInterval(poll); };
  }, [fetchData]);

  async function act(id, action) {
    setActing(id);
    try {
      const body = action === "approve" ? { confirmOverBalance: true } : {};
      await api.post(`/leaves/${id}/${action}`, body);
      fetchData();
    } catch (err) { alert(err.data?.error || err.message); }
    setActing(null);
  }

  async function openAdjust(empId) {
    const emp = employees.find((e) => e.id === empId);
    setAdjustModal({ empId, empName: emp?.name || `#${empId}` });
    setAdjForm({ type: types[0]?.code || "", delta: "", note: "" });
    // We don't have a dedicated adjustments-history endpoint, so leave it empty for now
    setAdjHistory([]);
  }

  async function submitAdjust() {
    if (!adjForm.delta) return;
    try {
      await api.post("/leaves/adjustments", {
        employee_id: adjustModal.empId,
        year,
        type: adjForm.type,
        delta: Number(adjForm.delta),
        note: adjForm.note || null,
      });
      setAdjustModal(null);
      fetchData();
    } catch (err) { alert(err.data?.error || err.message); }
  }

  async function saveType() {
    if (!editType) return;
    try {
      if (editType === "__new__") {
        await api.post("/leaves/types", typeForm);
      } else {
        const { code, ...rest } = typeForm;
        await api.patch(`/leaves/types/${editType}`, rest);
      }
      setEditType(null);
      fetchData();
    } catch (err) { alert(err.data?.error || err.message); }
  }

  // Lookup map: empId → employee
  const empMap = {};
  employees.forEach((e) => { empMap[e.id] = e; });

  // Merge balances with employee names
  const balRows = balanceData.map((b) => {
    const emp = empMap[b.employeeId];
    return { ...b, name: emp?.name || "—", code: emp?.code || "—" };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const paidTypes = types.filter((t) => t.annual > 0);

  if (loading) return <div style={{ padding: 20, color: "var(--text-muted)" }}>Loading…</div>;

  return (
    <div>
      <h2 style={{ margin: "0 0 20px", fontSize: 22, fontWeight: 700, letterSpacing: "-.02rem" }}>
        HR — Leave Management
      </h2>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "2px solid var(--line)", marginBottom: 18 }}>
        {[["requests", "All Requests"], ["balances", "Balances"], ["types", "Leave Types"]].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: "8px 20px", background: "none", border: "none", cursor: "pointer",
            fontWeight: tab === k ? 700 : 400,
            color: tab === k ? "var(--ink)" : "var(--text-muted)",
            borderBottom: tab === k ? "2px solid var(--lime)" : "2px solid transparent",
            marginBottom: -2, fontSize: 13.5, fontFamily: "inherit",
          }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── All Requests ───────────────────────────────────────── */}
      {tab === "requests" && (
        <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r-card)", overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg)", textAlign: "left" }}>
                <th style={thStyle}>Employee</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>From</th>
                <th style={thStyle}>To</th>
                <th style={thStyle}>Days</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {leaves.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 24, textAlign: "center", color: "var(--text-faint)" }}>No leave requests</td></tr>
              )}
              {leaves.map((l) => (
                <tr key={l.id} style={{ borderTop: "1px solid var(--line)" }}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 600 }}>{l.employee_name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{l.employee_code}</div>
                  </td>
                  <td style={tdStyle}>{l.type}</td>
                  <td style={tdStyle}>{fmtDate(l.date_from)}{l.half_from ? " (½)" : ""}</td>
                  <td style={tdStyle}>{fmtDate(l.date_to)}{l.half_to ? " (½)" : ""}</td>
                  <td style={tdStyle}>{l.days}</td>
                  <td style={tdStyle}><Badge status={l.status} /></td>
                  <td style={tdStyle}>
                    {l.status === "PENDING" && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => act(l.id, "approve")} disabled={acting === l.id}
                          style={{ ...btnStyle, background: "var(--charcoal)", color: "#fff" }}>Approve</button>
                        <button onClick={() => act(l.id, "reject")} disabled={acting === l.id}
                          style={{ ...btnStyle, background: "var(--danger)", color: "#fff" }}>Reject</button>
                      </div>
                    )}
                    {(l.status === "PENDING" || l.status === "APPROVED") && (
                      <button onClick={() => act(l.id, "cancel")} disabled={acting === l.id}
                        style={{ ...btnStyle, border: "1px solid var(--line)", background: "var(--card)", color: "var(--danger)", marginTop: l.status === "PENDING" ? 4 : 0 }}>
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Balances ───────────────────────────────────────────── */}
      {tab === "balances" && (
        <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r-card)", overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
          <div style={{ padding: "12px 16px", fontWeight: 700, fontSize: 14, borderBottom: "1px solid var(--line)" }}>
            Leave Balances — {year}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--bg)" }}>
                  <th style={thStyle}>Employee</th>
                  {paidTypes.map((t) => (
                    <th key={t.code} style={{ ...thStyle, textAlign: "center" }} title={t.name}>
                      {t.code} avail.
                    </th>
                  ))}
                  <th style={{ ...thStyle, textAlign: "center" }}>LWP taken</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {balRows.map((row) => {
                  const lwp = row.balances.LWP?.used || 0;
                  return (
                    <tr key={row.employeeId} style={{ borderTop: "1px solid var(--line)" }}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600 }}>{row.name}</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{row.code}</div>
                      </td>
                      {paidTypes.map((t) => {
                        const b = row.balances[t.code];
                        return (
                          <td key={t.code} style={{ ...tdStyle, textAlign: "center" }}>
                            <span style={{ fontWeight: 700, color: (b?.available ?? 0) < 0 ? "var(--danger)" : "var(--ink)" }}>
                              {b?.available ?? 0}
                            </span>
                            <span style={{ fontSize: 11, color: "var(--text-faint)", marginLeft: 4 }}>
                              / {(b?.entitled ?? 0) + (b?.adj ?? 0)}
                            </span>
                          </td>
                        );
                      })}
                      <td style={{ ...tdStyle, textAlign: "center" }}>{lwp || "—"}</td>
                      <td style={tdStyle}>
                        <button onClick={() => openAdjust(row.employeeId)}
                          style={{ ...btnStyle, border: "1px solid var(--line)", background: "var(--card)" }}>
                          Adjust
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: "10px 16px", fontSize: 12, color: "var(--text-muted)", borderTop: "1px solid var(--line)" }}>
            Entitlement is prorated by joining month in the joining year. Use <b>Adjust</b> for opening balances, carry-forward, or encashment.
          </div>
        </div>
      )}

      {/* ── Leave Types ────────────────────────────────────────── */}
      {tab === "types" && (
        <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r-card)", overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
          <div style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--line)" }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Leave Types</span>
            <button onClick={() => {
              setEditType("__new__");
              setTypeForm({ code: "", name: "", annual: 0, paid: 1, carry_fwd: 0, max_carry: 0 });
            }} style={{ ...btnStyle, background: "var(--ink)", color: "var(--lime-light)" }}>
              + Add Type
            </button>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg)" }}>
                <th style={thStyle}>Code</th>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Annual</th>
                <th style={thStyle}>Paid</th>
                <th style={thStyle}>Carry Fwd</th>
                <th style={thStyle}>Max Carry</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {types.map((t) => (
                <tr key={t.code} style={{ borderTop: "1px solid var(--line)" }}>
                  <td style={{ ...tdStyle, fontWeight: 700 }}>{t.code}</td>
                  <td style={tdStyle}>{t.name}</td>
                  <td style={tdStyle}>{t.annual}</td>
                  <td style={tdStyle}>{t.paid ? "Yes" : "No"}</td>
                  <td style={tdStyle}>{t.carry_fwd ? "Yes" : "No"}</td>
                  <td style={tdStyle}>{t.max_carry || "—"}</td>
                  <td style={tdStyle}>
                    <button onClick={() => {
                      setEditType(t.code);
                      setTypeForm({ name: t.name, annual: t.annual, paid: t.paid, carry_fwd: t.carry_fwd, max_carry: t.max_carry });
                    }} style={{ ...btnStyle, border: "1px solid var(--line)", background: "var(--card)" }}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Adjust Modal ───────────────────────────────────────── */}
      {adjustModal && (
        <div style={overlayStyle} onClick={() => setAdjustModal(null)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 14px", fontSize: 16 }}>Adjust Balance — {adjustModal.empName}</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Leave Type</label>
                <select value={adjForm.type} onChange={(e) => setAdjForm({ ...adjForm, type: e.target.value })}
                  style={inputStyle}>
                  {types.map((t) => <option key={t.code} value={t.code}>{t.code}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Days (+/−)</label>
                <input type="number" step="0.5" value={adjForm.delta}
                  onChange={(e) => setAdjForm({ ...adjForm, delta: e.target.value })}
                  placeholder="e.g. 5 or -2" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Note</label>
                <input value={adjForm.note} onChange={(e) => setAdjForm({ ...adjForm, note: e.target.value })}
                  placeholder="e.g. carry-forward 2024" style={inputStyle} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => setAdjustModal(null)} style={{ ...btnStyle, border: "1px solid var(--line)" }}>Cancel</button>
              <button onClick={submitAdjust} style={{ ...btnStyle, background: "var(--ink)", color: "var(--lime-light)" }}>Apply</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Type Modal ────────────────────────────────────── */}
      {editType && (
        <div style={overlayStyle} onClick={() => setEditType(null)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 14px", fontSize: 16 }}>
              {editType === "__new__" ? "New Leave Type" : `Edit — ${editType}`}
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {editType === "__new__" && (
                <div>
                  <label style={labelStyle}>Code</label>
                  <input value={typeForm.code || ""} onChange={(e) => setTypeForm({ ...typeForm, code: e.target.value.toUpperCase() })}
                    style={inputStyle} maxLength={10} />
                </div>
              )}
              <div>
                <label style={labelStyle}>Name</label>
                <input value={typeForm.name || ""} onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })}
                  style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Annual Days</label>
                <input type="number" step="0.5" value={typeForm.annual ?? 0}
                  onChange={(e) => setTypeForm({ ...typeForm, annual: Number(e.target.value) })}
                  style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Paid</label>
                <select value={typeForm.paid ?? 1} onChange={(e) => setTypeForm({ ...typeForm, paid: Number(e.target.value) })}
                  style={inputStyle}>
                  <option value={1}>Yes</option>
                  <option value={0}>No</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Carry Forward</label>
                <select value={typeForm.carry_fwd ?? 0} onChange={(e) => setTypeForm({ ...typeForm, carry_fwd: Number(e.target.value) })}
                  style={inputStyle}>
                  <option value={0}>No</option>
                  <option value={1}>Yes</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Max Carry Days</label>
                <input type="number" step="0.5" value={typeForm.max_carry ?? 0}
                  onChange={(e) => setTypeForm({ ...typeForm, max_carry: Number(e.target.value) })}
                  style={inputStyle} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => setEditType(null)} style={{ ...btnStyle, border: "1px solid var(--line)" }}>Cancel</button>
              <button onClick={saveType} style={{ ...btnStyle, background: "var(--ink)", color: "var(--lime-light)" }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const thStyle = { padding: "8px 12px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".05em" };
const tdStyle = { padding: "10px 12px" };
const btnStyle = {
  padding: "5px 14px", borderRadius: "var(--r-card)", border: "none", cursor: "pointer",
  fontSize: 12, fontWeight: 600, fontFamily: "inherit",
};
const labelStyle = { display: "block", fontSize: 12, fontWeight: 600, color: "var(--badge-gray-text)", marginBottom: 4 };
const inputStyle = {
  width: "100%", padding: "7px 10px", borderRadius: "var(--r-card)", border: "1px solid var(--line)",
  fontSize: 13, fontFamily: "inherit", boxSizing: "border-box",
};
const overlayStyle = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", display: "flex",
  alignItems: "center", justifyContent: "center", zIndex: 1000,
};
const modalStyle = {
  background: "var(--card)", borderRadius: "var(--r-card)", padding: 24, minWidth: 440, maxWidth: 560, boxShadow: "var(--shadow-card)",
  
};
