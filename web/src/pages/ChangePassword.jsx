import { useState } from "react";
import { auth as authApi } from "../lib/api.js";
import { useAuth } from "../hooks/useAuth.jsx";

export default function ChangePassword() {
  const { logout, refreshUser } = useAuth();
  const [current, setCurrent]   = useState("");
  const [newPw, setNewPw]       = useState("");
  const [confirm, setConfirm]   = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (newPw !== confirm) { setError("Passwords do not match"); return; }
    if (newPw.length < 8)  { setError("Password must be at least 8 characters"); return; }
    setLoading(true);
    try {
      await authApi.changePassword(current, newPw);
      await refreshUser();
    } catch (err) {
      setError(err.message || "Failed to change password");
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
      {/* Ambient top-right glow */}
      <div style={{
        position: "absolute", top: -140, right: -100,
        width: 400, height: 400,
        borderRadius: "50%",
        background: "none",
        pointerEvents: "none",
      }} />
      {/* Ambient bottom-left glow */}
      <div style={{
        position: "absolute", bottom: -100, left: -60,
        width: 340, height: 340,
        borderRadius: "50%",
        background: "none",
        pointerEvents: "none",
      }} />

      <div
        style={{
          width: 410,
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
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <div
            style={{
              width: 40, height: 40, borderRadius: "var(--r-pill)",
              background: "var(--lime)", color: "var(--bg)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 800, fontSize: 18, fontFamily: "var(--font-display)",
            }}
          >G</div>
          <h1 style={{ fontSize: 20, color: "#fff", fontFamily: "var(--font-display)", letterSpacing: "-.02rem" }}>
            Set new password
          </h1>
        </div>

        <div style={{
          color: "rgba(255,255,255,.7)", fontSize: 12.5,
          margin: "4px 0 24px",
          background: "rgba(255,53,53,.08)",
          border: "1px solid rgba(255,53,53,.2)",
          borderRadius: "var(--r-card)", padding: "10px 14px",
        }}>
          You must change your password before continuing.
        </div>

        <form onSubmit={handleSubmit}>
          {[
            { label: "Current password",    val: current, set: setCurrent, auto: "current-password" },
            { label: "New password",         val: newPw,   set: setNewPw,   auto: "new-password" },
            { label: "Confirm new password", val: confirm, set: setConfirm, auto: "new-password" },
          ].map(({ label, val, set, auto }) => (
            <div key={label} style={{ marginTop: 16 }}>
              <label style={{ display: "block", fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".08em", color: "rgba(255,255,255,.4)", marginBottom: 6 }}>
                {label}
              </label>
              <input
                type="password"
                value={val}
                onChange={(e) => set(e.target.value)}
                autoComplete={auto}
                required
                style={{ background: "rgba(255,255,255,.06)", borderColor: "rgba(255,255,255,.15)", color: "#fff", borderRadius: "var(--r-card)" }}
              />
            </div>
          ))}

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
            style={{ width: "100%", marginTop: 22, padding: "12px", fontSize: 13.5, opacity: loading ? 0.65 : 1 }}
          >
            {loading ? "Saving…" : "Set password & continue"}
          </button>
        </form>

        <div style={{ marginTop: 16, textAlign: "center" }}>
          <button
            onClick={logout}
            style={{ background: "none", border: "none", color: "rgba(255,255,255,.3)", fontSize: 12, cursor: "pointer", fontFamily: "var(--font-ui)", letterSpacing: ".03em" }}
          >
            Sign out instead
          </button>
        </div>
      </div>
    </div>
  );
}
