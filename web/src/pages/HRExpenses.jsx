import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";

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
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtAmount(n) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

export default function HRExpenses() {
  const [tab, setTab] = useState("expenses");
  const [expenses, setExpenses] = useState([]);
  const [advances, setAdvances] = useState([]);
  const [categories, setCategories] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(null);

  // Category / policy forms
  const [catForm, setCatForm] = useState({ name: "", policy_id: "" });
  const [polForm, setPolForm] = useState({ name: "", per_diem_limit: "", requires_receipt: 1 });
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const [exps, advs, cats, pols] = await Promise.all([
        api.get(`/expenses${statusFilter ? `?status=${statusFilter}` : ""}${monthFilter ? `${statusFilter ? "&" : "?"}month=${monthFilter}` : ""}`),
        api.get("/expenses/advances"),
        api.get("/expenses/categories"),
        api.get("/expenses/policies"),
      ]);
      setExpenses(exps);
      setAdvances(advs);
      setCategories(cats);
      setPolicies(pols);
    } catch { /* ignore */ }
    setLoading(false);
  }, [statusFilter, monthFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const es = new EventSource("/api/events", { withCredentials: true });
    es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (["expenses", "advance_requests", "expense_categories", "expense_policies"].includes(d.entity)) fetchData();
      } catch { /* ignore */ }
    };
    return () => es.close();
  }, [fetchData]);

  async function actOnExpense(id, action, extra) {
    setActing(`exp-${id}`);
    try {
      await api.post(`/expenses/${id}/${action}`, extra || {});
      fetchData();
    } catch (err) {
      alert(err.data?.error || err.message);
    }
    setActing(null);
  }

  async function actOnAdvance(id, action) {
    setActing(`adv-${id}`);
    try {
      await api.post(`/expenses/advances/${id}/${action}`, {});
      fetchData();
    } catch (err) {
      alert(err.data?.error || err.message);
    }
    setActing(null);
  }

  function handleSettle(id) {
    const month = prompt("Enter payroll month (YYYY-MM):");
    if (!month || !/^\d{4}-\d{2}$/.test(month)) return;
    actOnExpense(id, "settle", { settled_in_month: month });
  }

  async function handleAddCategory(e) {
    e.preventDefault();
    setFormError(""); setFormSuccess("");
    try {
      await api.post("/expenses/categories", {
        name: catForm.name,
        policy_id: catForm.policy_id ? parseInt(catForm.policy_id, 10) : null,
      });
      setCatForm({ name: "", policy_id: "" });
      setFormSuccess("Category added");
      fetchData();
    } catch (err) {
      setFormError(err.data?.error || err.message);
    }
  }

  async function handleAddPolicy(e) {
    e.preventDefault();
    setFormError(""); setFormSuccess("");
    try {
      await api.post("/expenses/policies", {
        name: polForm.name,
        per_diem_limit: polForm.per_diem_limit ? parseInt(polForm.per_diem_limit, 10) : null,
        requires_receipt: polForm.requires_receipt,
      });
      setPolForm({ name: "", per_diem_limit: "", requires_receipt: 1 });
      setFormSuccess("Policy added");
      fetchData();
    } catch (err) {
      setFormError(err.data?.error || err.message);
    }
  }

  if (loading) return <div style={{ padding: 20, color: "var(--text-muted)" }}>Loading...</div>;

  return (
    <div>
      <h2 style={{ margin: "0 0 20px", fontSize: 22, fontWeight: 700, letterSpacing: "-.02rem" }}>Expense Management</h2>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "2px solid var(--line)", marginBottom: 18 }}>
        {[
          { key: "expenses", label: "All Expenses" },
          { key: "advances", label: "Advances" },
          { key: "config", label: "Categories & Policies" },
        ].map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: "8px 20px", background: "none", border: "none", cursor: "pointer",
            fontWeight: tab === t.key ? 700 : 400,
            color: tab === t.key ? "var(--text)" : "var(--text-muted)",
            borderBottom: tab === t.key ? "2px solid var(--lime)" : "2px solid transparent",
            marginBottom: -2, fontSize: 13.5, fontFamily: "inherit",
          }}>{t.label}</button>
        ))}
      </div>

      {tab === "expenses" && (
        <>
          {/* Filters */}
          <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...inputStyle, width: 160 }}>
              <option value="">All statuses</option>
              {["PENDING", "APPROVED", "REJECTED", "SETTLED"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input type="month" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} style={{ ...inputStyle, width: 180 }} placeholder="Filter by month" />
          </div>

          <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r-card)", overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--bg)", textAlign: "left" }}>
                  <th style={thStyle}>Employee</th>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Category</th>
                  <th style={thStyle}>Amount</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {expenses.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: 20, textAlign: "center", color: "var(--text-faint)" }}>No expenses</td></tr>
                )}
                {expenses.map((x) => (
                  <tr key={x.id} style={{ borderTop: "1px solid var(--line)" }}>
                    <td style={tdStyle}><span style={{ fontWeight: 600 }}>{x.employee_name}</span><br /><span style={{ fontSize: 11, color: "var(--text-muted)" }}>{x.employee_code}</span></td>
                    <td style={tdStyle}>{fmtDate(x.date)}</td>
                    <td style={tdStyle}>{x.category_name}</td>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{fmtAmount(x.amount)}</td>
                    <td style={tdStyle}><Badge status={x.status} /></td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {x.status === "PENDING" && (
                          <>
                            <button onClick={() => actOnExpense(x.id, "approve")} disabled={!!acting} style={actionBtn("approve")}>Approve</button>
                            <button onClick={() => actOnExpense(x.id, "reject")} disabled={!!acting} style={actionBtn("reject")}>Reject</button>
                          </>
                        )}
                        {x.status === "APPROVED" && (
                          <button onClick={() => handleSettle(x.id)} disabled={!!acting} style={actionBtn("settle")}>Settle</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "advances" && (
        <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r-card)", overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--bg)", textAlign: "left" }}>
                <th style={thStyle}>Employee</th>
                <th style={thStyle}>Amount</th>
                <th style={thStyle}>Reason</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {advances.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 20, textAlign: "center", color: "var(--text-faint)" }}>No advance requests</td></tr>
              )}
              {advances.map((a) => (
                <tr key={a.id} style={{ borderTop: "1px solid var(--line)" }}>
                  <td style={tdStyle}><span style={{ fontWeight: 600 }}>{a.employee_name}</span><br /><span style={{ fontSize: 11, color: "var(--text-muted)" }}>{a.employee_code}</span></td>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{fmtAmount(a.amount)}</td>
                  <td style={{ ...tdStyle, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.reason || "--"}</td>
                  <td style={tdStyle}><Badge status={a.status} /></td>
                  <td style={tdStyle}>
                    {a.status === "PENDING" && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => actOnAdvance(a.id, "approve")} disabled={!!acting} style={actionBtn("approve")}>Approve</button>
                        <button onClick={() => actOnAdvance(a.id, "reject")} disabled={!!acting} style={actionBtn("reject")}>Reject</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "config" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "start" }}>
          {/* Policies */}
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: "var(--text)" }}>Policies</div>
            <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r-card)", padding: 16, marginBottom: 14 }}>
              <form onSubmit={handleAddPolicy}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={labelStyle}>Name</label>
                    <input value={polForm.name} onChange={(e) => setPolForm({ ...polForm, name: e.target.value })} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Per-Diem Limit (INR)</label>
                    <input type="number" min="0" value={polForm.per_diem_limit} onChange={(e) => setPolForm({ ...polForm, per_diem_limit: e.target.value })} style={inputStyle} />
                  </div>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: 12.5, color: "var(--text-muted)" }}>
                  <input type="checkbox" checked={!!polForm.requires_receipt} onChange={(e) => setPolForm({ ...polForm, requires_receipt: e.target.checked ? 1 : 0 })} />
                  Requires receipt
                </label>
                <button type="submit" disabled={!polForm.name} style={{ ...smallBtn, marginTop: 10 }}>Add Policy</button>
              </form>
            </div>
            {policies.map((p) => (
              <div key={p.id} style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r-card)", padding: "10px 14px", marginBottom: 6, fontSize: 13 }}>
                <span style={{ fontWeight: 600 }}>{p.name}</span>
                {p.per_diem_limit && <span style={{ marginLeft: 8, color: "var(--text-muted)", fontSize: 12 }}>Limit: {fmtAmount(p.per_diem_limit)}</span>}
                {p.requires_receipt ? <span style={{ marginLeft: 8, fontSize: 11, color: "var(--badge-green-text)" }}>Receipt required</span> : null}
              </div>
            ))}
          </div>

          {/* Categories */}
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: "var(--text)" }}>Categories</div>
            <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r-card)", padding: 16, marginBottom: 14 }}>
              <form onSubmit={handleAddCategory}>
                <div>
                  <label style={labelStyle}>Name</label>
                  <input value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} style={inputStyle} />
                </div>
                <div style={{ marginTop: 10 }}>
                  <label style={labelStyle}>Policy (optional)</label>
                  <select value={catForm.policy_id} onChange={(e) => setCatForm({ ...catForm, policy_id: e.target.value })} style={inputStyle}>
                    <option value="">None</option>
                    {policies.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <button type="submit" disabled={!catForm.name} style={{ ...smallBtn, marginTop: 10 }}>Add Category</button>
              </form>
              {formError && <div style={{ marginTop: 8, color: "var(--danger)", fontSize: 12 }}>{formError}</div>}
              {formSuccess && <div style={{ marginTop: 8, color: "var(--charcoal)", fontSize: 12 }}>{formSuccess}</div>}
            </div>
            {categories.map((c) => (
              <div key={c.id} style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r-card)", padding: "10px 14px", marginBottom: 6, fontSize: 13 }}>
                <span style={{ fontWeight: 600 }}>{c.name}</span>
                {c.policy_name && <span style={{ marginLeft: 8, color: "var(--text-muted)", fontSize: 12 }}>{c.policy_name}</span>}
                {!c.active && <span style={{ marginLeft: 8, fontSize: 11, color: "var(--danger)" }}>Inactive</span>}
              </div>
            ))}
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
const smallBtn = {
  padding: "6px 16px", borderRadius: "var(--r-pill)", border: "none",
  background: "var(--ink)", color: "var(--lime-light)", fontWeight: 700, fontSize: 12,
  cursor: "pointer", fontFamily: "inherit",
};
function actionBtn(type) {
  return {
    padding: "4px 12px", borderRadius: "var(--r-card)", border: "1px solid var(--line)",
    background: "var(--card)", cursor: "pointer", fontSize: 11.5, fontFamily: "inherit", fontWeight: 600,
    color: type === "reject" ? "var(--danger)" : type === "settle" ? "var(--badge-sky-text)" : "var(--charcoal)",
  };
}
