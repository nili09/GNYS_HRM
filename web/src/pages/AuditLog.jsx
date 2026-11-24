import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";

const ENTITIES = ["", "employee", "leave", "attendance", "payroll", "settings", "auth"];
const PAGE_SIZE = 50;

export default function AuditLog() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [entity, setEntity] = useState("");
  const [action, setAction] = useState("");
  const [offset, setOffset] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: PAGE_SIZE, offset });
      if (entity) params.set("entity", entity);
      if (action) params.set("action", action);
      const d = await api.get(`/audit?${params}`);
      setRows(d.rows);
      setTotal(d.total);
    } catch { /* ignore */ }
    setLoading(false);
  }, [entity, action, offset]);

  useEffect(() => { load(); }, [load]);

  function fmtTs(ts) {
    if (!ts) return "—";
    try {
      const d = new Date(ts);
      return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
    } catch { return ts; }
  }

  const pages = Math.ceil(total / PAGE_SIZE);
  const curPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: 18 }}>Audit Log</h1>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
        <div>
          <label style={lS}>Entity</label>
          <select value={entity} onChange={(e) => { setEntity(e.target.value); setOffset(0); }} style={selS}>
            <option value="">All</option>
            {ENTITIES.filter(Boolean).map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <div>
          <label style={lS}>Action</label>
          <input value={action} onChange={(e) => { setAction(e.target.value); setOffset(0); }} placeholder="e.g. create, update" style={{ ...selS, width: 130 }} />
        </div>
        <div style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-muted)", paddingTop: 16 }}>
          {total} entries
        </div>
      </div>

      {/* Table */}
      <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r-card)", overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
        {loading ? (
          <div style={{ padding: 30, textAlign: "center", color: "var(--text-faint)" }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: "var(--text-faint)" }}>No audit entries found</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--line)", background: "var(--bg)" }}>
                <th style={thS}>Time</th>
                <th style={thS}>Actor</th>
                <th style={thS}>Action</th>
                <th style={thS}>Entity</th>
                <th style={thS}>ID</th>
                <th style={thS}>Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid var(--line)" }}>
                  <td style={{ ...tdS, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{fmtTs(r.at)}</td>
                  <td style={tdS}>{r.actor_name || `#${r.actor_id}`}</td>
                  <td style={tdS}><ActionBadge action={r.action} /></td>
                  <td style={tdS}><span style={{ fontWeight: 600 }}>{r.entity}</span></td>
                  <td style={{ ...tdS, color: "var(--text-faint)" }}>{r.entity_id || "—"}</td>
                  <td style={{ ...tdS, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-muted)", fontSize: 11.5 }}>
                    {fmtDetail(r.detail)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div style={{ display: "flex", gap: 6, marginTop: 12, justifyContent: "center", alignItems: "center" }}>
          <PgBtn label="Prev" disabled={curPage <= 1} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} />
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Page {curPage} of {pages}</span>
          <PgBtn label="Next" disabled={curPage >= pages} onClick={() => setOffset(offset + PAGE_SIZE)} />
        </div>
      )}
    </div>
  );
}

function ActionBadge({ action }) {
  const colors = {
    create: { bg: "var(--lime-pale)", c: "var(--charcoal)" },
    update: { bg: "var(--lime-pale)", c: "var(--charcoal)" },
    delete: { bg: "var(--badge-danger-bg)", c: "var(--danger)" },
    login: { bg: "var(--badge-tan-bg)", c: "var(--badge-tan-text)" },
    finalize: { bg: "var(--badge-indigo-bg)", c: "var(--badge-indigo-text)" },
    reopen: { bg: "var(--badge-amber-bg)", c: "var(--badge-amber-text)" },
    generate: { bg: "var(--lime-pale)", c: "var(--charcoal)" },
  };
  const { bg, c } = colors[action] || { bg: "var(--bg)", c: "var(--text-muted)" };
  return <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: "var(--r-pill)", background: bg, color: c }}>{action}</span>;
}

function fmtDetail(d) {
  if (!d) return "—";
  try {
    const obj = typeof d === "string" ? JSON.parse(d) : d;
    return JSON.stringify(obj);
  } catch { return String(d); }
}

function PgBtn({ label, disabled, onClick }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: "5px 14px", border: "1px solid var(--line)", borderRadius: "var(--r-card)",
      background: "var(--card)", cursor: disabled ? "default" : "pointer",
      fontSize: 12, fontWeight: 500, color: disabled ? "var(--neutral)" : "var(--charcoal)",
      opacity: disabled ? 0.6 : 1,
    }}>{label}</button>
  );
}

const lS = { display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 3 };
const selS = { padding: "6px 10px", border: "1px solid var(--line)", borderRadius: "var(--r-card)", fontSize: 12.5, outline: "none" };
const thS = { padding: "8px 10px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textAlign: "left" };
const tdS = { padding: "8px 10px" };
