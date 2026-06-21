import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";

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

export default function HRHelpdesk() {
  const [tab, setTab] = useState("tickets");
  const [tickets, setTickets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(null);
  const [selected, setSelected] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentBody, setCommentBody] = useState("");

  const [catForm, setCatForm] = useState({ name: "", assigned_to: "" });
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const qs = [statusFilter && `status=${statusFilter}`, categoryFilter && `category_id=${categoryFilter}`].filter(Boolean).join("&");
      const [tix, cats, dash, empList] = await Promise.all([
        api.get(`/helpdesk/tickets${qs ? `?${qs}` : ""}`),
        api.get("/helpdesk/ticket-categories"),
        api.get("/helpdesk/dashboard"),
        api.get("/employees"),
      ]);
      setTickets(tix);
      setCategories(cats);
      setDashboard(dash);
      setEmployees(empList.filter(e => e.status === "ACTIVE"));
    } catch { /* ignore */ }
    setLoading(false);
  }, [statusFilter, categoryFilter]);

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

  async function addCategory(e) {
    e.preventDefault();
    setFormError(""); setFormSuccess("");
    try {
      await api.post("/helpdesk/ticket-categories", {
        name: catForm.name,
        assigned_to: catForm.assigned_to ? Number(catForm.assigned_to) : null,
      });
      setCatForm({ name: "", assigned_to: "" });
      setFormSuccess("Category created");
      fetchData();
    } catch (err) { setFormError(err.message || "Failed"); }
  }

  async function updateTicket(ticketId, patch) {
    setActing(`ticket-${ticketId}`);
    try {
      await api.patch(`/helpdesk/tickets/${ticketId}`, patch);
      fetchData();
      if (selected?.id === ticketId) {
        setSelected(s => ({ ...s, ...patch }));
      }
    } catch { /* ignore */ }
    setActing(null);
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

  const inputStyle = {
    display: "block", width: "100%", marginTop: 4, padding: "7px 10px", borderRadius: 4,
    border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 13,
  };

  if (loading) return <p style={{ color: "var(--text-muted)", padding: 24 }}>Loading...</p>;

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, fontFamily: "var(--font-display)" }}>
        Helpdesk
      </h2>

      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", marginBottom: 20 }}>
        <button style={tabStyle(tab === "tickets")} onClick={() => setTab("tickets")}>All Tickets</button>
        <button style={tabStyle(tab === "categories")} onClick={() => setTab("categories")}>Categories</button>
        <button style={tabStyle(tab === "dashboard")} onClick={() => setTab("dashboard")}>Dashboard</button>
        {selected && <button style={tabStyle(tab === "detail")} onClick={() => setTab("detail")}>Ticket #{selected.id}</button>}
      </div>

      {formError && <div style={{ color: "var(--danger)", fontSize: 13, marginBottom: 12 }}>{formError}</div>}
      {formSuccess && <div style={{ color: "var(--lime)", fontSize: 13, marginBottom: 12 }}>{formSuccess}</div>}

      {tab === "tickets" && (
        <>
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...inputStyle, width: 160 }}>
              <option value="">All Statuses</option>
              <option value="OPEN">Open</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="RESOLVED">Resolved</option>
              <option value="CLOSED">Closed</option>
            </select>
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={{ ...inputStyle, width: 160 }}>
              <option value="">All Categories</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border)", textAlign: "left" }}>
                  <th style={{ padding: "8px 10px" }}>#</th>
                  <th style={{ padding: "8px 10px" }}>Subject</th>
                  <th style={{ padding: "8px 10px" }}>Requester</th>
                  <th style={{ padding: "8px 10px" }}>Category</th>
                  <th style={{ padding: "8px 10px" }}>Priority</th>
                  <th style={{ padding: "8px 10px" }}>Status</th>
                  <th style={{ padding: "8px 10px" }}>Assigned</th>
                  <th style={{ padding: "8px 10px" }}>Created</th>
                  <th style={{ padding: "8px 10px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map(t => (
                  <tr key={t.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px 10px", fontWeight: 600, cursor: "pointer", color: "var(--lime)" }} onClick={() => openTicket(t)}>{t.id}</td>
                    <td style={{ padding: "8px 10px", cursor: "pointer" }} onClick={() => openTicket(t)}>{t.subject}</td>
                    <td style={{ padding: "8px 10px" }}>{t.employee_name}</td>
                    <td style={{ padding: "8px 10px" }}>{t.category_name}</td>
                    <td style={{ padding: "8px 10px" }}><Badge map={PRIORITY_BADGE} value={t.priority} /></td>
                    <td style={{ padding: "8px 10px" }}><Badge map={STATUS_BADGE} value={t.status} /></td>
                    <td style={{ padding: "8px 10px" }}>
                      <select value={t.assigned_to || ""} onChange={e => updateTicket(t.id, { assigned_to: e.target.value ? Number(e.target.value) : null })}
                        disabled={acting === `ticket-${t.id}`}
                        style={{ ...inputStyle, width: 130, marginTop: 0, padding: "4px 6px", fontSize: 11 }}>
                        <option value="">Unassigned</option>
                        {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: "8px 10px" }}>{fmtDate(t.created_at)}</td>
                    <td style={{ padding: "8px 10px" }}>
                      {t.status === "OPEN" && (
                        <button onClick={() => updateTicket(t.id, { status: "IN_PROGRESS" })} disabled={acting === `ticket-${t.id}`}
                          style={{ padding: "3px 10px", borderRadius: 4, border: "none", background: "var(--lime)", color: "#ffffff", fontWeight: 700, fontSize: 11, cursor: "pointer", marginRight: 4 }}>
                          Start
                        </button>
                      )}
                      {(t.status === "OPEN" || t.status === "IN_PROGRESS") && (
                        <button onClick={() => updateTicket(t.id, { status: "RESOLVED" })} disabled={acting === `ticket-${t.id}`}
                          style={{ padding: "3px 10px", borderRadius: 4, border: "1px solid var(--border)", background: "transparent", color: "var(--text)", fontWeight: 600, fontSize: 11, cursor: "pointer" }}>
                          Resolve
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {tickets.length === 0 && (
                  <tr><td colSpan={9} style={{ padding: 20, textAlign: "center", color: "var(--text-muted)" }}>No tickets found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "detail" && selected && (
        <div style={{ maxWidth: 700 }}>
          <button onClick={() => { setSelected(null); setTab("tickets"); }}
            style={{ marginBottom: 16, border: "none", background: "none", color: "var(--lime)", cursor: "pointer", fontWeight: 600, fontSize: 12, padding: 0 }}>
            &larr; Back to all tickets
          </button>
          <div style={{ background: "var(--card)", borderRadius: 8, padding: 20, marginBottom: 20, border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <span style={{ fontWeight: 700, fontSize: 16 }}>#{selected.id} — {selected.subject}</span>
              <Badge map={STATUS_BADGE} value={selected.status} />
              <Badge map={PRIORITY_BADGE} value={selected.priority} />
            </div>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 8 }}>{selected.description}</p>
            <div style={{ fontSize: 11, color: "var(--text-faint)", display: "flex", gap: 20, flexWrap: "wrap" }}>
              <span>Requester: {selected.employee_name}</span>
              <span>Category: {selected.category_name}</span>
              <span>Created: {fmtDate(selected.created_at)}</span>
              <span>Assigned: {selected.assigned_to_name || "Unassigned"}</span>
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              {selected.status !== "CLOSED" && (
                <select value={selected.status} onChange={e => updateTicket(selected.id, { status: e.target.value })}
                  style={{ ...inputStyle, width: 140, marginTop: 0, fontSize: 12 }}>
                  <option value="OPEN">Open</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="RESOLVED">Resolved</option>
                  <option value="CLOSED">Closed</option>
                </select>
              )}
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

          <form onSubmit={addComment} style={{ display: "flex", gap: 8 }}>
            <input value={commentBody} onChange={e => setCommentBody(e.target.value)} placeholder="Add a comment..."
              style={{ flex: 1, padding: "7px 10px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 13 }} />
            <button type="submit"
              style={{ padding: "7px 18px", borderRadius: 4, border: "none", background: "var(--lime)", color: "#ffffff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              Send
            </button>
          </form>
        </div>
      )}

      {tab === "categories" && (
        <div style={{ maxWidth: 520 }}>
          <form onSubmit={addCategory} style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
              Category Name
              <input value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} required style={inputStyle} />
            </label>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
              Default Resolver
              <select value={catForm.assigned_to} onChange={e => setCatForm(f => ({ ...f, assigned_to: e.target.value }))} style={inputStyle}>
                <option value="">None</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.code})</option>)}
              </select>
            </label>
            <button type="submit" style={{ alignSelf: "flex-start", padding: "7px 16px", borderRadius: 4, border: "none", background: "var(--lime)", color: "#ffffff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
              Add Category
            </button>
          </form>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--border)", textAlign: "left" }}>
                <th style={{ padding: "8px 10px" }}>Name</th>
                <th style={{ padding: "8px 10px" }}>Default Resolver</th>
              </tr>
            </thead>
            <tbody>
              {categories.map(c => (
                <tr key={c.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "8px 10px" }}>{c.name}</td>
                  <td style={{ padding: "8px 10px" }}>{c.assigned_to_name || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "dashboard" && dashboard && (
        <div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
            <div style={{ background: "var(--card)", borderRadius: 8, padding: "16px 24px", border: "1px solid var(--border)", minWidth: 140 }}>
              <div style={{ fontSize: 11, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>Open Tickets</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{dashboard.totalOpen}</div>
            </div>
            <div style={{ background: "var(--card)", borderRadius: 8, padding: "16px 24px", border: "1px solid var(--border)", minWidth: 140 }}>
              <div style={{ fontSize: 11, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>Resolved</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{dashboard.totalResolved}</div>
            </div>
            <div style={{ background: "var(--card)", borderRadius: 8, padding: "16px 24px", border: "1px solid var(--border)", minWidth: 160 }}>
              <div style={{ fontSize: 11, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>Avg Resolution</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{dashboard.avgResolutionTime}h</div>
            </div>
          </div>

          {dashboard.openByCategory.length > 0 && (
            <>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Open by Category</h3>
              <table style={{ width: "100%", maxWidth: 400, borderCollapse: "collapse", fontSize: 13, marginBottom: 24 }}>
                <tbody>
                  {dashboard.openByCategory.map(c => (
                    <tr key={c.category} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "6px 10px" }}>{c.category}</td>
                      <td style={{ padding: "6px 10px", fontWeight: 700 }}>{c.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {dashboard.agentLoad.length > 0 && (
            <>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Agent Load</h3>
              <table style={{ width: "100%", maxWidth: 400, borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--border)", textAlign: "left" }}>
                    <th style={{ padding: "6px 10px" }}>Agent</th>
                    <th style={{ padding: "6px 10px" }}>Open Tickets</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.agentLoad.map(a => (
                    <tr key={a.name} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "6px 10px" }}>{a.name}</td>
                      <td style={{ padding: "6px 10px", fontWeight: 700 }}>{a.open_tickets}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  );
}
