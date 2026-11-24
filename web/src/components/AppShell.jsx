import { useState, useEffect, useCallback, useRef } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.jsx";
import { useTheme } from "../hooks/useTheme.jsx";
import { useIsMobile } from "../hooks/useIsMobile.jsx";
import { api } from "../lib/api.js";
import SearchBar from "./SearchBar.jsx";
import NotificationBell from "./NotificationBell.jsx";
import ProfilePhoto from "./ProfilePhoto.jsx";
import Icon from "./Icon.jsx";

function NavItem({ to, icon, label, badge, onNav }) {
  const [hovered, setHovered] = useState(false);

  return (
    <NavLink
      to={to}
      onClick={onNav}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={({ isActive }) => ({
        display: "flex", alignItems: "center", gap: 10,
        padding: "6px 10px 6px 12px",
        borderRadius: 0,
        color: isActive ? "var(--sidebar-fg-active)" : hovered ? "var(--sidebar-fg-hover)" : "var(--sidebar-fg)",
        fontSize: 13.5, textDecoration: "none",
        cursor: "pointer",
        transition: "color .15s linear",
        borderLeft: isActive ? "3px solid var(--signal)" : "3px solid transparent",
        background: "transparent",
        fontWeight: isActive ? 600 : 400,
        letterSpacing: "-.01em",
        minHeight: 34,
      })}
    >
      {({ isActive }) => (<>
      <Icon name={icon} style={{ flexShrink: 0, fontSize: 17, opacity: isActive ? 1 : .55 }} />
      <span style={{ flex: 1 }}>{label}</span>
      {badge > 0 && (
        <span style={{
          minWidth: 20, height: 18, borderRadius: 0,
          background: "var(--signal)",
          color: "var(--signal-ink)", fontSize: 10.5, fontWeight: 600,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "0 5px",
        }}>{badge}</span>
      )}
      </>)}
    </NavLink>
  );
}

