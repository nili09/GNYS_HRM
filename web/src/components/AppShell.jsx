import { useState, useEffect, useCallback } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.jsx";
import { api } from "../lib/api.js";

function NavItem({ to, icon, label, badge }) {
  return (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        display: "flex", alignItems: "center", gap: 11,
        padding: "8px 12px",
        borderRadius: 2,
        color: isActive ? "var(--lime)" : "var(--text-faint)",
        fontSize: 12, textDecoration: "none",
        cursor: "pointer",
        transition: "all .2s ease-in-out",
        borderLeft: isActive ? "2px solid var(--lime)" : "2px solid transparent",
        background: isActive ? "rgba(223,241,64,.1)" : "transparent",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: ".05rem",
      })}
      onMouseEnter={(e) => {
        if (!e.currentTarget.getAttribute("aria-current")) {
          e.currentTarget.style.background = "rgba(255,255,255,.05)";
          e.currentTarget.style.color = "rgba(255,255,255,.8)";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.removeAttribute("style");
      }}
    >
      <span style={{ width: 16, textAlign: "center", fontSize: 14, flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {badge > 0 && (
        <span style={{
          minWidth: 18, height: 18, borderRadius: "var(--r-pill)",
          background: "var(--danger)",
          color: "#fff", fontSize: 10, fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "0 5px",
        }}>{badge}</span>
      )}
    </NavLink>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 9.5, fontWeight: 700, letterSpacing: ".12em",
      color: "rgba(255,255,255,.25)", textTransform: "uppercase",
      padding: "12px 14px 4px", marginTop: 4,
    }}>
      {children}
    </div>
  );
}

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [pendingCount, setPendingCount] = useState(0);

  const fetchPendingCount = useCallback(async () => {
    try {
      const data = await api.get("/leaves/pending-count");
      setPendingCount(data.count);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchPendingCount();
    const es = new EventSource("/api/events", { withCredentials: true });
    es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.entity === "leaves") fetchPendingCount();
      } catch { /* ignore */ }
    };
    return () => es.close();
  }, [fetchPendingCount]);

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  const isHR    = ["HR", "ADMIN"].includes(user?.role);
  const isAdmin = user?.role === "ADMIN";

  const initials = (user?.name || "?")
    .split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      {/* ── Sidebar ── */}
      <aside
        style={{
          width: 216, minWidth: 216,
          background: "var(--ink)",
          color: "var(--text-faint)",
          display: "flex", flexDirection: "column",
          padding: "0 10px",
          borderRight: "1px solid rgba(255,255,255,.06)",
        }}
      >
        {/* Logo */}
        <div
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "20px 4px 18px",
            borderBottom: "1px solid rgba(255,255,255,.07)",
            marginBottom: 8,
          }}
        >
          <div
            style={{
              width: 32, height: 32, borderRadius: "var(--r-pill)",
              background: "var(--lime)", color: "var(--ink)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 800, fontSize: 14, flexShrink: 0,
              fontFamily: "var(--font-display)",
            }}
          >G</div>
          <div>
            <b style={{ color: "#fff", fontSize: 13.5, display: "block", lineHeight: 1.1, fontFamily: "var(--font-display)" }}>
              Genesys HRMS
            </b>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,.3)", letterSpacing: ".02em" }}>
              International Corp Ltd
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 1, overflowY: "auto" }}>
          <SectionLabel>My Space</SectionLabel>
          <NavItem to="/my/dashboard"   icon="◫"  label="Dashboard" />
          <NavItem to="/my/attendance"  icon="🕘" label="Attendance" />
          <NavItem to="/my/leave"       icon="🌴" label="Apply Leave" />
          <NavItem to="/my/payslips"    icon="₹"  label="Payslips" />
          <NavItem to="/my/expenses"   icon="💰" label="Expenses" />
          <NavItem to="/my/profile"     icon="👤" label="Profile" />

          <SectionLabel>Team</SectionLabel>
          <NavItem to="/team/approvals"  icon="✅" label="Approvals" badge={pendingCount} />
          <NavItem to="/team/calendar"   icon="📅" label="Calendar" />
          <NavItem to="/team/attendance" icon="🕘" label="Team Attendance" />
          <NavItem to="/team/expenses"  icon="💰" label="Team Expenses" />

          {isHR && (
            <>
              <SectionLabel>HR</SectionLabel>
              <NavItem to="/hr/dashboard"  icon="◫"  label="HR Dashboard" />
              <NavItem to="/hr/employees"  icon="👥" label="Employees" />
              <NavItem to="/hr/attendance" icon="🕘" label="Attendance" />
              <NavItem to="/hr/leave"      icon="🌴" label="Leave" badge={pendingCount} />
              <NavItem to="/hr/payroll"    icon="₹"  label="Payroll" />
              <NavItem to="/hr/expenses"  icon="💰" label="Expenses" />
            </>
          )}

          {isAdmin && (
            <>
              <SectionLabel>Admin</SectionLabel>
              <NavItem to="/admin/settings" icon="⚙" label="Settings" />
              <NavItem to="/admin/audit"    icon="📋" label="Audit Log" />
            </>
          )}
        </nav>

        {/* User footer */}
        <div
          style={{
            padding: "14px 4px 16px",
            borderTop: "1px solid rgba(255,255,255,.07)",
            display: "flex", alignItems: "center", gap: 10,
          }}
        >
          <div style={{
            width: 30, height: 30, borderRadius: "50%",
            background: "var(--charcoal)", color: "var(--lime)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700, flexShrink: 0,
          }}>{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "#fff", fontWeight: 600, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user?.name}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,.3)", letterSpacing: ".06em", textTransform: "uppercase" }}>{user?.role}</div>
          </div>
          <button
            onClick={handleLogout}
            title="Sign out"
            style={{
              background: "none", border: "none",
              color: "var(--text-faint)", cursor: "pointer",
              fontSize: 14, padding: "2px 4px",
              transition: "color .2s",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = "var(--lime)"}
            onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-faint)"}
          >↪</button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg)" }}>
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
