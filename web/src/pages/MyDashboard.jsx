import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.jsx";
import { useIsMobile } from "../hooks/useIsMobile.jsx";
import { api } from "../lib/api.js";

function fmt(n) { return Number(n || 0).toLocaleString("en-IN"); }

function fmtMonth(ym) {
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-IN", { month: "short", year: "numeric" });
}

function fmtDate(d) {
  if (!d) return "—";
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y}`;
}

function daysAgo(dt) {
  if (!dt) return "";
  const diff = Math.floor((Date.now() - new Date(dt).getTime()) / 86400000);
  if (diff === 0) return "today";
  if (diff === 1) return "1 day ago";
  return `${diff} days ago`;
}

function relTime(dt) {
  if (!dt) return "";
  const ms = Date.now() - new Date(dt).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  return fmtDate(dt?.slice?.(0, 10) || dt);
}

export default function MyDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [data, setData] = useState(null);
  const [mgrData, setMgrData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [me, mgr] = await Promise.all([
        api.get("/dashboard/me"),
        api.get("/dashboard/manager"),
      ]);
      setData(me);
      setMgrData(mgr);
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

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading dashboard…</div>;

  const totalBal = data?.balances?.reduce((s, b) => s + Math.max(0, b.available), 0) ?? 0;
  const att = data?.attendance ?? {};

  return (
    <div>
      <h2 className="page-title" style={{ marginBottom: 24 }}>Welcome, {user?.name}</h2>

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(auto-fit, minmax(155px, 1fr))", gap: 10, marginBottom: 20 }}>
        <KPI label="Leave Balance" value={totalBal} sub="days available" onClick={() => navigate("/my/leave")} />
        <KPI label="Present"       value={att.present ?? 0} sub={fmtMonth(att.month || new Date().toISOString().slice(0, 7))} onClick={() => navigate("/my/attendance")} />
        <KPI label="On Leave"      value={att.leaves ?? 0}  sub="this month" />
        <KPI label="Pending"       value={data?.pendingRequests?.length ?? 0} sub="leave requests" />
        {data?.lastPayslip && (
          <KPI label="Last Pay" value={`₹${fmt(data.lastPayslip.net)}`} sub={fmtMonth(data.lastPayslip.month)} onClick={() => navigate("/my/payslips")} />
        )}
      </div>

      {/* Module KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(auto-fit, minmax(155px, 1fr))", gap: 10, marginBottom: 20 }}>
        <KPI label="Expenses" value={data?.myExpenses?.count ?? 0} sub={data?.myExpenses?.total ? `₹${fmt(data.myExpenses.total)} pending` : "none pending"} onClick={() => navigate("/my/expenses")} />
        <KPI label="Tickets" value={data?.myOpenTickets ?? 0} sub="open tickets" onClick={() => navigate("/my/tickets")} />
        <KPI label="Assets" value={data?.myAssets ?? 0} sub="assigned to me" onClick={() => navigate("/my/assets")} />
        <KPI label="Surveys" value={data?.activeSurveys?.length ?? 0} sub="awaiting response" onClick={() => navigate("/my/surveys")} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
        {/* Leave balances */}
        <Card title="Leave Balances">
          {data?.balances?.length ? (
            <div style={{ display: "grid", gap: 4 }}>
              {data.balances.map((b) => (
                <div key={b.type} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--line)" }}>
                  <span style={{ fontSize: 13 }}>{b.name} <span style={{ color: "var(--text-faint)", fontSize: 11 }}>({b.type})</span></span>
                  <span style={{ fontWeight: 700, fontSize: 14, color: b.available <= 0 ? "var(--danger)" : "var(--charcoal)" }}>{b.available}</span>
                </div>
              ))}
            </div>
          ) : <Empty text="No leave types configured" />}
        </Card>

        {/* Pending requests */}
        <Card title="My Pending Requests">
          {data?.pendingRequests?.length ? (
            <div style={{ display: "grid", gap: 4 }}>
              {data.pendingRequests.map((r) => (
                <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--line)", fontSize: 13 }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>{r.type}</span>
                    <span style={{ color: "var(--text-muted)", marginLeft: 8 }}>{fmtDate(r.date_from)}{r.date_from !== r.date_to ? ` → ${fmtDate(r.date_to)}` : ""}</span>
                  </div>
                  <span className="badge badge-tan">PENDING</span>
                </div>
              ))}
            </div>
          ) : <Empty text="No pending requests" />}
        </Card>
      </div>

      {/* Upcoming interviews */}
      {data?.myInterviews?.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <Card title="Upcoming Interviews">
            <div style={{ display: "grid", gap: 4 }}>
              {data.myInterviews.map((iv) => (
                <div key={iv.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--line)", fontSize: 13 }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>{iv.candidate_name}</span>
                    <span style={{ color: "var(--text-muted)", marginLeft: 8 }}>{iv.job_title}</span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{fmtDate(iv.scheduled_at?.slice(0, 10))}</div>
                    <div style={{ fontSize: 10, color: "var(--text-faint)" }}>{iv.mode} · {iv.duration_mins}min</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Recent recognitions */}
      {data?.recentRecognitions?.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <Card title="Recent Recognitions">
            <div style={{ display: "grid", gap: 4 }}>
              {data.recentRecognitions.map((r) => (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--line)" }}>
                  <span style={{ fontSize: 20 }}>{r.badge_icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13 }}>
                      <span style={{ fontWeight: 600 }}>{r.badge_name}</span>
                      <span style={{ color: "var(--text-muted)" }}> from {r.from_name}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{r.message}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Announcements feed */}
      {data?.announcementsFeed?.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 14, color: "var(--text)", textTransform: "uppercase", letterSpacing: ".07rem" }}>Announcements</div>
          <div style={{ display: "grid", gap: 12 }}>
            {data.announcementsFeed.map((a) => (
              <div key={a.id} style={{
                background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r-card)",
                padding: "16px 20px", boxShadow: "var(--shadow-sm)",
                borderLeft: a.priority === "URGENT" ? "4px solid var(--danger)" : a.priority === "IMPORTANT" ? "4px solid var(--badge-amber-text)" : "4px solid var(--line)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{
                    padding: "2px 8px", borderRadius: "var(--r-pill)", fontSize: 10, fontWeight: 700,
                    background: a.priority === "URGENT" ? "var(--badge-danger-bg)" : a.priority === "IMPORTANT" ? "var(--badge-amber-bg)" : "var(--badge-blue-bg)",
                    color: a.priority === "URGENT" ? "var(--badge-danger-text)" : a.priority === "IMPORTANT" ? "var(--badge-amber-text)" : "var(--badge-blue-text)",
                    textTransform: "uppercase", letterSpacing: ".04rem",
                  }}>{a.priority}</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", flex: 1 }}>{a.title}</span>
                  <span style={{ fontSize: 11, color: "var(--text-faint)", flexShrink: 0 }}>{relTime(a.published_at)}</span>
                </div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: a.attachments?.length ? 10 : 4 }}>{a.body}</div>
                {a.attachments?.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
                    {a.attachments.filter(att => att.mime.startsWith("image/")).map(att => (
                      <img key={att.id} src={`/api/attachments/${att.id}/thumb`} alt={att.filename}
                        style={{ maxWidth: 180, maxHeight: 120, borderRadius: 0, objectFit: "cover", border: "1px solid var(--line)" }} />
                    ))}
                    {a.attachments.filter(att => !att.mime.startsWith("image/")).map(att => (
                      <a key={att.id} href={`/api/attachments/${att.id}/download`} target="_blank" rel="noopener noreferrer"
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          padding: "4px 10px", background: "var(--bg)", borderRadius: "var(--r-card)",
                          fontSize: 12, fontWeight: 500, color: "var(--text)", textDecoration: "none",
                          border: "1px solid var(--line)",
                        }}>
                        <span style={{ fontSize: 14 }}>📎</span> {att.filename}
                      </a>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
                  By <span style={{ fontWeight: 600, color: "var(--text-muted)" }}>{a.published_by_name}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manager section */}
      {mgrData?.isManager && (
        <div style={{ marginTop: 22 }}>
          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 14, color: "var(--text)", textTransform: "uppercase", letterSpacing: ".07rem" }}>Team Overview</div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(auto-fit, minmax(155px, 1fr))", gap: 10, marginBottom: 14 }}>
            <KPI label="Team Size" value={mgrData.teamSize} sub="direct reports" />
            <KPI label="Out Today" value={mgrData.outToday.length} sub="on leave" />
            <KPI label="Pending"   value={mgrData.pending.length}  sub="leave approvals" onClick={() => navigate("/team/approvals")} />
            {mgrData.pendingExpenses && <KPI label="Expense Claims" value={mgrData.pendingExpenses.length} sub="pending approval" onClick={() => navigate("/team/expenses")} />}
            {mgrData.teamGoals && <KPI label="Team Goals" value={`${mgrData.teamGoals.completionRate}%`} sub={`${mgrData.teamGoals.completed}/${mgrData.teamGoals.total} completed`} onClick={() => navigate("/team/performance")} />}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
            <Card title="Who's Out Today">
              {mgrData.outToday.length ? (
                mgrData.outToday.map((e) => (
                  <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
                    <Avatar name={e.name} />
                    <span style={{ fontSize: 13 }}>{e.name}</span>
                  </div>
                ))
              ) : <Empty text="Everyone's in today" />}
            </Card>

            <Card title="Pending Approvals">
              {mgrData.pending.length ? (
                mgrData.pending.slice(0, 5).map((l) => (
                  <div key={l.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--line)", fontSize: 13 }}>
                    <div>
                      <span style={{ fontWeight: 500 }}>{l.emp_name}</span>
                      <span style={{ color: "var(--text-muted)", marginLeft: 6 }}>{l.type} · {l.days}d</span>
                    </div>
                    <span style={{ color: "var(--text-faint)", fontSize: 11 }}>{daysAgo(l.applied_at)}</span>
                  </div>
                ))
              ) : <Empty text="All caught up" />}
            </Card>
          </div>

          {/* Team pending expenses */}
          {mgrData.pendingExpenses?.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <Card title="Pending Expense Approvals">
                <div style={{ display: "grid", gap: 4 }}>
                  {mgrData.pendingExpenses.slice(0, 5).map((e) => (
                    <div key={e.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--line)", fontSize: 13 }}>
                      <div>
                        <span style={{ fontWeight: 500 }}>{e.emp_name}</span>
                        <span style={{ color: "var(--text-muted)", marginLeft: 6 }}>{e.description || "Expense"}</span>
                      </div>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>₹{fmt(e.amount)}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function KPI({ label, value, sub, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: "var(--grad-hero)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r-card)",
        padding: "16px 18px",
        cursor: onClick ? "pointer" : "default",
        transition: "border-color .15s linear",
      }}
      onMouseEnter={(e) => { if (onClick) e.currentTarget.style.borderColor = "var(--text)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--line)"; }}
    >
      <div style={{ fontSize: 10.5, color: "var(--text)", fontWeight: 600, marginBottom: 18, textTransform: "uppercase", letterSpacing: ".08em" }}>{label}</div>
      <div style={{ fontSize: 40, fontWeight: 700, fontFamily: "var(--font-display)", letterSpacing: "-.045em", lineHeight: .95, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>{sub}</div>
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

function Empty({ text }) {
  return <div style={{ fontSize: 13, color: "var(--text-faint)", padding: "12px 0" }}>{text}</div>;
}

function Avatar({ name }) {
  const initials = (name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--text)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "var(--bg)", flexShrink: 0 }}>
      {initials}
    </div>
  );
}
