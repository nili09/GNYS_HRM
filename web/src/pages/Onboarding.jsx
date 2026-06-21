import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../hooks/useAuth.jsx";
import Icon from "../components/Icon.jsx";

function ProgressBar({ done, total, label }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
        <span>{label}</span>
        <span style={{ color: "var(--text-muted)" }}>{done}/{total}</span>
      </div>
      <div style={{ height: 6, background: "var(--border)", borderRadius: 3 }}>
        <div style={{
          height: "100%", borderRadius: 3, transition: "width .3s",
          width: `${pct}%`,
          background: pct === 100 ? "var(--success, #10b981)" : "var(--lime)",
        }} />
      </div>
    </div>
  );
}

function CheckItem({ label, checked, onChange, disabled }) {
  return (
    <label style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 0", borderBottom: "1px solid var(--border)",
      cursor: disabled ? "default" : "pointer", fontSize: 13,
    }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        style={{ width: 16, height: 16, accentColor: "var(--lime)" }}
      />
      <span style={{ color: checked ? "var(--text-muted)" : "var(--text)", textDecoration: checked ? "line-through" : "none" }}>
        {label}
      </span>
    </label>
  );
}

export default function Onboarding() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get("/onboarding/my");
      setData(res);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleDoc(key, done) {
    setBusy(true);
    try {
      await api.post("/onboarding/doc-check", { key, done: done ? 1 : 0 });
      await load();
    } catch { /* ignore */ }
    setBusy(false);
  }

  async function ackPolicy(policyKey) {
    setBusy(true);
    try {
      await api.post("/onboarding/policy-ack", { policy_key: policyKey });
      await load();
    } catch { /* ignore */ }
    setBusy(false);
  }

  if (loading) return <div style={{ padding: 20 }}>Loading...</div>;
  if (!data) return <div style={{ padding: 20, color: "var(--text-muted)" }}>Could not load onboarding data.</div>;

  const { employee, docs, policies, progress } = data;
  const isOnboarding = employee.status === "ONBOARDING";

  return (
    <div style={{ maxWidth: 680 }}>
      {/* Welcome header */}
      <div style={{
        background: "linear-gradient(135deg, var(--ink) 0%, #1a1a2e 100%)",
        borderRadius: 10, padding: "28px 28px 24px", marginBottom: 24,
        color: "#fff",
      }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 6px" }}>
          {isOnboarding ? `Welcome aboard, ${employee.name.split(" ")[0]}!` : "Onboarding Checklist"}
        </h1>
        {isOnboarding && (
          <p style={{ fontSize: 13, color: "rgba(255,255,255,.6)", margin: 0 }}>
            Complete the steps below to get started. Your joining date is{" "}
            <strong style={{ color: "var(--lime)" }}>{fmtDate(employee.doj)}</strong>.
          </p>
        )}
        {progress.complete && (
          <div style={{
            marginTop: 12, background: "#10b98122", color: "#10b981",
            padding: "8px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600,
          }}>
            All steps completed!
          </div>
        )}
      </div>

      {/* Progress overview */}
      <div style={{
        background: "var(--card)", border: "1px solid var(--border)",
        borderRadius: 8, padding: 20, marginBottom: 20,
      }}>
        <ProgressBar done={progress.docs_done} total={progress.docs_total} label="Documents" />
        <ProgressBar done={progress.policies_done} total={progress.policies_total} label="Policies" />
      </div>

      {/* Document checklist */}
      <div style={{
        background: "var(--card)", border: "1px solid var(--border)",
        borderRadius: 8, padding: 20, marginBottom: 20,
      }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Document Checklist</h2>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
          Upload and mark each required document as complete. Use your Profile page to upload documents.
        </p>
        {docs.map(d => (
          <CheckItem
            key={d.key}
            label={d.label}
            checked={d.done}
            disabled={busy}
            onChange={() => toggleDoc(d.key, !d.done)}
          />
        ))}
      </div>

      {/* Policy acknowledgments */}
      <div style={{
        background: "var(--card)", border: "1px solid var(--border)",
        borderRadius: 8, padding: 20, marginBottom: 20,
      }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Policy Acknowledgments</h2>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
          Read and acknowledge each company policy.
        </p>
        {policies.map(p => (
          <div key={p.key} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 0", borderBottom: "1px solid var(--border)",
          }}>
            <span style={{ fontSize: 13, color: p.acked ? "var(--text-muted)" : "var(--text)", display: "flex", alignItems: "center", gap: 4 }}>
              {p.acked && <Icon name="check" style={{ fontSize: 14, color: "var(--success, #10b981)" }} />}{p.label}
            </span>
            {p.acked ? (
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                Acknowledged
              </span>
            ) : (
              <button
                onClick={() => ackPolicy(p.key)}
                disabled={busy}
                style={{
                  padding: "5px 14px", fontSize: 12, fontWeight: 600,
                  background: "var(--lime)", color: "#ffffff", border: "none",
                  borderRadius: 5, cursor: "pointer",
                }}
              >
                Acknowledge
              </button>
            )}
          </div>
        ))}
      </div>

      {/* First week tips */}
      {isOnboarding && (
        <div style={{
          background: "var(--card)", border: "1px solid var(--border)",
          borderRadius: 8, padding: 20,
        }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>First Week Steps</h2>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.8, color: "var(--text)" }}>
            <li>Complete your profile — add personal details, emergency contacts, and bank info</li>
            <li>Upload all required documents from the checklist above</li>
            <li>Read and acknowledge all company policies</li>
            <li>Meet your manager and team members</li>
            <li>Set up your workstation and IT access</li>
            <li>Review the employee handbook and leave policy</li>
          </ol>
        </div>
      )}
    </div>
  );
}

function fmtDate(d) {
  if (!d) return "—";
  try { return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return d; }
}
