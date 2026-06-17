import { useState, useEffect } from "react";
import { api } from "../lib/api.js";
import PayslipView from "./PayslipView.jsx";

function fmt(n) {
  return Number(n || 0).toLocaleString("en-IN");
}

function fmtMonth(ym) {
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
}

export default function MyPayslips() {
  const [payslips, setPayslips] = useState([]);
  const [error, setError] = useState("");
  const [selectedLineId, setSelectedLineId] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get("/payroll/my-payslips");
        setPayslips(data);
      } catch (e) {
        setError(e.message);
      }
    })();
  }, []);

  if (selectedLineId) {
    return <PayslipView lineId={selectedLineId} onBack={() => setSelectedLineId(null)} />;
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 18 }}>My Payslips</h1>

      {error && <div style={{ background: "var(--badge-danger-bg)", color: "var(--danger)", padding: "8px 14px", borderRadius: "var(--r-pill)", marginBottom: 12, fontSize: 13 }}>{error}</div>}

      {payslips.length === 0 && !error && (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-faint)", fontSize: 14 }}>
          No finalized payslips yet.
        </div>
      )}

      {payslips.length > 0 && (
        <div style={{ display: "grid", gap: 10, maxWidth: 600 }}>
          {payslips.map((p) => (
            <div
              key={p.id}
              onClick={() => setSelectedLineId(p.id)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                background: "var(--bg)", border: "1px solid var(--line)", borderRadius: "var(--r-card)",
                padding: "14px 18px", cursor: "pointer",
                transition: "box-shadow .15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,.08)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{fmtMonth(p.month)}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                  {p.payable}/{p.month_days} days
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: "var(--charcoal)" }}>₹{fmt(p.net)}</div>
                <div style={{ fontSize: 11, color: "var(--text-faint)" }}>Gross: ₹{fmt(p.gross)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
