import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";

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
  "":  { bg: "var(--bg)", color: "var(--text-faint)" },
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

function dowChar(idx) { return "SMTWTFS"[idx]; }

export default function MyAttendance() {
  const [month, setMonth] = useState(thisMonth());
  const [data, setData]   = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(() => {
    setLoading(true);
    api.get(`/attendance/me?month=${month}`)
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

  // Summary counts
  const counts = {};
  if (data) {
    for (const code of data.dayCodes) {
      if (!code) continue;
      counts[code] = (counts[code] || 0) + 1;
    }
  }

  return (
    <div style={{ maxWidth: 860 }}>
      <h2 style={{ margin: "0 0 4px", color: "var(--ink)", fontSize: 20, fontWeight: 700 }}>My Attendance</h2>
      <p style={{ margin: "0 0 20px", color: "var(--text-muted)", fontSize: 13 }}>Your monthly attendance summary</p>

      {/* Month nav */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
        <button onClick={() => setMonth(shiftMonth(month, -1))} className="btn-sm">‹</button>
        <b style={{ minWidth: 160, textAlign: "center", fontSize: 14 }}>{fmtMonth(month)}</b>
        <button onClick={() => setMonth(shiftMonth(month, 1))} className="btn-sm">›</button>
      </div>

      {loading && <div style={{ textAlign: "center", color: "var(--text-faint)", padding: 40 }}>Loading…</div>}

      {!loading && data && (
        <>
          {/* Payable summary */}
          <div style={{
            background: "linear-gradient(135deg, var(--ink) 0%, #1e2d5c 100%)",
            color: "#fff", borderRadius: "var(--r-card)", padding: "18px 24px",
            marginBottom: 20, display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap",
          }}>
            <div>
              <div style={{ fontSize: 12, color: "#8b9ac0", marginBottom: 2 }}>Payable days</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#dff140" }}>
                {data.payable}<span style={{ fontSize: 14, color: "#8b9ac0" }}>/{data.days}</span>
              </div>
            </div>
            {Object.entries(counts).map(([code, n]) => (
              <div key={code} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "#8b9ac0", marginBottom: 2 }}>{ATT_LABEL[code] || code}</div>
                <div style={{
                  ...CODE_COLORS[code],
                  borderRadius: "var(--r-card)", padding: "3px 12px",
                  fontWeight: 700, fontSize: 15, display: "inline-block",
                }}>
                  {n}
                </div>
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: "var(--r-card)", padding: 20 }}>
            {/* Day-of-week header */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 8 }}>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--text-faint)", padding: "4px 0" }}>{d}</div>
              ))}
            </div>

            {/* Calendar cells */}
            {(() => {
              const [y, m] = month.split("-").map(Number);
              const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
              const cells = [];

              // Empty cells for days before the 1st
              for (let i = 0; i < firstDow; i++) {
                cells.push(<div key={`empty-${i}`} />);
              }

              // Day cells
              for (let i = 0; i < data.days; i++) {
                const dayNum = i + 1;
                const code   = data.dayCodes[i] || "";
                const c      = CODE_COLORS[code];
                const hol    = data.holidays?.find((h) => h.date === `${month}-${String(dayNum).padStart(2, "0")}`);

                cells.push(
                  <div key={dayNum} title={`${dayNum}: ${ATT_LABEL[code] || "Unmarked"}${hol ? " – " + hol.name : ""}`} style={{
                    borderRadius: "var(--r-pill)", padding: "8px 4px",
                    background: c?.bg || "var(--bg)",
                    border: `1px solid ${code ? "transparent" : "var(--line)"}`,
                    textAlign: "center", cursor: "default",
                    position: "relative",
                  }}>
                    <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 2 }}>{dayNum}</div>
                    <div style={{ fontWeight: 700, fontSize: 12, color: c?.color || "var(--neutral)" }}>
                      {code || "–"}
                    </div>
                    {hol && (
                      <div style={{
                        position: "absolute", bottom: 2, left: "50%", transform: "translateX(-50%)",
                        width: 5, height: 5, borderRadius: "50%", background: "var(--charcoal)",
                      }} />
                    )}
                  </div>
                );
              }
              return <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>{cells}</div>;
            })()}

            {/* Holidays this month */}
            {data.holidays?.length > 0 && (
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-faint)", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".08em" }}>
                  Holidays this month
                </div>
                {data.holidays.map((h) => (
                  <div key={h.date} style={{ display: "flex", gap: 8, fontSize: 12.5, marginBottom: 4 }}>
                    <span style={{ color: "var(--charcoal)", fontWeight: 700 }}>{h.date.slice(8)}</span>
                    <span>{h.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Legend */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 14, fontSize: 12 }}>
            {Object.entries(ATT_LABEL).map(([code, label]) => (
              <span key={code} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{
                  ...CODE_COLORS[code], borderRadius: "var(--r-pill)",
                  padding: "1px 7px", fontWeight: 700, fontSize: 11,
                }}>{code}</span>
                <span style={{ color: "var(--text-muted)" }}>{label}</span>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
