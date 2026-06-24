import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../hooks/useAuth.jsx";
import { useIsMobile } from "../hooks/useIsMobile.jsx";

const STATUS_BADGE = {
  PENDING:   { bg: "var(--badge-tan-bg)", color: "var(--badge-tan-text)" },
  APPROVED:  { bg: "var(--lime-pale)", color: "var(--charcoal)" },
  REJECTED:  { bg: "var(--badge-danger-bg)", color: "var(--danger)" },
  CANCELLED: { bg: "var(--bg)", color: "var(--text-muted)" },
};

function Badge({ status }) {
  const s = STATUS_BADGE[status] || STATUS_BADGE.PENDING;
  return (
    <span style={{
      padding: "2px 10px", borderRadius: "var(--r-pill)", fontSize: 10.5, fontWeight: 700, letterSpacing: ".04rem", textTransform: "uppercase",
      background: s.bg, color: s.color,
    }}>{status}</span>
  );
}

function fmtDate(d) {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateShort(d) {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function today() { return new Date().toISOString().slice(0, 10); }

export default function MyLeave() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [tab, setTab] = useState("apply");
  const [types, setTypes] = useState([]);
  const [balances, setBalances] = useState(null);
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    type: "", date_from: "", date_to: "", half_from: 0, half_to: 0, reason: "",
  });
  const [preview, setPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [overBalanceWarn, setOverBalanceWarn] = useState(null);
  const [ackOverBalance, setAckOverBalance] = useState(false);

  const year = new Date().getFullYear();

  const fetchData = useCallback(async () => {
    try {
      const [t, b, l] = await Promise.all([
        api.get("/leaves/types"),
        api.get(`/leaves/balances?year=${year}&employeeId=${user.id}`),
        api.get("/leaves?limit=1000"),
      ]);
      setTypes(t);
      setBalances(b.balances);
      setLeaves(l.data);
    } catch { /* ignore */ }
    setLoading(false);
  }, [year, user.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Default the type dropdown to the first leave type on initial load only —
  // the updater form reads current state, so this won't clobber a later user pick.
  useEffect(() => {
    if (types.length === 0) return;
    setForm((f) => (f.type ? f : { ...f, type: types[0].code }));
  }, [types]);

  useEffect(() => {
    const es = new EventSource("/api/events", { withCredentials: true });
    es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.entity === "leaves" || d.entity === "leave_adjustments") fetchData();
      } catch { /* ignore */ }
    };
    const poll = setInterval(fetchData, 30000);
    return () => { es.close(); clearInterval(poll); };
  }, [fetchData]);

  useEffect(() => {
    if (!form.date_from || !form.date_to || form.date_to < form.date_from || !form.type) {
      setPreview(null);
      return;
    }
    const bal = balances?.[form.type];
    setPreview({ balAvail: bal?.available ?? null });
  }, [form.date_from, form.date_to, form.type, form.half_from, form.half_to, balances]);

  // A change to the request invalidates any prior over-balance acknowledgment.
  useEffect(() => {
    setOverBalanceWarn(null);
    setAckOverBalance(false);
  }, [form.type, form.date_from, form.date_to, form.half_from, form.half_to]);

  async function handleApply(e) {
    e.preventDefault();
    setError(""); setSuccess(""); setSubmitting(true);
    try {
      const res = await api.post("/leaves", {
        type: form.type,
        date_from: form.date_from,
        date_to: form.date_to,
        half_from: form.half_from,
        half_to: form.half_to,
        reason: form.reason || null,
        ...(ackOverBalance ? { confirmOverBalance: true } : {}),
      });
      setSuccess(`Leave applied: ${res.days} day(s), status ${res.status}`);
      setForm({ type: types[0]?.code || "", date_from: "", date_to: "", half_from: 0, half_to: 0, reason: "" });
      setOverBalanceWarn(null);
      setAckOverBalance(false);
      fetchData();
    } catch (err) {
      if (err.data?.requiresConfirm) {
        setOverBalanceWarn(err.data.error);
      } else {
        setError(err.data?.error || err.message);
      }
    }
    setSubmitting(false);
  }

  async function handleCancel(id) {
    if (!confirm("Cancel this leave request?")) return;
    try {
      await api.post(`/leaves/${id}/cancel`);
      fetchData();
    } catch (err) {
      alert(err.data?.error || err.message);
    }
  }

  if (loading) return <div style={{ padding: 20, color: "var(--text-muted)" }}>Loading…</div>;

  const balancePanel = (
    <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r-card)", padding: 16, boxShadow: "var(--shadow-card)" }}>
      <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 10, color: "var(--text)" }}>
        Balances — {year}
      </div>
      {balances && types.filter((t) => t.annual > 0).map((t) => {
        const b = balances[t.code];
        if (!b) return null;
        const isActive = form.type === t.code;
        return (
          <div key={t.code} style={{
            padding: "8px 10px", borderRadius: "var(--r-pill)", marginBottom: 6,
            background: isActive ? "var(--lime-pale)" : "var(--bg)",
            border: isActive ? "1px solid var(--badge-green-bg)" : "1px solid transparent",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>{t.code}</span>
              <span style={{ fontWeight: 700, color: b.available < 0 ? "var(--danger)" : "var(--charcoal)" }}>
                {b.available}
              </span>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
              Entitled {b.entitled}{b.adj ? ` + ${b.adj} adj` : ""} — Used {b.used}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div>
      <h2 style={{ margin: "0 0 20px", fontSize: 22, fontWeight: 700, letterSpacing: "-.02rem" }}>
        Leave
      </h2>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "2px solid var(--line)", marginBottom: 18 }}>
        {["apply", "requests"].map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "8px 20px", background: "none", border: "none", cursor: "pointer",
            fontWeight: tab === t ? 700 : 400,
            color: tab === t ? "var(--text)" : "var(--text-muted)",
            borderBottom: tab === t ? "2px solid var(--lime)" : "2px solid transparent",
            marginBottom: -2, fontSize: 13.5, fontFamily: "inherit",
            minHeight: 40,
          }}>
            {t === "apply" ? "Apply Leave" : "My Requests"}
          </button>
        ))}
      </div>

      {tab === "apply" && (
        <div style={isMobile
          ? { display: "flex", flexDirection: "column", gap: 16 }
          : { display: "grid", gridTemplateColumns: "1fr 300px", gap: 24, alignItems: "start" }
        }>
          {/* Balance panel first on mobile */}
          {isMobile && balancePanel}

          {/* Form */}
          <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r-card)", padding: isMobile ? 16 : 20, boxShadow: "var(--shadow-card)" }}>
            <form onSubmit={handleApply}>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
                <div>
                  <label style={labelStyle}>Leave Type</label>
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                    style={inputStyle}>
                    {types.map((t) => <option key={t.code} value={t.code}>{t.code} — {t.name}</option>)}
                  </select>
                </div>
                {!isMobile && <div />}

                <div>
                  <label style={labelStyle}>From</label>
                  <input type="date" value={form.date_from}
                    onChange={(e) => {
                      const v = e.target.value;
                      setForm((f) => ({ ...f, date_from: v, date_to: f.date_to < v ? v : f.date_to }));
                    }}
                    style={inputStyle} />
                  <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 12.5, color: "var(--text-muted)", minHeight: 32 }}>
                    <input type="checkbox" checked={!!form.half_from}
                      onChange={(e) => setForm({ ...form, half_from: e.target.checked ? 1 : 0 })}
                      style={{ width: 18, height: 18 }} />
                    Half day
                  </label>
                </div>
                <div>
                  <label style={labelStyle}>To</label>
                  <input type="date" value={form.date_to}
                    min={form.date_from}
                    onChange={(e) => setForm({ ...form, date_to: e.target.value })}
                    style={inputStyle} />
                  <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 12.5, color: "var(--text-muted)", minHeight: 32 }}>
                    <input type="checkbox" checked={!!form.half_to}
                      onChange={(e) => setForm({ ...form, half_to: e.target.checked ? 1 : 0 })}
                      style={{ width: 18, height: 18 }} />
                    Half day
                  </label>
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                <label style={labelStyle}>Reason (optional)</label>
                <textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  rows={2} style={{ ...inputStyle, resize: "vertical" }} />
              </div>

              {error && <div style={{ marginTop: 12, color: "var(--danger)", fontSize: 13 }}>{error}</div>}
              {success && <div style={{ marginTop: 12, color: "var(--charcoal)", fontSize: 13 }}>{success}</div>}

              {overBalanceWarn && (
                <div style={{ marginTop: 12, padding: 10, borderRadius: "var(--r-card)", background: "var(--badge-danger-bg)", color: "var(--danger)", fontSize: 13 }}>
                  {overBalanceWarn}
                  <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 12.5, fontWeight: 600, color: "var(--text)" }}>
                    <input type="checkbox" checked={ackOverBalance}
                      onChange={(e) => setAckOverBalance(e.target.checked)}
                      style={{ width: 16, height: 16 }} />
                    I understand, apply anyway
                  </label>
                </div>
              )}

              <button type="submit" disabled={submitting || !form.date_from || !form.date_to || (overBalanceWarn && !ackOverBalance)}
                style={{
                  marginTop: 16, padding: "12px 28px", borderRadius: "var(--r-pill)", border: "none",
                  background: "var(--ink)", color: "var(--lime-light)", fontWeight: 700, fontSize: 13.5,
                  cursor: "pointer", opacity: submitting ? 0.6 : 1, fontFamily: "inherit",
                  width: isMobile ? "100%" : "auto",
                }}>
                {submitting ? "Applying…" : "Apply Leave"}
              </button>
            </form>
          </div>

          {/* Balance panel — desktop side */}
          {!isMobile && balancePanel}
        </div>
      )}

      {tab === "requests" && (
        isMobile ? (
          /* Card layout for mobile */
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {leaves.length === 0 && (
              <div style={{ padding: 20, textAlign: "center", color: "var(--text-faint)" }}>No leave requests</div>
            )}
            {leaves.map((l) => (
              <div key={l.id} style={{
                background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r-card)",
                padding: 14, boxShadow: "var(--shadow-card)",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{l.type}</span>
                  <Badge status={l.status} />
                </div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 4 }}>
                  {fmtDateShort(l.date_from)}{l.half_from ? " (½)" : ""}
                  {l.date_from !== l.date_to && ` → ${fmtDateShort(l.date_to)}`}{l.half_to && l.date_from !== l.date_to ? " (½)" : ""}
                  <span style={{ marginLeft: 8, fontWeight: 600, color: "var(--text)" }}>{l.days}d</span>
                </div>
                {l.reason && (
                  <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {l.reason}
                  </div>
                )}
                {(l.status === "PENDING" || (l.status === "APPROVED" && l.date_from > today())) && (
                  <button onClick={() => handleCancel(l.id)}
                    style={{
                      padding: "6px 14px", borderRadius: "var(--r-card)", border: "1px solid var(--line)",
                      background: "var(--card)", color: "var(--danger)", cursor: "pointer", fontSize: 12,
                      fontFamily: "inherit", minHeight: 36,
                    }}>Cancel</button>
                )}
              </div>
            ))}
          </div>
        ) : (
          /* Table layout for desktop */
          <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r-card)", overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--bg)", textAlign: "left" }}>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>From</th>
                  <th style={thStyle}>To</th>
                  <th style={thStyle}>Days</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Reason</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {leaves.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: 20, textAlign: "center", color: "var(--text-faint)" }}>No leave requests</td></tr>
                )}
                {leaves.map((l) => (
                  <tr key={l.id} style={{ borderTop: "1px solid var(--line)" }}>
                    <td style={tdStyle}><span style={{ fontWeight: 600 }}>{l.type}</span></td>
                    <td style={tdStyle}>{fmtDate(l.date_from)}{l.half_from ? " (½)" : ""}</td>
                    <td style={tdStyle}>{fmtDate(l.date_to)}{l.half_to ? " (½)" : ""}</td>
                    <td style={tdStyle}>{l.days}</td>
                    <td style={tdStyle}><Badge status={l.status} /></td>
                    <td style={{ ...tdStyle, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {l.reason || "—"}
                    </td>
                    <td style={tdStyle}>
                      {(l.status === "PENDING" || (l.status === "APPROVED" && l.date_from > today())) && (
                        <button onClick={() => handleCancel(l.id)}
                          style={{
                            padding: "3px 10px", borderRadius: "var(--r-card)", border: "1px solid var(--line)",
                            background: "var(--card)", color: "var(--danger)", cursor: "pointer", fontSize: 11.5,
                            fontFamily: "inherit",
                          }}>Cancel</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

const labelStyle = { display: "block", fontSize: 12, fontWeight: 600, color: "var(--badge-gray-text)", marginBottom: 4 };
const inputStyle = {
  width: "100%", padding: "10px 12px", borderRadius: "var(--r-card)", border: "1px solid var(--line)",
  fontSize: 14, fontFamily: "inherit", boxSizing: "border-box",
};
const thStyle = { padding: "8px 12px", fontSize: 11.5, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".05em" };
const tdStyle = { padding: "10px 12px" };
