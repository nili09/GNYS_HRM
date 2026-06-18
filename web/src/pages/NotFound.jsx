import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "var(--ink)",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#fff",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 420, padding: "0 24px" }}>
        <div style={{
          fontSize: 72, fontWeight: 800, lineHeight: 1,
          color: "var(--lime)", marginBottom: 12,
          fontFamily: "var(--font-display), sans-serif",
        }}>404</div>
        <div style={{
          fontSize: 16, fontWeight: 600, marginBottom: 8,
          letterSpacing: ".02em",
        }}>
          That page doesn't exist or moved
        </div>
        <div style={{
          fontSize: 13, color: "rgba(255,255,255,.4)",
          marginBottom: 28, lineHeight: 1.5,
        }}>
          The link you followed may be outdated or mistyped. Check the URL and try again.
        </div>
        <Link
          to="/my/dashboard"
          className="btn-primary"
          style={{
            display: "inline-block",
            padding: "10px 28px",
            fontSize: 13,
            textDecoration: "none",
          }}
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
