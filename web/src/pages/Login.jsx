import { useState } from "react";
import { useAuth } from "../hooks/useAuth.jsx";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

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
      {/* Subtle lime accent shape */}
      <div style={{
        position: "absolute", top: -120, right: -80,
        width: 420, height: 420,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(223,241,64,.07) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      <div
        style={{
          width: 380,
          background: "rgba(255,255,255,.04)",
          border: "1px solid rgba(255,255,255,.1)",
          borderRadius: 4,
          padding: "40px 36px",
          color: "#fff",
          animation: "fadeIn .4s ease",
          position: "relative",
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
                background: "rgba(255,255,255,.06)", borderColor: "rgba(255,255,255,.15)", color: "#fff",
                borderRadius: "var(--r-card) 0 0 var(--r-card)", borderRight: "none", flex: 1,
              }}
            />
            <span style={{
              padding: "7px 12px", background: "rgba(255,255,255,.03)",
              border: "1px solid rgba(255,255,255,.15)", borderLeft: "none",
              borderRadius: "0 var(--r-card) var(--r-card) 0",
              color: "rgba(255,255,255,.35)", fontSize: 13, whiteSpace: "nowrap",
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
            style={{ background: "rgba(255,255,255,.06)", borderColor: "rgba(255,255,255,.15)", color: "#fff", borderRadius: "var(--r-card)" }}
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

        <div style={{ marginTop: 24, fontSize: 11, color: "rgba(255,255,255,.2)", textAlign: "center", letterSpacing: ".03em" }}>
          Internal tool · Data stays on company systems
        </div>
      </div>
    </div>
  );
}
