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

export default function TeamExpenses() {
  const [expenses, setExpenses] = useState([]);
  const [advances, setAdvances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [exps, advs] = await Promise.all([
        api.get("/expenses/pending"),
        api.get("/expenses/advances?status=PENDING"),
      ]);
      setExpenses(exps);
      setAdvances(advs);
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

  async function actOnExpense(id, action) {
    setActing(`exp-${id}-${action}`);
    try {
      await api.post(`/expenses/${id}/${action}`, {});
      fetchData();
    } catch (err) {
      alert(err.data?.error || err.message);
    }
    setActing(null);
  }

  async function actOnAdvance(id, action) {
    setActing(`adv-${id}-${action}`);
    try {
      await api.post(`/expenses/advances/${id}/${action}`, {});
      fetchData();
    } catch (err) {
      alert(err.data?.error || err.message);
    }
    setActing(null);
  }

  if (loading) return <div style={{ padding: 20, color: "var(--text-muted)" }}>Loading...</div>;

  return (
    <div>
      <h2 style={{ margin: "0 0 20px", fontSize: 22, fontWeight: 700, letterSpacing: "-.02rem" }}>Team Expenses</h2>

      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: "var(--text)" }}>
        Pending Expenses ({expenses.length})
      </div>
      <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r-card)", overflow: "hidden", marginBottom: 24, boxShadow: "var(--shadow-card)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--bg)", textAlign: "left" }}>
              <th style={thStyle}>Employee</th>
              <th style={thStyle}>Date</th>
              <th style={thStyle}>Category</th>
              <th style={thStyle}>Amount</th>
              <th style={thStyle}>Description</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {expenses.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 20, textAlign: "center", color: "var(--text-faint)" }}>No pending expenses</td></tr>
            )}
            {expenses.map((x) => (
              <tr key={x.id} style={{ borderTop: "1px solid var(--line)" }}>
                <td style={tdStyle}><span style={{ fontWeight: 600 }}>{x.employee_name}</span><br /><span style={{ fontSize: 11, color: "var(--text-muted)" }}>{x.employee_code}</span></td>
                <td style={tdStyle}>{fmtDate(x.date)}</td>
                <td style={tdStyle}>{x.category_name}</td>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{fmtAmount(x.amount)}</td>
                <td style={{ ...tdStyle, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.description || "--"}</td>
                <td style={tdStyle}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => actOnExpense(x.id, "approve")} disabled={!!acting} style={actionBtn("approve")} title="Approve">Approve</button>
                    <button onClick={() => actOnExpense(x.id, "reject")} disabled={!!acting} style={actionBtn("reject")} title="Reject">Reject</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: "var(--text)" }}>
        Pending Advance Requests ({advances.length})
      </div>
      <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r-card)", overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--bg)", textAlign: "left" }}>
              <th style={thStyle}>Employee</th>
              <th style={thStyle}>Amount</th>
              <th style={thStyle}>Reason</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {advances.length === 0 && (
              <tr><td colSpan={4} style={{ padding: 20, textAlign: "center", color: "var(--text-faint)" }}>No pending advances</td></tr>
            )}
            {advances.map((a) => (
              <tr key={a.id} style={{ borderTop: "1px solid var(--line)" }}>
                <td style={tdStyle}><span style={{ fontWeight: 600 }}>{a.employee_name}</span><br /><span style={{ fontSize: 11, color: "var(--text-muted)" }}>{a.employee_code}</span></td>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{fmtAmount(a.amount)}</td>
                <td style={{ ...tdStyle, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.reason || "--"}</td>
                <td style={tdStyle}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => actOnAdvance(a.id, "approve")} disabled={!!acting} style={actionBtn("approve")}>Approve</button>
                    <button onClick={() => actOnAdvance(a.id, "reject")} disabled={!!acting} style={actionBtn("reject")}>Reject</button>
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

const thStyle = { padding: "8px 12px", fontSize: 11.5, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".05em" };
const tdStyle = { padding: "10px 12px" };
function actionBtn(type) {
  return {
    padding: "4px 12px", borderRadius: "var(--r-card)", border: "1px solid var(--line)",
    background: "var(--card)", cursor: "pointer", fontSize: 11.5, fontFamily: "inherit", fontWeight: 600,
    color: type === "approve" ? "var(--charcoal)" : "var(--danger)",
  };
}
