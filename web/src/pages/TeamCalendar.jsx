import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";

const STATUS_STYLE = {
  L:   { bg: "var(--badge-tan-bg)", color: "var(--text-muted)", label: "Leave" },
  WFH: { bg: "rgba(25,25,112,.15)", color: "var(--charcoal)", label: "WFH" },
  OD:  { bg: "var(--charcoal)", color: "var(--lime-light)", label: "On Duty" },
  H:   { bg: "var(--lime-pale)", color: "var(--charcoal)", label: "Holiday" },
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

function fmtDay(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

function isWeekend(dateStr) {
  const dow = new Date(dateStr + "T00:00:00").getDay();
  return dow === 0 || dow === 6;
}

export default function TeamCalendar() {
  const [month, setMonth] = useState(thisMonth());
  const [data, setData]   = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(() => {
    setLoading(true);
    api.get(`/attendance/team-calendar?month=${month}`)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const holMap = {};
  if (data?.holidays) {
    for (const h of data.holidays) holMap[h.date] = h.name;
  }

  const entryMap = {};
  if (data?.entries) {
    for (const e of data.entries) entryMap[e.date] = e.people;
  }

  const dates = data ? Array.from({ length: data.days }, (_, i) => {
    const d = String(i + 1).padStart(2, "0");
    return `${month}-${d}`;
  }) : [];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, fontFamily: "var(--font-display), sans-serif" }}>
          Team Calendar
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
          <button onClick={() => setMonth(shiftMonth(month, -1))} className="btn-secondary btn-sm">← Prev</button>
          <span style={{ fontWeight: 600, fontSize: 14, minWidth: 140, textAlign: "center" }}>{fmtMonth(month)}</span>
          <button onClick={() => setMonth(shiftMonth(month, 1))} className="btn-secondary btn-sm">Next →</button>
        </div>
      </div>

      {loading && <div style={{ color: "var(--text-muted)", fontSize: 13 }}>Loading…</div>}

      {data && !loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {dates.map((d) => {
            const people = entryMap[d] || [];
            const hol = holMap[d];
            const weekend = isWeekend(d);
            const hasContent = people.length > 0 || hol;

            return (
              <div
                key={d}
                style={{
                  display: "flex",
                  gap: 12,
                  padding: "8px 12px",
                  borderRadius: 3,
                  background: hol ? "rgba(25,25,112,.06)" : weekend ? "rgba(0,0,0,.02)" : "var(--card)",
                  border: "1px solid var(--border)",
                  opacity: !hasContent && weekend ? 0.5 : 1,
                  minHeight: 38,
                  alignItems: "flex-start",
                }}
              >
                <div style={{
                  width: 120,
                  flexShrink: 0,
                  fontSize: 12,
                  fontWeight: 600,
                  color: weekend ? "var(--text-muted)" : "var(--text)",
                  paddingTop: 2,
                }}>
                  {fmtDay(d)}
                </div>

                <div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {hol && (
                    <span style={{
                      fontSize: 11,
                      padding: "3px 10px",
                      borderRadius: "var(--r-pill)",
                      background: "var(--lime-pale)",
                      color: "var(--charcoal)",
                      fontWeight: 600,
                    }}>
                      {hol}
                    </span>
                  )}

                  {people.filter((p) => p.status !== "H").map((p) => {
                    const st = STATUS_STYLE[p.status] || STATUS_STYLE.L;
                    return (
                      <span
                        key={p.employee_id}
                        title={`${p.name}${p.dept ? ` · ${p.dept}` : ""} — ${st.label}${p.leave_type ? ` (${p.leave_type})` : ""}`}
                        style={{
                          fontSize: 11,
                          padding: "3px 10px",
                          borderRadius: "var(--r-pill)",
                          background: st.bg,
                          color: st.color,
                          fontWeight: 500,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {p.name}
                        <span style={{ opacity: 0.6, marginLeft: 4, fontSize: 10 }}>
                          {p.status === "L" && p.leave_type ? p.leave_type : st.label}
                        </span>
                      </span>
                    );
                  })}

                  {!hol && people.filter((p) => p.status !== "H").length === 0 && (
                    <span style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic", paddingTop: 2 }}>
                      {weekend ? "" : "Everyone in office"}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
