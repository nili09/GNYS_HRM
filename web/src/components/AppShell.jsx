import { useState, useEffect, useCallback, useRef } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.jsx";
import { useTheme } from "../hooks/useTheme.jsx";
import { useIsMobile } from "../hooks/useIsMobile.jsx";
import { api } from "../lib/api.js";
import SearchBar from "./SearchBar.jsx";
import NotificationBell from "./NotificationBell.jsx";
import ProfilePhoto from "./ProfilePhoto.jsx";

function NavItem({ to, icon, label, badge, onNav }) {
  const [hovered, setHovered] = useState(false);

  return (
    <NavLink
      to={to}
      onClick={onNav}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={({ isActive }) => ({
        display: "flex", alignItems: "center", gap: 11,
        padding: "10px 12px",
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
        minHeight: 40,
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
  const location = useLocation();
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [interviewCount, setInterviewCount] = useState(0);
  const [surveyCount, setSurveyCount] = useState(0);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem("hrms-sidebar-w");
    const n = Number(saved);
    return n >= MIN_WIDTH && n <= MAX_WIDTH ? n : DEFAULT_WIDTH;
  });
  const dragging = useRef(false);

  // Close drawer on route change
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  const fetchPendingCount = useCallback(async () => {
    try {
      const data = await api.get("/leaves/pending-count");
      setPendingCount(data.count);
    } catch { /* ignore */ }
  }, []);

  const fetchModuleCounts = useCallback(async () => {
    try {
      const [iv, sv] = await Promise.all([
        api.get("/recruitment/interviews/my-count"),
        api.get("/engagement/surveys/my-count"),
      ]);
      setInterviewCount(iv.count);
      setSurveyCount(sv.count);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchPendingCount();
    fetchModuleCounts();
    const es = new EventSource("/api/events", { withCredentials: true });
    window.__sseSource = es;
    es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.entity === "leaves") fetchPendingCount();
      } catch { /* ignore */ }
    };
    return () => { es.close(); window.__sseSource = null; };
  }, [fetchPendingCount, fetchModuleCounts]);

  useEffect(() => {
    if (isMobile) return;
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
  }, [sidebarWidth, isMobile]);

  function startDrag(e) {
    if (isMobile) return;
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  const isHR      = ["HR", "ADMIN"].includes(user?.role);
  const isAdmin   = user?.role === "ADMIN";
  const showTeam  = !!user?.is_manager || isHR;

  const initials = (user?.name || "?")
    .split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  const closeDrawer = () => setDrawerOpen(false);

  const sidebarContent = (
    <>
      {/* Logo */}
      <div
        style={{
          padding: "20px 4px 18px",
          borderBottom: "1px solid rgba(255,255,255,.07)",
          marginBottom: 8,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}
      >
        <div>
          <img
            src="/logo.png"
            alt="Genesys HRMS"
            style={{
              height: 22, width: "auto",
              filter: "brightness(0) invert(1)",
              opacity: 0.9, display: "block",
            }}
          />
          <span style={{ fontSize: 10, color: "rgba(255,255,255,.3)", letterSpacing: ".02em", marginTop: 4, display: "block" }}>
            International Corp Ltd
          </span>
        </div>
        {isMobile && (
          <button
            onClick={closeDrawer}
            style={{
              background: "none", border: "none", color: "rgba(255,255,255,.5)",
              fontSize: 22, cursor: "pointer", padding: "4px 8px", lineHeight: 1,
            }}
            aria-label="Close menu"
          >×</button>
        )}
      </div>

      {/* Nav */}
      <nav className="sidebar-scroll" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 1, overflowY: "auto" }}>
        <SectionLabel>My Space</SectionLabel>
        <NavItem to="/my/dashboard"   icon="◫"  label="Dashboard"  onNav={closeDrawer} />
        <NavItem to="/my/attendance"  icon="🕘" label="Attendance" onNav={closeDrawer} />
        <NavItem to="/my/leave"       icon="🌴" label="Apply Leave" onNav={closeDrawer} />
        <NavItem to="/my/payslips"    icon="₹"  label="Payslips"   onNav={closeDrawer} />
        <NavItem to="/my/expenses"    icon="💰" label="Expenses"   onNav={closeDrawer} />
        {interviewCount > 0 && <NavItem to="/my/interviews"  icon="🎙" label="My Interviews" onNav={closeDrawer} />}
        <NavItem to="/my/performance" icon="📊" label="Performance" onNav={closeDrawer} />
        {surveyCount > 0 && <NavItem to="/my/surveys" icon="📝" label="Surveys" onNav={closeDrawer} />}
        <NavItem to="/my/assets"      icon="💻" label="My Assets"   onNav={closeDrawer} />
        <NavItem to="/my/tickets"     icon="🎫" label="My Tickets"  onNav={closeDrawer} />
        <NavItem to="/my/profile"     icon="👤" label="Profile"     onNav={closeDrawer} />

        <SectionLabel>Engage</SectionLabel>
        <NavItem to="/announcements" icon="📢" label="Announcements" onNav={closeDrawer} />
        <NavItem to="/recognition"   icon="🏆" label="Recognition"   onNav={closeDrawer} />

        {showTeam && (
          <>
            <SectionLabel>Team</SectionLabel>
            <NavItem to="/team/approvals"    icon="✅" label="Approvals" badge={pendingCount} onNav={closeDrawer} />
            <NavItem to="/team/calendar"     icon="📅" label="Calendar"  onNav={closeDrawer} />
            <NavItem to="/team/attendance"   icon="🕘" label="Team Attendance" onNav={closeDrawer} />
            <NavItem to="/team/expenses"     icon="💰" label="Team Expenses"   onNav={closeDrawer} />
            <NavItem to="/team/performance"  icon="📊" label="Team Performance" onNav={closeDrawer} />
          </>
        )}

        {isHR && (
          <>
            <SectionLabel>HR</SectionLabel>
            <NavItem to="/hr/dashboard"   icon="◫"  label="HR Dashboard" onNav={closeDrawer} />
            <NavItem to="/hr/employees"   icon="👥" label="Employees"    onNav={closeDrawer} />
            <NavItem to="/hr/attendance"  icon="🕘" label="Attendance"   onNav={closeDrawer} />
            <NavItem to="/hr/leave"       icon="🌴" label="Leave" badge={pendingCount} onNav={closeDrawer} />
            <NavItem to="/hr/payroll"     icon="₹"  label="Payroll"      onNav={closeDrawer} />
            <NavItem to="/hr/expenses"    icon="💰" label="Expenses"     onNav={closeDrawer} />
            <NavItem to="/hr/recruitment" icon="📋" label="Recruitment"  onNav={closeDrawer} />
            <NavItem to="/hr/performance" icon="📊" label="Performance"  onNav={closeDrawer} />
            <NavItem to="/hr/engagement"  icon="💬" label="Engagement"   onNav={closeDrawer} />
            <NavItem to="/hr/assets"      icon="💻" label="Assets"       onNav={closeDrawer} />
            <NavItem to="/hr/helpdesk"    icon="🎫" label="Helpdesk"     onNav={closeDrawer} />
          </>
        )}

        {isAdmin && (
          <>
            <SectionLabel>Admin</SectionLabel>
            <NavItem to="/admin/settings" icon="⚙" label="Settings"  onNav={closeDrawer} />
            <NavItem to="/admin/audit"    icon="📋" label="Audit Log" onNav={closeDrawer} />
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
        <ProfilePhoto employee={user} size={30} style={{ background: "var(--charcoal)", color: "var(--lime)" }} />
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
            fontSize: 14, padding: "4px 8px", minWidth: 36, minHeight: 36,
            display: "flex", alignItems: "center", justifyContent: "center",
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
            fontSize: 14, padding: "4px 8px", minWidth: 36, minHeight: 36,
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "color .3s",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = "var(--lime)"}
          onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-faint)"}
        >↪</button>
      </div>
    </>
  );

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* ── Mobile drawer overlay ── */}
      {isMobile && drawerOpen && (
        <div
          onClick={closeDrawer}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,.5)",
            zIndex: 999, animation: "fadeIn .15s ease-out",
          }}
        />
      )}

      {/* ── Sidebar / Drawer ── */}
      {isMobile ? (
        <aside
          style={{
            position: "fixed", top: 0, left: 0, bottom: 0,
            width: 280,
            background: "var(--ink)", color: "var(--text-faint)",
            display: "flex", flexDirection: "column",
            padding: "0 10px",
            zIndex: 1000,
            transform: drawerOpen ? "translateX(0)" : "translateX(-100%)",
            transition: "transform .25s cubic-bezier(.4,0,.2,1)",
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {sidebarContent}
        </aside>
      ) : (
        <aside
          style={{
            width: sidebarWidth, minWidth: MIN_WIDTH, maxWidth: MAX_WIDTH,
            background: "var(--ink)", color: "var(--text-faint)",
            display: "flex", flexDirection: "column",
            padding: "0 10px",
            borderRight: "1px solid rgba(255,255,255,.06)",
            position: "relative",
            flexShrink: 0,
          }}
        >
          {sidebarContent}

          {/* Resize handle (desktop only) */}
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
      )}

      {/* ── Main content ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg)" }}>
        <div style={{
          display: "flex", alignItems: "center",
          justifyContent: isMobile ? "space-between" : "flex-end",
          padding: isMobile ? "8px 12px 0" : "10px 28px 0", flexShrink: 0,
          gap: 8,
        }}>
          {isMobile && (
            <button
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
              style={{
                background: "none", border: "none", cursor: "pointer",
                padding: 8, fontSize: 20, color: "var(--text)",
                display: "flex", alignItems: "center", justifyContent: "center",
                minWidth: 40, minHeight: 40,
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6"/>
                <line x1="3" y1="12" x2="21" y2="12"/>
                <line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
          )}
          {!isMobile && <SearchBar />}
          <NotificationBell />
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "10px 12px 20px" : "14px 28px 24px" }}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
