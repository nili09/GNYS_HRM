import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../lib/api.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const ATT_CODES = ["P", "A", "HD", "WFH", "OD"];
const ATT_LABEL = {
  P: "Present", A: "Absent", HD: "Half day",
  WFH: "WFH", OD: "On duty", L: "On leave",
  H: "Holiday", WO: "Week off",
};

const CODE_COLORS = {
  P:   { bg: "var(--lime-pale)", color: "var(--charcoal)" },
  A:   { bg: "#ffe5e5", color: "var(--danger)" },
  HD:  { bg: "#ede8df", color: "#7a6a55" },
  WFH: { bg: "rgba(223,241,64,.15)", color: "var(--charcoal)" },
  OD:  { bg: "var(--charcoal)", color: "var(--lime)" },
  L:   { bg: "#ede8df", color: "var(--text-muted)" },
  H:   { bg: "var(--lime-pale)", color: "var(--charcoal)" },
  WO:  { bg: "var(--bg)", color: "var(--text-muted)" },
  "":  { bg: "transparent", color: "var(--text-faint)" },
};

// ── Utilities ─────────────────────────────────────────────────────────────────

function fmtDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function fmtMonth(ym) {
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function thisMonth() {
  return new Date().toISOString().slice(0, 7);
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function shiftMonth(ym, n) {
  let [y, m] = ym.split("-").map(Number);
  m += n;
  while (m < 1) { m += 12; y--; }
  while (m > 12) { m -= 12; y++; }
  return `${y}-${String(m).padStart(2, "0")}`;
}

function dowChar(dateStr) {
  return "SMTWTFS"[new Date(dateStr + "T00:00:00").getDay()];
}

function toCSV(rows) {
  return rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
}

function downloadCSV(filename, rows) {
  const blob = new Blob([toCSV(rows)], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Badge component ───────────────────────────────────────────────────────────

function AttBadge({ code, size = "sm", style = {} }) {
  const c = CODE_COLORS[code] || CODE_COLORS[""];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      padding: size === "sm" ? "1px 7px" : "2px 10px",
      borderRadius: "var(--r-card)", fontWeight: 600,
      fontSize: size === "sm" ? 11.5 : 12.5,
      background: c.bg, color: c.color,
      minWidth: size === "sm" ? 26 : 32,
      ...style,
    }}>
      {code || "–"}
    </span>
  );
}

// ── Daily Register ────────────────────────────────────────────────────────────

function DailyRegister({ onSseEvent }) {
  const [date, setDate]     = useState(todayStr());
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState({});
  const [toast, setToast]   = useState("");

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2800); };

  const load = useCallback(async (d) => {
    setLoading(true);
    try {
      const res = await api.get(`/attendance?date=${d}`);
      setData(res);
    } catch (e) {
      showToast("Failed to load: " + (e.message || "error"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(date); }, [date, load]);

  // Re-fetch on SSE mutation for attendance
  useEffect(() => {
    if (onSseEvent?.entity === "attendance" && onSseEvent?.id === date) load(date);
  }, [onSseEvent, date, load]);

  async function mark(empId, code) {
    setSaving((s) => ({ ...s, [empId]: true }));
    try {
      await api.put(`/attendance/${date}`, { marks: { [empId]: code } });
      await load(date);
    } catch (e) {
      showToast("Mark failed: " + (e.message || "error"));
    } finally {
      setSaving((s) => ({ ...s, [empId]: false }));
    }
  }

  async function markAllPresent() {
    if (!data) return;
    const unmarked = data.employees.filter((e) => e.attStatus === "");
    if (!unmarked.length) { showToast("No unmarked employees"); return; }
    const marks = Object.fromEntries(unmarked.map((e) => [e.id, "P"]));
    try {
      await api.put(`/attendance/${date}`, { marks });
      showToast(`${unmarked.length} employee${unmarked.length > 1 ? "s" : ""} marked Present`);
      await load(date);
    } catch (e) {
      showToast("Bulk mark failed: " + (e.message || "error"));
    }
  }

  const counts = { P: 0, A: 0, HD: 0, WFH: 0, OD: 0, L: 0, unmarked: 0 };
  if (data) {
    for (const e of data.employees) {
      if (e.attStatus === "L") counts.L++;
      else if (ATT_CODES.includes(e.attStatus)) counts[e.attStatus]++;
      else if (!data.isWeekOff && !data.holiday) counts.unmarked++;
    }
  }

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button className="btn-sm" onClick={() => setDate(addDays(date, -1))}>‹</button>
        <input
          type="date" value={date}
          onChange={(e) => setDate(e.target.value || todayStr())}
          style={{ padding: "5px 10px", borderRadius: "var(--r-card)", border: "1px solid var(--line)", fontSize: 13 }}
        />
        <button className="btn-sm" onClick={() => setDate(addDays(date, 1))}>›</button>
        <button className="btn-sm" onClick={() => setDate(todayStr())}>Today</button>
        {data?.holiday && (
          <span style={{ background: "#ede8df", color: "#92400e", borderRadius: "var(--r-card)", padding: "2px 10px", fontSize: 12, fontWeight: 600 }}>
            🎉 Holiday: {data.holiday.name}
          </span>
        )}
        {data?.isWeekOff && !data?.holiday && (
          <span style={{ background: "var(--bg)", color: "var(--text-muted)", borderRadius: "var(--r-card)", padding: "2px 10px", fontSize: 12 }}>
            Week off
          </span>
        )}
        <div style={{ flex: 1 }} />
        {!data?.isWeekOff && !data?.holiday && (
          <button
            onClick={markAllPresent}
            style={{
              background: "var(--lime)", color: "var(--ink)",
              border: "none", borderRadius: "var(--r-pill)", padding: "6px 14px",
              fontWeight: 700, fontSize: 13, cursor: "pointer",
            }}
          >
            ✓ Mark all unmarked Present
          </button>
        )}
      </div>

      {/* Count badges */}
      {data && (
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          {Object.entries({ P: "Present", A: "Absent", HD: "Half day", WFH: "WFH", OD: "On duty", L: "Leave" }).map(([c, label]) => (
            counts[c] > 0 && (
              <span key={c} style={{ ...CODE_COLORS[c], borderRadius: "var(--r-card)", padding: "2px 9px", fontSize: 12, fontWeight: 600 }}>
                {c}: {counts[c]}
              </span>
            )
          ))}
          {counts.unmarked > 0 && (
            <span style={{ background: "var(--bg)", color: "var(--text-muted)", border: "1px solid var(--line)", borderRadius: "var(--r-card)", padding: "2px 9px", fontSize: 12 }}>
              Unmarked: {counts.unmarked}
            </span>
          )}
        </div>
      )}

      {/* Table */}
      {loading && <div style={{ color: "var(--text-faint)", padding: "32px 0", textAlign: "center" }}>Loading…</div>}
      {!loading && data && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: "var(--bg)", borderBottom: "2px solid var(--line)" }}>
                <th style={thStyle}>Employee</th>
                <th style={thStyle}>Dept</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Mark</th>
              </tr>
            </thead>
            <tbody>
              {data.employees.length === 0 && (
                <tr><td colSpan={4} style={{ padding: "32px", textAlign: "center", color: "var(--text-faint)" }}>No employees</td></tr>
              )}
              {data.employees.map((emp) => {
                const locked = emp.attStatus === "L" || emp.attStatus === "H" || emp.attStatus === "WO";
                return (
                  <tr key={emp.id} style={{ borderBottom: "1px solid var(--line)" }}>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{
                          width: 30, height: 30, borderRadius: "50%",
                          background: "var(--ink)", color: "#dff140",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontWeight: 700, fontSize: 11, flexShrink: 0,
                        }}>
                          {emp.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600 }}>{emp.name}</div>
                          <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{emp.code}</div>
                        </div>
                      </div>
                    </td>
                    <td style={tdStyle}>{emp.dept || "—"}</td>
                    <td style={tdStyle}>
                      {emp.attStatus ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <AttBadge code={emp.attStatus} />
                          <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>
                            {ATT_LABEL[emp.attStatus]}{emp.leaveType ? ` (${emp.leaveType})` : ""}
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: "var(--neutral)" }}>—</span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      {locked ? (
                        <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>auto</span>
                      ) : (
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {ATT_CODES.map((code) => (
                            <button
                              key={code}
                              onClick={() => mark(emp.id, emp.attCode === code ? "" : code)}
                              disabled={!!saving[emp.id]}
                              style={{
                                ...CODE_COLORS[code],
                                border: `2px solid ${emp.attCode === code ? CODE_COLORS[code].color : "transparent"}`,
                                borderRadius: "var(--r-card)", padding: "2px 8px",
                                fontWeight: 700, fontSize: 11.5,
                                cursor: "pointer", opacity: saving[emp.id] ? 0.5 : 1,
                                minWidth: 34,
                              }}
                              title={ATT_LABEL[code]}
                            >
                              {code}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: "var(--text)", color: "#fff",
          padding: "10px 20px", borderRadius: "var(--r-pill)", fontSize: 13.5, fontWeight: 500,
           zIndex: 9999,
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}

// ── Monthly Grid ──────────────────────────────────────────────────────────────

function MonthlyGrid() {
  const [month, setMonth] = useState(thisMonth());
  const [data, setData]   = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get(`/attendance?month=${month}`)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [month]);

  function exportCSV() {
    if (!data) return;
    const head = ["Code", "Name", "Dept"];
    for (let i = 1; i <= data.days; i++) head.push(String(i));
    head.push("Payable");
    const rows = [head, ...data.employees.map((e) => [e.code, e.name, e.dept || "", ...e.dayCodes, e.payable])];
    downloadCSV(`genesys-attendance-${month}.csv`, rows);
  }

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <button className="btn-sm" onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
        <b style={{ minWidth: 150, textAlign: "center", fontSize: 14 }}>{fmtMonth(month)}</b>
        <button className="btn-sm" onClick={() => setMonth(shiftMonth(month, 1))}>›</button>
        <div style={{ flex: 1 }} />
        <button className="btn-sm" onClick={exportCSV}>⬇ Export CSV</button>
      </div>

      {loading && <div style={{ textAlign: "center", color: "var(--text-faint)", padding: 32 }}>Loading…</div>}
      {!loading && data && (
        <>
          {/* Grid */}
          <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "62vh" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: 180, minWidth: 180 }} />
                {Array.from({ length: data.days }, (_, i) => (
                  <col key={i} style={{ width: 36, minWidth: 36 }} />
                ))}
                <col style={{ width: 64, minWidth: 64 }} />
              </colgroup>
              <thead>
                <tr style={{ background: "var(--bg)", position: "sticky", top: 0, zIndex: 2 }}>
                  <th style={{ ...thStyle, position: "sticky", left: 0, background: "var(--bg)", zIndex: 3, textAlign: "left" }}>
                    Employee
                  </th>
                  {Array.from({ length: data.days }, (_, i) => {
                    const d = `${month}-${String(i + 1).padStart(2, "0")}`;
                    const isHol = data.holidays.some((h) => h.date === d);
                    return (
                      <th key={i} style={{ ...thStyle, padding: "4px 2px", textAlign: "center", fontWeight: 500 }}>
                        <div style={{ color: isHol ? "var(--charcoal)" : "var(--text-muted)", fontSize: 10 }}>{dowChar(d)}</div>
                        <div style={{ fontWeight: isHol ? 700 : 400, color: isHol ? "var(--charcoal)" : undefined }}>{i + 1}</div>
                      </th>
                    );
                  })}
                  <th style={{ ...thStyle, textAlign: "center" }}>Payable</th>
                </tr>
              </thead>
              <tbody>
                {data.employees.map((emp) => (
                  <tr key={emp.id} style={{ borderBottom: "1px solid var(--line)" }}>
                    <td style={{
                      ...tdStyle, position: "sticky", left: 0, background: "#fff",
                      fontWeight: 600, borderRight: "1px solid var(--line)", zIndex: 1,
                    }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {emp.name}
                      </div>
                      <div style={{ fontSize: 10, color: "var(--text-faint)" }}>{emp.code}</div>
                    </td>
                    {emp.dayCodes.map((code, i) => {
                      const c = CODE_COLORS[code] || CODE_COLORS[""];
                      return (
                        <td key={i} style={{ padding: "3px 2px", textAlign: "center" }}>
                          <span style={{
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            width: 28, height: 22, borderRadius: "var(--r-pill)",
                            background: c.bg, color: c.color,
                            fontWeight: 700, fontSize: 10.5,
                          }}>
                            {code || "–"}
                          </span>
                        </td>
                      );
                    })}
                    <td style={{ ...tdStyle, textAlign: "center", fontWeight: 700 }}>
                      {emp.payable}/{data.days}
                    </td>
                  </tr>
                ))}
                {data.employees.length === 0 && (
                  <tr><td colSpan={data.days + 2} style={{ padding: 32, textAlign: "center", color: "var(--text-faint)" }}>No employees</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 14, fontSize: 12 }}>
            {Object.entries(ATT_LABEL).map(([code, label]) => (
              <span key={code} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <AttBadge code={code} size="sm" />
                <span style={{ color: "var(--text-muted)" }}>{label}</span>
              </span>
            ))}
          </div>

          {/* Note */}
          <p style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 10 }}>
            Payable = P + WFH + OD + Holidays + Week-offs + Paid leave + ½ for HD. Absent, LWP and unmarked working days = 0.
          </p>
        </>
      )}
    </div>
  );
}

// ── Shared table styles ───────────────────────────────────────────────────────

const thStyle = {
  padding: "10px 12px", textAlign: "left",
  fontWeight: 600, fontSize: 12, color: "var(--text-muted)",
  borderBottom: "2px solid var(--line)", whiteSpace: "nowrap",
};
const tdStyle = { padding: "10px 12px", verticalAlign: "middle" };

// ── Main page ─────────────────────────────────────────────────────────────────

export default function HRAttendance() {
  const [tab, setTab]       = useState("daily");
  const [sseEvent, setSseEvent] = useState(null);
  const esRef = useRef(null);

  // SSE connection + 30s polling fallback
  useEffect(() => {
    const es = new EventSource("/api/events", { withCredentials: true });
    esRef.current = es;
    es.onmessage = (e) => {
      try { setSseEvent(JSON.parse(e.data)); } catch {}
    };
    const poll = setInterval(() => setSseEvent({ type: "poll", entity: "attendance" }), 30000);
    return () => { es.close(); clearInterval(poll); };
  }, []);

  const tabStyle = (t) => ({
    padding: "8px 18px", borderRadius: "8px 8px 0 0",
    border: "none", background: tab === t ? "#fff" : "transparent",
    color: tab === t ? "var(--ink)" : "var(--text-muted)",
    fontWeight: tab === t ? 700 : 400, fontSize: 13.5,
    cursor: "pointer", borderBottom: tab === t ? "2px solid var(--lime)" : "2px solid transparent",
  });

  return (
    <div style={{ maxWidth: 1400 }}>
      <div style={{ marginBottom: 4 }}>
        <h2 style={{ margin: "0 0 2px", color: "var(--ink)", fontSize: 20, fontWeight: 700 }}>Attendance</h2>
        <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 13 }}>Daily register and monthly view</p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: "2px solid var(--line)", margin: "16px 0 0" }}>
        <button style={tabStyle("daily")}  onClick={() => setTab("daily")}>Daily register</button>
        <button style={tabStyle("monthly")} onClick={() => setTab("monthly")}>Monthly view</button>
      </div>

      <div style={{
        background: "#fff", border: "1px solid var(--line)", borderTop: "none",
        borderRadius: "0 0 10px 10px", padding: 20,
      }}>
        {tab === "daily"   && <DailyRegister onSseEvent={sseEvent} />}
        {tab === "monthly" && <MonthlyGrid />}
      </div>
    </div>
  );
}
