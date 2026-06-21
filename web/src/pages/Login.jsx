import { useState } from "react";
import { useAuth } from "../hooks/useAuth.jsx";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [showForgot, setShowForgot] = useState(false);

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

  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "var(--ink)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {/* Ambient lime glow — top-right */}
      <div style={{
        position: "absolute", top: -140, right: -100,
        width: 480, height: 480,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(25,25,112,.14) 0%, transparent 65%)",
        pointerEvents: "none",
      }} />
      {/* Ambient lime glow — bottom-left */}
      <div style={{
        position: "absolute", bottom: -120, left: -80,
        width: 360, height: 360,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(25,25,112,.10) 0%, transparent 65%)",
        pointerEvents: "none",
      }} />

      <div
        style={{
          width: 390,
          background: "rgba(255,255,255,.06)",
          border: "1px solid rgba(255,255,255,.14)",
          borderRadius: "var(--r-card)",
          padding: "44px 40px",
          color: "#fff",
          animation: "fadeIn .4s ease",
          position: "relative",
          boxShadow: "0 24px 60px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.06)",
        }}
      >
        {/* Logo */}
        <div style={{ marginBottom: 8 }}>
          <img
            src="/logo.png"
            alt="Genesys HRMS"
            style={{
              height: 28,
              width: "auto",
              filter: "brightness(0) invert(1)",
              opacity: 0.9,
              display: "block",
            }}
          />
        </div>
        <div style={{ color: "rgba(255,255,255,.35)", fontSize: 12, margin: "0 0 28px", letterSpacing: ".02em" }}>
          Genesys International Corporation Ltd · People Operations
        </div>

        <form onSubmit={handleSubmit}>
          <label style={{ display: "block", fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".08em", color: "rgba(255,255,255,.4)", margin: "0 0 6px" }}>
            Username
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="yourname"
              autoComplete="username"
              required
              style={{
                background: "rgba(255,255,255,.07)", borderColor: "rgba(255,255,255,.16)", color: "#fff",
                borderRadius: "10px 0 0 10px", borderRight: "none", flex: 1,
              }}
            />
            <span style={{
              padding: "7px 14px", background: "rgba(255,255,255,.03)",
              border: "1px solid rgba(255,255,255,.16)", borderLeft: "none",
              borderRadius: "0 10px 10px 0",
              color: "rgba(255,255,255,.40)", fontSize: 13, whiteSpace: "nowrap",
              userSelect: "none",
            }}>@igenesys.com</span>
          </div>

          <label style={{ display: "block", fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".08em", color: "rgba(255,255,255,.4)", margin: "16px 0 6px" }}>
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            required
            style={{ background: "rgba(255,255,255,.07)", borderColor: "rgba(255,255,255,.16)", color: "#fff", borderRadius: 10 }}
          />

          {error && (
            <div style={{
              color: "var(--danger)", fontSize: 12.5, marginTop: 12,
              background: "rgba(255,53,53,.1)", border: "1px solid rgba(255,53,53,.25)",
              borderRadius: "var(--r-card)", padding: "8px 12px",
            }}>{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary"
            style={{
              width: "100%", marginTop: 22,
              padding: "12px", fontSize: 13.5,
              opacity: loading ? 0.65 : 1,
            }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {showForgot ? (
          <div style={{
            marginTop: 18,
            padding: "14px 16px",
            background: "rgba(25,25,112,.10)",
            border: "1px solid rgba(25,25,112,.20)",
            borderRadius: "var(--r-card)",
            fontSize: 12.5,
            color: "rgba(255,255,255,.65)",
            lineHeight: 1.55,
          }}>
            <div style={{ fontWeight: 700, color: "var(--lime-light)", marginBottom: 6, fontSize: 11.5, textTransform: "uppercase", letterSpacing: ".06em" }}>
              Password reset
            </div>
            Contact your <strong style={{ color: "#fff" }}>HR or IT helpdesk</strong> to
            reset your password. They will set a temporary password and you'll be
            prompted to change it on your next login.
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowForgot(true)}
            style={{
              display: "block",
              width: "100%",
              marginTop: 16,
              background: "none",
              border: "none",
              color: "rgba(255,255,255,.35)",
              fontSize: 12,
              cursor: "pointer",
              textAlign: "center",
              padding: "4px 0",
              transition: "color .2s",
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = "var(--lime-light)"}
            onMouseLeave={(e) => e.currentTarget.style.color = "rgba(255,255,255,.35)"}
          >
            Forgot password?
          </button>
        )}

        <div style={{ marginTop: 16, fontSize: 11, color: "rgba(255,255,255,.2)", textAlign: "center", letterSpacing: ".03em" }}>
          Internal tool · Data stays on company systems
        </div>
      </div>
    </div>
  );
}
