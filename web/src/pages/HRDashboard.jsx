import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";

function fmt(n) { return Number(n || 0).toLocaleString("en-IN"); }
function fmtDate(d) {
  if (!d) return "—";
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y}`;
}
function daysAgo(dt) {
  if (!dt) return "";
  const diff = Math.floor((Date.now() - new Date(dt).getTime()) / 86400000);
  if (diff === 0) return "today";
  if (diff === 1) return "1d ago";
  return `${diff}d ago`;
}

// Leave-type badge on new palette
const LEAVE_BADGE = {
  EL: { bg: "var(--badge-lime-bg)",   color: "var(--badge-lime-text)" },
  CL: { bg: "var(--badge-cl-bg)",     color: "var(--badge-cl-text)" },
  SL: { bg: "var(--badge-tan-bg)",    color: "var(--badge-tan-text)" },
  LWP:{ bg: "var(--badge-danger-bg)", color: "var(--badge-danger-text)" },
  ML: { bg: "var(--badge-purple-bg)", color: "var(--badge-purple-text)" },
  PL: { bg: "var(--badge-lime-bg)",   color: "var(--badge-lime-text)" },
};

export default function HRDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const d = await api.get("/dashboard/hr");
      setData(d);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const es = new EventSource("/api/events", { withCredentials: true });
    es.onmessage = () => load();
    const poll = setInterval(load, 30000);
    return () => { es.close(); clearInterval(poll); };
  }, [load]);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>;
  if (!data) return <div style={{ padding: 40, textAlign: "center", color: "var(--danger)" }}>Failed to load dashboard</div>;

  const { headcount, today, pendingLeaves, deptDistribution, payroll, joiners, exits, upcomingHolidays, birthdays,
    recruitment, expenses, performance, engagement, assets, helpdesk } = data;
  const attPct = today.total > 0 ? Math.round((today.present / today.total) * 100) : 0;
  const maxDept = Math.max(1, ...deptDistribution.map((d) => d.count));

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: 24 }}>HR Dashboard</h1>

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(148px, 1fr))", gap: 10, marginBottom: 22 }}>
        <KPI label="Active Headcount" value={headcount.active} sub={`${headcount.onboarding} onboarding · ${headcount.notice} notice`} accent onClick={() => navigate("/hr/employees")} />
        <KPI label="Present Today"    value={today.present}   sub={`${attPct}% of ${today.total}`} onClick={() => navigate("/hr/attendance")} />
        <KPI label="On Leave Today"   value={today.onLeave}   sub="approved leaves" />
        <KPI label="Pending Approvals" value={pendingLeaves.total} sub="leave requests" onClick={() => navigate("/hr/leave")} />
        <KPI label="Payroll Runs"     value={payroll.finalizedRuns} sub={payroll.latestRun ? `Latest: ${payroll.latestRun.month}` : "none yet"} onClick={() => navigate("/hr/payroll")} />
      </div>

      {/* Modules Overview */}
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", textTransform: "uppercase", letterSpacing: ".07rem", marginBottom: 10 }}>Modules Overview</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(148px, 1fr))", gap: 10, marginBottom: 22 }}>
        {recruitment && <KPI label="Open Positions" value={recruitment.openPositions} sub={`${recruitment.candidatesInPipeline} in pipeline`} onClick={() => navigate("/hr/recruitment")} />}
        {recruitment && <KPI label="Hired This Month" value={recruitment.hiredThisMonth} sub={recruitment.avgDaysToHire ? `avg ${recruitment.avgDaysToHire}d to hire` : "no hires yet"} />}
        {expenses && <KPI label="Pending Expenses" value={expenses.pendingCount} sub={`₹${fmt(expenses.pendingAmount)}`} onClick={() => navigate("/hr/expenses")} />}
        {expenses && <KPI label="Settled This Month" value={expenses.settledThisMonth} sub="expense claims" />}
        {performance && <KPI label="Review Cycle" value={performance.activeCycle || "None"} sub={performance.activeCycle ? `${performance.completionRate}% done` : "no active cycle"} onClick={() => navigate("/hr/performance")} />}
        {performance && <KPI label="Pending Reviews" value={performance.pendingReviews} sub="awaiting submission" />}
        {engagement && <KPI label="Active Surveys" value={engagement.activeSurveys} sub={`${engagement.participationRate}% participation`} onClick={() => navigate("/hr/engagement")} />}
        {engagement && <KPI label="Recognitions" value={engagement.recognitionsThisWeek} sub="this week" onClick={() => navigate("/recognition")} />}
        {assets && <KPI label="Total Assets" value={assets.total} sub={`${assets.assigned} assigned · ${assets.inRepair} repair`} onClick={() => navigate("/hr/assets")} />}
        {helpdesk && <KPI label="Open Tickets" value={helpdesk.openTickets} sub={helpdesk.urgentCount ? `${helpdesk.urgentCount} urgent` : "none urgent"} onClick={() => navigate("/hr/helpdesk")} />}
        {helpdesk && <KPI label="Avg Resolution" value={helpdesk.avgResolutionHours ? `${helpdesk.avgResolutionHours}h` : "—"} sub="hours to resolve" />}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 16 }}>
        {/* Left column */}
        <div style={{ display: "grid", gap: 16 }}>
          {/* Dept distribution */}
          <Card title="Headcount by Department">
            {deptDistribution.length ? deptDistribution.map((d) => (
              <div key={d.dept} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0" }}>
                <div style={{ width: 100, fontSize: 12, color: "var(--text-muted)", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.dept}</div>
                <div style={{ flex: 1, height: 8, background: "var(--lime-pale)", borderRadius: 0, overflow: "hidden" }}>
                  <div style={{
                    width: `${(d.count / maxDept * 100).toFixed(0)}%`,
                    height: "100%",
                    background: "var(--text)",
                    borderRadius: 0,
                    transition: "width .4s ease",
                  }} />
                </div>
                <div style={{ width: 28, fontSize: 12, fontWeight: 700, textAlign: "right", color: "var(--text)" }}>{d.count}</div>
              </div>
            )) : <Empty text="No employees yet" />}
          </Card>

          {/* Pending leaves */}
          <Card title={`Pending Leave Requests (${pendingLeaves.total})`}>
            {pendingLeaves.items.length ? (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead>
                  <tr>
                    {["Employee", "Type", "Dates", "Days", "Applied"].map((h) => (
                      <th key={h} className="table-th" style={{ padding: "6px 8px" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pendingLeaves.items.map((l) => {
                    const bstyle = LEAVE_BADGE[l.type] || { bg: "var(--line)", color: "var(--text-muted)" };
                    return (
                      <tr key={l.id} className="table-row" style={{ borderBottom: "1px solid var(--line)" }}>
                        <td style={{ padding: "6px 8px" }}>{l.emp_name}</td>
                        <td style={{ padding: "6px 8px" }}>
                          <span className="badge" style={{ background: bstyle.bg, color: bstyle.color }}>{l.type}</span>
                        </td>
                        <td style={{ padding: "6px 8px" }}>{fmtDate(l.date_from)}{l.date_from !== l.date_to ? ` → ${fmtDate(l.date_to)}` : ""}</td>
                        <td style={{ padding: "6px 8px" }}>{l.days}</td>
                        <td style={{ padding: "6px 8px", color: "var(--text-faint)" }}>{daysAgo(l.applied_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : <Empty text="Nothing pending" />}
          </Card>
        </div>

        {/* Right column */}
        <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
          {/* Upcoming holidays */}
          <Card title="Upcoming Holidays">
            {upcomingHolidays.length ? upcomingHolidays.map((h) => (
              <div key={h.date} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--line)", fontSize: 13 }}>
                <span style={{ color: "var(--text)" }}>{h.name}</span>
                <span style={{ color: "var(--text-muted)", fontSize: 12, fontWeight: 600 }}>{fmtDate(h.date)}</span>
              </div>
            )) : <Empty text="No upcoming holidays" />}
          </Card>

          {/* Birthdays */}
          <Card title="Birthdays — Next 30 Days">
            {birthdays.length ? birthdays.map((b) => (
              <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0", borderBottom: "1px solid var(--line)" }}>
                <Avatar name={b.name} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{b.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{b.date} · {b.daysAway === 0 ? "Today!" : `in ${b.daysAway}d`}</div>
                </div>
              </div>
            )) : <Empty text="None coming up" />}
          </Card>

          {/* Joiners & exits */}
          {(joiners.length > 0 || exits.length > 0) && (
            <Card title="Joiners & Exits This Month">
              {joiners.map((j) => (
                <div key={j.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12.5 }}>
                  <span><span style={{ color: "var(--charcoal)", fontWeight: 700 }}>+</span> {j.name}</span>
                  <span style={{ color: "var(--text-faint)" }}>Joined {fmtDate(j.doj)}</span>
                </div>
              ))}
              {exits.map((e) => (
                <div key={e.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12.5 }}>
                  <span><span style={{ color: "var(--danger)", fontWeight: 700 }}>−</span> {e.name}</span>
                  <span style={{ color: "var(--text-faint)" }}>Exited {fmtDate(e.exit_date)}</span>
                </div>
              ))}
            </Card>
          )}

          {/* Quick actions */}
          <Card title="Quick Actions">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <QBtn label="+ Add Employee" onClick={() => navigate("/hr/employees")} />
              <QBtn label="Mark Attendance" onClick={() => navigate("/hr/attendance")} />
              <QBtn label="Run Payroll" onClick={() => navigate("/hr/payroll")} />
            </div>
          </Card>
        </div>
      </div>

      {/* Announcements feed */}
      {data.announcementsFeed?.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 14, color: "var(--text)", textTransform: "uppercase", letterSpacing: ".07rem" }}>Recent Announcements</div>
          <div style={{ display: "grid", gap: 10 }}>
            {data.announcementsFeed.map((a) => (
              <div key={a.id} style={{
                background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r-card)",
                padding: "14px 18px", boxShadow: "var(--shadow-sm)",
                borderLeft: a.priority === "URGENT" ? "4px solid var(--danger)" : a.priority === "IMPORTANT" ? "4px solid var(--badge-amber-text)" : "4px solid var(--line)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", flex: 1 }}>{a.title}</span>
                  <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{daysAgo(a.published_at)}</span>
                </div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5, marginBottom: 4 }}>{a.body}</div>
                {a.attachments?.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                    {a.attachments.filter(att => att.mime.startsWith("image/")).map(att => (
                      <img key={att.id} src={`/api/attachments/${att.id}/thumb`} alt={att.filename}
                        style={{ maxWidth: 140, maxHeight: 90, borderRadius: 0, objectFit: "cover", border: "1px solid var(--line)" }} />
                    ))}
                    {a.attachments.filter(att => !att.mime.startsWith("image/")).map(att => (
                      <a key={att.id} href={`/api/attachments/${att.id}/download`} target="_blank" rel="noopener noreferrer"
                        style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "3px 8px", background: "var(--bg)", borderRadius: 0, fontSize: 11, color: "var(--text)", textDecoration: "none", border: "1px solid var(--line)" }}>
                        📎 {att.filename}
                      </a>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>By {a.published_by_name}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function KPI({ label, value, sub, accent, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: accent ? "var(--grad-accent)" : "var(--grad-hero)",
        color: accent ? "var(--signal-ink)" : "var(--text)",
        border: accent ? "1px solid var(--signal)" : "1px solid var(--line)",
        borderRadius: "var(--r-card)",
        padding: "16px 18px",
        cursor: onClick ? "pointer" : "default",
        transition: "border-color .15s linear",
      }}
      onMouseEnter={(e) => { if (onClick && !accent) e.currentTarget.style.borderColor = "var(--text)"; }}
      onMouseLeave={(e) => { if (!accent) e.currentTarget.style.borderColor = "var(--line)"; }}
    >
      <div style={{ fontSize: 10.5, color: accent ? "inherit" : "var(--text)", fontWeight: 600, marginBottom: 18, textTransform: "uppercase", letterSpacing: ".08em" }}>{label}</div>
      <div style={{ fontSize: 44, fontWeight: 700, fontFamily: "var(--font-display)", letterSpacing: "-.045em", lineHeight: .95, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 12, color: accent ? "inherit" : "var(--text-muted)", opacity: accent ? .8 : 1, marginTop: 8 }}>{sub}</div>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div style={{ background: "var(--card)", borderTop: "2px solid var(--text)", padding: "12px 0 0" }}>
      <h4 style={{ fontSize: 11, fontWeight: 600, marginBottom: 16, color: "var(--text)", textTransform: "uppercase", letterSpacing: ".08em" }}>{title}</h4>
      {children}
    </div>
  );
}

function Empty({ text }) { return <div style={{ fontSize: 13, color: "var(--text-faint)", padding: "10px 0" }}>{text}</div>; }

function Avatar({ name }) {
  const i = (name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--text)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: "var(--bg)", flexShrink: 0 }}>{i}</div>
  );
}

function QBtn({ label, onClick }) {
  return (
    <button onClick={onClick} className="btn-sm" style={{ padding: "6px 14px", fontSize: 12 }}>{label}</button>
  );
}
