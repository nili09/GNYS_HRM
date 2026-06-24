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
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function daysInMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function thisMonth() { return new Date().toISOString().slice(0, 7); }

function fmtMonthLabel(ym) {
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
}

export default function TeamApprovals() {
  const [tab, setTab] = useState("pending");
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(null);

  // Who's out calendar
  const [calMonth] = useState(thisMonth());
  const [approved, setApproved] = useState([]);

  const fetchData = useCallback(async () => {
    try {
      const [p, all] = await Promise.all([
        api.get("/leaves/pending"),
        api.get(`/leaves?status=APPROVED&limit=1000`),
      ]);
      setPending(p);
      setApproved((all.data || []).filter(
        (l) => l.status === "APPROVED" && l.date_from.slice(0, 7) <= calMonth && l.date_to.slice(0, 7) >= calMonth
      ));
    } catch { /* ignore */ }
    setLoading(false);
  }, [calMonth]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // SSE + 30s polling fallback
  useEffect(() => {
    const es = new EventSource("/api/events", { withCredentials: true });
    es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.entity === "leaves") fetchData();
      } catch { /* ignore */ }
    };
    const poll = setInterval(fetchData, 30000);
    return () => { es.close(); clearInterval(poll); };
  }, [fetchData]);

  async function act(id, action) {
    setActing(id);
    try {
      const body = action === "approve" ? { confirmOverBalance: true } : {};
      await api.post(`/leaves/${id}/${action}`, body);
      fetchData();
    } catch (err) {
      alert(err.data?.error || err.message);
    }
    setActing(null);
  }

  if (loading) return <div style={{ padding: 20, color: "var(--text-muted)" }}>Loading…</div>;

  // Build who's-out strip data
  const numDays = daysInMonth(calMonth);
  const todayDate = new Date().getDate();
  const todayStr = new Date().toISOString().slice(0, 10);

  // Group approved leaves by employee for the calendar
  const empLeaves = {};
  approved.forEach((l) => {
    if (!empLeaves[l.employee_id]) empLeaves[l.employee_id] = { name: l.employee_name, leaves: [] };
    empLeaves[l.employee_id].leaves.push(l);
  });

  return (
    <div>
      <h2 style={{ margin: "0 0 20px", fontSize: 22, fontWeight: 700, letterSpacing: "-.02rem" }}>
        Team
      </h2>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "2px solid var(--line)", marginBottom: 18 }}>
        {[["pending", `Pending (${pending.length})`], ["calendar", "Who's Out"]].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: "8px 20px", background: "none", border: "none", cursor: "pointer",
            fontWeight: tab === k ? 700 : 400,
            color: tab === k ? "var(--text)" : "var(--text-muted)",
            borderBottom: tab === k ? "2px solid var(--lime)" : "2px solid transparent",
            marginBottom: -2, fontSize: 13.5, fontFamily: "inherit",
          }}>
            {label}
          </button>
        ))}
      </div>

      {tab === "pending" && (
        <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r-card)", overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg)", textAlign: "left" }}>
                <th style={thStyle}>Employee</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>From</th>
                <th style={thStyle}>To</th>
                <th style={thStyle}>Days</th>
                <th style={thStyle}>Reason</th>
                <th style={thStyle}>Applied</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pending.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 24, textAlign: "center", color: "var(--text-faint)" }}>
                  No pending approvals
                </td></tr>
              )}
              {pending.map((l) => (
                <tr key={l.id} style={{ borderTop: "1px solid var(--line)" }}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 600 }}>{l.employee_name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{l.employee_code}</div>
                  </td>
                  <td style={tdStyle}><span style={{ fontWeight: 600 }}>{l.type}</span></td>
                  <td style={tdStyle}>{fmtDate(l.date_from)}{l.half_from ? " (½)" : ""}</td>
                  <td style={tdStyle}>{fmtDate(l.date_to)}{l.half_to ? " (½)" : ""}</td>
                  <td style={tdStyle}>{l.days}</td>
                  <td style={{ ...tdStyle, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {l.reason || "—"}
                  </td>
                  <td style={{ ...tdStyle, fontSize: 11.5, color: "var(--text-muted)" }}>
                    {fmtDate(l.applied_at?.slice(0, 10))}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => act(l.id, "approve")} disabled={acting === l.id}
                        style={{ ...btnStyle, background: "var(--charcoal)", color: "#fff" }}>
                        Approve
                      </button>
                      <button onClick={() => act(l.id, "reject")} disabled={acting === l.id}
                        style={{ ...btnStyle, background: "var(--danger)", color: "#fff" }}>
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "calendar" && (
        <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r-card)", padding: 16, boxShadow: "var(--shadow-card)" }}>
          <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 14 }}>{fmtMonthLabel(calMonth)}</div>
          {Object.keys(empLeaves).length === 0 ? (
            <div style={{ color: "var(--text-faint)", padding: 16, textAlign: "center" }}>No one on leave this month</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, position: "sticky", left: 0, background: "var(--bg)", zIndex: 1, minWidth: 120 }}>
                      Employee
                    </th>
                    {Array.from({ length: numDays }, (_, i) => {
                      const d = i + 1;
                      const ds = `${calMonth}-${String(d).padStart(2, "0")}`;
                      const isToday = ds === todayStr;
                      return (
                        <th key={d} style={{
                          ...thStyle, textAlign: "center", minWidth: 26,
                          background: isToday ? "var(--lime)" : "var(--bg)",
                          color: isToday ? "#ffffff" : "var(--text-muted)",
                        }}>{d}</th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(empLeaves).map(([empId, { name, leaves }]) => (
                    <tr key={empId} style={{ borderTop: "1px solid var(--line)" }}>
                      <td style={{ ...tdStyle, position: "sticky", left: 0, background: "var(--card)", fontWeight: 600 }}>
                        {name}
                      </td>
                      {Array.from({ length: numDays }, (_, i) => {
                        const d = i + 1;
                        const ds = `${calMonth}-${String(d).padStart(2, "0")}`;
                        const onLeave = leaves.some((l) => l.date_from <= ds && ds <= l.date_to);
                        return (
                          <td key={d} style={{
                            textAlign: "center", padding: "6px 2px",
                            background: onLeave ? "var(--badge-tan-bg)" : "transparent",
                          }}>
                            {onLeave && <span style={{ color: "var(--text-muted)", fontWeight: 700, fontSize: 11 }}>L</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const thStyle = { padding: "6px 8px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" };
const tdStyle = { padding: "8px 10px" };
const btnStyle = {
  padding: "4px 12px", borderRadius: "var(--r-card)", border: "none", cursor: "pointer",
  fontSize: 11.5, fontWeight: 600, fontFamily: "inherit",
};
