import { useState, useEffect, useCallback } from "react";
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

function thisMonth() { return new Date().toISOString().slice(0, 7); }

function fmtMonth(ym) {
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
}

function shiftMonth(ym, n) {
  let [y, m] = ym.split("-").map(Number);
  m += n;
  while (m < 1) { m += 12; y--; }
  while (m > 12) { m -= 12; y++; }
  return `${y}-${String(m).padStart(2, "0")}`;
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

export default function TeamAttendance() {
  const [month, setMonth] = useState(thisMonth());
  const [data, setData]   = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(() => {
    setLoading(true);
    api.get(`/attendance/team?month=${month}`)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // SSE + 30s polling fallback
  useEffect(() => {
    const es = new EventSource("/api/events", { withCredentials: true });
    es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.entity === "attendance") fetchData();
      } catch {}
    };
    const poll = setInterval(fetchData, 30000);
    return () => { es.close(); clearInterval(poll); };
  }, [fetchData]);

  function exportCSV() {
    if (!data) return;
    const head = ["Code", "Name", "Dept"];
    for (let i = 1; i <= data.days; i++) head.push(String(i));
    head.push("Payable");
    const rows = [head, ...data.employees.map((e) => [e.code, e.name, e.dept || "", ...e.dayCodes, e.payable])];
    downloadCSV(`team-attendance-${month}.csv`, rows);
  }

  const thStyle = {
    padding: "8px 6px", textAlign: "center",
    fontWeight: 600, fontSize: 11.5, color: "var(--text-muted)",
    borderBottom: "2px solid var(--line)", whiteSpace: "nowrap",
    background: "var(--bg)", position: "sticky", top: 0, zIndex: 2,
  };

  return (
    <div style={{ maxWidth: 1400 }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 700, letterSpacing: "-.02rem" }}>Team Attendance</h2>
      <p style={{ margin: "0 0 20px", color: "var(--text-muted)", fontSize: 13 }}>
        Monthly view of your direct reports (read-only)
      </p>

      {/* Month nav */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
        <button onClick={() => setMonth(shiftMonth(month, -1))} className="btn-sm">‹</button>
        <b style={{ minWidth: 160, textAlign: "center", fontSize: 14 }}>{fmtMonth(month)}</b>
        <button onClick={() => setMonth(shiftMonth(month, 1))} className="btn-sm">›</button>
        <div style={{ flex: 1 }} />
        <button className="btn-sm" onClick={exportCSV}>⬇ Export CSV</button>
      </div>

      {loading && <div style={{ textAlign: "center", color: "var(--text-faint)", padding: 40 }}>Loading…</div>}

      {!loading && data && data.employees.length === 0 && (
        <div style={{
          background: "var(--bg)", border: "1px solid var(--line)", borderRadius: "var(--r-card)",
          padding: "48px 32px", textAlign: "center", color: "var(--text-faint)",
        }}>
          No direct reports to display.
        </div>
      )}

      {!loading && data && data.employees.length > 0 && (
        <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r-card)", padding: 20, boxShadow: "var(--shadow-card)" }}>
          <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "65vh" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: 180, minWidth: 180 }} />
                {Array.from({ length: data.days }, (_, i) => (
                  <col key={i} style={{ width: 34, minWidth: 34 }} />
                ))}
                <col style={{ width: 70, minWidth: 70 }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={{ ...thStyle, textAlign: "left", position: "sticky", left: 0, zIndex: 3 }}>
                    Employee
                  </th>
                  {Array.from({ length: data.days }, (_, i) => {
                    const d   = `${month}-${String(i + 1).padStart(2, "0")}`;
                    const isH = data.holidays.some((h) => h.date === d);
                    const dow = new Date(d + "T00:00:00").getDay();
                    const isW = dow === 0 || dow === 6;
                    return (
                      <th key={i} style={{ ...thStyle, color: isH ? "var(--charcoal)" : isW ? "var(--text-faint)" : "var(--text-muted)" }}>
                        <div style={{ fontSize: 9, fontWeight: 400 }}>{"SMTWTFS"[dow]}</div>
                        <div>{i + 1}</div>
                      </th>
                    );
                  })}
                  <th style={{ ...thStyle }}>Payable</th>
                </tr>
              </thead>
              <tbody>
                {data.employees.map((emp) => (
                  <tr key={emp.id} style={{ borderBottom: "1px solid var(--line)" }}>
                    <td style={{
                      padding: "8px 10px", position: "sticky", left: 0,
                      background: "var(--card)", zIndex: 1,
                      borderRight: "1px solid var(--line)", fontWeight: 600,
                    }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {emp.name}
                      </div>
                      <div style={{ fontSize: 10, color: "var(--text-faint)" }}>{emp.dept || emp.code}</div>
                    </td>
                    {emp.dayCodes.map((code, i) => {
                      const c = CODE_COLORS[code] || CODE_COLORS[""];
                      return (
                        <td key={i} style={{ padding: "2px", textAlign: "center" }}>
                          <span style={{
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            width: 28, height: 20, borderRadius: "var(--r-pill)",
                            background: c.bg, color: c.color,
                            fontWeight: 700, fontSize: 10,
                          }}>
                            {code || "–"}
                          </span>
                        </td>
                      );
                    })}
                    <td style={{ padding: "8px 6px", textAlign: "center", fontWeight: 700, fontSize: 12.5 }}>
                      {emp.payable}
                      <span style={{ fontSize: 10, color: "var(--text-faint)" }}>/{data.days}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14, fontSize: 11.5 }}>
            {Object.entries(ATT_LABEL).map(([code, label]) => (
              <span key={code} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{
                  ...CODE_COLORS[code], borderRadius: "var(--r-pill)",
                  padding: "1px 6px", fontWeight: 700, fontSize: 10,
                }}>{code}</span>
                <span style={{ color: "var(--text-muted)" }}>{label}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
