import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../hooks/useAuth.jsx";
import { api } from "../lib/api.js";
import Icon from "../components/Icon.jsx";

const STATUS_BADGE = {
  PENDING:     { bg: "var(--badge-tan-bg)", color: "var(--badge-tan-text)" },
  IN_PROGRESS: { bg: "var(--badge-blue-bg)", color: "var(--badge-blue-text)" },
  COMPLETED:   { bg: "var(--lime-pale)", color: "var(--charcoal)" },
  DEFERRED:    { bg: "var(--badge-gray-bg)", color: "var(--badge-gray-text)" },
  SUBMITTED:   { bg: "var(--lime-pale)", color: "var(--charcoal)" },
  DRAFT:       { bg: "var(--badge-tan-bg)", color: "var(--badge-tan-text)" },
  ACTIVE:      { bg: "var(--badge-blue-bg)", color: "var(--badge-blue-text)" },
  CLOSED:      { bg: "var(--badge-gray-bg)", color: "var(--badge-gray-text)" },
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
  background: "var(--lime)", color: "#ffffff",
  textTransform: "uppercase", letterSpacing: ".04rem",
};

const tabStyle = (active) => ({
  padding: "8px 18px", fontSize: 12, fontWeight: 700, cursor: "pointer",
  border: "none", borderRadius: "var(--r-sm)",
  background: active ? "var(--lime)" : "var(--charcoal)",
  color: active ? "#ffffff" : "var(--text-faint)",
  textTransform: "uppercase", letterSpacing: ".06rem",
  transition: "all .15s",
});

