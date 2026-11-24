import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../hooks/useAuth.jsx";
import { useIsMobile } from "../hooks/useIsMobile.jsx";
import Icon from "../components/Icon.jsx";

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
  const isMobile = useIsMobile();

  const [feed, setFeed] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [feedLoading, setFeedLoading] = useState(true);
  const [badges, setBadges] = useState([]);

  // Form state
  const [recipient, setRecipient] = useState(null); // { id, code, name, dept_name }
  const [searchText, setSearchText] = useState("");
  const [codeText, setCodeText] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [form, setForm] = useState({ badge_id: "", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const searchRef = useRef(null);
  const debounceRef = useRef(null);

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

  // Close search dropdown on outside click
  useEffect(() => {
    if (!showResults) return;
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setShowResults(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showResults]);

  function handleSearch(val) {
    setSearchText(val);
    setRecipient(null);
    clearTimeout(debounceRef.current);
    if (val.trim().length < 2) { setSearchResults([]); setShowResults(false); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await api.get(`/engagement/employee-search?q=${encodeURIComponent(val.trim())}`);
        setSearchResults(results);
        setShowResults(true);
      } catch { setSearchResults([]); }
    }, 250);
  }

  function pickResult(emp) {
    setRecipient(emp);
    setSearchText("");
    setCodeText(emp.code);
    setSearchResults([]);
    setShowResults(false);
  }

  function handleCodeChange(val) {
    const upper = val.toUpperCase();
    setCodeText(upper);
    setRecipient(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError(""); setFormSuccess(""); setSubmitting(true);

    if (!recipient && !codeText.trim()) {
      setFormError("Search for a colleague by name or enter their employee code.");
      setSubmitting(false);
      return;
    }
    if (!form.badge_id) {
      setFormError("Please select a badge.");
      setSubmitting(false);
      return;
    }

    const body = {
      badge_id: parseInt(form.badge_id, 10),
      message: form.message || null,
    };
    if (recipient) {
      body.to_employee = recipient.id;
    } else {
      body.to_employee_code = codeText.trim();
    }

    try {
      await api.post("/engagement/recognitions", body);
      setFormSuccess("Recognition sent!");
      setRecipient(null);
      setSearchText("");
      setCodeText("");
      setForm({ badge_id: badges.length > 0 ? String(badges[0].id) : "", message: "" });
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
      <h1 className="page-title" style={{ marginBottom: 18 }}>Recognition Wall</h1>

      {/* Give Recognition Form */}
      <div style={{
        background: "var(--card)", borderRadius: "var(--r-card)",
        padding: isMobile ? 16 : 20, border: "1px solid var(--line)",
        marginBottom: 24, boxShadow: "var(--shadow-card)",
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>
          Give Recognition
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12, marginBottom: 12 }}>
            {/* Name search */}
            <div ref={searchRef} style={{ position: "relative" }}>
              <label style={labelStyle}>Search by Name</label>
              <input
                type="text"
                value={searchText}
                onChange={(e) => handleSearch(e.target.value)}
                onFocus={() => { if (searchResults.length) setShowResults(true); }}
                placeholder="Type a colleague's name..."
                style={inputStyle}
              />
              {showResults && searchResults.length > 0 && (
                <div style={{
                  position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
                  background: "var(--card)", border: "1px solid var(--line)",
                  borderRadius: "var(--r-card)", boxShadow: "0 4px 16px rgba(0,0,0,.2)",
                  maxHeight: 200, overflowY: "auto",
                }}>
                  {searchResults.map((r) => (
                    <div key={r.id} onClick={() => pickResult(r)} style={{
                      padding: "8px 12px", cursor: "pointer", fontSize: 13,
                      borderBottom: "1px solid var(--line)",
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >
                      <span style={{ fontWeight: 600 }}>{r.name}</span>
                      <span style={{ color: "var(--text-muted)", marginLeft: 6 }}>— {r.code}</span>
                      {r.dept_name && <span style={{ color: "var(--text-faint)", marginLeft: 6 }}>· {r.dept_name}</span>}
                    </div>
                  ))}
                </div>
              )}
              {showResults && searchResults.length === 0 && searchText.trim().length >= 2 && (
                <div style={{
                  position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
                  background: "var(--card)", border: "1px solid var(--line)",
                  borderRadius: "var(--r-card)", padding: "10px 12px", fontSize: 13,
                  color: "var(--text-faint)",
                }}>
                  No employees found
                </div>
              )}
            </div>

            {/* Employee code input */}
            <div>
              <label style={labelStyle}>Or Enter Employee Code</label>
              <input
                type="text"
                value={codeText}
                onChange={(e) => handleCodeChange(e.target.value)}
                placeholder="e.g. GIL0101"
                style={{ ...inputStyle, textTransform: "uppercase" }}
              />
            </div>
          </div>

          {/* Recipient chip */}
          {recipient && (
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "6px 12px", borderRadius: "var(--r-pill)",
              background: "var(--lime-pale)", marginBottom: 12, fontSize: 13,
            }}>
              <span style={{ fontWeight: 600 }}>{recipient.name}</span>
              <span style={{ color: "var(--text-muted)" }}>({recipient.code})</span>
              <button type="button" onClick={() => { setRecipient(null); setCodeText(""); }} style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: 16, color: "var(--text-muted)", padding: 0, lineHeight: 1,
              }}>×</button>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12, marginBottom: 12 }}>
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
            <label style={labelStyle}>Message</label>
            <textarea
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              rows={2}
              placeholder="Say something nice..."
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
            />
          </div>

          {formError && <div style={{ color: "var(--danger)", fontSize: 13, marginBottom: 8 }}>{formError}</div>}
          {formSuccess && <div style={{ color: "var(--charcoal)", fontSize: 13, marginBottom: 8 }}>{formSuccess}</div>}

          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: "10px 20px", borderRadius: "var(--r-pill)", border: "none",
              cursor: submitting ? "not-allowed" : "pointer",
              fontWeight: 700, fontSize: 13,
              background: "var(--text)", color: "var(--bg)",
              opacity: submitting ? 0.6 : 1, fontFamily: "inherit",
              width: isMobile ? "100%" : "auto", minHeight: 40,
            }}
          >
            {submitting ? "Sending..." : "Send Recognition"}
          </button>
        </form>
      </div>

      {/* Recognition Feed */}
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>
        Recent Recognitions
      </div>

      {feedLoading ? (
        <div style={{ padding: 20, color: "var(--text-muted)" }}>Loading feed...</div>
      ) : feed.length === 0 ? (
        <div style={{
          background: "var(--card)", borderRadius: "var(--r-card)",
          padding: 32, border: "1px solid var(--line)",
          textAlign: "center", color: "var(--text-faint)", fontSize: 14,
        }}>
          No recognitions yet. Be the first to recognize a colleague!
        </div>
      ) : (
        <>
          {feed.map((r) => (
            <div key={r.id} style={{
              background: "var(--card)", borderRadius: "var(--r-card)",
              padding: 16, border: "1px solid var(--line)",
              marginBottom: 12, display: "flex", gap: 14, alignItems: "flex-start",
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: 0,
                background: "var(--bg)", border: "1px solid var(--line)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 24, flexShrink: 0,
              }}>
                {r.badge_icon || <Icon name="star" filled={true} style={{ fontSize: 24 }} />}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{r.from_name}</span>
                  <Icon name="arrow_forward" style={{ fontSize: 13, color: "var(--text-faint)" }} />
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{r.to_name}</span>
                </div>

                <div style={{
                  padding: "2px 8px", borderRadius: "var(--r-pill)",
                  fontSize: 11, fontWeight: 600,
                  background: "var(--lime-pale)", color: "var(--charcoal)",
                  display: "inline-block", marginBottom: 6,
                }}>
                  {r.badge_icon} {r.badge_name}
                </div>

                {r.message && (
                  <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5, marginBottom: 4 }}>
                    {r.message}
                  </div>
                )}

                <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
                  {timeAgo(r.created_at)}
                </div>
              </div>
            </div>
          ))}

          {totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 16 }}>
              <button onClick={() => handlePageChange(page - 1)} disabled={page <= 1} className="btn-sm"
                style={{ opacity: page <= 1 ? 0.4 : 1 }}>Previous</button>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                Page {page} of {totalPages}
              </span>
              <button onClick={() => handlePageChange(page + 1)} disabled={page >= totalPages} className="btn-sm"
                style={{ opacity: page >= totalPages ? 0.4 : 1 }}>Next</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const labelStyle = {
  display: "block", fontSize: 12, fontWeight: 600,
  color: "var(--text-muted)", marginBottom: 4,
};

const inputStyle = {
  width: "100%", padding: "10px 12px",
  borderRadius: "var(--r-card)", border: "1px solid var(--line)",
  fontSize: 14, boxSizing: "border-box", fontFamily: "inherit",
};
