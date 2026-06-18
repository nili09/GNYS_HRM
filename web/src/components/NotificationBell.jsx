import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import { useIsMobile } from "../hooks/useIsMobile.jsx";

export default function NotificationBell() {
  const isMobile = useIsMobile();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  const fetchCount = useCallback(async () => {
    try {
      const res = await api.get("/notifications/unread-count");
      setCount(res.data.count);
    } catch { /* ignore */ }
  }, []);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/notifications?limit=20");
      setNotifications(res.data.rows || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCount();
    const iv = setInterval(fetchCount, 30000);
    return () => clearInterval(iv);
  }, [fetchCount]);

  // Listen for SSE notification events
  useEffect(() => {
    const handleSSE = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "notification") {
          setCount(c => c + 1);
          setNotifications(prev => [data.notification, ...prev].slice(0, 20));
        }
      } catch { /* ignore */ }
    };

    const es = window.__sseSource;
    if (es) es.addEventListener("message", handleSSE);
    return () => { if (es) es.removeEventListener("message", handleSSE); };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleOpen = () => {
    setOpen(!open);
    if (!open) fetchNotifications();
  };

  const markRead = async (notif) => {
    if (!notif.read) {
      try {
        await api.post(`/notifications/${notif.id}/read`);
        setCount(c => Math.max(0, c - 1));
        setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: 1 } : n));
      } catch { /* ignore */ }
    }
    if (notif.link) {
      navigate(notif.link);
      setOpen(false);
    }
  };

  const markAllRead = async () => {
    try {
      await api.post("/notifications/read-all");
      setCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, read: 1 })));
    } catch { /* ignore */ }
  };

  const timeAgo = (ts) => {
    const diff = Date.now() - new Date(ts + "Z").getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={handleOpen}
        aria-label="Notifications"
        style={{
          background: "transparent", border: "none", cursor: "pointer",
          position: "relative", padding: 6, display: "flex", alignItems: "center",
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {count > 0 && (
          <span style={{
            position: "absolute", top: 2, right: 2,
            background: "#ef4444", color: "#fff",
            fontSize: 10, fontWeight: 700,
            minWidth: 16, height: 16,
            borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
            padding: "0 4px",
          }}>
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: isMobile ? "fixed" : "absolute",
          top: isMobile ? 50 : "100%",
          right: isMobile ? 8 : 0,
          left: isMobile ? 8 : "auto",
          width: isMobile ? "auto" : 360,
          maxHeight: isMobile ? "70vh" : 440,
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 8, boxShadow: "0 8px 32px rgba(0,0,0,.3)",
          zIndex: 1000, display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 16px", borderBottom: "1px solid var(--border)",
          }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>Notifications</span>
            {count > 0 && (
              <button
                onClick={markAllRead}
                style={{
                  background: "transparent", border: "none", cursor: "pointer",
                  color: "var(--lime)", fontSize: 12, fontWeight: 600,
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          <div style={{ overflowY: "auto", flex: 1 }}>
            {loading && notifications.length === 0 && (
              <div style={{ padding: 24, textAlign: "center", color: "var(--text-faint)", fontSize: 13 }}>Loading...</div>
            )}
            {!loading && notifications.length === 0 && (
              <div style={{ padding: 24, textAlign: "center", color: "var(--text-faint)", fontSize: 13 }}>No notifications yet</div>
            )}
            {notifications.map(n => (
              <div
                key={n.id}
                onClick={() => markRead(n)}
                style={{
                  padding: "10px 16px",
                  cursor: n.link ? "pointer" : "default",
                  borderBottom: "1px solid var(--border)",
                  background: n.read ? "transparent" : "rgba(223,241,64,.05)",
                  transition: "background .15s",
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,.04)"}
                onMouseLeave={(e) => e.currentTarget.style.background = n.read ? "transparent" : "rgba(223,241,64,.05)"}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <span style={{
                    fontWeight: n.read ? 400 : 600,
                    fontSize: 13, color: "var(--text)",
                    flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {!n.read && <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 3, background: "var(--lime)", marginRight: 6, verticalAlign: "middle" }} />}
                    {n.title}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-faint)", whiteSpace: "nowrap", flexShrink: 0 }}>
                    {timeAgo(n.created_at)}
                  </span>
                </div>
                {n.body && (
                  <div style={{
                    fontSize: 12, color: "var(--text-faint)", marginTop: 3,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {n.body}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
