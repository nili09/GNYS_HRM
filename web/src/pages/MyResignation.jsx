import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../hooks/useAuth.jsx";

const STATUS_BADGE = {
  PENDING: { bg: "#f59e0b22", color: "#f59e0b", label: "Pending" },
  APPROVED: { bg: "#10b98122", color: "#10b981", label: "Approved" },
  REJECTED: { bg: "#ef444422", color: "#ef4444", label: "Rejected" },
  WITHDRAWN: { bg: "#6b728022", color: "#6b7280", label: "Withdrawn" },
};

function fmtDate(d) {
  if (!d) return "—";
  try { return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return d; }
}

export default function MyResignation() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    resignation_type: "Voluntary",
    resignation_reason: "",
    intended_last_day: "",
    requestee_remarks: "",
  });

  const load = useCallback(async () => {
    try {
      const res = await api.get("/resignation/my");
      setData(res);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/resignation/submit", form);
      setShowForm(false);
      await load();
    } catch (e) { setError(e.message || "Failed to submit"); }
    setSubmitting(false);
  }

  async function handleCancel() {
    if (!confirm("Are you sure you want to withdraw your resignation?")) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/resignation/cancel");
      await load();
    } catch (e) { setError(e.message || "Failed to cancel"); }
    setSubmitting(false);
  }

  if (loading) return <div style={{ padding: 20 }}>Loading...</div>;

  const hasResignation = data && data.resignation_status;
  const badge = hasResignation ? STATUS_BADGE[data.resignation_status] : null;

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 className="page-title" style={{ marginBottom: 20 }}>Resignation</h1>

      {error && (
        <div style={{ background: "#ef444422", color: "#ef4444", padding: "10px 14px", borderRadius: 0, marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      {hasResignation ? (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 0, padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Resignation Status</h2>
            {badge && (
              <span style={{
                background: badge.bg, color: badge.color,
                fontSize: 11, fontWeight: 700, padding: "3px 10px",
                borderRadius: 0, textTransform: "uppercase",
              }}>{badge.label}</span>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "10px 16px", fontSize: 13 }}>
            <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>Type</span>
            <span>{data.resignation_type}</span>
            <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>Reason</span>
            <span>{data.resignation_reason}</span>
            <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>Intended Last Day</span>
            <span>{fmtDate(data.resignation_intended_last_day)}</span>
            {data.requestee_remarks && (
              <>
                <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>Your Remarks</span>
                <span>{data.requestee_remarks}</span>
              </>
            )}
            <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>Submitted</span>
            <span>{data.resignation_submitted_at || "—"}</span>
            {data.approver_remarks && (
              <>
                <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>Approver Remarks</span>
                <span>{data.approver_remarks}</span>
              </>
            )}
            {data.exit_date && (
              <>
                <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>Last Working Day</span>
                <span>{fmtDate(data.exit_date)}</span>
              </>
            )}
          </div>

          {data.resignation_status === "PENDING" && (
            <button
              onClick={handleCancel}
              disabled={submitting}
              style={{
                marginTop: 20, padding: "8px 20px", fontSize: 13, fontWeight: 600,
                background: "var(--danger)", color: "#fff", border: "none",
                borderRadius: 0, cursor: "pointer",
              }}
            >
              {submitting ? "Withdrawing..." : "Withdraw Resignation"}
            </button>
          )}
        </div>
      ) : (
        <>
          {!showForm ? (
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 0, padding: 32, textAlign: "center" }}>
              <p style={{ color: "var(--text-muted)", marginBottom: 16, fontSize: 14 }}>
                No resignation on record. If you wish to resign, you can submit a request below.
              </p>
              <button
                onClick={() => setShowForm(true)}
                style={{
                  padding: "10px 24px", fontSize: 13, fontWeight: 600,
                  background: "var(--lime)", color: "var(--bg)", border: "none",
                  borderRadius: 0, cursor: "pointer",
                }}
              >
                Submit Resignation
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 0, padding: 24 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Submit Resignation</h2>

              <label style={{ display: "block", marginBottom: 14 }}>
                <span style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4, color: "var(--text-muted)" }}>Type</span>
                <select
                  value={form.resignation_type}
                  onChange={e => setForm(f => ({ ...f, resignation_type: e.target.value }))}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 0, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13 }}
                >
                  <option>Voluntary</option>
                  <option>Retirement</option>
                  <option>Health Reasons</option>
                  <option>Relocation</option>
                  <option>Other</option>
                </select>
              </label>

              <label style={{ display: "block", marginBottom: 14 }}>
                <span style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4, color: "var(--text-muted)" }}>Reason *</span>
                <textarea
                  required
                  rows={3}
                  value={form.resignation_reason}
                  onChange={e => setForm(f => ({ ...f, resignation_reason: e.target.value }))}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 0, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13, resize: "vertical" }}
                />
              </label>

              <label style={{ display: "block", marginBottom: 14 }}>
                <span style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4, color: "var(--text-muted)" }}>Intended Last Working Day *</span>
                <input
                  type="date"
                  required
                  value={form.intended_last_day}
                  onChange={e => setForm(f => ({ ...f, intended_last_day: e.target.value }))}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 0, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13 }}
                />
              </label>

              <label style={{ display: "block", marginBottom: 20 }}>
                <span style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4, color: "var(--text-muted)" }}>Additional Remarks</span>
                <textarea
                  rows={2}
                  value={form.requestee_remarks}
                  onChange={e => setForm(f => ({ ...f, requestee_remarks: e.target.value }))}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 0, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13, resize: "vertical" }}
                />
              </label>

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    padding: "8px 20px", fontSize: 13, fontWeight: 600,
                    background: "var(--danger)", color: "#fff", border: "none",
                    borderRadius: 0, cursor: "pointer",
                  }}
                >
                  {submitting ? "Submitting..." : "Confirm Resignation"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  style={{
                    padding: "8px 20px", fontSize: 13, fontWeight: 600,
                    background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border)",
                    borderRadius: 0, cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
}
