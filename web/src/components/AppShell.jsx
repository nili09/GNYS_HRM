import { useState, useEffect, useCallback, useRef } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.jsx";
import { useTheme } from "../hooks/useTheme.jsx";
import { api } from "../lib/api.js";
import SearchBar from "./SearchBar.jsx";

function NavItem({ to, icon, label, badge }) {
  const [hovered, setHovered] = useState(false);

  return (
    <NavLink
      to={to}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={({ isActive }) => ({
        display: "flex", alignItems: "center", gap: 11,
        padding: "8px 12px",
        borderRadius: 2,
        color: isActive ? "var(--lime)" : hovered ? "rgba(255,255,255,.8)" : "var(--text-faint)",
        fontSize: 12, textDecoration: "none",
        cursor: "pointer",
        transition: "background .2s, color .2s",
        borderLeft: isActive ? "2px solid var(--lime)" : "2px solid transparent",
        background: isActive ? "rgba(223,241,64,.1)" : hovered ? "rgba(255,255,255,.05)" : "transparent",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: ".05rem",
      })}
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

const MIN_WIDTH = 180;
const MAX_WIDTH = 320;
const DEFAULT_WIDTH = 216;

export default function AppShell() {
  const { user, logout } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [pendingCount, setPendingCount] = useState(0);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem("hrms-sidebar-w");
    const n = Number(saved);
    return n >= MIN_WIDTH && n <= MAX_WIDTH ? n : DEFAULT_WIDTH;
  });
  const dragging = useRef(false);

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

  useEffect(() => {
    function onMouseMove(e) {
      if (!dragging.current) return;
      const w = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX));
      setSidebarWidth(w);
    }
    function onMouseUp() {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      localStorage.setItem("hrms-sidebar-w", String(sidebarWidth));
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [sidebarWidth]);

  function startDrag(e) {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

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
          width: sidebarWidth, minWidth: MIN_WIDTH, maxWidth: MAX_WIDTH,
          background: "var(--ink)",
          color: "var(--text-faint)",
          display: "flex", flexDirection: "column",
          padding: "0 10px",
          borderRight: "1px solid rgba(255,255,255,.06)",
          position: "relative",
          flexShrink: 0,
        }}
      >
        {/* Logo */}
        <div
          style={{
            padding: "20px 4px 18px",
            borderBottom: "1px solid rgba(255,255,255,.07)",
            marginBottom: 8,
          }}
        >
          <img
            src="/logo.png"
            alt="Genesys HRMS"
            style={{
              height: 22,
              width: "auto",
              filter: "brightness(0) invert(1)",
              opacity: 0.9,
              display: "block",
            }}
          />
          <span style={{ fontSize: 10, color: "rgba(255,255,255,.3)", letterSpacing: ".02em", marginTop: 4, display: "block" }}>
            International Corp Ltd
          </span>
        </div>

        {/* Nav */}
        <nav className="sidebar-scroll" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 1, overflowY: "auto" }}>
          <SectionLabel>My Space</SectionLabel>
          <NavItem to="/my/dashboard"   icon="◫"  label="Dashboard" />
          <NavItem to="/my/attendance"  icon="🕘" label="Attendance" />
          <NavItem to="/my/leave"       icon="🌴" label="Apply Leave" />
          <NavItem to="/my/payslips"    icon="₹"  label="Payslips" />
          <NavItem to="/my/expenses"    icon="💰" label="Expenses" />
          <NavItem to="/my/interviews"  icon="🎙" label="My Interviews" />
          <NavItem to="/my/performance" icon="📊" label="Performance" />
          <NavItem to="/my/surveys"     icon="📝" label="Surveys" />
          <NavItem to="/my/assets"      icon="💻" label="My Assets" />
          <NavItem to="/my/tickets"     icon="🎫" label="My Tickets" />
          <NavItem to="/my/profile"     icon="👤" label="Profile" />

          <SectionLabel>Engage</SectionLabel>
          <NavItem to="/announcements" icon="📢" label="Announcements" />
          <NavItem to="/recognition"   icon="🏆" label="Recognition" />

          <SectionLabel>Team</SectionLabel>
          <NavItem to="/team/approvals"  icon="✅" label="Approvals" badge={pendingCount} />
          <NavItem to="/team/calendar"   icon="📅" label="Calendar" />
          <NavItem to="/team/attendance" icon="🕘" label="Team Attendance" />
          <NavItem to="/team/expenses"  icon="💰" label="Team Expenses" />
          <NavItem to="/team/performance" icon="📊" label="Team Performance" />

          {isHR && (
            <>
              <SectionLabel>HR</SectionLabel>
              <NavItem to="/hr/dashboard"  icon="◫"  label="HR Dashboard" />
              <NavItem to="/hr/employees"  icon="👥" label="Employees" />
              <NavItem to="/hr/attendance" icon="🕘" label="Attendance" />
              <NavItem to="/hr/leave"      icon="🌴" label="Leave" badge={pendingCount} />
              <NavItem to="/hr/payroll"    icon="₹"  label="Payroll" />
              <NavItem to="/hr/expenses"     icon="💰" label="Expenses" />
              <NavItem to="/hr/recruitment"  icon="📋" label="Recruitment" />
              <NavItem to="/hr/performance"  icon="📊" label="Performance" />
              <NavItem to="/hr/engagement"  icon="💬" label="Engagement" />
              <NavItem to="/hr/assets"      icon="💻" label="Assets" />
              <NavItem to="/hr/helpdesk"    icon="🎫" label="Helpdesk" />
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
            onClick={toggleTheme}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            style={{
              background: "none", border: "none",
              color: "var(--text-faint)", cursor: "pointer",
              fontSize: 14, padding: "2px 4px",
              transition: "color .3s",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = "var(--lime)"}
            onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-faint)"}
          >{theme === "dark" ? "☀" : "☾"}</button>
          <button
            onClick={handleLogout}
            title="Sign out"
            style={{
              background: "none", border: "none",
              color: "var(--text-faint)", cursor: "pointer",
              fontSize: 14, padding: "2px 4px",
              transition: "color .3s",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = "var(--lime)"}
            onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-faint)"}
          >↪</button>
        </div>

        {/* Resize handle */}
        <div
          onMouseDown={startDrag}
          style={{
            position: "absolute", top: 0, right: -3, bottom: 0,
            width: 6, cursor: "col-resize", zIndex: 10,
          }}
        >
          <div style={{
            position: "absolute", top: 0, bottom: 0,
            left: 2, width: 2, borderRadius: 1,
            background: "transparent",
            transition: "background .2s",
          }}
            onMouseEnter={(e) => e.currentTarget.style.background = "var(--lime)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
          />
        </div>
      </aside>

      {/* ── Main content ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg)" }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "flex-end",
          padding: "10px 28px 0", flexShrink: 0,
        }}>
          <SearchBar />
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 28px 24px" }}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
