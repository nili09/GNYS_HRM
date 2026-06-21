import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../hooks/useAuth.jsx";
import FileUpload from "../components/FileUpload.jsx";

const STATUS_BADGE = {
  PENDING:  { bg: "var(--badge-tan-bg)", color: "var(--badge-tan-text)" },
  APPROVED: { bg: "var(--lime-pale)", color: "var(--charcoal)" },
  REJECTED: { bg: "var(--badge-danger-bg)", color: "var(--danger)" },
  SETTLED:  { bg: "var(--badge-sky-bg)", color: "var(--badge-sky-text)" },
};

function Badge({ status }) {
  const s = STATUS_BADGE[status] || STATUS_BADGE.PENDING;
  return (
    <span style={{
      padding: "2px 10px", borderRadius: "var(--r-pill)", fontSize: 10.5, fontWeight: 700,
      letterSpacing: ".04rem", textTransform: "uppercase", background: s.bg, color: s.color,
    }}>{status}</span>
  );
}

function fmtDate(d) {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtAmount(n) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

export default function MyExpenses() {
  const { user } = useAuth();
  const [tab, setTab] = useState("submit");
  const [categories, setCategories] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [advances, setAdvances] = useState([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({ category_id: "", amount: "", date: "", description: "" });
  const [advForm, setAdvForm] = useState({ amount: "", reason: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const [cats, exps, advs] = await Promise.all([
        api.get("/expenses/categories"),
        api.get("/expenses"),
        api.get("/expenses/advances"),
      ]);
      setCategories(cats.filter((c) => c.active));
      setExpenses(exps);
      setAdvances(advs);
      if (!form.category_id && cats.length > 0) {
        setForm((f) => ({ ...f, category_id: String(cats[0].id) }));
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
        if (d.entity === "expenses" || d.entity === "advance_requests") fetchData();
      } catch { /* ignore */ }
    };
    return () => es.close();
  }, [fetchData]);

  async function handleSubmitExpense(e) {
    e.preventDefault();
    setError(""); setSuccess(""); setSubmitting(true);
    try {
      await api.post("/expenses", {
        category_id: parseInt(form.category_id, 10),
        amount: parseInt(form.amount, 10),
        date: form.date,
        description: form.description || null,
      });
      setSuccess("Expense submitted successfully");
      setForm({ category_id: categories[0]?.id ? String(categories[0].id) : "", amount: "", date: "", description: "" });
      fetchData();
    } catch (err) {
      setError(err.data?.error || err.message);
    }
    setSubmitting(false);
  }

  async function handleSubmitAdvance(e) {
    e.preventDefault();
    setError(""); setSuccess(""); setSubmitting(true);
    try {
      await api.post("/expenses/advances", {
        amount: parseInt(advForm.amount, 10),
        reason: advForm.reason || null,
      });
      setSuccess("Advance request submitted");
      setAdvForm({ amount: "", reason: "" });
      fetchData();
    } catch (err) {
      setError(err.data?.error || err.message);
    }
    setSubmitting(false);
  }

  if (loading) return <div style={{ padding: 20, color: "var(--text-muted)" }}>Loading...</div>;

  const totalPending = expenses.filter((x) => x.status === "PENDING").reduce((s, x) => s + x.amount, 0);
  const totalApproved = expenses.filter((x) => x.status === "APPROVED").reduce((s, x) => s + x.amount, 0);

  return (
    <div>
      <h2 style={{ margin: "0 0 20px", fontSize: 22, fontWeight: 700, letterSpacing: "-.02rem" }}>Expenses</h2>

      {/* Summary cards */}
      <div style={{ display: "flex", gap: 14, marginBottom: 18 }}>
        {[
          { label: "Pending", value: fmtAmount(totalPending), color: "var(--badge-tan-text)" },
          { label: "Approved (unsettled)", value: fmtAmount(totalApproved), color: "var(--charcoal)" },
          { label: "Total Submitted", value: expenses.length, color: "var(--text)" },
        ].map((c) => (
          <div key={c.label} style={{
            flex: 1, background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r-card)", padding: "14px 16px", boxShadow: "var(--shadow-card)",
          }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: c.color, marginTop: 4 }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "2px solid var(--line)", marginBottom: 18 }}>
        {[
          { key: "submit", label: "Submit Expense" },
          { key: "history", label: "My Expenses" },
          { key: "advance", label: "Advance Request" },
        ].map((t) => (
          <button key={t.key} onClick={() => { setTab(t.key); setError(""); setSuccess(""); }} style={{
            padding: "8px 20px", background: "none", border: "none", cursor: "pointer",
            fontWeight: tab === t.key ? 700 : 400,
            color: tab === t.key ? "var(--text)" : "var(--text-muted)",
            borderBottom: tab === t.key ? "2px solid var(--lime)" : "2px solid transparent",
            marginBottom: -2, fontSize: 13.5, fontFamily: "inherit",
          }}>{t.label}</button>
        ))}
      </div>

      {tab === "submit" && (
        <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r-card)", padding: 20, maxWidth: 520, boxShadow: "var(--shadow-card)" }}>
          <form onSubmit={handleSubmitExpense}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label style={labelStyle}>Category</label>
                <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} style={inputStyle}>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Amount (INR)</label>
                <input type="number" min="1" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Date</label>
                <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={inputStyle} />
              </div>
              <div />
            </div>
            <div style={{ marginTop: 14 }}>
              <label style={labelStyle}>Description (optional)</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
            </div>

            {error && <div style={{ marginTop: 12, color: "var(--danger)", fontSize: 13 }}>{error}</div>}
            {success && <div style={{ marginTop: 12, color: "var(--charcoal)", fontSize: 13 }}>{success}</div>}

            <button type="submit" disabled={submitting || !form.category_id || !form.amount || !form.date} style={btnStyle(submitting)}>
              {submitting ? "Submitting..." : "Submit Expense"}
            </button>
          </form>
        </div>
      )}

      {tab === "history" && (
        <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r-card)", overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg)", textAlign: "left" }}>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Category</th>
                <th style={thStyle}>Amount</th>
                <th style={thStyle}>Description</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Receipt</th>
              </tr>
            </thead>
            <tbody>
              {expenses.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 20, textAlign: "center", color: "var(--text-faint)" }}>No expenses</td></tr>
              )}
              {expenses.map((x) => (
                <tr key={x.id} style={{ borderTop: "1px solid var(--line)" }}>
                  <td style={tdStyle}>{fmtDate(x.date)}</td>
                  <td style={tdStyle}>{x.category_name}</td>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{fmtAmount(x.amount)}</td>
                  <td style={{ ...tdStyle, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.description || "--"}</td>
                  <td style={tdStyle}><Badge status={x.status} /></td>
                  <td style={tdStyle}>
                    <FileUpload ownerType="expense" ownerId={String(x.id)} accept=".pdf,.jpg,.jpeg,.png" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "advance" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "start" }}>
          <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r-card)", padding: 20, boxShadow: "var(--shadow-card)" }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, color: "var(--text)" }}>Request Advance</div>
            <form onSubmit={handleSubmitAdvance}>
              <div>
                <label style={labelStyle}>Amount (INR)</label>
                <input type="number" min="1" value={advForm.amount} onChange={(e) => setAdvForm({ ...advForm, amount: e.target.value })} style={inputStyle} />
              </div>
              <div style={{ marginTop: 14 }}>
                <label style={labelStyle}>Reason (optional)</label>
                <textarea value={advForm.reason} onChange={(e) => setAdvForm({ ...advForm, reason: e.target.value })} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
              </div>

              {error && tab === "advance" && <div style={{ marginTop: 12, color: "var(--danger)", fontSize: 13 }}>{error}</div>}
              {success && tab === "advance" && <div style={{ marginTop: 12, color: "var(--charcoal)", fontSize: 13 }}>{success}</div>}

              <button type="submit" disabled={submitting || !advForm.amount} style={btnStyle(submitting)}>
                {submitting ? "Submitting..." : "Request Advance"}
              </button>
            </form>
          </div>

          <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r-card)", overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
            <div style={{ padding: "12px 16px", fontWeight: 700, fontSize: 13.5, borderBottom: "1px solid var(--line)" }}>My Advances</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--bg)", textAlign: "left" }}>
                  <th style={thStyle}>Amount</th>
                  <th style={thStyle}>Reason</th>
                  <th style={thStyle}>Status</th>
                </tr>
              </thead>
              <tbody>
                {advances.length === 0 && (
                  <tr><td colSpan={3} style={{ padding: 20, textAlign: "center", color: "var(--text-faint)" }}>No advance requests</td></tr>
                )}
                {advances.map((a) => (
                  <tr key={a.id} style={{ borderTop: "1px solid var(--line)" }}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{fmtAmount(a.amount)}</td>
                    <td style={{ ...tdStyle, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.reason || "--"}</td>
                    <td style={tdStyle}><Badge status={a.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const labelStyle = { display: "block", fontSize: 12, fontWeight: 600, color: "var(--badge-gray-text)", marginBottom: 4 };
const inputStyle = {
  width: "100%", padding: "7px 10px", borderRadius: "var(--r-card)", border: "1px solid var(--line)",
  fontSize: 13, fontFamily: "inherit", boxSizing: "border-box",
};
const thStyle = { padding: "8px 12px", fontSize: 11.5, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".05em" };
const tdStyle = { padding: "10px 12px" };
function btnStyle(disabled) {
  return {
    marginTop: 16, padding: "9px 28px", borderRadius: "var(--r-pill)", border: "none",
    background: "var(--ink)", color: "var(--lime-light)", fontWeight: 700, fontSize: 13.5,
    cursor: "pointer", opacity: disabled ? 0.6 : 1, fontFamily: "inherit",
  };
}
