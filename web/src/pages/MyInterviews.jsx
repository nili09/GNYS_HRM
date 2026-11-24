import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";
import Icon from "../components/Icon.jsx";

const STATUS_BADGE = {
  SCHEDULED: { bg: "var(--badge-blue-bg)", color: "var(--badge-blue-text)" },
  COMPLETED: { bg: "var(--lime-pale)", color: "var(--charcoal)" },
  CANCELLED: { bg: "var(--badge-gray-bg)", color: "var(--badge-gray-text)" },
};

function Badge({ status }) {
  const s = STATUS_BADGE[status] || { bg: "var(--badge-tan-bg)", color: "var(--badge-tan-text)" };
  return (
    <span style={{
      padding: "2px 10px", borderRadius: "var(--r-pill)", fontSize: 10.5, fontWeight: 700,
      letterSpacing: ".04rem", textTransform: "uppercase", background: s.bg, color: s.color,
    }}>{status}</span>
  );
}

const inputStyle = {
  padding: "7px 10px", fontSize: 13, border: "1px solid var(--border)",
  borderRadius: "var(--r-sm)", background: "var(--bg-raised)", color: "var(--text)",
  width: "100%", boxSizing: "border-box",
};

const btnPrimary = {
  padding: "7px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer",
  border: "none", borderRadius: "var(--r-sm)",
  background: "var(--lime)", color: "#ffffff",
  textTransform: "uppercase", letterSpacing: ".04rem",
};

export default function MyInterviews() {
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedbackForm, setFeedbackForm] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const data = await api.get("/recruitment/interviews");
      setInterviews(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const es = new EventSource("/api/events", { withCredentials: true });
    es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.entity === "interviews") fetchData();
      } catch { /* ignore */ }
    };
    return () => es.close();
  }, [fetchData]);

  async function submitFeedback(intId) {
    if (!feedbackForm) return;
    try {
      await api.patch(`/recruitment/interviews/${intId}`, {
        feedback: feedbackForm.feedback,
        rating: feedbackForm.rating ? Number(feedbackForm.rating) : undefined,
        status: "COMPLETED",
      });
      setFeedbackForm(null);
      fetchData();
    } catch (err) { alert(err.data?.error || err.message); }
  }

  if (loading) return <div style={{ padding: 20, color: "var(--text-faint)" }}>Loading…</div>;

  const upcoming = interviews.filter(i => i.status === "SCHEDULED");
  const past = interviews.filter(i => i.status !== "SCHEDULED");

  return (
    <div>
      <h2 className="page-title" style={{ margin: 0 }}>My Interviews</h2>
      <p style={{ color: "var(--text-faint)", fontSize: 12, margin: "4px 0 20px" }}>Interviews assigned to you</p>

      {/* Upcoming */}
      <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 10px", textTransform: "uppercase", letterSpacing: ".06rem", color: "var(--text-faint)" }}>
        Upcoming ({upcoming.length})
      </h3>
      {upcoming.length === 0 ? (
        <p style={{ color: "var(--text-faint)", fontSize: 13 }}>No upcoming interviews.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
          {upcoming.map(i => (
            <div key={i.id} style={{
              background: "var(--bg-raised)", border: "1px solid var(--border)",
              borderRadius: "var(--r-sm)", padding: 16,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{i.candidate_name}</div>
                  <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 2 }}>
                    {i.job_title} • {i.mode} • {i.duration_mins} min
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text)", marginTop: 4 }}>
                    {new Date(i.scheduled_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                  </div>
                </div>
                <Badge status={i.status} />
              </div>
              {feedbackForm?.id === i.id ? (
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                  <textarea placeholder="Your feedback..." value={feedbackForm.feedback}
                    onChange={e => setFeedbackForm({ ...feedbackForm, feedback: e.target.value })}
                    style={{ ...inputStyle, minHeight: 80 }} />
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <label style={{ fontSize: 12, color: "var(--text-faint)" }}>Rating:</label>
                    <select value={feedbackForm.rating || ""} onChange={e => setFeedbackForm({ ...feedbackForm, rating: e.target.value })}
                      style={{ ...inputStyle, width: 80 }}>
                      <option value="">—</option>
                      {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button style={btnPrimary} onClick={() => submitFeedback(i.id)}>Submit</button>
                    <button style={{ ...btnPrimary, background: "var(--charcoal)", color: "var(--text-faint)" }} onClick={() => setFeedbackForm(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button style={{ ...btnPrimary, marginTop: 10, padding: "5px 14px", fontSize: 11 }}
                  onClick={() => setFeedbackForm({ id: i.id, feedback: "", rating: "" })}>
                  Submit Feedback
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Past */}
      <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 10px", textTransform: "uppercase", letterSpacing: ".06rem", color: "var(--text-faint)" }}>
        Past ({past.length})
      </h3>
      {past.length === 0 ? (
        <p style={{ color: "var(--text-faint)", fontSize: 13 }}>No past interviews.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", fontSize: 10.5, textTransform: "uppercase", color: "var(--text-faint)", letterSpacing: ".06rem" }}>
              <th style={{ padding: "8px 10px" }}>Candidate</th>
              <th style={{ padding: "8px 10px" }}>Job</th>
              <th style={{ padding: "8px 10px" }}>Date</th>
              <th style={{ padding: "8px 10px" }}>Status</th>
              <th style={{ padding: "8px 10px" }}>Rating</th>
              <th style={{ padding: "8px 10px" }}>Feedback</th>
            </tr>
          </thead>
          <tbody>
            {past.map(i => (
              <tr key={i.id} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={{ padding: "8px 10px", fontWeight: 600 }}>{i.candidate_name}</td>
                <td style={{ padding: "8px 10px" }}>{i.job_title}</td>
                <td style={{ padding: "8px 10px", fontSize: 12 }}>{new Date(i.scheduled_at).toLocaleDateString("en-IN")}</td>
                <td style={{ padding: "8px 10px" }}><Badge status={i.status} /></td>
                <td style={{ padding: "8px 10px" }}>{i.rating ? Array.from({length: i.rating}, (_, idx) => <Icon key={idx} name="star" filled={true} style={{ fontSize: "13px" }} />) : "—"}</td>
                <td style={{ padding: "8px 10px", maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.feedback || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
