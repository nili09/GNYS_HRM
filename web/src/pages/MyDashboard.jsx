import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.jsx";
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

export default function MyDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
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
      <h2 style={{ fontSize: 20, marginBottom: 20 }}>Welcome, {user?.name}</h2>

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: 10, marginBottom: 20 }}>
        <KPI label="Leave Balance" value={totalBal} sub="days available" onClick={() => navigate("/my/leave")} />
        <KPI label="Present"       value={att.present ?? 0} sub={fmtMonth(att.month || new Date().toISOString().slice(0, 7))} onClick={() => navigate("/my/attendance")} />
        <KPI label="On Leave"      value={att.leaves ?? 0}  sub="this month" />
        <KPI label="Pending"       value={data?.pendingRequests?.length ?? 0} sub="leave requests" />
        {data?.lastPayslip && (
          <KPI label="Last Pay" value={`₹${fmt(data.lastPayslip.net)}`} sub={fmtMonth(data.lastPayslip.month)} onClick={() => navigate("/my/payslips")} />
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
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

      {/* Manager section */}
      {mgrData?.isManager && (
        <div style={{ marginTop: 22 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".06rem" }}>Team Overview</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: 10, marginBottom: 14 }}>
            <KPI label="Team Size" value={mgrData.teamSize} sub="direct reports" />
            <KPI label="Out Today" value={mgrData.outToday.length} sub="on leave" />
            <KPI label="Pending"   value={mgrData.pending.length}  sub="approvals" onClick={() => navigate("/team/approvals")} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
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
        background: "var(--card)", border: "1px solid var(--line)",
        borderRadius: "var(--r-card)",
        padding: "14px 16px", cursor: onClick ? "pointer" : "default",
        transition: "box-shadow .2s",
      }}
      onMouseEnter={(e) => onClick && (e.currentTarget.style.boxShadow = "var(--lime-glow)")}
      onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "")}
    >
      <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: ".05rem" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, fontFamily: "var(--font-display)", letterSpacing: "-.02rem", lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 3 }}>{sub}</div>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r-card)", padding: "16px 18px" }}>
      <h4 style={{ fontSize: 11, fontWeight: 700, marginBottom: 12, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".06rem" }}>{title}</h4>
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
    <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--charcoal)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "var(--lime)", flexShrink: 0 }}>
      {initials}
    </div>
  );
}
