import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../hooks/useAuth.jsx";

const PRIORITY_COLORS = {
  URGENT: "#ef4444",
  IMPORTANT: "#f59e0b",
  NORMAL: "#3b82f6",
};

const PRIORITY_BG = {
  URGENT: "#fef2f2",
  IMPORTANT: "#fffbeb",
  NORMAL: "#eff6ff",
};

function fmtDate(d) {
  if (!d) return "";
  const dt = new Date(d.includes("T") ? d : d + "T00:00:00");
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function Announcements() {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchAnnouncements = useCallback(async () => {
    try {
      const data = await api.get("/engagement/announcements");
      setAnnouncements(data);
    } catch (err) {
      setError(err.data?.error || err.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  useEffect(() => {
    let es;
    try {
      es = new EventSource("/api/events", { withCredentials: true });
      es.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data);
          if (d.entity === "announcements") fetchAnnouncements();
        } catch { /* ignore */ }
      };
    } catch { /* ignore */ }
    const poll = setInterval(fetchAnnouncements, 30000);
    return () => { es?.close(); clearInterval(poll); };
  }, [fetchAnnouncements]);

  if (loading) {
    return <div style={{ padding: 20, color: "#64748b" }}>Loading...</div>;
  }

  if (error) {
    return <div style={{ padding: 20, color: "#ef4444" }}>{error}</div>;
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 18 }}>Announcements</h1>

      {announcements.length === 0 && (
        <div style={{
          background: "#fff",
          borderRadius: 10,
          padding: 32,
          border: "1px solid #e2e8f0",
          textAlign: "center",
          color: "#94a3b8",
          fontSize: 14,
        }}>
          No announcements at this time.
        </div>
      )}

      {announcements.map((a) => {
        const priorityColor = PRIORITY_COLORS[a.priority] || PRIORITY_COLORS.NORMAL;
        const isUrgent = a.priority === "URGENT";
        const isImportant = a.priority === "IMPORTANT";

        return (
          <div
            key={a.id}
            style={{
              background: "#fff",
              borderRadius: 10,
              padding: 16,
              border: "1px solid #e2e8f0",
              marginBottom: 12,
              borderLeft: isUrgent
                ? "4px solid #ef4444"
                : isImportant
                  ? "4px solid #f59e0b"
                  : "4px solid #e2e8f0",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{
                padding: "2px 8px",
                borderRadius: 10,
                fontSize: 11,
                fontWeight: 600,
                background: PRIORITY_BG[a.priority] || PRIORITY_BG.NORMAL,
                color: priorityColor,
                textTransform: "uppercase",
                letterSpacing: "0.03em",
              }}>
                {a.priority}
              </span>
              <span style={{ fontSize: 16, fontWeight: 700, color: "#0d152c" }}>
                {a.title}
              </span>
            </div>

            <div style={{ fontSize: 14, color: "#334155", lineHeight: 1.6, marginBottom: 12 }}>
              {a.body}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 12, color: "#94a3b8" }}>
              <span>Published by <span style={{ fontWeight: 600, color: "#64748b" }}>{a.published_by_name}</span></span>
              <span>{fmtDate(a.published_at)}</span>
              {a.expires_at && (
                <span>Expires {fmtDate(a.expires_at)}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