export default function MyPerformance() {
  const { user } = useAuth();
  const [tab, setTab] = useState("goals");
  const [cycles, setCycles] = useState([]);
  const [goals, setGoals] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [oneOnOnes, setOneOnOnes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCycle, setSelectedCycle] = useState("");
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalForm, setGoalForm] = useState({ title: "", description: "", weight: "", target_value: "" });
  const [formError, setFormError] = useState("");
  const [ratingForm, setRatingForm] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [c, g, r, o] = await Promise.all([
        api.get("/performance/review-cycles"),
        api.get(`/performance/goals?employee_id=${user.id}${selectedCycle ? `&cycle_id=${selectedCycle}` : ""}`),
        api.get(`/performance/reviews?employee_id=${user.id}`),
        api.get("/performance/one-on-ones"),
      ]);
      setCycles(c);
      setGoals(g);
      setReviews(r);
      setOneOnOnes(o);
    } catch { /* ignore */ }
    setLoading(false);
  }, [user.id, selectedCycle]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const es = new EventSource("/api/events", { withCredentials: true });
    es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (["goals", "reviews", "review_cycles", "one_on_ones"].includes(d.entity)) fetchData();
      } catch { /* ignore */ }
    };
    return () => es.close();
  }, [fetchData]);

  async function createGoal(e) {
    e.preventDefault();
    setFormError("");
    const cycleId = selectedCycle || cycles.find(c => c.status === "ACTIVE")?.id;
    if (!cycleId) { setFormError("No active cycle selected"); return; }
    try {
      await api.post("/performance/goals", {
        employee_id: user.id,
        cycle_id: Number(cycleId),
        title: goalForm.title,
        description: goalForm.description || null,
        weight: Number(goalForm.weight) || 1,
        target_value: goalForm.target_value || null,
      });
      setGoalForm({ title: "", description: "", weight: "", target_value: "" });
      setShowGoalForm(false);
      fetchData();
    } catch (err) { setFormError(err.data?.error || err.message); }
  }

  async function submitSelfRating(goalId) {
    if (!ratingForm) return;
    try {
      await api.patch(`/performance/goals/${goalId}`, {
        self_rating: Number(ratingForm.rating),
        actual_value: ratingForm.actual_value || undefined,
        status: ratingForm.status || undefined,
      });
      setRatingForm(null);
      fetchData();
    } catch (err) { alert(err.data?.error || err.message); }
  }

  if (loading) return <div style={{ padding: 20, color: "var(--text-faint)" }}>Loading...</div>;

  const activeCycles = cycles.filter(c => c.status === "ACTIVE");

  return (
    <div>
      <h2 className="page-title" style={{ margin: 0 }}>My Performance</h2>
      <p style={{ color: "var(--text-faint)", fontSize: 12, margin: "4px 0 20px" }}>Goals, reviews & 1-on-1 history</p>

      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {["goals", "reviews", "1-on-1s"].map(t => (
          <button key={t} style={tabStyle(tab === t)} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {/* ── Goals ── */}
      {tab === "goals" && (
        <div>
          <div style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "center" }}>
            <select value={selectedCycle} onChange={e => setSelectedCycle(e.target.value)} style={{ ...inputStyle, width: 220 }}>
              <option value="">All cycles</option>
              {cycles.map(c => <option key={c.id} value={c.id}>{c.name} ({c.status})</option>)}
            </select>
            {activeCycles.length > 0 && (
              <button style={btnPrimary} onClick={() => setShowGoalForm(!showGoalForm)}>
                {showGoalForm ? "Cancel" : "+ Add Goal"}
              </button>
            )}
          </div>

          {showGoalForm && (
            <form onSubmit={createGoal} style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: 16, marginBottom: 16, display: "flex", flexDirection: "column", gap: 10, maxWidth: 500 }}>
              <input placeholder="Goal title" value={goalForm.title} onChange={e => setGoalForm({ ...goalForm, title: e.target.value })} style={inputStyle} required />
              <textarea placeholder="Description" value={goalForm.description} onChange={e => setGoalForm({ ...goalForm, description: e.target.value })} style={{ ...inputStyle, minHeight: 60 }} />
              <div style={{ display: "flex", gap: 10 }}>
                <input type="number" placeholder="Weight (%)" value={goalForm.weight} onChange={e => setGoalForm({ ...goalForm, weight: e.target.value })} style={{ ...inputStyle, width: 120 }} />
                <input placeholder="Target value" value={goalForm.target_value} onChange={e => setGoalForm({ ...goalForm, target_value: e.target.value })} style={inputStyle} />
              </div>
              {formError && <div style={{ color: "var(--danger)", fontSize: 12 }}>{formError}</div>}
              <button type="submit" style={btnPrimary}>Create Goal</button>
            </form>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {goals.map(g => (
              <div key={g.id} style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{g.title}</div>
                    {g.description && <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 2 }}>{g.description}</div>}
                    <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>
                      Weight: {g.weight}% {g.target_value && `| Target: ${g.target_value}`} {g.actual_value && `| Actual: ${g.actual_value}`}
                    </div>
                    <div style={{ fontSize: 11, marginTop: 4, display: "flex", gap: 12 }}>
                      {g.self_rating && <span>Self: {Array.from({length: g.self_rating}, (_, i) => <Icon key={i} name="star" filled={true} style={{ fontSize: "13px" }} />)}</span>}
                      {g.manager_rating && <span>Manager: {Array.from({length: g.manager_rating}, (_, i) => <Icon key={i} name="star" filled={true} style={{ fontSize: "13px" }} />)}</span>}
                    </div>
                  </div>
                  <Badge status={g.status} />
                </div>
                {ratingForm?.id === g.id ? (
                  <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <select value={ratingForm.rating || ""} onChange={e => setRatingForm({ ...ratingForm, rating: e.target.value })} style={{ ...inputStyle, width: 80 }}>
                      <option value="">Rate</option>
                      {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <input placeholder="Actual value" value={ratingForm.actual_value || ""} onChange={e => setRatingForm({ ...ratingForm, actual_value: e.target.value })} style={{ ...inputStyle, width: 150 }} />
                    <select value={ratingForm.status || ""} onChange={e => setRatingForm({ ...ratingForm, status: e.target.value })} style={{ ...inputStyle, width: 130 }}>
                      <option value="">Status</option>
                      {["IN_PROGRESS", "COMPLETED", "DEFERRED"].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <button style={btnPrimary} onClick={() => submitSelfRating(g.id)}>Save</button>
                    <button style={{ ...btnPrimary, background: "var(--charcoal)", color: "var(--text-faint)" }} onClick={() => setRatingForm(null)}>Cancel</button>
                  </div>
                ) : (
                  <button style={{ ...btnPrimary, marginTop: 10, padding: "4px 12px", fontSize: 10 }}
                    onClick={() => setRatingForm({ id: g.id, rating: g.self_rating || "", actual_value: g.actual_value || "", status: "" })}>
                    Update / Self-Rate
                  </button>
                )}
              </div>
            ))}
            {goals.length === 0 && <p style={{ color: "var(--text-faint)", fontSize: 13 }}>No goals yet.</p>}
          </div>
        </div>
      )}

      {/* ── Reviews ── */}
      {tab === "reviews" && (
        <div>
          {reviews.length === 0 ? <p style={{ color: "var(--text-faint)", fontSize: 13 }}>No reviews yet.</p> : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", fontSize: 10.5, textTransform: "uppercase", color: "var(--text-faint)", letterSpacing: ".06rem" }}>
                  <th style={{ padding: "8px 10px" }}>Cycle</th>
                  <th style={{ padding: "8px 10px" }}>Reviewer</th>
                  <th style={{ padding: "8px 10px" }}>Relationship</th>
                  <th style={{ padding: "8px 10px" }}>Rating</th>
                  <th style={{ padding: "8px 10px" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {reviews.map(r => (
                  <tr key={r.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px 10px" }}>{r.cycle_name}</td>
                    <td style={{ padding: "8px 10px" }}>{r.reviewer_name}</td>
                    <td style={{ padding: "8px 10px" }}>{r.relationship}</td>
                    <td style={{ padding: "8px 10px" }}>{r.overall_rating ? Array.from({length: r.overall_rating}, (_, i) => <Icon key={i} name="star" filled={true} style={{ fontSize: "13px" }} />) : "—"}</td>
                    <td style={{ padding: "8px 10px" }}><Badge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── 1-on-1s ── */}
      {tab === "1-on-1s" && (
        <div>
          {oneOnOnes.length === 0 ? <p style={{ color: "var(--text-faint)", fontSize: 13 }}>No 1-on-1 meetings recorded.</p> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {oneOnOnes.map(o => (
                <div key={o.id} style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>
                      {o.employee_name} & {o.manager_name}
                    </div>
                    <span style={{ fontSize: 12, color: "var(--text-faint)" }}>
                      {new Date(o.date + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    </span>
                  </div>
                  {o.notes && <div style={{ fontSize: 12, marginTop: 6, color: "var(--text)" }}>{o.notes}</div>}
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
