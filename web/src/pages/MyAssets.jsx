import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../hooks/useAuth.jsx";

const STATUS_BADGE = {
  AVAILABLE: { bg: "var(--lime-pale)", color: "var(--charcoal)" },
  ASSIGNED:  { bg: "var(--badge-sky-bg)", color: "var(--badge-sky-text)" },
  IN_REPAIR: { bg: "var(--badge-tan-bg)", color: "var(--badge-tan-text)" },
  RETIRED:   { bg: "var(--badge-danger-bg)", color: "var(--danger)" },
};

function Badge({ status }) {
  const s = STATUS_BADGE[status] || STATUS_BADGE.ASSIGNED;
  return (
    <span style={{
      padding: "2px 10px", borderRadius: "var(--r-pill)", fontSize: 10.5, fontWeight: 700,
      letterSpacing: ".04rem", textTransform: "uppercase", background: s.bg, color: s.color,
    }}>{status}</span>
  );
}

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function MyAssets() {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const data = await api.get(`/assets/employee/${user.id}`);
      setAssignments(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, [user.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const es = new EventSource("/api/events", { withCredentials: true });
    es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.entity === "assets") fetchData();
      } catch { /* ignore */ }
    };
    return () => es.close();
  }, [fetchData]);

  const current = assignments.filter(a => !a.returned_at);
  const history = assignments.filter(a => a.returned_at);

  if (loading) return <p style={{ color: "var(--text-muted)", padding: 24 }}>Loading...</p>;

  return (
    <div>
      <h2 className="page-title" style={{ marginBottom: 20 }}>
        My Assets
      </h2>

      {current.length === 0 && history.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>No assets assigned to you.</p>
      ) : (
        <>
          {current.length > 0 && (
            <>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text)" }}>
                Currently Assigned
              </h3>
              <div style={{ overflowX: "auto", marginBottom: 24 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid var(--border)", textAlign: "left" }}>
                      <th style={{ padding: "8px 10px" }}>Asset</th>
                      <th style={{ padding: "8px 10px" }}>Type</th>
                      <th style={{ padding: "8px 10px" }}>Serial No.</th>
                      <th style={{ padding: "8px 10px" }}>Status</th>
                      <th style={{ padding: "8px 10px" }}>Assigned On</th>
                      <th style={{ padding: "8px 10px" }}>Assigned By</th>
                      <th style={{ padding: "8px 10px" }}>Temp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {current.map(a => (
                      <tr key={a.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "8px 10px", fontWeight: 600 }}>{a.asset_name}</td>
                        <td style={{ padding: "8px 10px" }}>{a.type_name}</td>
                        <td style={{ padding: "8px 10px", fontFamily: "monospace" }}>{a.serial_no || "—"}</td>
                        <td style={{ padding: "8px 10px" }}><Badge status={a.asset_status} /></td>
                        <td style={{ padding: "8px 10px" }}>{fmtDate(a.assigned_at)}</td>
                        <td style={{ padding: "8px 10px" }}>{a.assigned_by_name}</td>
                        <td style={{ padding: "8px 10px" }}>{a.is_temporary ? "Yes" : "No"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {history.length > 0 && (
            <>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text)" }}>
                Past Assignments
              </h3>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid var(--border)", textAlign: "left" }}>
                      <th style={{ padding: "8px 10px" }}>Asset</th>
                      <th style={{ padding: "8px 10px" }}>Type</th>
                      <th style={{ padding: "8px 10px" }}>Serial No.</th>
                      <th style={{ padding: "8px 10px" }}>Assigned</th>
                      <th style={{ padding: "8px 10px" }}>Returned</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(a => (
                      <tr key={a.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "8px 10px" }}>{a.asset_name}</td>
                        <td style={{ padding: "8px 10px" }}>{a.type_name}</td>
                        <td style={{ padding: "8px 10px", fontFamily: "monospace" }}>{a.serial_no || "—"}</td>
                        <td style={{ padding: "8px 10px" }}>{fmtDate(a.assigned_at)}</td>
                        <td style={{ padding: "8px 10px" }}>{fmtDate(a.returned_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
