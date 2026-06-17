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
      <h1 style={{ fontSize: 22, marginBottom: 20 }}>HR Dashboard</h1>

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(148px, 1fr))", gap: 10, marginBottom: 22 }}>
        <KPI label="Active Headcount" value={headcount.active} sub={`${headcount.onboarding} onboarding · ${headcount.notice} notice`} accent onClick={() => navigate("/hr/employees")} />
        <KPI label="Present Today"    value={today.present}   sub={`${attPct}% of ${today.total}`} onClick={() => navigate("/hr/attendance")} />
        <KPI label="On Leave Today"   value={today.onLeave}   sub="approved leaves" />
        <KPI label="Pending Approvals" value={pendingLeaves.total} sub="leave requests" onClick={() => navigate("/hr/leave")} />
        <KPI label="Payroll Runs"     value={payroll.finalizedRuns} sub={payroll.latestRun ? `Latest: ${payroll.latestRun.month}` : "none yet"} onClick={() => navigate("/hr/payroll")} />
      </div>

      {/* Modules Overview */}
      <h3 style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".06rem", marginBottom: 10 }}>Modules Overview</h3>
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
                <div style={{ flex: 1, height: 14, background: "var(--line)", borderRadius: 1, overflow: "hidden" }}>
                  <div style={{
                    width: `${(d.count / maxDept * 100).toFixed(0)}%`,
                    height: "100%",
                    background: "var(--charcoal)",
                    borderRadius: 1,
                    transition: "width .3s",
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
    </div>
  );
}

function KPI({ label, value, sub, accent, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: accent ? "var(--ink)" : "var(--card)",
        color: accent ? "var(--lime)" : "var(--text)",
        border: accent ? "none" : "1px solid var(--line)",
        borderRadius: "var(--r-card)",
        padding: "14px 16px",
        cursor: onClick ? "pointer" : "default",
        transition: "box-shadow .2s",
      }}
      onMouseEnter={(e) => onClick && (e.currentTarget.style.boxShadow = "var(--lime-glow)")}
      onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "")}
    >
      <div style={{ fontSize: 10, color: accent ? "rgba(255,255,255,.35)" : "var(--text-muted)", fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: ".05rem" }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "var(--font-display)", letterSpacing: "-.02rem", lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 11, color: accent ? "rgba(255,255,255,.3)" : "var(--text-faint)", marginTop: 3 }}>{sub}</div>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r-card)", padding: "16px 18px", boxShadow: "var(--shadow-card)" }}>
      <h4 style={{ fontSize: 11, fontWeight: 700, marginBottom: 12, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".06rem" }}>{title}</h4>
      {children}
    </div>
  );
}

function Empty({ text }) { return <div style={{ fontSize: 13, color: "var(--text-faint)", padding: "10px 0" }}>{text}</div>; }

function Avatar({ name }) {
  const i = (name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--charcoal)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "var(--lime)", flexShrink: 0 }}>{i}</div>
  );
}

function QBtn({ label, onClick }) {
  return (
    <button onClick={onClick} className="btn-sm" style={{ padding: "6px 14px", fontSize: 12 }}>{label}</button>
  );
}
