import { useState, useEffect, useCallback, Fragment } from "react";
import { api } from "../lib/api.js";

const ATT_LABEL = {
  P: "Present", A: "Absent", HD: "Half day",
  WFH: "WFH", OD: "On duty", L: "On leave",
  H: "Holiday", WO: "Week off",
};

const CODE_COLORS = {
  P:   { bg: "var(--lime-pale)", color: "var(--charcoal)" },
  A:   { bg: "var(--badge-danger-bg)", color: "var(--danger)" },
  HD:  { bg: "var(--badge-tan-bg)", color: "var(--badge-tan-text)" },
  WFH: { bg: "rgba(25,25,112,.15)", color: "var(--charcoal)" },
  OD:  { bg: "var(--charcoal)", color: "var(--lime-light)" },
  L:   { bg: "var(--badge-tan-bg)", color: "var(--text-muted)" },
  H:   { bg: "var(--lime-pale)", color: "var(--charcoal)" },
  WO:  { bg: "var(--bg)", color: "var(--text-muted)" },
  "":  { bg: "transparent", color: "var(--neutral)" },
};

function fmtDateTime(s) {
  if (!s) return "";
  return new Date(s.replace(" ", "T") + "Z").toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function fmtMonthLabel(ym) {
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
}

function rowKey(r) { return `${r.employee_id}:${r.month}`; }

export default function TeamAttendanceApprovals() {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null); // rowKey or null
  const [grid, setGrid] = useState(null);          // { employee, ym, dayCodes, days, holidays }
  const [gridLoading, setGridLoading] = useState(false);
  const [comments, setComments] = useState({});    // rowKey -> comment text
  const [acting, setActing] = useState(null);       // rowKey being acted on

  const fetchData = useCallback(async () => {
    try {
      const rows = await api.get("/attendance/pending");
      setPending(rows);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // SSE + 30s polling fallback
  useEffect(() => {
    const es = new EventSource("/api/events", { withCredentials: true });
    es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.entity === "attendance_months") fetchData();
      } catch { /* ignore */ }
    };
    const poll = setInterval(fetchData, 30000);
    return () => { es.close(); clearInterval(poll); };
  }, [fetchData]);

  async function toggleExpand(row) {
    const key = rowKey(row);
    if (expanded === key) { setExpanded(null); setGrid(null); return; }
    setExpanded(key);
    setGrid(null);
    setGridLoading(true);
    try {
      const data = await api.get(`/attendance/team?month=${row.month}`);
      const emp = data.employees.find((e) => e.id === row.employee_id);
      setGrid({ ym: row.month, days: data.days, holidays: data.holidays, emp });
    } catch { /* ignore */ }
    setGridLoading(false);
  }

  async function act(row, action) {
    const key = rowKey(row);
    const comment = (comments[key] || "").trim();
    if (action === "reject" && !comment) {
      alert("A comment is required to reject.");
      return;
    }
    setActing(key);
    try {
      await api.post(`/attendance/months/${row.employee_id}/${row.month}/${action}`, comment ? { comment } : {});
      if (expanded === key) { setExpanded(null); setGrid(null); }
      setComments((c) => ({ ...c, [key]: "" }));
      await fetchData();
    } catch (err) {
      alert(err.data?.error || err.message);
    }
    setActing(null);
  }

  if (loading) return <div style={{ padding: 20, color: "var(--text-muted)" }}>Loading…</div>;

  return (
    <div>
      <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 700, letterSpacing: "-.02rem" }}>Attendance Approvals</h2>
      <p style={{ margin: "0 0 20px", color: "var(--text-muted)", fontSize: 13 }}>
        Months your direct reports have submitted, awaiting your approval
      </p>

      <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r-card)", overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--bg)", textAlign: "left" }}>
              <th style={thStyle}>Employee</th>
              <th style={thStyle}>Month</th>
              <th style={thStyle}>Submitted</th>
              <th style={thStyle}>Comment</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pending.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 24, textAlign: "center", color: "var(--text-faint)" }}>
                No submitted months awaiting approval
              </td></tr>
            )}
            {pending.map((row) => {
              const key = rowKey(row);
              const isExpanded = expanded === key;
              return (
                <Fragment key={key}>
                  <tr style={{ borderTop: "1px solid var(--line)" }}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600 }}>{row.employee_name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{row.employee_code}</div>
                    </td>
                    <td style={tdStyle}>{fmtMonthLabel(row.month)}</td>
                    <td style={{ ...tdStyle, fontSize: 11.5, color: "var(--text-muted)" }}>{fmtDateTime(row.submitted_at)}</td>
                    <td style={tdStyle}>
                      <input
                        value={comments[key] || ""}
                        onChange={(e) => setComments((c) => ({ ...c, [key]: e.target.value }))}
                        placeholder="Optional (required to reject)"
                        style={{ width: "100%", minWidth: 160, padding: "4px 8px", borderRadius: "var(--r-card)", border: "1px solid var(--line)", fontSize: 12 }}
                      />
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button onClick={() => toggleExpand(row)} style={{ ...btnStyle, background: "var(--bg)", color: "var(--text)", border: "1px solid var(--line)" }}>
                          {isExpanded ? "Hide" : "View"}
                        </button>
                        <button onClick={() => act(row, "approve")} disabled={acting === key}
                          style={{ ...btnStyle, background: "var(--charcoal)", color: "#fff" }}>
                          Approve
                        </button>
                        <button onClick={() => act(row, "reject")} disabled={acting === key}
                          style={{ ...btnStyle, background: "var(--danger)", color: "#fff" }}>
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={5} style={{ padding: "0 16px 16px", background: "var(--bg)" }}>
                        {gridLoading && <div style={{ padding: 16, color: "var(--text-faint)" }}>Loading…</div>}
                        {!gridLoading && grid?.emp && (
                          <div style={{ overflowX: "auto", paddingTop: 12 }}>
                            <table style={{ borderCollapse: "collapse", fontSize: 11 }}>
                              <tbody>
                                <tr>
                                  {grid.emp.dayCodes.map((code, i) => {
                                    const d = i + 1;
                                    const isHol = grid.holidays.some((h) => h.date === `${grid.ym}-${String(d).padStart(2, "0")}`);
                                    const c = CODE_COLORS[code] || CODE_COLORS[""];
                                    return (
                                      <td key={i} style={{ padding: "2px", textAlign: "center" }}>
                                        <div style={{ fontSize: 9, color: isHol ? "var(--charcoal)" : "var(--text-faint)" }}>{d}</div>
                                        <span style={{
                                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                                          width: 24, height: 18, borderRadius: "var(--r-pill)",
                                          background: c.bg, color: c.color, fontWeight: 700, fontSize: 9.5,
                                        }}>
                                          {code || "–"}
                                        </span>
                                      </td>
                                    );
                                  })}
                                </tr>
                              </tbody>
                            </table>
                            <div style={{ fontWeight: 700, fontSize: 12.5, marginTop: 6 }}>
                              Payable: {grid.emp.payable}/{grid.days}
                            </div>
                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8, fontSize: 10.5 }}>
                              {Object.entries(ATT_LABEL).map(([code, label]) => (
                                <span key={code} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                                  <span style={{ ...CODE_COLORS[code], borderRadius: "var(--r-pill)", padding: "1px 5px", fontWeight: 700 }}>{code}</span>
                                  <span style={{ color: "var(--text-muted)" }}>{label}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {!gridLoading && !grid?.emp && (
                          <div style={{ padding: 16, color: "var(--text-faint)" }}>No attendance data for this month.</div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const thStyle = { padding: "6px 8px", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" };
const tdStyle = { padding: "8px 10px" };
const btnStyle = {
  padding: "4px 12px", borderRadius: "var(--r-card)", border: "none", cursor: "pointer",
  fontSize: 11.5, fontWeight: 600, fontFamily: "inherit",
};
