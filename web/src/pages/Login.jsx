import { useState } from "react";
import { useAuth } from "../hooks/useAuth.jsx";
import { useIsMobile } from "../hooks/useIsMobile.jsx";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const isMobile = useIsMobile();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  const label = { display: "block", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".08em", color: "#0a0a0a", margin: "0 0 8px" };
  const field = { background: "#fff", borderColor: "#0a0a0a", color: "#0a0a0a", height: 46, fontSize: 15 };

  return (
    <div
      style={{
        position: "fixed", inset: 0,
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 7fr) minmax(400px, 5fr)",
        gridTemplateRows: isMobile ? "auto 1fr" : "1fr",
        background: "#ffffff", color: "#0a0a0a",
        overflowY: "auto",
      }}
    >
      {/* ── Left: the poster ── */}
      <div style={{
        background: "#0a0a0a", color: "#fff",
        padding: isMobile ? "28px 20px 32px" : "48px 56px",
        display: "flex", flexDirection: "column", justifyContent: "space-between",
        minHeight: isMobile ? 220 : "100%",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <img
            src="/logo.png"
            alt="Genesys HRMS"
            style={{ height: isMobile ? 22 : 26, width: "auto", filter: "brightness(0) invert(1)", display: "block" }}
          />
          <span style={{ width: 14, height: 14, background: "var(--signal)", display: "block" }} />
        </div>

        <div>
          <div style={{
            fontSize: isMobile ? 48 : "clamp(64px, 8.4vw, 132px)",
            fontWeight: 700, lineHeight: .9, letterSpacing: "-.055em",
            margin: isMobile ? "36px 0 0" : "0 0 36px",
          }}>
            People<br />Operations<span style={{ color: "var(--signal)" }}>.</span>
          </div>
          {!isMobile && <div style={{
            display: "grid", gridTemplateColumns: "repeat(3, auto)", justifyContent: "start", gap: 40,
            borderTop: "1px solid rgba(255,255,255,.9)", paddingTop: 12,
            fontSize: 12, color: "rgba(255,255,255,.62)",
          }}>
            <span>Genesys International<br />Corporation Ltd</span>
            <span>Attendance, leave,<br />payroll, people</span>
            <span>Internal system<br />Data stays on company servers</span>
          </div>}
        </div>
      </div>

      {/* ── Right: the form ── */}
      <div style={{
        display: "flex", flexDirection: "column", justifyContent: "center",
        padding: isMobile ? "32px 20px 40px" : "48px 64px",
      }}>
        <div style={{ width: "100%", maxWidth: 380, animation: "fadeIn .3s linear" }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: "#5f5f5c", marginBottom: 10 }}>
            Genesys HRMS
          </div>
          <h1 style={{ fontSize: 40, letterSpacing: "-.035em", lineHeight: 1, margin: "0 0 32px", paddingBottom: 18, borderBottom: "2px solid #0a0a0a" }}>
            Sign in
          </h1>

        <form onSubmit={handleSubmit}>
          <label style={label}>
            Username
          </label>
          <div style={{ display: "flex", alignItems: "stretch", gap: 0 }}>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="yourname"
              autoComplete="username"
              required
              style={{ ...field, borderRight: "none", flex: 1 }}
            />
            <span style={{
              padding: "0 14px", display: "flex", alignItems: "center",
              border: "1px solid #0a0a0a", borderLeft: "1px solid #d9d9d6",
              color: "#5f5f5c", fontSize: 14, whiteSpace: "nowrap",
              userSelect: "none",
            }}>@igenesys.com</span>
          </div>

          <label style={{ ...label, marginTop: 20 }}>
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            required
            style={field}
          />

          {error && (
            <div style={{
              color: "#a50e0e", fontSize: 13, marginTop: 14,
              borderLeft: "3px solid var(--signal)", padding: "6px 12px",
              background: "#fbe6e6",
            }}>{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary"
            style={{
              width: "100%", marginTop: 28, height: 50,
              fontSize: 15, justifyContent: "space-between",
              background: "#0a0a0a", borderColor: "#0a0a0a", color: "#fff",
              opacity: loading ? 0.65 : 1,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--signal)"; e.currentTarget.style.borderColor = "var(--signal)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "#0a0a0a"; e.currentTarget.style.borderColor = "#0a0a0a"; }}
          >
            <span>{loading ? "Signing in…" : "Sign in"}</span>
            <span aria-hidden="true">→</span>
          </button>
        </form>

        {showForgot ? (
          <div style={{
            marginTop: 20,
            padding: "12px 0 0",
            borderTop: "1px solid #0a0a0a",
            fontSize: 13,
            color: "#3a3a38",
            lineHeight: 1.55,
          }}>
            <div style={{ fontWeight: 600, color: "#0a0a0a", marginBottom: 6, fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em" }}>
              Password reset
            </div>
            Contact your <strong style={{ color: "#0a0a0a" }}>HR or IT helpdesk</strong> to
            reset your password. They will set a temporary password and you'll be
            prompted to change it on your next login.
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowForgot(true)}
            style={{
              display: "block",
              marginTop: 18,
              background: "none",
              border: "none",
              color: "#0a0a0a",
              fontSize: 13,
              cursor: "pointer",
              textAlign: "left",
              padding: "4px 0",
              textDecoration: "underline",
              textUnderlineOffset: 3,
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = "var(--signal)"}
            onMouseLeave={(e) => e.currentTarget.style.color = "#0a0a0a"}
          >
            Forgot password?
          </button>
        )}
        </div>
      </div>
    </div>
  );
}
