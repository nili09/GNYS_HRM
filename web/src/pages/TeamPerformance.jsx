import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../hooks/useAuth.jsx";
import { api } from "../lib/api.js";

const STATUS_BADGE = {
  PENDING:     { bg: "var(--badge-tan-bg)", color: "var(--badge-tan-text)" },
  IN_PROGRESS: { bg: "var(--badge-blue-bg)", color: "var(--badge-blue-text)" },
  COMPLETED:   { bg: "var(--lime-pale)", color: "var(--charcoal)" },
  DEFERRED:    { bg: "var(--badge-gray-bg)", color: "var(--badge-gray-text)" },
  SUBMITTED:   { bg: "var(--lime-pale)", color: "var(--charcoal)" },
};

function Badge({ status }) {
  const s = STATUS_BADGE[status] || STATUS_BADGE.PENDING;
  return (
    <span style={{
      padding: "2px 10px", borderRadius: "var(--r-pill)", fontSize: 10.5, fontWeight: 700,
      letterSpacing: ".04rem", textTransform: "uppercase", background: s.bg, color: s.color,
    }}>{status?.replace("_", " ")}</span>
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
  background: "var(--lime)", color: "var(--ink)",
  textTransform: "uppercase", letterSpacing: ".04rem",
};

const tabStyle = (active) => ({
  padding: "8px 18px", fontSize: 12, fontWeight: 700, cursor: "pointer",
  border: "none", borderRadius: "var(--r-sm)",
  background: active ? "var(--lime)" : "var(--charcoal)",
  color: active ? "var(--ink)" : "var(--text-faint)",
  textTransform: "uppercase", letterSpacing: ".06rem",
  transition: "all .15s",
});

export default function TeamPerformance() {
  const { user } = useAuth();
  const [tab, setTab] = useState("goals");
  const [goals, setGoals] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [oneOnOnes, setOneOnOnes] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ratingForm, setRatingForm] = useState(null);
  const [oooForm, setOooForm] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [g, r, o, c] = await Promise.all([
        api.get("/performance/goals"),
        api.get("/performance/reviews"),
        api.get("/performance/one-on-ones"),
        api.get("/performance/review-cycles"),
      ]);
      setGoals(g.filter(gl => gl.employee_id !== user.id));
      setReviews(r.filter(rv => rv.reviewer_id === user.id));
      setOneOnOnes(o);
      setCycles(c);
    } catch { /* ignore */ }
    setLoading(false);
  }, [user.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const es = new EventSource("/api/events", { withCredentials: true });
    es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (["goals", "reviews", "one_on_ones"].includes(d.entity)) fetchData();
      } catch { /* ignore */ }
    };
    return () => es.close();
  }, [fetchData]);

  async function submitManagerRating(goalId) {
    if (!ratingForm) return;
    try {
      await api.patch(`/performance/goals/${goalId}`, { manager_rating: Number(ratingForm.rating) });
      setRatingForm(null);
      fetchData();
    } catch (err) { alert(err.data?.error || err.message); }
  }

  async function submitReview(revId) {
    if (!ratingForm) return;
    try {
      await api.patch(`/performance/reviews/${revId}`, {
        overall_rating: Number(ratingForm.rating),
        strengths: ratingForm.strengths || null,
        improvements: ratingForm.improvements || null,
        comments: ratingForm.comments || null,
        status: "SUBMITTED",
      });
      setRatingForm(null);
      fetchData();
    } catch (err) { alert(err.data?.error || err.message); }
  }

  async function createOneOnOne(e) {
    e.preventDefault();
    if (!oooForm) return;
    try {
      await api.post("/performance/one-on-ones", {
        employee_id: Number(oooForm.employee_id),
        manager_id: user.id,
        date: oooForm.date,
        notes: oooForm.notes || null,
        action_items: oooForm.action_items || null,
      });
      setOooForm(null);
      fetchData();
    } catch (err) { alert(err.data?.error || err.message); }
  }

  if (loading) return <div style={{ padding: 20, color: "var(--text-faint)" }}>Loading...</div>;

  const pendingReviews = reviews.filter(r => r.status === "PENDING");

  return (
    <div>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, fontFamily: "var(--font-display)" }}>Team Performance</h2>
      <p style={{ color: "var(--text-faint)", fontSize: 12, margin: "4px 0 20px" }}>Rate goals, submit reviews & manage 1-on-1s for your direct reports</p>

      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {["goals", "reviews", "1-on-1s"].map(t => (
          <button key={t} style={tabStyle(tab === t)} onClick={() => setTab(t)}>
            {t}{t === "reviews" && pendingReviews.length > 0 ? ` (${pendingReviews.length})` : ""}
          </button>
        ))}
      </div>

      {/* ── Goals ── */}
      {tab === "goals" && (
        <div>
          {goals.length === 0 ? <p style={{ color: "var(--text-faint)", fontSize: 13 }}>No direct report goals.</p> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {goals.map(g => (
                <div key={g.id} style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: 11, color: "var(--text-faint)", fontWeight: 600, textTransform: "uppercase" }}>{g.employee_name}</div>
                      <div style={{ fontWeight: 700, fontSize: 14, marginTop: 2 }}>{g.title}</div>
                      <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>
                        Weight: {g.weight}% {g.target_value && `| Target: ${g.target_value}`} {g.actual_value && `| Actual: ${g.actual_value}`}
                      </div>
                      <div style={{ fontSize: 11, marginTop: 4, display: "flex", gap: 12 }}>
                        {g.self_rating && <span>Self: {"★".repeat(g.self_rating)}</span>}
                        {g.manager_rating && <span>Manager: {"★".repeat(g.manager_rating)}</span>}
                      </div>
                    </div>
                    <Badge status={g.status} />
                  </div>
                  {ratingForm?.type === "goal" && ratingForm.id === g.id ? (
                    <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
                      <select value={ratingForm.rating || ""} onChange={e => setRatingForm({ ...ratingForm, rating: e.target.value })} style={{ ...inputStyle, width: 80 }}>
                        <option value="">Rate</option>
                        {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} ★</option>)}
                      </select>
                      <button style={btnPrimary} onClick={() => submitManagerRating(g.id)}>Save</button>
                      <button style={{ ...btnPrimary, background: "var(--charcoal)", color: "var(--text-faint)" }} onClick={() => setRatingForm(null)}>Cancel</button>
                    </div>
                  ) : (
                    <button style={{ ...btnPrimary, marginTop: 10, padding: "4px 12px", fontSize: 10 }}
                      onClick={() => setRatingForm({ type: "goal", id: g.id, rating: g.manager_rating || "" })}>
                      Rate Goal
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Reviews ── */}
      {tab === "reviews" && (
        <div>
          {reviews.length === 0 ? <p style={{ color: "var(--text-faint)", fontSize: 13 }}>No reviews assigned to you.</p> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {reviews.map(r => (
                <div key={r.id} style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{r.employee_name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{r.cycle_name} | {r.relationship}</div>
                      {r.overall_rating && <div style={{ marginTop: 4 }}>Rating: {"★".repeat(r.overall_rating)}</div>}
                      {r.strengths && <div style={{ fontSize: 12, marginTop: 4 }}>Strengths: {r.strengths}</div>}
                      {r.improvements && <div style={{ fontSize: 12, marginTop: 2 }}>Improvements: {r.improvements}</div>}
                    </div>
                    <Badge status={r.status} />
                  </div>
                  {r.status === "PENDING" && ratingForm?.type === "review" && ratingForm.id === r.id ? (
                    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <select value={ratingForm.rating || ""} onChange={e => setRatingForm({ ...ratingForm, rating: e.target.value })} style={{ ...inputStyle, width: 80 }}>
                          <option value="">Rate</option>
                          {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} ★</option>)}
                        </select>
                      </div>
                      <input placeholder="Strengths" value={ratingForm.strengths || ""} onChange={e => setRatingForm({ ...ratingForm, strengths: e.target.value })} style={inputStyle} />
                      <input placeholder="Areas for improvement" value={ratingForm.improvements || ""} onChange={e => setRatingForm({ ...ratingForm, improvements: e.target.value })} style={inputStyle} />
                      <textarea placeholder="Comments" value={ratingForm.comments || ""} onChange={e => setRatingForm({ ...ratingForm, comments: e.target.value })} style={{ ...inputStyle, minHeight: 60 }} />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button style={btnPrimary} onClick={() => submitReview(r.id)}>Submit Review</button>
                        <button style={{ ...btnPrimary, background: "var(--charcoal)", color: "var(--text-faint)" }} onClick={() => setRatingForm(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : r.status === "PENDING" ? (
                    <button style={{ ...btnPrimary, marginTop: 10, padding: "4px 12px", fontSize: 10 }}
                      onClick={() => setRatingForm({ type: "review", id: r.id, rating: "", strengths: "", improvements: "", comments: "" })}>
                      Write Review
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 1-on-1s ── */}
      {tab === "1-on-1s" && (
        <div>
          <div style={{ marginBottom: 12 }}>
            <button style={btnPrimary} onClick={() => setOooForm(oooForm ? null : { employee_id: "", date: "", notes: "", action_items: "" })}>
              {oooForm ? "Cancel" : "+ New 1-on-1"}
            </button>
          </div>
          {oooForm && (
            <form onSubmit={createOneOnOne} style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: 16, marginBottom: 16, display: "flex", flexDirection: "column", gap: 10, maxWidth: 500 }}>
              <input type="number" placeholder="Employee ID" value={oooForm.employee_id} onChange={e => setOooForm({ ...oooForm, employee_id: e.target.value })} style={inputStyle} required />
              <input type="date" value={oooForm.date} onChange={e => setOooForm({ ...oooForm, date: e.target.value })} style={inputStyle} required />
              <textarea placeholder="Notes" value={oooForm.notes} onChange={e => setOooForm({ ...oooForm, notes: e.target.value })} style={{ ...inputStyle, minHeight: 60 }} />
              <textarea placeholder="Action items" value={oooForm.action_items} onChange={e => setOooForm({ ...oooForm, action_items: e.target.value })} style={{ ...inputStyle, minHeight: 40 }} />
              <button type="submit" style={btnPrimary}>Create</button>
            </form>
          )}
          {oneOnOnes.length === 0 ? <p style={{ color: "var(--text-faint)", fontSize: 13 }}>No 1-on-1 meetings recorded.</p> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {oneOnOnes.map(o => (
                <div key={o.id} style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{o.employee_name} & {o.manager_name}</div>
                    <span style={{ fontSize: 12, color: "var(--text-faint)" }}>
                      {new Date(o.date + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    </span>
                  </div>
                  {o.notes && <div style={{ fontSize: 12, marginTop: 6 }}>{o.notes}</div>}
                  {o.action_items && <div style={{ fontSize: 12, marginTop: 4, color: "var(--text-faint)" }}>Action items: {o.action_items}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
