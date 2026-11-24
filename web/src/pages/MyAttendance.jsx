import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";
import { useIsMobile } from "../hooks/useIsMobile.jsx";

const ATT_LABEL = {
  P: "Present", A: "Absent", HD: "Half day",
  WFH: "WFH", OD: "On duty", L: "On leave",
  H: "Holiday", WO: "Week off",
};

const CODE_COLORS = {
  P:   { bg: "var(--lime-pale)", color: "var(--charcoal)" },
  A:   { bg: "var(--badge-danger-bg)", color: "var(--danger)" },
  HD:  { bg: "var(--badge-tan-bg)", color: "var(--badge-tan-text)" },
  WFH: { bg: "var(--lime-pale)", color: "var(--charcoal)" },
  OD:  { bg: "var(--badge-blue-bg)", color: "var(--badge-blue-text)" },
  L:   { bg: "var(--badge-tan-bg)", color: "var(--text-muted)" },
  H:   { bg: "var(--lime-pale)", color: "var(--charcoal)" },
  WO:  { bg: "var(--bg)", color: "var(--text-muted)" },
  "":  { bg: "var(--bg)", color: "var(--text-faint)" },
};

// Locked codes are computed (leave/holiday/week-off) — never directly editable.
const LOCKED_CODES = new Set(["L", "H", "WO"]);
// Click-to-cycle order for editable days.
const CYCLE = ["", "P", "A", "HD", "WFH", "OD"];

const APPROVAL_BADGE = {
  OPEN:      { bg: "var(--bg)", color: "var(--text-muted)", label: "Not submitted" },
  SUBMITTED: { bg: "var(--badge-tan-bg)", color: "var(--badge-tan-text)", label: "Submitted — awaiting approval" },
  APPROVED:  { bg: "var(--lime-pale)", color: "var(--charcoal)", label: "Approved" },
  REJECTED:  { bg: "var(--badge-danger-bg)", color: "var(--danger)", label: "Rejected — edit and resubmit" },
};

function thisMonth() { return new Date().toISOString().slice(0, 7); }

function fmtMonth(ym) {
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
}

