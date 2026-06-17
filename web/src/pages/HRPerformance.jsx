import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";

const STATUS_BADGE = {
  DRAFT:       { bg: "var(--badge-tan-bg)", color: "var(--badge-tan-text)" },
  ACTIVE:      { bg: "var(--badge-blue-bg)", color: "var(--badge-blue-text)" },
  CLOSED:      { bg: "var(--badge-gray-bg)", color: "var(--badge-gray-text)" },
  PENDING:     { bg: "var(--badge-tan-bg)", color: "var(--badge-tan-text)" },
  IN_PROGRESS: { bg: "var(--badge-blue-bg)", color: "var(--badge-blue-text)" },
  COMPLETED:   { bg: "var(--lime-pale)", color: "var(--charcoal)" },
  DEFERRED:    { bg: "var(--badge-amber-bg)", color: "var(--badge-amber-text)" },
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

export default function HRPerformance() {
  const [tab, setTab] = useState("cycles");
  const [cycles, setCycles] = useState([]);
  const [goals, setGoals] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);

  const [cycleForm, setCycleForm] = useState({ name: "", year: new Date().getFullYear(), quarter: "", start_date: "", end_date: "", status: "DRAFT" });
  const [reviewForm, setReviewForm] = useState({ employee_id: "", cycle_id: "", reviewer_id: "", relationship: "MANAGER" });
  const [showCycleForm, setShowCycleForm] = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [formError, setFormError] = useState("");
  const [selectedCycle, setSelectedCycle] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const [c, g, r, d] = await Promise.all([
        api.get("/performance/review-cycles"),
        api.get(`/performance/goals${selectedCycle ? `?cycle_id=${selectedCycle}` : ""}`),
        api.get(`/performance/reviews${selectedCycle ? `?cycle_id=${selectedCycle}` : ""}`),
        api.get("/performance/dashboard"),
      ]);
      setCycles(c);
      setGoals(g);
      setReviews(r);
      setDashboard(d);
    } catch { /* ignore */ }
    setLoading(false);
  }, [selectedCycle]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const es = new EventSource("/api/events", { withCredentials: true });
    es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (["review_cycles", "goals", "reviews", "one_on_ones"].includes(d.entity)) fetchData();
      } catch { /* ignore */ }
    };
    return () => es.close();
  }, [fetchData]);

  async function createCycle(e) {
    e.preventDefault();
    setFormError("");
    try {
      await api.post("/performance/review-cycles", {
        ...cycleForm,
        year: Number(cycleForm.year),
        quarter: cycleForm.quarter ? Number(cycleForm.quarter) : null,
      });
      setCycleForm({ name: "", year: new Date().getFullYear(), quarter: "", start_date: "", end_date: "", status: "DRAFT" });
      setShowCycleForm(false);
      fetchData();
    } catch (err) { setFormError(err.data?.error || err.message); }
  }

  async function patchCycleStatus(id, status) {
    try { await api.patch(`/performance/review-cycles/${id}`, { status }); fetchData(); }
    catch (err) { alert(err.data?.error || err.message); }
  }

  async function assignReview(e) {
    e.preventDefault();
    setFormError("");
    try {
      await api.post("/performance/reviews", {
        employee_id: Number(reviewForm.employee_id),
        cycle_id: Number(reviewForm.cycle_id),
        reviewer_id: Number(reviewForm.reviewer_id),
        relationship: reviewForm.relationship,
      });
      setReviewForm({ employee_id: "", cycle_id: "", reviewer_id: "", relationship: "MANAGER" });
      setShowReviewForm(false);
      fetchData();
    } catch (err) { setFormError(err.data?.error || err.message); }
  }

  if (loading) return <div style={{ padding: 20, color: "var(--text-faint)" }}>Loading...</div>;

  return (
    <div>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, fontFamily: "var(--font-display)" }}>Performance Management</h2>
      <p style={{ color: "var(--text-faint)", fontSize: 12, margin: "4px 0 20px" }}>Manage review cycles, goals, and reviews across the organization</p>

      {/* Dashboard KPIs */}
      {dashboard && (
        <div style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
          {[
            { label: "Active Cycles", value: dashboard.activeCycles },
            { label: "Total Goals", value: dashboard.totalGoals },
            { label: "Pending Reviews", value: dashboard.pendingReviews },
          ].map(k => (
            <div key={k.label} style={{
              padding: "14px 20px", borderRadius: "var(--r-sm)", background: "var(--bg-raised)",
              border: "1px solid var(--border)", minWidth: 140,
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: ".06rem" }}>{k.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", marginTop: 2 }}>{k.value}</div>
            </div>
          ))}
          {dashboard.avgByDept.map(d => (
            <div key={d.dept} style={{
              padding: "14px 20px", borderRadius: "var(--r-sm)", background: "var(--bg-raised)",
              border: "1px solid var(--border)", minWidth: 120,
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: ".06rem" }}>{d.dept}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", marginTop: 2 }}>{d.avg_rating} ★ <span style={{ fontSize: 11, fontWeight: 400, color: "var(--text-faint)" }}>({d.count})</span></div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {["cycles", "goals", "reviews"].map(t => (
          <button key={t} style={tabStyle(tab === t)} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {/* ── Cycles ── */}
      {tab === "cycles" && (
        <div>
          <div style={{ marginBottom: 12 }}>
            <button style={btnPrimary} onClick={() => setShowCycleForm(!showCycleForm)}>
              {showCycleForm ? "Cancel" : "+ New Cycle"}
            </button>
          </div>
          {showCycleForm && (
            <form onSubmit={createCycle} style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: 16, marginBottom: 16, display: "flex", flexDirection: "column", gap: 10, maxWidth: 500 }}>
              <input placeholder="Cycle name" value={cycleForm.name} onChange={e => setCycleForm({ ...cycleForm, name: e.target.value })} style={inputStyle} required />
              <div style={{ display: "flex", gap: 10 }}>
                <input type="number" placeholder="Year" value={cycleForm.year} onChange={e => setCycleForm({ ...cycleForm, year: e.target.value })} style={{ ...inputStyle, width: 100 }} />
                <select value={cycleForm.quarter} onChange={e => setCycleForm({ ...cycleForm, quarter: e.target.value })} style={{ ...inputStyle, width: 120 }}>
                  <option value="">Annual</option>
                  {[1, 2, 3, 4].map(q => <option key={q} value={q}>Q{q}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <input type="date" value={cycleForm.start_date} onChange={e => setCycleForm({ ...cycleForm, start_date: e.target.value })} style={inputStyle} required />
                <input type="date" value={cycleForm.end_date} onChange={e => setCycleForm({ ...cycleForm, end_date: e.target.value })} style={inputStyle} required />
              </div>
              {formError && <div style={{ color: "var(--danger)", fontSize: 12 }}>{formError}</div>}
              <button type="submit" style={btnPrimary}>Create Cycle</button>
            </form>
          )}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", fontSize: 10.5, textTransform: "uppercase", color: "var(--text-faint)", letterSpacing: ".06rem" }}>
                <th style={{ padding: "8px 10px" }}>Name</th>
                <th style={{ padding: "8px 10px" }}>Year</th>
                <th style={{ padding: "8px 10px" }}>Period</th>
                <th style={{ padding: "8px 10px" }}>Status</th>
                <th style={{ padding: "8px 10px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {cycles.map(c => (
                <tr key={c.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "8px 10px", fontWeight: 600 }}>{c.name}</td>
                  <td style={{ padding: "8px 10px" }}>{c.year}{c.quarter ? ` Q${c.quarter}` : ""}</td>
                  <td style={{ padding: "8px 10px", fontSize: 12, color: "var(--text-faint)" }}>{c.start_date} to {c.end_date}</td>
                  <td style={{ padding: "8px 10px" }}><Badge status={c.status} /></td>
                  <td style={{ padding: "8px 10px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      {c.status === "DRAFT" && <button onClick={() => patchCycleStatus(c.id, "ACTIVE")} style={{ ...btnPrimary, padding: "4px 10px", fontSize: 10 }}>Activate</button>}
                      {c.status === "ACTIVE" && <button onClick={() => patchCycleStatus(c.id, "CLOSED")} style={{ ...btnPrimary, padding: "4px 10px", fontSize: 10, background: "var(--badge-gray-bg)", color: "var(--badge-gray-text)" }}>Close</button>}
                    </div>
                  </td>
                </tr>
              ))}
              {cycles.length === 0 && <tr><td colSpan={5} style={{ padding: 20, textAlign: "center", color: "var(--text-faint)" }}>No cycles created</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Goals ── */}
      {tab === "goals" && (
        <div>
          <div style={{ marginBottom: 12 }}>
            <select value={selectedCycle} onChange={e => setSelectedCycle(e.target.value)} style={{ ...inputStyle, width: 220 }}>
              <option value="">All cycles</option>
              {cycles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", fontSize: 10.5, textTransform: "uppercase", color: "var(--text-faint)", letterSpacing: ".06rem" }}>
                <th style={{ padding: "8px 10px" }}>Employee</th>
                <th style={{ padding: "8px 10px" }}>Goal</th>
                <th style={{ padding: "8px 10px" }}>Weight</th>
                <th style={{ padding: "8px 10px" }}>Self</th>
                <th style={{ padding: "8px 10px" }}>Manager</th>
                <th style={{ padding: "8px 10px" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {goals.map(g => (
                <tr key={g.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "8px 10px", fontWeight: 600 }}>{g.employee_name}</td>
                  <td style={{ padding: "8px 10px" }}>{g.title}</td>
                  <td style={{ padding: "8px 10px" }}>{g.weight}%</td>
                  <td style={{ padding: "8px 10px" }}>{g.self_rating ? "★".repeat(g.self_rating) : "—"}</td>
                  <td style={{ padding: "8px 10px" }}>{g.manager_rating ? "★".repeat(g.manager_rating) : "—"}</td>
                  <td style={{ padding: "8px 10px" }}><Badge status={g.status} /></td>
                </tr>
              ))}
              {goals.length === 0 && <tr><td colSpan={6} style={{ padding: 20, textAlign: "center", color: "var(--text-faint)" }}>No goals found</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Reviews ── */}
      {tab === "reviews" && (
        <div>
          <div style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "center" }}>
            <select value={selectedCycle} onChange={e => setSelectedCycle(e.target.value)} style={{ ...inputStyle, width: 220 }}>
              <option value="">All cycles</option>
              {cycles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button style={btnPrimary} onClick={() => setShowReviewForm(!showReviewForm)}>
              {showReviewForm ? "Cancel" : "+ Assign Review"}
            </button>
          </div>
          {showReviewForm && (
            <form onSubmit={assignReview} style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: 16, marginBottom: 16, display: "flex", flexDirection: "column", gap: 10, maxWidth: 500 }}>
              <div style={{ display: "flex", gap: 10 }}>
                <input type="number" placeholder="Employee ID" value={reviewForm.employee_id} onChange={e => setReviewForm({ ...reviewForm, employee_id: e.target.value })} style={inputStyle} required />
                <input type="number" placeholder="Reviewer ID" value={reviewForm.reviewer_id} onChange={e => setReviewForm({ ...reviewForm, reviewer_id: e.target.value })} style={inputStyle} required />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <select value={reviewForm.cycle_id} onChange={e => setReviewForm({ ...reviewForm, cycle_id: e.target.value })} style={inputStyle} required>
                  <option value="">Select cycle</option>
                  {cycles.filter(c => c.status === "ACTIVE").map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select value={reviewForm.relationship} onChange={e => setReviewForm({ ...reviewForm, relationship: e.target.value })} style={inputStyle}>
                  {["SELF", "MANAGER", "PEER", "SKIP_LEVEL"].map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              {formError && <div style={{ color: "var(--danger)", fontSize: 12 }}>{formError}</div>}
              <button type="submit" style={btnPrimary}>Assign</button>
            </form>
          )}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", fontSize: 10.5, textTransform: "uppercase", color: "var(--text-faint)", letterSpacing: ".06rem" }}>
                <th style={{ padding: "8px 10px" }}>Employee</th>
                <th style={{ padding: "8px 10px" }}>Reviewer</th>
                <th style={{ padding: "8px 10px" }}>Relationship</th>
                <th style={{ padding: "8px 10px" }}>Rating</th>
                <th style={{ padding: "8px 10px" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {reviews.map(r => (
                <tr key={r.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "8px 10px", fontWeight: 600 }}>{r.employee_name}</td>
                  <td style={{ padding: "8px 10px" }}>{r.reviewer_name}</td>
                  <td style={{ padding: "8px 10px" }}>{r.relationship}</td>
                  <td style={{ padding: "8px 10px" }}>{r.overall_rating ? "★".repeat(r.overall_rating) : "—"}</td>
                  <td style={{ padding: "8px 10px" }}><Badge status={r.status} /></td>
                </tr>
              ))}
              {reviews.length === 0 && <tr><td colSpan={5} style={{ padding: 20, textAlign: "center", color: "var(--text-faint)" }}>No reviews found</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Completion rates */}
      {dashboard && dashboard.completionRate.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 10px", textTransform: "uppercase", letterSpacing: ".06rem", color: "var(--text-faint)" }}>
            Review Completion
          </h3>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {dashboard.completionRate.map(cr => (
              <div key={cr.cycle_name} style={{ padding: "14px 20px", borderRadius: "var(--r-sm)", background: "var(--bg-raised)", border: "1px solid var(--border)", minWidth: 160 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-faint)" }}>{cr.cycle_name}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", marginTop: 2 }}>{cr.pct}%</div>
                <div style={{ marginTop: 6, height: 4, borderRadius: 2, background: "var(--border)" }}>
                  <div style={{ height: 4, borderRadius: 2, background: "var(--lime)", width: `${cr.pct}%`, transition: "width .3s" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
