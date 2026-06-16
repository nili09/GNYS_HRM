import { useState, useEffect } from "react";
import { api } from "../lib/api.js";

function fmt(n) {
  return Number(n || 0).toLocaleString("en-IN");
}

function fmtMonth(ym) {
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
}

export default function PayslipView({ lineId, onBack }) {
  const [slip, setSlip] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get(`/payroll/payslip/${lineId}`);
        setSlip(data);
      } catch (e) {
        setError(e.message);
      }
    })();
  }, [lineId]);

  if (error) {
    return (
      <div>
        <button onClick={onBack} style={backBtnStyle}>← Back</button>
        <div style={{ color: "var(--danger)", marginTop: 16 }}>{error}</div>
      </div>
    );
  }

  if (!slip) {
    return <div style={{ padding: 40, textAlign: "center", color: "var(--text-faint)" }}>Loading payslip…</div>;
  }

  const isDraft = slip.run_status === "DRAFT";
  const totalDeductions = (slip.ded_pf || 0) + (slip.ded_esi || 0) + (slip.ded_pt || 0) + (slip.ded_tds || 0);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <button onClick={onBack} style={backBtnStyle}>← Back</button>
        <button onClick={() => window.print()} style={printBtnStyle}>Print</button>
      </div>

      {/* Payslip container */}
      <div id="payslip-print" style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: "var(--r-card)", padding: 32, maxWidth: 800, margin: "0 auto", position: "relative", overflow: "hidden" }}>

        {/* DRAFT watermark */}
        {isDraft && (
          <div style={{
            position: "absolute", top: "50%", left: "50%",
            transform: "translate(-50%, -50%) rotate(-30deg)",
            fontSize: 80, fontWeight: 900, color: "rgba(223,241,64,.08)",
            letterSpacing: 20, pointerEvents: "none", whiteSpace: "nowrap",
            zIndex: 1,
          }}>DRAFT</div>
        )}

        {/* Company header */}
        <div style={{ textAlign: "center", marginBottom: 20, position: "relative", zIndex: 2 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Genesys International Corporation Ltd</h2>
          <p style={{ margin: "4px 0 0", color: "var(--text-muted)", fontSize: 12 }}>Payslip for {fmtMonth(slip.month)}</p>
        </div>

        {/* Employee info */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 24px", fontSize: 13, marginBottom: 20, position: "relative", zIndex: 2 }}>
          <InfoRow label="Employee Code" value={slip.emp_code} />
          <InfoRow label="Employee Name" value={slip.emp_name} />
          <InfoRow label="Department" value={slip.dept_name || "—"} />
          <InfoRow label="Designation" value={slip.desig_name || "—"} />
          <InfoRow label="PAN" value={slip.pan || "—"} />
          <InfoRow label="UAN" value={slip.uan || "—"} />
          <InfoRow label="Bank" value={slip.bank_name || "—"} />
          <InfoRow label="Account" value={slip.bank_acc || "—"} />
          <InfoRow label="Working Days" value={`${slip.payable} / ${slip.month_days}`} />
        </div>

        <hr style={{ border: "none", borderTop: "1px solid var(--line)", margin: "16px 0" }} />

        {/* Earnings + Deductions side by side */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, fontSize: 13, position: "relative", zIndex: 2 }}>
          {/* Earnings */}
          <div>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--charcoal)", marginBottom: 10, textTransform: "uppercase", letterSpacing: ".05em" }}>Earnings</h3>
            <SlipRow label="Basic" value={slip.earn_basic} />
            <SlipRow label="HRA" value={slip.earn_hra} />
            <SlipRow label="Conveyance" value={slip.earn_conv} />
            <SlipRow label="Medical" value={slip.earn_medical} />
            <SlipRow label="LTA" value={slip.earn_lta} />
            <SlipRow label="Special Allowance" value={slip.earn_special} />
            {slip.earn_other > 0 && <SlipRow label="Other" value={slip.earn_other} />}
            <div style={{ borderTop: "1px solid var(--line)", marginTop: 8, paddingTop: 8 }}>
              <SlipRow label="Gross Earnings" value={slip.gross} bold />
            </div>
          </div>

          {/* Deductions */}
          <div>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--danger)", marginBottom: 10, textTransform: "uppercase", letterSpacing: ".05em" }}>Deductions</h3>
            <SlipRow label="Provident Fund" value={slip.ded_pf} />
            <SlipRow label="ESI" value={slip.ded_esi} />
            <SlipRow label="Professional Tax" value={slip.ded_pt} />
            <SlipRow label="TDS" value={slip.ded_tds} />
            <div style={{ borderTop: "1px solid var(--line)", marginTop: 8, paddingTop: 8 }}>
              <SlipRow label="Total Deductions" value={totalDeductions} bold />
            </div>
          </div>
        </div>

        <hr style={{ border: "none", borderTop: "2px solid var(--ink)", margin: "20px 0 12px" }} />

        {/* Net pay */}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 800, position: "relative", zIndex: 2 }}>
          <span>Net Pay</span>
          <span style={{ color: "var(--charcoal)" }}>₹{fmt(slip.net)}</span>
        </div>

        {/* Employer contributions (small footer) */}
        <div style={{ marginTop: 20, padding: "10px 14px", background: "var(--bg)", borderRadius: "var(--r-pill)", fontSize: 11, color: "var(--text-muted)", position: "relative", zIndex: 2 }}>
          <strong>Employer Contributions:</strong>{" "}
          EPF ₹{fmt(slip.er_epf)} | EPS ₹{fmt(slip.er_eps)} | ESI ₹{fmt(slip.er_esi)}
          {slip.esi_covered ? " (ESI covered)" : ""}
        </div>
      </div>

      {/* Print CSS */}
      <style>{`
        @media print {
          body > *:not(#root) { display: none !important; }
          #root > *:not(#payslip-print),
          button, nav, aside { display: none !important; }
          #payslip-print {
            border: none !important;
            box-shadow: none !important;
            max-width: 100% !important;
            padding: 20px !important;
          }
        }
      `}</style>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function SlipRow({ label, value, bold }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontWeight: bold ? 700 : 400 }}>
      <span>{label}</span>
      <span>₹{fmt(value)}</span>
    </div>
  );
}

const backBtnStyle = { background: "var(--bg)", border: "1px solid var(--line)", borderRadius: "var(--r-pill)", padding: "6px 14px", cursor: "pointer", fontSize: 13 };
const printBtnStyle = { background: "var(--ink)", color: "#dff140", border: "none", borderRadius: "var(--r-pill)", padding: "6px 14px", cursor: "pointer", fontWeight: 600, fontSize: 13 };