function fmtDateTime(s) {
  if (!s) return "";
  return new Date(s.replace(" ", "T") + "Z").toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function shiftMonth(ym, n) {
  let [y, m] = ym.split("-").map(Number);
  m += n;
  while (m < 1) { m += 12; y--; }
  while (m > 12) { m -= 12; y++; }
  return `${y}-${String(m).padStart(2, "0")}`;
}

export default function MyAttendance() {
  const isMobile = useIsMobile();
  const [month, setMonth] = useState(thisMonth());
  const [data, setData]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast]   = useState("");

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3500); };

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
        if (d.entity === "attendance" || d.entity === "attendance_months") fetchData();
      } catch {}
    };
    const poll = setInterval(fetchData, 30000);
    return () => { es.close(); clearInterval(poll); };
  }, [fetchData]);

  const approval = data?.approval || { status: "OPEN" };
  const editable = approval.status === "OPEN" || approval.status === "REJECTED";

  async function cycleDay(dateStr, currentCode) {
    if (!editable || saving) return;
    const next = CYCLE[(CYCLE.indexOf(currentCode || "") + 1) % CYCLE.length];
    setSaving(true);
    try {
      await api.put(`/attendance/my?month=${month}`, { marks: { [dateStr]: next } });
      await fetchData();
    } catch (e) {
      showToast(e.data?.error || e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function submit() {
    setSaving(true);
    try {
      await api.post("/attendance/my/submit", { month });
      await fetchData();
    } catch (e) {
      showToast(e.data?.error || e.message || "Submit failed");
    } finally {
      setSaving(false);
    }
  }

  // Summary counts
  const counts = {};
  if (data) {
    for (const code of data.dayCodes) {
      if (!code) continue;
      counts[code] = (counts[code] || 0) + 1;
    }
  }

  const badge = APPROVAL_BADGE[approval.status] || APPROVAL_BADGE.OPEN;
  const missingCount = data?.missingDates?.length || 0;

  return (
    <div style={{ maxWidth: isMobile ? "100%" : 860 }}>
      <h2 className="page-title" style={{ margin: "0 0 4px" }}>My Attendance</h2>
      <p style={{ margin: "0 0 20px", color: "var(--text-muted)", fontSize: 13 }}>Mark your month, then submit it for your manager's approval</p>

      {/* Month nav */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <button onClick={() => setMonth(shiftMonth(month, -1))} className="btn-sm">‹</button>
        <b style={{ minWidth: 160, textAlign: "center", fontSize: 14 }}>{fmtMonth(month)}</b>
        <button onClick={() => setMonth(shiftMonth(month, 1))} className="btn-sm">›</button>
      </div>

      {loading && <div style={{ textAlign: "center", color: "var(--text-faint)", padding: 40 }}>Loading…</div>}

      {!loading && data && (
        <>
          {/* Status banner */}
          <div style={{
            background: badge.bg, color: badge.color, borderRadius: "var(--r-card)",
            padding: "10px 16px", marginBottom: 14, display: "flex", alignItems: "center",
            gap: 10, flexWrap: "wrap", fontSize: 13,
          }}>
            <span style={{ fontWeight: 700 }}>{badge.label}</span>
            {approval.status === "SUBMITTED" && approval.submitted_at && (
              <span>· submitted {fmtDateTime(approval.submitted_at)}</span>
            )}
            {approval.status === "APPROVED" && (
              <span>· by {approval.acted_by || "manager"}{approval.acted_at ? ` on ${fmtDateTime(approval.acted_at)}` : ""}</span>
            )}
            {editable && (
              <span>· {missingCount === 0 ? "all working days marked" : `${missingCount} day${missingCount > 1 ? "s" : ""} still need marking`}</span>
            )}
            <div style={{ flex: 1 }} />
            {editable && (
              <button
                onClick={submit}
                disabled={missingCount > 0 || saving}
                style={{
                  background: missingCount > 0 ? "var(--line)" : "var(--lime)",
                  color: missingCount > 0 ? "var(--text-faint)" : "var(--bg)",
                  border: "none", borderRadius: "var(--r-pill)", padding: "6px 16px",
                  fontWeight: 700, fontSize: 12.5, cursor: missingCount > 0 || saving ? "default" : "pointer",
                }}
              >
                Submit for approval
              </button>
            )}
          </div>

          {approval.status === "REJECTED" && approval.act_comment && (
            <div style={{
              background: "var(--badge-danger-bg)", color: "var(--danger)", borderRadius: "var(--r-card)",
              padding: "10px 16px", marginBottom: 14, fontSize: 13,
            }}>
              <b>{approval.acted_by || "Manager"}'s comment:</b> {approval.act_comment}
            </div>
          )}

          {/* Payable summary */}
          <div style={{
            background: "var(--ink)", border: "1px solid var(--line)",
            color: "#fff", borderRadius: "var(--r-card)", padding: "18px 24px",
            marginBottom: 20, display: "flex", alignItems: "center", gap: isMobile ? 12 : 24, flexWrap: "wrap",
          }}>
            <div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 2 }}>Payable days</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "var(--lime-light)" }}>
                {data.payable}<span style={{ fontSize: 14, color: "var(--text-muted)" }}>/{data.days}</span>
              </div>
            </div>
            {Object.entries(counts).map(([code, n]) => (
              <div key={code} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>{ATT_LABEL[code] || code}</div>
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
          <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r-card)", padding: isMobile ? 8 : 20, boxShadow: "var(--shadow-card)" }}>
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
                const dateStr = `${month}-${String(dayNum).padStart(2, "0")}`;
                const code   = data.dayCodes[i] || "";
                const c      = CODE_COLORS[code];
                const hol    = data.holidays?.find((h) => h.date === dateStr);
                const isMissing = data.missingDates?.includes(dateStr);
                const clickable = editable && !LOCKED_CODES.has(code) && !saving;

                cells.push(
                  <div
                    key={dayNum}
                    onClick={clickable ? () => cycleDay(dateStr, code) : undefined}
                    title={`${dayNum}: ${ATT_LABEL[code] || "Unmarked"}${hol ? " – " + hol.name : ""}${clickable ? " (click to change)" : ""}`}
                    style={{
                      borderRadius: "var(--r-pill)", padding: "8px 4px",
                      background: c?.bg || "var(--bg)",
                      border: `1px solid ${isMissing ? "var(--danger)" : code ? "transparent" : "var(--line)"}`,
                      textAlign: "center", cursor: clickable ? "pointer" : "default",
                      position: "relative", opacity: saving ? 0.7 : 1,
                    }}
                  >
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
          {editable && (
            <p style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 10 }}>
              Click a day to cycle P → A → HD → WFH → OD → blank. Leave, holiday and week-off days are automatic.
            </p>
          )}
        </>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: "var(--text)", color: "var(--bg)",
          padding: "10px 20px", borderRadius: "var(--r-pill)", fontSize: 13.5, fontWeight: 500,
          zIndex: 9999,
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}
