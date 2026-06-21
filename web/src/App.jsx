import { Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "./hooks/useTheme.jsx";
import { AuthProvider, useAuth } from "./hooks/useAuth.jsx";
import Login from "./pages/Login.jsx";
import ChangePassword from "./pages/ChangePassword.jsx";
import AppShell from "./components/AppShell.jsx";
import MyDashboard from "./pages/MyDashboard.jsx";
import MyProfile from "./pages/MyProfile.jsx";
import MyAttendance from "./pages/MyAttendance.jsx";
import HREmployees from "./pages/HREmployees.jsx";
import HRAttendance from "./pages/HRAttendance.jsx";
import TeamAttendance from "./pages/TeamAttendance.jsx";
import MyLeave from "./pages/MyLeave.jsx";
import TeamApprovals from "./pages/TeamApprovals.jsx";
import TeamCalendar from "./pages/TeamCalendar.jsx";
import HRLeave from "./pages/HRLeave.jsx";
import HRPayroll from "./pages/HRPayroll.jsx";
import HRDashboard from "./pages/HRDashboard.jsx";
import MyPayslips from "./pages/MyPayslips.jsx";
import AdminSettings from "./pages/AdminSettings.jsx";
import AuditLog from "./pages/AuditLog.jsx";
import MyExpenses from "./pages/MyExpenses.jsx";
import TeamExpenses from "./pages/TeamExpenses.jsx";
import HRExpenses from "./pages/HRExpenses.jsx";
import MyInterviews from "./pages/MyInterviews.jsx";
import HRRecruitment from "./pages/HRRecruitment.jsx";
import MyPerformance from "./pages/MyPerformance.jsx";
import TeamPerformance from "./pages/TeamPerformance.jsx";
import HRPerformance from "./pages/HRPerformance.jsx";
import Announcements from "./pages/Announcements.jsx";
import MySurveys from "./pages/MySurveys.jsx";
import RecognitionWall from "./pages/RecognitionWall.jsx";
import HREngagement from "./pages/HREngagement.jsx";
import MyAssets from "./pages/MyAssets.jsx";
import MyTickets from "./pages/MyTickets.jsx";
import HRAssets from "./pages/HRAssets.jsx";
import HRHelpdesk from "./pages/HRHelpdesk.jsx";
import MyResignation from "./pages/MyResignation.jsx";
import Onboarding from "./pages/Onboarding.jsx";
import NotFound from "./pages/NotFound.jsx";

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user)   return <Navigate to="/login" replace />;
  if (user.must_change_pw) return <Navigate to="/change-password" replace />;
  return children;
}

function AuthRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (user) return <Navigate to={user.must_change_pw ? "/change-password" : "/my/dashboard"} replace />;
  return children;
}

function LoadingScreen() {
  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "var(--ink)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div style={{ color: "var(--lime-light)", fontSize: 18, fontWeight: 700 }}>
        Loading…
      </div>
    </div>
  );
}

function HROnly({ children }) {
  const { user } = useAuth();
  if (!["HR", "ADMIN"].includes(user?.role)) {
    return <Navigate to="/my/dashboard" replace />;
  }
  return children;
}

function AdminOnly({ children }) {
  const { user } = useAuth();
  if (user?.role !== "ADMIN") return <Navigate to="/my/dashboard" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={
        <AuthRoute><Login /></AuthRoute>
      } />

      {/* Forced password change */}
      <Route path="/change-password" element={
        <ProtectedRouteForPwChange />
      } />

      {/* Authenticated app shell */}
      <Route path="/" element={
        <ProtectedRoute><AppShell /></ProtectedRoute>
      }>
        {/* My Space */}
        <Route index element={<Navigate to="/my/dashboard" replace />} />
        <Route path="my/dashboard"   element={<MyDashboard />} />
        <Route path="my/attendance"  element={<MyAttendance />} />
        <Route path="my/leave"       element={<MyLeave />} />
        <Route path="my/payslips"    element={<MyPayslips />} />
        <Route path="my/profile"     element={<MyProfile />} />
        <Route path="my/expenses"    element={<MyExpenses />} />
        <Route path="my/interviews"  element={<MyInterviews />} />
        <Route path="my/performance" element={<MyPerformance />} />
        <Route path="my/surveys"     element={<MySurveys />} />
        <Route path="my/assets"      element={<MyAssets />} />
        <Route path="my/tickets"     element={<MyTickets />} />
        <Route path="my/resignation" element={<MyResignation />} />
        <Route path="my/onboarding"  element={<Onboarding />} />

        {/* Engagement (all users) */}
        <Route path="announcements"  element={<Announcements />} />
        <Route path="recognition"    element={<RecognitionWall />} />

        {/* Team */}
        <Route path="team/approvals"  element={<TeamApprovals />} />
        <Route path="team/calendar"   element={<TeamCalendar />} />
        <Route path="team/attendance" element={<TeamAttendance />} />
        <Route path="team/expenses"  element={<TeamExpenses />} />
        <Route path="team/performance" element={<TeamPerformance />} />

        {/* HR */}
        <Route path="hr/employees"  element={<HROnly><HREmployees /></HROnly>} />
        <Route path="hr/attendance" element={<HROnly><HRAttendance /></HROnly>} />
        <Route path="hr/leave"      element={<HROnly><HRLeave /></HROnly>} />
        <Route path="hr/payroll"    element={<HROnly><HRPayroll /></HROnly>} />
        <Route path="hr/expenses"     element={<HROnly><HRExpenses /></HROnly>} />
        <Route path="hr/recruitment"  element={<HROnly><HRRecruitment /></HROnly>} />
        <Route path="hr/performance"  element={<HROnly><HRPerformance /></HROnly>} />
        <Route path="hr/engagement"  element={<HROnly><HREngagement /></HROnly>} />
        <Route path="hr/assets"      element={<HROnly><HRAssets /></HROnly>} />
        <Route path="hr/helpdesk"    element={<HROnly><HRHelpdesk /></HROnly>} />
        <Route path="hr/dashboard"  element={<HROnly><HRDashboard /></HROnly>} />

        {/* Admin */}
        <Route path="admin/settings" element={<AdminOnly><AdminSettings /></AdminOnly>} />
        <Route path="admin/audit" element={<AdminOnly><AuditLog /></AdminOnly>} />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function ProtectedRouteForPwChange() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user)   return <Navigate to="/login" replace />;
  if (!user.must_change_pw) return <Navigate to="/my/dashboard" replace />;
  return <ChangePassword />;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </ThemeProvider>
  );
}