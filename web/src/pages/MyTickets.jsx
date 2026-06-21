import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../hooks/useAuth.jsx";
import FileUpload from "../components/FileUpload.jsx";

const STATUS_BADGE = {
  OPEN:        { bg: "var(--badge-sky-bg)", color: "var(--badge-sky-text)" },
  IN_PROGRESS: { bg: "var(--badge-tan-bg)", color: "var(--badge-tan-text)" },
  RESOLVED:    { bg: "var(--lime-pale)", color: "var(--charcoal)" },
  CLOSED:      { bg: "var(--badge-danger-bg)", color: "var(--danger)" },
};

const PRIORITY_BADGE = {
  LOW:    { bg: "var(--lime-pale)", color: "var(--charcoal)" },
  MEDIUM: { bg: "var(--badge-tan-bg)", color: "var(--badge-tan-text)" },
  HIGH:   { bg: "var(--badge-danger-bg)", color: "var(--danger)" },
  URGENT: { bg: "var(--danger)", color: "#fff" },
};

function Badge({ map, value }) {
  const s = map[value] || { bg: "var(--border)", color: "var(--text-muted)" };
  return (
    <span style={{
      padding: "2px 10px", borderRadius: "var(--r-pill)", fontSize: 10.5, fontWeight: 700,
      letterSpacing: ".04rem", textTransform: "uppercase", background: s.bg, color: s.color,
    }}>{value?.replace("_", " ")}</span>
  );
}

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function MyTickets() {
  const { user } = useAuth();
  const [tab, setTab] = useState("list");
  const [tickets, setTickets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentBody, setCommentBody] = useState("");

  const [form, setForm] = useState({ category_id: "", subject: "", description: "", priority: "MEDIUM" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const [tix, cats] = await Promise.all([
        api.get("/helpdesk/tickets"),
        api.get("/helpdesk/ticket-categories"),
      ]);
      setTickets(tix);
      setCategories(cats.filter(c => c.active));
      if (!form.category_id && cats.length > 0) {
        setForm(f => ({ ...f, category_id: String(cats[0].id) }));
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const es = new EventSource("/api/events", { withCredentials: true });
    es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.entity === "tickets") fetchData();
      } catch { /* ignore */ }
    };
    return () => es.close();
  }, [fetchData]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(""); setSuccess(""); setSubmitting(true);
    try {
      await api.post("/helpdesk/tickets", {
        category_id: Number(form.category_id),
        subject: form.subject,
        description: form.description,
        priority: form.priority,
      });
      setSuccess("Ticket created successfully");
      setForm({ category_id: form.category_id, subject: "", description: "", priority: "MEDIUM" });
      fetchData();
    } catch (err) {
      setError(err.message || "Failed to create ticket");
    }
    setSubmitting(false);
  }

  async function openTicket(ticket) {
    setSelected(ticket);
    setTab("detail");
    try {
      const data = await api.get(`/helpdesk/tickets/${ticket.id}/comments`);
      setComments(data);
    } catch { setComments([]); }
  }

  async function addComment(e) {
    e.preventDefault();
    if (!commentBody.trim()) return;
    try {
      await api.post(`/helpdesk/tickets/${selected.id}/comments`, { body: commentBody });
      setCommentBody("");
      const data = await api.get(`/helpdesk/tickets/${selected.id}/comments`);
      setComments(data);
    } catch { /* ignore */ }
  }

  const tabStyle = (active) => ({
    padding: "8px 16px", border: "none", cursor: "pointer", fontWeight: 600, fontSize: 12,
    borderBottom: active ? "2px solid var(--lime)" : "2px solid transparent",
    color: active ? "var(--lime)" : "var(--text-muted)",
    background: "transparent", textTransform: "uppercase", letterSpacing: ".05em",
  });

  if (loading) return <p style={{ color: "var(--text-muted)", padding: 24 }}>Loading...</p>;

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, fontFamily: "var(--font-display)" }}>
        My Tickets
      </h2>

      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", marginBottom: 20 }}>
        <button style={tabStyle(tab === "list")} onClick={() => setTab("list")}>My Tickets</button>
        <button style={tabStyle(tab === "create")} onClick={() => setTab("create")}>New Ticket</button>
        {selected && <button style={tabStyle(tab === "detail")} onClick={() => setTab("detail")}>Ticket #{selected.id}</button>}
      </div>

      {tab === "list" && (
        <div style={{ overflowX: "auto" }}>
          {tickets.length === 0 ? (
            <p style={{ color: "var(--text-muted)" }}>No tickets yet.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border)", textAlign: "left" }}>
                  <th style={{ padding: "8px 10px" }}>#</th>
                  <th style={{ padding: "8px 10px" }}>Subject</th>
                  <th style={{ padding: "8px 10px" }}>Category</th>
                  <th style={{ padding: "8px 10px" }}>Priority</th>
                  <th style={{ padding: "8px 10px" }}>Status</th>
                  <th style={{ padding: "8px 10px" }}>Created</th>
                  <th style={{ padding: "8px 10px" }}>Assigned To</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map(t => (
                  <tr key={t.id} style={{ borderBottom: "1px solid var(--border)", cursor: "pointer" }}
                    onClick={() => openTicket(t)}>
                    <td style={{ padding: "8px 10px", fontWeight: 600 }}>{t.id}</td>
                    <td style={{ padding: "8px 10px" }}>{t.subject}</td>
                    <td style={{ padding: "8px 10px" }}>{t.category_name}</td>
                    <td style={{ padding: "8px 10px" }}><Badge map={PRIORITY_BADGE} value={t.priority} /></td>
                    <td style={{ padding: "8px 10px" }}><Badge map={STATUS_BADGE} value={t.status} /></td>
                    <td style={{ padding: "8px 10px" }}>{fmtDate(t.created_at)}</td>
                    <td style={{ padding: "8px 10px" }}>{t.assigned_to_name || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "create" && (
        <form onSubmit={handleSubmit} style={{ maxWidth: 520, display: "flex", flexDirection: "column", gap: 12 }}>
          {error && <div style={{ color: "var(--danger)", fontSize: 13 }}>{error}</div>}
          {success && <div style={{ color: "var(--lime)", fontSize: 13 }}>{success}</div>}
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
            Category
            <select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
              style={{ display: "block", width: "100%", marginTop: 4, padding: "7px 10px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 13 }}>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
            Priority
            <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
              style={{ display: "block", width: "100%", marginTop: 4, padding: "7px 10px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 13 }}>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>
          </label>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
            Subject
            <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} required
              style={{ display: "block", width: "100%", marginTop: 4, padding: "7px 10px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 13 }} />
          </label>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
            Description
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} required rows={4}
              style={{ display: "block", width: "100%", marginTop: 4, padding: "7px 10px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 13, resize: "vertical" }} />
          </label>
          <button type="submit" disabled={submitting}
            style={{ alignSelf: "flex-start", padding: "8px 24px", borderRadius: 4, border: "none", background: "var(--lime)", color: "#ffffff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            {submitting ? "Submitting..." : "Create Ticket"}
          </button>
        </form>
      )}

      {tab === "detail" && selected && (
        <div style={{ maxWidth: 700 }}>
          <button onClick={() => { setSelected(null); setTab("list"); }}
            style={{ marginBottom: 16, border: "none", background: "none", color: "var(--lime)", cursor: "pointer", fontWeight: 600, fontSize: 12, padding: 0 }}>
            &larr; Back to list
          </button>
          <div style={{ background: "var(--card)", borderRadius: 8, padding: 20, marginBottom: 20, border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <span style={{ fontWeight: 700, fontSize: 16 }}>#{selected.id} — {selected.subject}</span>
              <Badge map={STATUS_BADGE} value={selected.status} />
              <Badge map={PRIORITY_BADGE} value={selected.priority} />
            </div>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 8 }}>{selected.description}</p>
            <div style={{ fontSize: 11, color: "var(--text-faint)", display: "flex", gap: 20 }}>
              <span>Category: {selected.category_name}</span>
              <span>Created: {fmtDate(selected.created_at)}</span>
              <span>Assigned: {selected.assigned_to_name || "Unassigned"}</span>
            </div>
            <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
              <FileUpload ownerType="ticket" ownerId={String(selected.id)} label="Attachments" />
            </div>
          </div>

          <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text-muted)" }}>Comments</h4>
          {comments.length === 0 ? (
            <p style={{ color: "var(--text-faint)", fontSize: 13, marginBottom: 16 }}>No comments yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
              {comments.map(c => (
                <div key={c.id} style={{ background: "var(--card)", borderRadius: 6, padding: "10px 14px", border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 12 }}>{c.author_name}</span>
                    <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{fmtDate(c.created_at)}</span>
                  </div>
                  <p style={{ fontSize: 13, margin: 0 }}>{c.body}</p>
                </div>
              ))}
            </div>
          )}

          {(selected.employee_id === user.id || selected.assigned_to === user.id) && (
            <form onSubmit={addComment} style={{ display: "flex", gap: 8 }}>
              <input value={commentBody} onChange={e => setCommentBody(e.target.value)} placeholder="Add a comment..."
                style={{ flex: 1, padding: "7px 10px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 13 }} />
              <button type="submit"
                style={{ padding: "7px 18px", borderRadius: 4, border: "none", background: "var(--lime)", color: "#ffffff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                Send
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
