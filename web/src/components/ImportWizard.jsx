import { useState, useRef } from "react";
import { api } from "../lib/api.js";
import { parseCSV, guessMap, IMP_FIELDS as SHARED_FIELDS } from "@hrms/shared/import";

const IMP_FIELDS = SHARED_FIELDS.map(([k, l]) => [k, l]);

export default function ImportWizard({ onClose, onDone }) {
  const [step, setStep] = useState(1);
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [dupMode, setDupMode] = useState("skip");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [pasteText, setPasteText] = useState("");
  const fileRef = useRef(null);

  function handleParse(text) {
    const all = parseCSV(text);
    if (all.length < 2) { setError("CSV must have at least a header row and one data row."); return; }
    setHeaders(all[0]);
    setRows(all.slice(1));
    setMapping(guessMap(all[0]));
    setError("");
    setStep(2);
  }

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => handleParse(reader.result);
    reader.readAsText(file);
  }

  function setMap(field, colIdx) {
    setMapping(m => {
      const nm = { ...m };
      if (colIdx === "") { delete nm[field]; } else { nm[field] = Number(colIdx); }
      return nm;
    });
  }

  async function handleImport() {
    setImporting(true);
    setError("");
    try {
      const res = await api.post("/employees/import", { headers, rows, mapping, dupMode });
      setResult(res);
    } catch (e) {
      setError(e.data?.error || e.message);
    }
    setImporting(false);
  }

  const title = result ? "Import Results" : step === 1 ? "Step 1 — Upload CSV" : "Step 2 — Map Columns";

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "var(--overlay)", zIndex: 200 }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        width: 720, maxWidth: "95vw", maxHeight: "90vh",
        background: "var(--card)", borderRadius: "var(--r-card)",
        zIndex: 201, display: "flex", flexDirection: "column",
        border: "1px solid var(--line)",
      }}>
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "var(--text-muted)", lineHeight: 1 }}>×</button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {error && (
            <div style={{ padding: "8px 12px", background: "var(--badge-danger-bg)", color: "var(--danger)", borderRadius: "var(--r-card)", marginBottom: 12, fontSize: 13, border: "1px solid rgba(255,53,53,.2)" }}>
              {error}
            </div>
          )}

          {/* Step 1 */}
          {step === 1 && !result && (
            <div>
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: "block", fontSize: 10.5, fontWeight: 600, color: "var(--text)", textTransform: "uppercase", letterSpacing: ".05rem", marginBottom: 8 }}>
                  Upload CSV file
                </label>
                <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} style={{ width: "auto", fontSize: 13 }} />
              </div>
              <div style={{ textAlign: "center", color: "var(--neutral)", fontSize: 12, margin: "18px 0", letterSpacing: ".06rem", textTransform: "uppercase" }}>— or —</div>
              <div>
                <label style={{ display: "block", fontSize: 10.5, fontWeight: 600, color: "var(--text)", textTransform: "uppercase", letterSpacing: ".05rem", marginBottom: 8 }}>
                  Paste CSV data
                </label>
                <textarea
                  rows={8} value={pasteText} onChange={e => setPasteText(e.target.value)}
                  placeholder="Paste CSV data here (with header row)…"
                  style={{ fontFamily: "monospace", fontSize: 12, resize: "vertical" }}
                />
                <button onClick={() => handleParse(pasteText)} disabled={!pasteText.trim()} className="btn-primary" style={{ marginTop: 10, padding: "8px 18px" }}>
                  Parse CSV
                </button>
              </div>
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && !result && (
            <div>
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 14 }}>
                Map your CSV columns to employee fields. <strong style={{ color: "var(--ink)" }}>{rows.length}</strong> data row{rows.length !== 1 ? "s" : ""} found.
              </p>

              <div style={{ overflowX: "auto", marginBottom: 16 }}>
                <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["Field", "CSV Column", "Sample (row 1)"].map(h => (
                        <th key={h} className="table-th" style={{ padding: "8px 10px" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {IMP_FIELDS.map(([key, label]) => {
                      const colIdx = mapping[key];
                      const sample = colIdx != null && rows[0] ? rows[0][colIdx] || "" : "";
                      return (
                        <tr key={key} style={{ borderBottom: "1px solid var(--line)" }}>
                          <td style={{ padding: "5px 10px", fontWeight: 500 }}>{label}</td>
                          <td style={{ padding: "5px 10px" }}>
                            <select value={colIdx ?? ""} onChange={e => setMap(key, e.target.value)} style={{ padding: "4px 8px", fontSize: 12, width: "100%" }}>
                              <option value="">— skip —</option>
                              {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                            </select>
                          </td>
                          <td style={{ padding: "5px 10px", color: "var(--text-faint)", fontFamily: "monospace", fontSize: 11 }}>{sample}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", textTransform: "uppercase", letterSpacing: ".04rem" }}>Duplicate handling (by code):</label>
                <select value={dupMode} onChange={e => setDupMode(e.target.value)} style={{ width: "auto", padding: "6px 10px", fontSize: 13 }}>
                  <option value="skip">Skip existing</option>
                  <option value="update">Update existing</option>
                </select>
              </div>
            </div>
          )}

          {/* Results */}
          {result && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 18 }}>
                <Stat label="Added"   value={result.added}   bg="var(--lime-pale)"  color="var(--charcoal)" />
                <Stat label="Updated" value={result.updated} bg="var(--badge-cl-bg)"  color="var(--badge-cl-text)" />
                <Stat label="Skipped" value={result.skipped} bg="var(--badge-tan-bg)" color="var(--badge-tan-text)" />
              </div>
              {result.problems?.length > 0 && (
                <div>
                  <h4 style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", textTransform: "uppercase", letterSpacing: ".05rem", marginBottom: 8 }}>Issues</h4>
                  <div style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: "var(--r-card)", padding: 12, maxHeight: 150, overflowY: "auto" }}>
                    {result.problems.map((p, i) => <div key={i} style={{ fontSize: 12, color: "var(--badge-tan-text)", marginBottom: 3 }}>{p}</div>)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 20px", borderTop: "1px solid var(--line)", display: "flex", justifyContent: "space-between", background: "var(--bg)" }}>
          <div>
            {step === 2 && !result && (
              <button onClick={() => { setStep(1); setHeaders([]); setRows([]); setMapping({}); }}
                className="btn-secondary" style={{ padding: "7px 16px" }}>← Back</button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} className="btn-secondary" style={{ padding: "7px 16px" }}>{result ? "Close" : "Cancel"}</button>
            {step === 2 && !result && (
              <button onClick={handleImport} disabled={importing || !mapping.name}
                className="btn-primary" style={{ padding: "7px 18px" }}>
                {importing ? "Importing…" : `Import ${rows.length} rows`}
              </button>
            )}
            {result && (
              <button onClick={onDone} className="btn-primary" style={{ padding: "7px 18px" }}>Done</button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, color, bg }) {
  return (
    <div style={{ padding: "14px 16px", borderRadius: "var(--r-card)", background: bg, border: "1px solid var(--line)", textAlign: "center" }}>
      <div style={{ fontSize: 26, fontWeight: 700, color, fontFamily: "var(--font-display)", letterSpacing: "-.02rem" }}>{value}</div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: ".05rem", marginTop: 2 }}>{label}</div>
    </div>
  );
}
