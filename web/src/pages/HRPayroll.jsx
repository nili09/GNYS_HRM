import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";
import PayslipView from "./PayslipView.jsx";

// ── Utilities ────────────────────────────────────────────────────────────────

function fmtMonth(ym) {
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
}

function thisMonth() {
  return new Date().toISOString().slice(0, 7);
}

function shiftMonth(ym, n) {
  let [y, m] = ym.split("-").map(Number);
  m += n;
  while (m < 1) { m += 12; y--; }
  while (m > 12) { m -= 12; y++; }
  return `${y}-${String(m).padStart(2, "0")}`;
}

function fmt(n) {
  return Number(n || 0).toLocaleString("en-IN");
}

const STATUS_BADGE = {
  DRAFT: { bg: "#ede8df", color: "#7a6a55", label: "DRAFT" },
  FINAL: { bg: "var(--lime-pale)", color: "var(--charcoal)", label: "FINALIZED" },
};

// ── Component ────────────────────────────────────────────────────────────────

export default function HRPayroll() {
  const [month, setMonth] = useState(thisMonth());
  const [run, setRun] = useState(null);
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [payslipLineId, setPayslipLineId] = useState(null);

  const loadRun = useCallback(async () => {
    setError("");
    try {
      const runs = await api.get("/payroll/runs");
      const match = runs.find((r) => r.month === month);
      if (match) {
        const detail = await api.get(`/payroll/runs/${match.id}`);
        setRun(detail.run);
        setLines(detail.lines);
      } else {
        setRun(null);
        setLines([]);
      }
    } catch (e) {
      setError(e.message);
    }
  }, [month]);

  useEffect(() => {
    loadRun();
    // SSE + 30s polling fallback
    const es = new EventSource("/api/events", { withCredentials: true });
    es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.entity === "payroll") loadRun();
      } catch {}
    };
    const poll = setInterval(loadRun, 30000);
    return () => { es.close(); clearInterval(poll); };
  }, [loadRun]);

  async function handleGenerate() {
    setLoading(true);
    setError("");
    try {
      const data = await api.post("/payroll/runs", { month });
      setRun(data.run);
      setLines(data.lines);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  async function handleRegenerate() {
    if (!run) return;
    setLoading(true);
    setError("");
    try {
      const data = await api.post(`/payroll/runs/${run.id}/regenerate`);
      setRun(data.run);
      setLines(data.lines);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  async function handleFinalize() {
    if (!run || !confirm("Finalize this payroll run? Payslips will become official.")) return;
    setLoading(true);
    setError("");
    try {
      const data = await api.post(`/payroll/runs/${run.id}/finalize`);
      setRun(data);
      await loadRun();
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  async function handleReopen() {
    if (!run || !confirm("Reopen this run? It will return to DRAFT status.")) return;
    setLoading(true);
    setError("");
    try {
      await api.post(`/payroll/runs/${run.id}/reopen`);
      await loadRun();
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  function downloadCSV(type) {
    if (!run) return;
    window.open(`/api/payroll/runs/${run.id}/${type}`, "_blank");
  }

  // ── KPI calculations ──────────────────────────────────────────────────────

  const totalGross = lines.reduce((s, l) => s + (l.gross || 0), 0);
  const totalNet = lines.reduce((s, l) => s + (l.net || 0), 0);
  const totalPF = lines.reduce((s, l) => s + (l.ded_pf || 0), 0);
  const totalESI = lines.reduce((s, l) => s + (l.ded_esi || 0), 0);
  const totalPT = lines.reduce((s, l) => s + (l.ded_pt || 0), 0);
  const totalTDS = lines.reduce((s, l) => s + (l.ded_tds || 0), 0);
  const totalErEPF = lines.reduce((s, l) => s + (l.er_epf || 0), 0);
  const totalErEPS = lines.reduce((s, l) => s + (l.er_eps || 0), 0);
  const totalErESI = lines.reduce((s, l) => s + (l.er_esi || 0), 0);
  const employerCost = totalGross + totalErEPF + totalErEPS + totalErESI;

  // ── Payslip modal ──────────────────────────────────────────────────────────

  if (payslipLineId) {
    return (
      <PayslipView
        lineId={payslipLineId}
        onBack={() => setPayslipLineId(null)}
      />
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Payroll</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => setMonth(shiftMonth(month, -1))} className="btn-sm" style={navBtnStyle}>◀</button>
          <span style={{ fontSize: 15, fontWeight: 600, minWidth: 140, textAlign: "center" }}>{fmtMonth(month)}</span>
          <button onClick={() => setMonth(shiftMonth(month, 1))} className="btn-sm" style={navBtnStyle}>▶</button>
        </div>
      </div>

      {error && <div style={{ background: "#ffe5e5", color: "var(--danger)", padding: "8px 14px", borderRadius: "var(--r-pill)", marginBottom: 12, fontSize: 13 }}>{error}</div>}

      {/* Actions bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {!run && (
          <button onClick={handleGenerate} disabled={loading} style={primaryBtnStyle}>
            {loading ? "Generating…" : "Generate Payroll"}
          </button>
        )}
        {run && run.status === "DRAFT" && (
          <>
            <button onClick={handleRegenerate} disabled={loading} style={secondaryBtnStyle}>Regenerate</button>
            <button onClick={handleFinalize} disabled={loading} style={primaryBtnStyle}>Finalize</button>
          </>
        )}
        {run && run.status === "FINAL" && (
          <>
            <button onClick={handleReopen} disabled={loading} style={secondaryBtnStyle}>Reopen</button>
            <button onClick={() => downloadCSV("register.csv")} style={secondaryBtnStyle}>Register CSV</button>
            <button onClick={() => downloadCSV("bank.csv")} style={secondaryBtnStyle}>Bank CSV</button>
          </>
        )}
        {run && (
          <span style={{
            marginLeft: 8,
            padding: "4px 12px",
            borderRadius: "var(--r-card)",
            fontSize: 11,
            fontWeight: 700,
            background: STATUS_BADGE[run.status]?.bg,
            color: STATUS_BADGE[run.status]?.color,
          }}>
            {STATUS_BADGE[run.status]?.label}
          </span>
        )}
      </div>

      {/* KPI Cards */}
      {run && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 18 }}>
          <KPI label="Employees" value={lines.length} />
          <KPI label="Total Gross" value={`₹${fmt(totalGross)}`} />
          <KPI label="Total Net" value={`₹${fmt(totalNet)}`} />
          <KPI label="PF" value={`₹${fmt(totalPF)}`} />
          <KPI label="ESI" value={`₹${fmt(totalESI)}`} />
          <KPI label="PT" value={`₹${fmt(totalPT)}`} />
          <KPI label="TDS" value={`₹${fmt(totalTDS)}`} />
          <KPI label="Employer Cost" value={`₹${fmt(employerCost)}`} accent />
        </div>
      )}

      {/* Lines table */}
      {run && lines.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: "var(--bg)", textAlign: "left" }}>
                <th style={thStyle}>Code</th>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Days</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Basic</th>
                <th style={{ ...thStyle, textAlign: "right" }}>HRA</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Gross</th>
                <th style={{ ...thStyle, textAlign: "right" }}>PF</th>
                <th style={{ ...thStyle, textAlign: "right" }}>ESI</th>
                <th style={{ ...thStyle, textAlign: "right" }}>PT</th>
                <th style={{ ...thStyle, textAlign: "right" }}>TDS</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Net</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} style={{ borderBottom: "1px solid var(--line)" }}>
                  <td style={tdStyle}>{l.emp_code}</td>
                  <td style={tdStyle}>{l.emp_name}</td>
                  <td style={tdStyle}>{l.payable}/{l.month_days}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{fmt(l.earn_basic)}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{fmt(l.earn_hra)}</td>
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>{fmt(l.gross)}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{fmt(l.ded_pf)}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{fmt(l.ded_esi)}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{fmt(l.ded_pt)}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{fmt(l.ded_tds)}</td>
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: "var(--charcoal)" }}>{fmt(l.net)}</td>
                  <td style={tdStyle}>
                    <button
                      onClick={() => setPayslipLineId(l.id)}
                      style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 12 }}
                    >View</button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: "var(--bg)", fontWeight: 700, borderTop: "2px solid var(--line)" }}>
                <td style={tdStyle} colSpan={3}>Total</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{fmt(lines.reduce((s, l) => s + l.earn_basic, 0))}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{fmt(lines.reduce((s, l) => s + l.earn_hra, 0))}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{fmt(totalGross)}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{fmt(totalPF)}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{fmt(totalESI)}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{fmt(totalPT)}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{fmt(totalTDS)}</td>
                <td style={{ ...tdStyle, textAlign: "right", color: "var(--charcoal)" }}>{fmt(totalNet)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {run && lines.length === 0 && (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-faint)", fontSize: 14 }}>
          No payroll lines generated. Check that employees have salary structures and attendance marked.
        </div>
      )}

      {!run && (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-faint)", fontSize: 14 }}>
          No payroll run for {fmtMonth(month)}. Click "Generate Payroll" to create one.
        </div>
      )}
    </div>
  );
}

function KPI({ label, value, accent }) {
  return (
    <div style={{
      background: accent ? "var(--ink)" : "var(--bg)",
      color: accent ? "#dff140" : "var(--text)",
      borderRadius: "var(--r-card)", padding: "12px 14px",
      border: accent ? "none" : "1px solid var(--line)",
    }}>
      <div style={{ fontSize: 11, color: accent ? "#8b9ac0" : "var(--text-muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const thStyle = { padding: "8px 10px", fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".04rem", borderBottom: "1px solid var(--line)" };
const tdStyle = { padding: "8px 10px" };
const navBtnStyle = { background: "var(--bg)", border: "1px solid var(--line)", borderRadius: "var(--r-card)", padding: "5px 10px", cursor: "pointer", fontSize: 13 };
const primaryBtnStyle = { background: "var(--ink)", color: "#dff140", border: "none", borderRadius: "var(--r-pill)", padding: "8px 18px", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const secondaryBtnStyle = { background: "var(--bg)", color: "var(--charcoal)", border: "1px solid var(--line)", borderRadius: "var(--r-pill)", padding: "8px 18px", cursor: "pointer", fontWeight: 500, fontSize: 13 };
