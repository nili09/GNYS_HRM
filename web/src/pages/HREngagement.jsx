import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../hooks/useAuth.jsx";
import Icon from "../components/Icon.jsx";
import FileUpload from "../components/FileUpload.jsx";

/* ── Helpers ──────────────────────────────────────────────────────── */

function fmtDate(d) {
  if (!d) return "";
  const dt = new Date(d.includes("T") ? d : d + "T00:00:00");
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const PRIORITY_COLORS = {
  URGENT:    "var(--badge-danger-text)",
  IMPORTANT: "var(--badge-amber-text)",
  NORMAL:    "var(--badge-blue-text)",
};
const PRIORITY_BG = {
  URGENT:    "var(--badge-danger-bg)",
  IMPORTANT: "var(--badge-amber-bg)",
  NORMAL:    "var(--badge-blue-bg)",
};
const STATUS_COLORS = {
  ACTIVE: "var(--badge-green-text)",
  DRAFT:  "var(--badge-gray-text)",
  CLOSED: "var(--text-faint)",
};
const STATUS_BG = {
  ACTIVE: "var(--badge-green-bg)",
  DRAFT:  "var(--badge-gray-bg)",
  CLOSED: "var(--line)",
};

function PriorityBadge({ priority }) {
  return (
    <span style={{
      padding: "2px 8px", borderRadius: "var(--r-pill)", fontSize: 11, fontWeight: 700,
      background: PRIORITY_BG[priority] || PRIORITY_BG.NORMAL,
      color: PRIORITY_COLORS[priority] || PRIORITY_COLORS.NORMAL,
      textTransform: "uppercase", letterSpacing: ".04rem",
    }}>
      {priority}
    </span>
  );
}

function StatusBadge({ status }) {
  return (
    <span style={{
      padding: "2px 8px", borderRadius: "var(--r-pill)", fontSize: 11, fontWeight: 700,
      background: STATUS_BG[status] || STATUS_BG.DRAFT,
      color: STATUS_COLORS[status] || STATUS_COLORS.DRAFT,
      textTransform: "uppercase", letterSpacing: ".04rem",
    }}>
      {status}
    </span>
  );
}

/* ── Style constants ──────────────────────────────────────────────── */

const labelStyle = { display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4 };
const inputStyle = { width: "100%", padding: "9px 12px", borderRadius: "var(--r-card)", border: "1px solid var(--line)", fontSize: 13, boxSizing: "border-box", fontFamily: "inherit", background: "var(--card)", color: "var(--text)" };
const thStyle = { textAlign: "left", padding: "10px 12px", borderBottom: "1px solid var(--line)", background: "var(--bg)", fontWeight: 700, fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.045em" };
const tdStyle = { padding: "10px 12px", borderBottom: "1px solid var(--line)", fontSize: 13 };
const btnPrimary = { padding: "7px 16px", borderRadius: "var(--r-pill)", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, background: "var(--grad-cta)", color: "var(--ink)" };
const btnDanger = { padding: "7px 16px", borderRadius: "var(--r-pill)", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, background: "var(--danger)", color: "#fff" };
const btnSmall = { padding: "5px 12px", borderRadius: "var(--r-pill)", border: "1px solid var(--line)", cursor: "pointer", fontWeight: 600, fontSize: 12, background: "var(--card)", color: "var(--text)" };
const cardStyle = { background: "var(--card)", borderRadius: "var(--r-card)", padding: 16, border: "1px solid var(--line)", marginBottom: 12, boxShadow: "var(--shadow-sm)" };

const TABS = ["Announcements", "Surveys", "Badges", "Dashboard"];

/* ── Main component ───────────────────────────────────────────────── */

export default function HREngagement() {
  const { user } = useAuth();
  const [tab, setTab] = useState("Announcements");

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 18 }}>Employee Engagement</h1>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--line)", marginBottom: 20 }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "9px 22px",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontWeight: tab === t ? 700 : 500,
              color: tab === t ? "var(--text)" : "var(--text-faint)",
              borderBottom: tab === t ? "2px solid var(--lime)" : "2px solid transparent",
              marginBottom: -1,
              fontSize: 13,
              fontFamily: "inherit",
              transition: "color .2s",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Announcements" && <AnnouncementsTab />}
      {tab === "Surveys" && <SurveysTab />}
      {tab === "Badges" && <BadgesTab />}
      {tab === "Dashboard" && <DashboardTab />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Announcements Tab
   ═══════════════════════════════════════════════════════════════════ */

function AnnouncementsTab() {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ title: "", body: "", priority: "NORMAL", expires_at: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [pendingFiles, setPendingFiles] = useState([]);
  const pendingInputRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const data = await api.get("/engagement/announcements");
      setAnnouncements(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    let es;
    try {
      es = new EventSource("/api/events", { withCredentials: true });
      es.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data);
          if (d.entity === "announcements") fetchData();
        } catch { /* ignore */ }
      };
    } catch { /* ignore */ }
    return () => { es?.close(); };
  }, [fetchData]);

  function resetForm() {
    setForm({ title: "", body: "", priority: "NORMAL", expires_at: "" });
    setEditId(null);
    setShowForm(false);
    setError("");
    setPendingFiles([]);
  }

  function handleEdit(a) {
    setForm({
      title: a.title,
      body: a.body,
      priority: a.priority,
      expires_at: a.expires_at || "",
    });
    setEditId(a.id);
    setShowForm(true);
    setError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const payload = {
      title: form.title,
      body: form.body,
      priority: form.priority,
      expires_at: form.expires_at || null,
    };

    try {
      if (editId) {
        await api.patch(`/engagement/announcements/${editId}`, payload);
      } else {
        const created = await api.post("/engagement/announcements", payload);
        if (pendingFiles.length && created.id) {
          for (const f of pendingFiles) {
            const fd = new FormData();
            fd.append("file", f);
            fd.append("owner_type", "announcement");
            fd.append("owner_id", String(created.id));
            await fetch("/api/attachments", { method: "POST", credentials: "include", body: fd });
          }
        }
      }
      resetForm();
      fetchData();
    } catch (err) {
      setError(err.data?.error || err.message);
    }
    setSubmitting(false);
  }

  async function handleDelete(id) {
    if (!confirm("Delete this announcement?")) return;
    try {
      await api.delete(`/engagement/announcements/${id}`);
      fetchData();
    } catch (err) {
      alert(err.data?.error || err.message);
    }
  }

  async function handleToggleActive(a) {
    try {
      await api.patch(`/engagement/announcements/${a.id}`, { active: a.active ? 0 : 1 });
      fetchData();
    } catch (err) {
      alert(err.data?.error || err.message);
    }
  }

  if (loading) return <div style={{ padding: 20, color: "var(--text-muted)" }}>Loading...</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ fontSize: 14, color: "var(--text-muted)" }}>{announcements.length} announcement(s)</span>
        <button onClick={() => { resetForm(); setShowForm(true); }} style={btnPrimary}>
          + New Announcement
        </button>
      </div>

      {/* Create / Edit Form */}
      {showForm && (
        <div style={{ ...cardStyle, marginBottom: 18, borderColor: "var(--lime)" }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: "var(--text)" }}>
            {editId ? "Edit Announcement" : "New Announcement"}
          </div>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>Title</label>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                style={inputStyle}
                required
              />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>Body</label>
              <textarea
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                rows={3}
                style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
                required
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10 }}>
              <div>
                <label style={labelStyle}>Priority</label>
                <select
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value })}
                  style={inputStyle}
                >
                  <option value="NORMAL">Normal</option>
                  <option value="IMPORTANT">Important</option>
                  <option value="URGENT">Urgent</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Expires At (optional)</label>
                <input
                  type="date"
                  value={form.expires_at}
                  onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Attachments */}
            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>Attachments</label>
              {editId ? (
                <FileUpload ownerType="announcement" ownerId={String(editId)} accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" label="" />
              ) : (
                <div>
                  <label style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "6px 14px", background: "var(--bg)", color: "var(--charcoal)",
                    border: "1px dashed var(--line)", borderRadius: "var(--r-card)",
                    fontSize: 12, fontWeight: 600, cursor: "pointer",
                  }}>
                    <span style={{ fontSize: 14 }}>+</span> Add files
                    <input
                      ref={pendingInputRef}
                      type="file"
                      multiple
                      accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                      onChange={(e) => {
                        if (e.target.files?.length) setPendingFiles(prev => [...prev, ...Array.from(e.target.files)]);
                        e.target.value = "";
                      }}
                      style={{ display: "none" }}
                    />
                  </label>
                  {pendingFiles.length > 0 && (
                    <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {pendingFiles.map((f, i) => (
                        <span key={i} style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          padding: "4px 10px", background: "var(--bg)", borderRadius: "var(--r-card)",
                          fontSize: 12, fontWeight: 500,
                        }}>
                          {f.name}
                          <span style={{ cursor: "pointer", color: "var(--danger)", fontWeight: 700 }}
                            onClick={() => setPendingFiles(prev => prev.filter((_, j) => j !== i))}>×</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {error && <div style={{ color: "var(--danger)", fontSize: 13, marginBottom: 8 }}>{error}</div>}

            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" disabled={submitting} style={{ ...btnPrimary, opacity: submitting ? 0.6 : 1 }}>
                {submitting ? "Saving..." : editId ? "Update" : "Publish"}
              </button>
              <button type="button" onClick={resetForm} style={btnSmall}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Announcements table */}
      <div style={{ background: "var(--card)", borderRadius: "var(--r-card)", border: "1px solid var(--line)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th style={thStyle}>Priority</th>
              <th style={thStyle}>Title</th>
              <th style={thStyle}>Published By</th>
              <th style={thStyle}>Published</th>
              <th style={thStyle}>Expires</th>
              <th style={thStyle}>Files</th>
              <th style={thStyle}>Active</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {announcements.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: 24, textAlign: "center", color: "var(--text-faint)" }}>
                  No announcements yet.
                </td>
              </tr>
            )}
            {announcements.map((a) => (
              <tr key={a.id}>
                <td style={tdStyle}><PriorityBadge priority={a.priority} /></td>
                <td style={{ ...tdStyle, fontWeight: 600, maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {a.title}
                </td>
                <td style={tdStyle}>{a.published_by_name}</td>
                <td style={tdStyle}>{fmtDate(a.published_at)}</td>
                <td style={tdStyle}>{a.expires_at ? fmtDate(a.expires_at) : "—"}</td>
                <td style={tdStyle}>{a.attachments?.length || 0}</td>
                <td style={tdStyle}>
                  <span style={{
                    padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600,
                    background: a.active ? "var(--badge-green-bg)" : "var(--line)",
                    color: a.active ? "var(--badge-green-text)" : "var(--text-faint)",
                    cursor: "pointer",
                  }} onClick={() => handleToggleActive(a)}>
                    {a.active ? "YES" : "NO"}
                  </span>
                </td>
                <td style={tdStyle}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => handleEdit(a)} style={btnSmall}>Edit</button>
                    <button onClick={() => handleDelete(a.id)} style={{ ...btnSmall, color: "var(--danger)", borderColor: "var(--badge-danger-bg)" }}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Surveys Tab
   ═══════════════════════════════════════════════════════════════════ */

function SurveysTab() {
  const { user } = useAuth();
  const [surveys, setSurveys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Create form
  const [form, setForm] = useState({ title: "", description: "", anonymous: false, closes_at: "" });
  const [questions, setQuestions] = useState([{ question: "", type: "RATING", options: "" }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Results view
  const [resultsForId, setResultsForId] = useState(null);
  const [results, setResults] = useState(null);
  const [resultsLoading, setResultsLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const data = await api.get("/engagement/surveys");
      setSurveys(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    let es;
    try {
      es = new EventSource("/api/events", { withCredentials: true });
      es.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data);
          if (d.entity === "surveys" || d.entity === "survey_responses") fetchData();
        } catch { /* ignore */ }
      };
    } catch { /* ignore */ }
    return () => { es?.close(); };
  }, [fetchData]);

  function resetForm() {
    setForm({ title: "", description: "", anonymous: false, closes_at: "" });
    setQuestions([{ question: "", type: "RATING", options: "" }]);
    setShowForm(false);
    setError("");
  }

  function addQuestion() {
    setQuestions([...questions, { question: "", type: "RATING", options: "" }]);
  }

  function updateQuestion(idx, field, value) {
    setQuestions(questions.map((q, i) => i === idx ? { ...q, [field]: value } : q));
  }

  function removeQuestion(idx) {
    if (questions.length <= 1) return;
    setQuestions(questions.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const payload = {
      title: form.title,
      description: form.description || null,
      anonymous: form.anonymous,
      closes_at: form.closes_at || null,
      questions: questions.map((q, i) => ({
        question: q.question,
        type: q.type,
        options: q.type === "CHOICE" ? q.options : null,
        sort_order: i + 1,
      })),
    };

    try {
      await api.post("/engagement/surveys", payload);
      resetForm();
      fetchData();
    } catch (err) {
      setError(err.data?.error || err.message);
    }
    setSubmitting(false);
  }

  async function handleStatusChange(surveyId, newStatus) {
    try {
      await api.patch(`/engagement/surveys/${surveyId}`, { status: newStatus });
      fetchData();
    } catch (err) {
      alert(err.data?.error || err.message);
    }
  }

  async function handleViewResults(surveyId) {
    if (resultsForId === surveyId) {
      setResultsForId(null);
      setResults(null);
      return;
    }
    setResultsForId(surveyId);
    setResultsLoading(true);
    try {
      const data = await api.get(`/engagement/surveys/${surveyId}/results`);
      setResults(data);
    } catch (err) {
      alert(err.data?.error || err.message);
      setResultsForId(null);
    }
    setResultsLoading(false);
  }

  if (loading) return <div style={{ padding: 20, color: "var(--text-muted)" }}>Loading...</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ fontSize: 14, color: "var(--text-muted)" }}>{surveys.length} survey(s)</span>
        <button onClick={() => { resetForm(); setShowForm(true); }} style={btnPrimary}>
          + New Survey
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div style={{ ...cardStyle, marginBottom: 18, borderColor: "var(--lime)" }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: "var(--text)" }}>
            New Survey
          </div>
          <form onSubmit={handleSubmit}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10 }}>
              <div>
                <label style={labelStyle}>Title</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  style={inputStyle}
                  required
                />
              </div>
              <div>
                <label style={labelStyle}>Closes At (optional)</label>
                <input
                  type="date"
                  value={form.closes_at}
                  onChange={(e) => setForm({ ...form, closes_at: e.target.value })}
                  style={inputStyle}
                />
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>Description (optional)</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
                style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
              />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, marginBottom: 14, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={form.anonymous}
                onChange={(e) => setForm({ ...form, anonymous: e.target.checked })}
              />
              Anonymous responses
            </label>

            {/* Questions builder */}
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: "var(--text)" }}>Questions</div>
            {questions.map((q, idx) => (
              <div key={idx} style={{
                background: "var(--bg)",
                borderRadius: 8,
                padding: 12,
                border: "1px solid #e2e8f0",
                marginBottom: 8,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Question {idx + 1}</span>
                  {questions.length > 1 && (
                    <button type="button" onClick={() => removeQuestion(idx)} style={{ ...btnSmall, color: "var(--danger)", fontSize: 11, padding: "2px 8px" }}>Remove</button>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 8, marginBottom: 8 }}>
                  <input
                    value={q.question}
                    onChange={(e) => updateQuestion(idx, "question", e.target.value)}
                    placeholder="Enter question text..."
                    style={inputStyle}
                    required
                  />
                  <select
                    value={q.type}
                    onChange={(e) => updateQuestion(idx, "type", e.target.value)}
                    style={inputStyle}
                  >
                    <option value="RATING">Rating (1-5)</option>
                    <option value="TEXT">Text</option>
                    <option value="CHOICE">Choice</option>
                  </select>
                </div>
                {q.type === "CHOICE" && (
                  <div>
                    <label style={{ ...labelStyle, fontSize: 11 }}>Options (pipe-separated, e.g. "Agree|Neutral|Disagree")</label>
                    <input
                      value={q.options}
                      onChange={(e) => updateQuestion(idx, "options", e.target.value)}
                      placeholder="Option A|Option B|Option C"
                      style={inputStyle}
                      required
                    />
                  </div>
                )}
              </div>
            ))}
            <button type="button" onClick={addQuestion} style={{ ...btnSmall, marginBottom: 14 }}>
              + Add Question
            </button>

            {error && <div style={{ color: "var(--danger)", fontSize: 13, marginBottom: 8 }}>{error}</div>}

            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" disabled={submitting} style={{ ...btnPrimary, opacity: submitting ? 0.6 : 1 }}>
                {submitting ? "Creating..." : "Create Survey"}
              </button>
              <button type="button" onClick={resetForm} style={btnSmall}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Surveys table */}
      <div style={{ background: "var(--card)", borderRadius: "var(--r-card)", border: "1px solid var(--line)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th style={thStyle}>Title</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Anonymous</th>
              <th style={thStyle}>Closes</th>
              <th style={thStyle}>Created By</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {surveys.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 24, textAlign: "center", color: "var(--text-faint)" }}>No surveys yet.</td>
              </tr>
            )}
            {surveys.map((s) => (
              <tr key={s.id} style={{ background: resultsForId === s.id ? "var(--lime-subtle)" : "transparent" }}>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{s.title}</td>
                <td style={tdStyle}><StatusBadge status={s.status} /></td>
                <td style={tdStyle}>{s.anonymous ? "Yes" : "No"}</td>
                <td style={tdStyle}>{s.closes_at ? fmtDate(s.closes_at) : "—"}</td>
                <td style={tdStyle}>{s.created_by_name}</td>
                <td style={tdStyle}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {s.status === "DRAFT" && (
                      <button onClick={() => handleStatusChange(s.id, "ACTIVE")} style={{ ...btnSmall, color: "var(--badge-green-text)", borderColor: "var(--badge-green-bg)" }}>
                        Activate
                      </button>
                    )}
                    {s.status === "ACTIVE" && (
                      <button onClick={() => handleStatusChange(s.id, "CLOSED")} style={{ ...btnSmall, color: "var(--text-faint)", borderColor: "var(--line)" }}>
                        Close
                      </button>
                    )}
                    <button onClick={() => handleViewResults(s.id)} style={btnSmall}>
                      {resultsForId === s.id ? "Hide Results" : "Results"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Inline Results */}
      {resultsForId && (
        <div style={{ ...cardStyle, marginTop: 12, borderColor: "var(--lime)" }}>
          {resultsLoading ? (
            <div style={{ color: "var(--text-muted)", fontSize: 13 }}>Loading results...</div>
          ) : results ? (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
                  Results: {results.title}
                </div>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {results.totalRespondents} respondent(s) {results.anonymous ? "(Anonymous)" : ""}
                </span>
              </div>

              {results.questions.map((q) => (
                <div key={q.question_id} style={{
                  background: "var(--bg)",
                  borderRadius: 8,
                  padding: 12,
                  border: "1px solid #e2e8f0",
                  marginBottom: 10,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
                    {q.question}
                    <span style={{ fontWeight: 400, color: "var(--text-faint)", marginLeft: 8 }}>({q.type})</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>
                    {q.totalResponses} response(s)
                  </div>

                  {q.type === "RATING" && (
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>
                        {q.avg} <span style={{ fontSize: 12, fontWeight: 400, color: "var(--text-faint)" }}>/ 5 average</span>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <div key={n} style={{ textAlign: "center" }}>
                            <div style={{
                              width: 32,
                              height: Math.max(4, ((q.distribution?.[String(n)] || 0) / Math.max(q.totalResponses, 1)) * 60),
                              background: "var(--lime)",
                              borderRadius: 4,
                              marginBottom: 2,
                            }} />
                            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{n}</div>
                            <div style={{ fontSize: 10, color: "var(--text-faint)" }}>{q.distribution?.[String(n)] || 0}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {q.type === "CHOICE" && q.counts && (
                    <div>
                      {Object.entries(q.counts).map(([option, count]) => (
                        <div key={option} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <div style={{
                            flex: 1, height: 20, background: "var(--line)", borderRadius: 4, overflow: "hidden",
                          }}>
                            <div style={{
                              width: `${q.totalResponses > 0 ? (count / q.totalResponses) * 100 : 0}%`,
                              height: "100%",
                              background: "var(--lime)",
                              borderRadius: 4,
                              transition: "width 0.3s",
                            }} />
                          </div>
                          <span style={{ fontSize: 12, minWidth: 120, color: "var(--text-muted)" }}>{option}</span>
                          <span style={{ fontSize: 12, color: "var(--text-faint)", minWidth: 30, textAlign: "right" }}>{count}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {q.type === "TEXT" && q.answers && (
                    <div style={{ maxHeight: 200, overflowY: "auto" }}>
                      {q.answers.length === 0 && (
                        <div style={{ fontSize: 12, color: "var(--text-faint)" }}>No text responses.</div>
                      )}
                      {q.answers.map((a, i) => (
                        <div key={i} style={{
                          padding: "6px 10px",
                          background: "var(--bg)",
                          borderRadius: "var(--r-card)",
                          border: "1px solid var(--line)",
                          marginBottom: 4,
                          fontSize: 13,
                          color: "var(--text-muted)",
                        }}>
                          {a.employee_name && (
                            <span style={{ fontWeight: 600, marginRight: 6 }}>{a.employee_name}:</span>
                          )}
                          {a.answer}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Badges Tab
   ═══════════════════════════════════════════════════════════════════ */

function BadgesTab() {
  const [badges, setBadges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", icon: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const data = await api.get("/engagement/badges");
      setBadges(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    let es;
    try {
      es = new EventSource("/api/events", { withCredentials: true });
      es.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data);
          if (d.entity === "badges") fetchData();
        } catch { /* ignore */ }
      };
    } catch { /* ignore */ }
    return () => { es?.close(); };
  }, [fetchData]);

  function resetForm() {
    setForm({ name: "", description: "", icon: "" });
    setShowForm(false);
    setError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await api.post("/engagement/badges", {
        name: form.name,
        description: form.description || null,
        icon: form.icon || null,
      });
      resetForm();
      fetchData();
    } catch (err) {
      setError(err.data?.error || err.message);
    }
    setSubmitting(false);
  }

  if (loading) return <div style={{ padding: 20, color: "var(--text-muted)" }}>Loading...</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ fontSize: 14, color: "var(--text-muted)" }}>{badges.length} badge(s)</span>
        <button onClick={() => { resetForm(); setShowForm(true); }} style={btnPrimary}>
          + New Badge
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div style={{ ...cardStyle, marginBottom: 18, borderColor: "var(--lime)" }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: "var(--text)" }}>
            New Badge
          </div>
          <form onSubmit={handleSubmit}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px", gap: 12, marginBottom: 10 }}>
              <div>
                <label style={labelStyle}>Name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  style={inputStyle}
                  required
                />
              </div>
              <div>
                <label style={labelStyle}>Description</label>
                <input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Icon</label>
                <input
                  value={form.icon}
                  onChange={(e) => setForm({ ...form, icon: e.target.value })}
                  placeholder="e.g. ⭐"
                  style={inputStyle}
                />
              </div>
            </div>

            {error && <div style={{ color: "var(--danger)", fontSize: 13, marginBottom: 8 }}>{error}</div>}

            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" disabled={submitting} style={{ ...btnPrimary, opacity: submitting ? 0.6 : 1 }}>
                {submitting ? "Creating..." : "Create Badge"}
              </button>
              <button type="button" onClick={resetForm} style={btnSmall}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Badge cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
        {badges.map((b) => (
          <div key={b.id} style={cardStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: "var(--bg)",
                border: "1px solid #e2e8f0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
              }}>
                {b.icon || <Icon name="star" filled={true} style={{ fontSize: 20 }} />}
              </span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{b.name}</div>
                {b.description && (
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{b.description}</div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {badges.length === 0 && !showForm && (
        <div style={{ ...cardStyle, textAlign: "center", color: "var(--text-faint)", padding: 32 }}>
          No badges created yet.
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Dashboard Tab
   ═══════════════════════════════════════════════════════════════════ */

function DashboardTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const d = await api.get("/engagement/dashboard");
        setData(d);
      } catch (err) {
        setError(err.data?.error || err.message);
      }
      setLoading(false);
    })();
  }, []);

  if (loading) return <div style={{ padding: 20, color: "var(--text-muted)" }}>Loading dashboard...</div>;
  if (error) return <div style={{ padding: 20, color: "var(--danger)" }}>{error}</div>;
  if (!data) return null;

  return (
    <div>
      {/* Stat cards row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
        <StatCard label="Active Surveys" value={data.surveys.active} color="#3b82f6" />
        <StatCard label="Total Surveys" value={data.surveys.total} color="var(--text-muted)" />
        <StatCard label="Avg Participation" value={`${data.surveys.avgParticipation}%`} color="var(--badge-green-text)" />
        <StatCard label="Active Announcements" value={data.announcements.active} color="#f59e0b" />
        <StatCard label="Expiring Soon" value={data.announcements.expiringSoon} color="var(--danger)" />
        <StatCard label="Recognitions This Week" value={data.recognitions.thisWeek} color="#8b5cf6" />
        <StatCard label="Recognitions This Month" value={data.recognitions.thisMonth} color="#8b5cf6" />
      </div>

      {/* Top receivers */}
      <div style={cardStyle}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>
          Top Recognition Receivers
        </div>
        {data.recognitions.topReceivers.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--text-faint)" }}>No recognitions data yet.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <th style={thStyle}>Rank</th>
                <th style={thStyle}>Employee</th>
                <th style={thStyle}>Recognitions</th>
              </tr>
            </thead>
            <tbody>
              {data.recognitions.topReceivers.map((r, i) => (
                <tr key={i}>
                  <td style={tdStyle}>
                    <span style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      background: i === 0 ? "var(--badge-amber-bg)" : i === 1 ? "var(--line)" : i === 2 ? "var(--badge-danger-bg)" : "var(--bg)",
                      fontSize: 12,
                      fontWeight: 700,
                      color: "var(--text)",
                    }}>
                      {i + 1}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{r.name}</td>
                  <td style={tdStyle}>{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 12, color: "var(--text-faint)", fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: color || "var(--text)" }}>{value}</div>
    </div>
  );
}