function SectionLabel({ n, children }) {
  return (
    <div style={{
      display: "flex", gap: 10, alignItems: "baseline",
      fontSize: 10.5, fontWeight: 600, letterSpacing: ".08em",
      color: "var(--sidebar-fg-hover)", textTransform: "uppercase",
      padding: "8px 12px 6px 15px", margin: "18px 0 4px",
      borderTop: "1px solid var(--sidebar-fg-hover)",
    }}>
      <span style={{ color: "var(--sidebar-muted)", fontVariantNumeric: "tabular-nums" }}>{n}</span>
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
        if (d.entity === "interviews" || d.entity === "surveys") fetchModuleCounts();
        // Relay notification events to NotificationBell via a window CustomEvent so
        // the bell doesn't need to hold its own EventSource reference (avoids the
        // child-effect-before-parent-effect race that kept the bell silent).
        if (d.type === "notification" && d.notification) {
          window.dispatchEvent(new CustomEvent("hrms:notification", { detail: d.notification }));
        }
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
          padding: "24px 6px 20px 15px",
          marginBottom: 0,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}
      >
        <div>
          <img
            src="/logo.png"
            alt="Genesys HRMS"
            style={{
              height: 22, width: "auto",
              filter: theme === "dark" ? "brightness(0) invert(1)" : "none",
              opacity: 1, display: "block",
            }}
          />
          <span style={{ fontSize: 11, color: "var(--sidebar-muted)", marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 7, height: 7, background: "var(--signal)", display: "inline-block" }} />
            People Operations
          </span>
        </div>
        {isMobile && (
          <button
            onClick={closeDrawer}
            style={{
              background: "none", border: "none", color: "var(--sidebar-fg)",
              fontSize: 22, cursor: "pointer", padding: "4px 8px", lineHeight: 1,
            }}
            aria-label="Close menu"
          >
            <Icon name="close" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="sidebar-scroll" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 1, overflowY: "auto" }}>
        <SectionLabel n="01">My Space</SectionLabel>
        <NavItem to="/my/dashboard"   icon="dashboard"              label="Dashboard"  onNav={closeDrawer} />
        <NavItem to="/my/attendance"  icon="schedule"               label="Attendance" onNav={closeDrawer} />
        <NavItem to="/my/leave"       icon="beach_access"           label="Apply Leave" onNav={closeDrawer} />
        <NavItem to="/my/payslips"    icon="payments"               label="Payslips"   onNav={closeDrawer} />
        <NavItem to="/my/expenses"    icon="account_balance_wallet" label="Expenses"   onNav={closeDrawer} />
        {interviewCount > 0 && <NavItem to="/my/interviews"  icon="mic"                label="My Interviews" onNav={closeDrawer} />}
        <NavItem to="/my/performance" icon="insights"               label="Performance" onNav={closeDrawer} />
        {surveyCount > 0 && <NavItem to="/my/surveys" icon="assignment"             label="Surveys" onNav={closeDrawer} />}
        <NavItem to="/my/assets"      icon="laptop_mac"             label="My Assets"   onNav={closeDrawer} />
        <NavItem to="/my/tickets"     icon="confirmation_number"    label="My Tickets"  onNav={closeDrawer} />
        <NavItem to="/my/profile"     icon="person"                 label="Profile"     onNav={closeDrawer} />
        <NavItem to="/my/resignation" icon="description"            label="Resignation" onNav={closeDrawer} />
        {user?.status === "ONBOARDING" && <NavItem to="/my/onboarding" icon="rocket_launch" label="Onboarding" onNav={closeDrawer} />}

        <SectionLabel n="02">Engage</SectionLabel>
        <NavItem to="/announcements" icon="campaign"     label="Announcements" onNav={closeDrawer} />
        <NavItem to="/recognition"   icon="emoji_events" label="Recognition"   onNav={closeDrawer} />

        {showTeam && (
          <>
            <SectionLabel n="03">Team</SectionLabel>
            <NavItem to="/team/approvals"    icon="task_alt"               label="Approvals" badge={pendingCount} onNav={closeDrawer} />
            <NavItem to="/team/calendar"     icon="calendar_month"         label="Calendar"  onNav={closeDrawer} />
            <NavItem to="/team/attendance"   icon="schedule"               label="Team Attendance" onNav={closeDrawer} />
            <NavItem to="/team/attendance-approvals" icon="fact_check"     label="Attendance Approvals" onNav={closeDrawer} />
            <NavItem to="/team/expenses"     icon="account_balance_wallet" label="Team Expenses"   onNav={closeDrawer} />
            <NavItem to="/team/performance"  icon="insights"               label="Team Performance" onNav={closeDrawer} />
          </>
        )}

        {isHR && (
          <>
            <SectionLabel n={showTeam ? "04" : "03"}>HR</SectionLabel>
            <NavItem to="/hr/dashboard"   icon="dashboard"              label="HR Dashboard" onNav={closeDrawer} />
            <NavItem to="/hr/employees"   icon="groups"                 label="Employees"    onNav={closeDrawer} />
            <NavItem to="/hr/attendance"  icon="schedule"               label="Attendance"   onNav={closeDrawer} />
            <NavItem to="/hr/leave"       icon="beach_access"           label="Leave" badge={pendingCount} onNav={closeDrawer} />
            <NavItem to="/hr/payroll"     icon="payments"               label="Payroll"      onNav={closeDrawer} />
            <NavItem to="/hr/expenses"    icon="account_balance_wallet" label="Expenses"     onNav={closeDrawer} />
            <NavItem to="/hr/recruitment" icon="work"                   label="Recruitment"  onNav={closeDrawer} />
            <NavItem to="/hr/performance" icon="insights"               label="Performance"  onNav={closeDrawer} />
            <NavItem to="/hr/engagement"  icon="forum"                  label="Engagement"   onNav={closeDrawer} />
            <NavItem to="/hr/assets"      icon="laptop_mac"             label="Assets"       onNav={closeDrawer} />
            <NavItem to="/hr/helpdesk"    icon="confirmation_number"    label="Helpdesk"     onNav={closeDrawer} />
          </>
        )}

        {isAdmin && (
          <>
            <SectionLabel n={showTeam ? "05" : "04"}>Admin</SectionLabel>
            <NavItem to="/admin/settings" icon="settings"     label="Settings"  onNav={closeDrawer} />
            <NavItem to="/admin/audit"    icon="receipt_long" label="Audit Log" onNav={closeDrawer} />
          </>
        )}
      </nav>

      {/* User footer */}
      <div
        style={{
          padding: "12px 6px 16px 12px",
          borderTop: "1px solid var(--sidebar-fg-hover)",
          display: "flex", alignItems: "center", gap: 10,
        }}
      >
        <ProfilePhoto employee={user} size={30} style={{ background: "var(--text)", color: "var(--bg)" }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "var(--sidebar-fg-hover)", fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user?.name}</div>
          <div style={{ fontSize: 10.5, color: "var(--sidebar-muted)", letterSpacing: ".08em", textTransform: "uppercase" }}>{user?.role}</div>
        </div>
        <button
          onClick={toggleTheme}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          style={{
            background: "none", border: "none",
            color: "var(--sidebar-fg)", cursor: "pointer",
            fontSize: 14, padding: "4px 8px", minWidth: 36, minHeight: 36,
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "color .3s",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = "var(--signal)"}
          onMouseLeave={(e) => e.currentTarget.style.color = "var(--sidebar-fg)"}
        >
          <Icon name={theme === "dark" ? "light_mode" : "dark_mode"} />
        </button>
        <button
          onClick={handleLogout}
          aria-label="Sign out"
          title="Sign out"
          style={{
            background: "none", border: "none",
            color: "var(--sidebar-fg)", cursor: "pointer",
            fontSize: 14, padding: "4px 8px", minWidth: 36, minHeight: 36,
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "color .3s",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = "var(--signal)"}
          onMouseLeave={(e) => e.currentTarget.style.color = "var(--sidebar-fg)"}
        >
          <Icon name="logout" />
        </button>
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
            position: "fixed", inset: 0, background: "var(--overlay)",
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
            background: "var(--sidebar-bg)", color: "var(--sidebar-fg)",
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
            background: "var(--sidebar-bg)", color: "var(--sidebar-fg)",
            display: "flex", flexDirection: "column",
            padding: "0 10px",
            borderRight: "1px solid var(--sidebar-border)",
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
              left: 2, width: 2, borderRadius: 0,
              background: "transparent",
              transition: "background .2s",
            }}
              onMouseEnter={(e) => e.currentTarget.style.background = "var(--signal)"}
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
          padding: isMobile ? "10px 14px 10px" : "12px 40px 12px", flexShrink: 0,
          gap: 10,
          borderBottom: "1px solid var(--line)",
          background: "var(--bg)",
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
        <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "20px 16px 28px" : "36px 40px 48px" }}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
