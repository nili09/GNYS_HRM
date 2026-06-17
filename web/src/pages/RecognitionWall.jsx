import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../hooks/useAuth.jsx";

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const now = new Date();
  const then = new Date(dateStr);
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths}mo ago`;
}

export default function RecognitionWall() {
  const { user } = useAuth();

  // Feed state
  const [feed, setFeed] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [feedLoading, setFeedLoading] = useState(true);

  // Badges for the give form
  const [badges, setBadges] = useState([]);

  // Give recognition form
  const [form, setForm] = useState({ to_employee: "", badge_id: "", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  const fetchFeed = useCallback(async (p) => {
    setFeedLoading(true);
    try {
      const data = await api.get(`/engagement/recognitions/feed?page=${p}&limit=20`);
      setFeed(data.data);
      setPage(data.page);
      setTotalPages(data.totalPages);
    } catch { /* ignore */ }
    setFeedLoading(false);
  }, []);

  const fetchBadges = useCallback(async () => {
    try {
      const data = await api.get("/engagement/badges");
      setBadges(data);
      if (data.length > 0) {
        setForm((f) => f.badge_id ? f : { ...f, badge_id: String(data[0].id) });
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchFeed(1);
    fetchBadges();
  }, [fetchFeed, fetchBadges]);

  useEffect(() => {
    let es;
    try {
      es = new EventSource("/api/events", { withCredentials: true });
      es.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data);
          if (d.entity === "recognitions" || d.entity === "badges") {
            fetchFeed(page);
            fetchBadges();
          }
        } catch { /* ignore */ }
      };
    } catch { /* ignore */ }
    return () => { es?.close(); };
  }, [fetchFeed, fetchBadges, page]);

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");
    setSubmitting(true);

    const toEmpId = parseInt(form.to_employee, 10);
    if (!toEmpId || isNaN(toEmpId)) {
      setFormError("Please enter a valid employee ID.");
      setSubmitting(false);
      return;
    }
    if (!form.badge_id) {
      setFormError("Please select a badge.");
      setSubmitting(false);
      return;
    }

    try {
      await api.post("/engagement/recognitions", {
        to_employee: toEmpId,
        badge_id: parseInt(form.badge_id, 10),
        message: form.message || null,
      });
      setFormSuccess("Recognition sent!");
      setForm({ to_employee: "", badge_id: badges.length > 0 ? String(badges[0].id) : "", message: "" });
      fetchFeed(1);
      setTimeout(() => setFormSuccess(""), 3000);
    } catch (err) {
      setFormError(err.data?.error || err.message);
    }
    setSubmitting(false);
  }

  function handlePageChange(newPage) {
    if (newPage < 1 || newPage > totalPages) return;
    fetchFeed(newPage);
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 18 }}>Recognition Wall</h1>

      {/* Give Recognition Form */}
      <div style={{
        background: "#fff",
        borderRadius: 10,
        padding: 20,
        border: "1px solid #e2e8f0",
        marginBottom: 24,
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#0d152c", marginBottom: 14 }}>
          Give Recognition
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Employee ID</label>
              <input
                type="number"
                min="1"
                value={form.to_employee}
                onChange={(e) => setForm({ ...form, to_employee: e.target.value })}
                placeholder="Enter recipient's employee ID"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Badge</label>
              <select
                value={form.badge_id}
                onChange={(e) => setForm({ ...form, badge_id: e.target.value })}
                style={inputStyle}
              >
                <option value="">Select a badge...</option>
                {badges.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.icon} {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Message (optional)</label>
            <textarea
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              rows={2}
              placeholder="Say something nice..."
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
            />
          </div>

          {formError && <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 8 }}>{formError}</div>}
          {formSuccess && <div style={{ color: "#22c55e", fontSize: 13, marginBottom: 8 }}>{formSuccess}</div>}

          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: "7px 16px",
              borderRadius: 6,
              border: "none",
              cursor: submitting ? "not-allowed" : "pointer",
              fontWeight: 600,
              fontSize: 13,
              background: "#dff140",
              color: "#0d152c",
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? "Sending..." : "Send Recognition"}
          </button>
        </form>
      </div>

      {/* Recognition Feed */}
      <div style={{ fontSize: 15, fontWeight: 700, color: "#0d152c", marginBottom: 12 }}>
        Recent Recognitions
      </div>

      {feedLoading ? (
        <div style={{ padding: 20, color: "#64748b" }}>Loading feed...</div>
      ) : feed.length === 0 ? (
        <div style={{
          background: "#fff",
          borderRadius: 10,
          padding: 32,
          border: "1px solid #e2e8f0",
          textAlign: "center",
          color: "#94a3b8",
          fontSize: 14,
        }}>
          No recognitions yet. Be the first to recognize a colleague!
        </div>
      ) : (
        <>
          {feed.map((r) => (
            <div key={r.id} style={{
              background: "#fff",
              borderRadius: 10,
              padding: 16,
              border: "1px solid #e2e8f0",
              marginBottom: 12,
              display: "flex",
              gap: 14,
              alignItems: "flex-start",
            }}>
              {/* Badge icon */}
              <div style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 24,
                flexShrink: 0,
              }}>
                {r.badge_icon || "⭐"}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: "#0d152c" }}>
                    {r.from_name}
                  </span>
                  <span style={{ fontSize: 13, color: "#94a3b8" }}>{"→"}</span>
                  <span style={{ fontWeight: 700, fontSize: 14, color: "#0d152c" }}>
                    {r.to_name}
                  </span>
                </div>

                <div style={{
                  padding: "2px 8px",
                  borderRadius: 10,
                  fontSize: 11,
                  fontWeight: 600,
                  background: "#fef9c3",
                  color: "#a16207",
                  display: "inline-block",
                  marginBottom: 6,
                }}>
                  {r.badge_icon} {r.badge_name}
                </div>

                {r.message && (
                  <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.5, marginBottom: 4 }}>
                    {r.message}
                  </div>
                )}

                <div style={{ fontSize: 11, color: "#94a3b8" }}>
                  {timeAgo(r.created_at)}
                </div>
              </div>
            </div>
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 16 }}>
              <button
                onClick={() => handlePageChange(page - 1)}
                disabled={page <= 1}
                style={{
                  padding: "7px 16px",
                  borderRadius: 6,
                  border: "1px solid #e2e8f0",
                  cursor: page <= 1 ? "not-allowed" : "pointer",
                  fontWeight: 600,
                  fontSize: 13,
                  background: page <= 1 ? "#f1f5f9" : "#fff",
                  color: page <= 1 ? "#94a3b8" : "#0d152c",
                }}
              >
                Previous
              </button>
              <span style={{ fontSize: 13, color: "#64748b" }}>
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => handlePageChange(page + 1)}
                disabled={page >= totalPages}
                style={{
                  padding: "7px 16px",
                  borderRadius: 6,
                  border: "1px solid #e2e8f0",
                  cursor: page >= totalPages ? "not-allowed" : "pointer",
                  fontWeight: 600,
                  fontSize: 13,
                  background: page >= totalPages ? "#f1f5f9" : "#fff",
                  color: page >= totalPages ? "#94a3b8" : "#0d152c",
                }}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const labelStyle = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "#64748b",
  marginBottom: 4,
};

const inputStyle = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid #cbd5e1",
  fontSize: 13,
  boxSizing: "border-box",
  fontFamily: "inherit",
};
