import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";
import Icon from "../components/Icon.jsx";

const STATUS_BADGE = {
  DRAFT:     { bg: "var(--badge-tan-bg)", color: "var(--badge-tan-text)" },
  OPEN:      { bg: "var(--lime-pale)", color: "var(--charcoal)" },
  ON_HOLD:   { bg: "var(--badge-amber-bg)", color: "var(--badge-amber-text)" },
  CLOSED:    { bg: "var(--badge-gray-bg)", color: "var(--badge-gray-text)" },
  APPLIED:   { bg: "var(--badge-blue-bg)", color: "var(--badge-blue-text)" },
  SCREENING: { bg: "var(--badge-amber-bg)", color: "var(--badge-amber-text)" },
  INTERVIEW: { bg: "var(--badge-purple-bg)", color: "var(--badge-purple-text)" },
  OFFERED:   { bg: "var(--badge-pink-bg)", color: "var(--badge-pink-text)" },
  HIRED:     { bg: "var(--lime-pale)", color: "var(--charcoal)" },
  REJECTED:  { bg: "var(--badge-danger-bg)", color: "var(--danger)" },
  SCHEDULED: { bg: "var(--badge-blue-bg)", color: "var(--badge-blue-text)" },
  COMPLETED: { bg: "var(--lime-pale)", color: "var(--charcoal)" },
  CANCELLED: { bg: "var(--badge-gray-bg)", color: "var(--badge-gray-text)" },
  SENT:      { bg: "var(--badge-blue-bg)", color: "var(--badge-blue-text)" },
  ACCEPTED:  { bg: "var(--lime-pale)", color: "var(--charcoal)" },
  DECLINED:  { bg: "var(--badge-danger-bg)", color: "var(--danger)" },
};

function Badge({ status }) {
  const s = STATUS_BADGE[status] || { bg: "var(--badge-tan-bg)", color: "var(--badge-tan-text)" };
  return (
    <span style={{
      padding: "2px 10px", borderRadius: "var(--r-pill)", fontSize: 10.5, fontWeight: 700,
      letterSpacing: ".04rem", textTransform: "uppercase", background: s.bg, color: s.color,
    }}>{status}</span>
  );
}

function fmtDate(d) {
  if (!d) return "";
  const str = d.length === 10 ? d + "T00:00:00" : d;
  return new Date(str).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtAmount(n) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

const tabStyle = (active) => ({
  padding: "8px 18px", fontSize: 12, fontWeight: 700, cursor: "pointer",
  border: "none", borderRadius: "var(--r-sm)",
  background: active ? "var(--lime)" : "var(--charcoal)",
  color: active ? "#ffffff" : "var(--text-faint)",
  textTransform: "uppercase", letterSpacing: ".06rem",
  transition: "all .15s",
});

const inputStyle = {
  padding: "7px 10px", fontSize: 13, border: "1px solid var(--border)",
  borderRadius: "var(--r-sm)", background: "var(--bg-raised)", color: "var(--text)",
  width: "100%", boxSizing: "border-box",
};

const btnPrimary = {
  padding: "7px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer",
  border: "none", borderRadius: "var(--r-sm)",
  background: "var(--lime)", color: "#ffffff",
  textTransform: "uppercase", letterSpacing: ".04rem",
};

export default function HRRecruitment() {
  const [tab, setTab] = useState("jobs");
  const [jobs, setJobs] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [applications, setApplications] = useState([]);
  const [interviews, setInterviews] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);

  const [jobForm, setJobForm] = useState({ title: "", positions: 1, status: "DRAFT", description: "", requirements: "" });
  const [candForm, setCandForm] = useState({ name: "", email: "", phone: "", source: "" });
  const [showJobForm, setShowJobForm] = useState(false);
  const [showCandForm, setShowCandForm] = useState(false);
  const [formError, setFormError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const [j, c, a, i, d] = await Promise.all([
        api.get(`/recruitment/jobs${statusFilter ? `?status=${statusFilter}` : ""}`),
        api.get("/recruitment/candidates"),
        api.get("/recruitment/applications"),
        api.get("/recruitment/interviews"),
        api.get("/recruitment/dashboard"),
      ]);
      setJobs(j);
      setCandidates(c);
      setApplications(a);
      setInterviews(i);
      setDashboard(d);
    } catch { /* ignore */ }
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const es = new EventSource("/api/events", { withCredentials: true });
    es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (["job_openings", "candidates", "applications", "interviews", "offer_letters"].includes(d.entity)) fetchData();
      } catch { /* ignore */ }
    };
    return () => es.close();
  }, [fetchData]);

  async function createJob(e) {
    e.preventDefault();
    setFormError("");
    try {
      await api.post("/recruitment/jobs", { ...jobForm, positions: Number(jobForm.positions) });
      setJobForm({ title: "", positions: 1, status: "DRAFT", description: "", requirements: "" });
      setShowJobForm(false);
      fetchData();
    } catch (err) { setFormError(err.data?.error || err.message); }
  }

  async function createCandidate(e) {
    e.preventDefault();
    setFormError("");
    try {
      await api.post("/recruitment/candidates", candForm);
      setCandForm({ name: "", email: "", phone: "", source: "" });
      setShowCandForm(false);
      fetchData();
    } catch (err) { setFormError(err.data?.error || err.message); }
  }

  async function patchJobStatus(id, status) {
    try { await api.patch(`/recruitment/jobs/${id}`, { status }); fetchData(); }
    catch (err) { alert(err.data?.error || err.message); }
  }

  async function patchAppStatus(id, status) {
    try { await api.patch(`/recruitment/applications/${id}`, { status }); fetchData(); }
    catch (err) { alert(err.data?.error || err.message); }
  }

  async function scheduleInterview(appId) {
    const interviewerId = prompt("Enter interviewer employee ID:");
    if (!interviewerId) return;
    const scheduledAt = prompt("Enter date/time (YYYY-MM-DDTHH:MM:SS):");
    if (!scheduledAt) return;
    const mode = prompt("Mode (IN_PERSON / VIDEO / PHONE):", "VIDEO");
    try {
      await api.post("/recruitment/interviews", {
        application_id: appId,
        interviewer_id: Number(interviewerId),
        scheduled_at: scheduledAt,
        mode: mode || "VIDEO",
      });
      fetchData();
    } catch (err) { alert(err.data?.error || err.message); }
  }

  async function createOffer(appId) {
    const ctc = prompt("CTC offered (annual, in rupees):");
    if (!ctc) return;
    const joiningDate = prompt("Joining date (YYYY-MM-DD):");
    if (!joiningDate) return;
    try {
      await api.post(`/recruitment/offers/${appId}`, {
        ctc_offered: Number(ctc),
        joining_date: joiningDate,
      });
      fetchData();
    } catch (err) { alert(err.data?.error || err.message); }
  }

  if (loading) return <div style={{ padding: 20, color: "var(--text-faint)" }}>Loading…</div>;

  return (
    <div>
      <h2 className="page-title" style={{ margin: 0 }}>Recruitment</h2>
      <p style={{ color: "var(--text-faint)", fontSize: 12, margin: "4px 0 20px" }}>Manage jobs, candidates, and hiring pipeline</p>

      {/* Dashboard KPIs */}
      {dashboard && (
        <div style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
          {[
            { label: "Open Jobs", value: dashboard.openJobs },
            { label: "Total Positions", value: dashboard.totalPositions },
            { label: "Avg. Time to Hire", value: dashboard.avgTimeToHire ? `${dashboard.avgTimeToHire} days` : "—" },
          ].map(k => (
            <div key={k.label} style={{
              padding: "14px 20px", borderRadius: "var(--r-sm)", background: "var(--bg-raised)",
              border: "1px solid var(--border)", minWidth: 140,
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: ".06rem" }}>{k.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", marginTop: 2 }}>{k.value}</div>
            </div>
          ))}
          {dashboard.candidatesByStage.map(s => (
            <div key={s.status} style={{
              padding: "14px 20px", borderRadius: "var(--r-sm)", background: "var(--bg-raised)",
              border: "1px solid var(--border)", minWidth: 100,
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: ".06rem" }}>{s.status}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", marginTop: 2 }}>{s.count}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {["jobs", "candidates", "applications", "interviews"].map(t => (
          <button key={t} style={tabStyle(tab === t)} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {/* ── Jobs Tab ── */}
      {tab === "jobs" && (
        <div>
          <div style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "center" }}>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...inputStyle, width: 160 }}>
              <option value="">All statuses</option>
              {["DRAFT", "OPEN", "ON_HOLD", "CLOSED"].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button style={btnPrimary} onClick={() => setShowJobForm(!showJobForm)}>
              {showJobForm ? "Cancel" : "+ New Job"}
            </button>
          </div>
          {showJobForm && (
            <form onSubmit={createJob} style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: 16, marginBottom: 16, display: "flex", flexDirection: "column", gap: 10, maxWidth: 500 }}>
              <input placeholder="Job title" value={jobForm.title} onChange={e => setJobForm({ ...jobForm, title: e.target.value })} style={inputStyle} required />
              <div style={{ display: "flex", gap: 10 }}>
                <input type="number" min={1} placeholder="Positions" value={jobForm.positions} onChange={e => setJobForm({ ...jobForm, positions: e.target.value })} style={{ ...inputStyle, width: 100 }} />
                <select value={jobForm.status} onChange={e => setJobForm({ ...jobForm, status: e.target.value })} style={{ ...inputStyle, width: 140 }}>
                  {["DRAFT", "OPEN"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <textarea placeholder="Description" value={jobForm.description} onChange={e => setJobForm({ ...jobForm, description: e.target.value })} style={{ ...inputStyle, minHeight: 60 }} />
              <textarea placeholder="Requirements" value={jobForm.requirements} onChange={e => setJobForm({ ...jobForm, requirements: e.target.value })} style={{ ...inputStyle, minHeight: 60 }} />
              {formError && <div style={{ color: "var(--danger)", fontSize: 12 }}>{formError}</div>}
              <button type="submit" style={btnPrimary}>Create Job</button>
            </form>
          )}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", fontSize: 10.5, textTransform: "uppercase", color: "var(--text-faint)", letterSpacing: ".06rem" }}>
                <th style={{ padding: "8px 10px" }}>Title</th>
                <th style={{ padding: "8px 10px" }}>Positions</th>
                <th style={{ padding: "8px 10px" }}>Status</th>
                <th style={{ padding: "8px 10px" }}>Created</th>
                <th style={{ padding: "8px 10px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(j => (
                <tr key={j.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "8px 10px" }}>
                    <div style={{ fontWeight: 600 }}>{j.title}</div>
                    {j.dept_name && <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{j.dept_name} {j.location_name ? `• ${j.location_name}` : ""}</div>}
                  </td>
                  <td style={{ padding: "8px 10px" }}>{j.positions}</td>
                  <td style={{ padding: "8px 10px" }}><Badge status={j.status} /></td>
                  <td style={{ padding: "8px 10px", fontSize: 12, color: "var(--text-faint)" }}>{fmtDate(j.created_at?.slice(0, 10))}</td>
                  <td style={{ padding: "8px 10px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      {j.status === "DRAFT" && <button onClick={() => patchJobStatus(j.id, "OPEN")} style={{ ...btnPrimary, padding: "4px 10px", fontSize: 10 }}>Open</button>}
                      {j.status === "OPEN" && <button onClick={() => patchJobStatus(j.id, "ON_HOLD")} style={{ ...btnPrimary, padding: "4px 10px", fontSize: 10, background: "var(--badge-amber-bg)", color: "var(--badge-amber-text)" }}>Hold</button>}
                      {j.status === "ON_HOLD" && <button onClick={() => patchJobStatus(j.id, "OPEN")} style={{ ...btnPrimary, padding: "4px 10px", fontSize: 10 }}>Reopen</button>}
                      {j.status !== "CLOSED" && <button onClick={() => patchJobStatus(j.id, "CLOSED")} style={{ ...btnPrimary, padding: "4px 10px", fontSize: 10, background: "var(--badge-gray-bg)", color: "var(--badge-gray-text)" }}>Close</button>}
                    </div>
                  </td>
                </tr>
              ))}
              {jobs.length === 0 && <tr><td colSpan={5} style={{ padding: 20, textAlign: "center", color: "var(--text-faint)" }}>No jobs found</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Candidates Tab ── */}
      {tab === "candidates" && (
        <div>
          <div style={{ marginBottom: 12 }}>
            <button style={btnPrimary} onClick={() => setShowCandForm(!showCandForm)}>
              {showCandForm ? "Cancel" : "+ New Candidate"}
            </button>
          </div>
          {showCandForm && (
            <form onSubmit={createCandidate} style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: 16, marginBottom: 16, display: "flex", flexDirection: "column", gap: 10, maxWidth: 500 }}>
              <input placeholder="Full name" value={candForm.name} onChange={e => setCandForm({ ...candForm, name: e.target.value })} style={inputStyle} required />
              <input type="email" placeholder="Email" value={candForm.email} onChange={e => setCandForm({ ...candForm, email: e.target.value })} style={inputStyle} required />
              <div style={{ display: "flex", gap: 10 }}>
                <input placeholder="Phone" value={candForm.phone} onChange={e => setCandForm({ ...candForm, phone: e.target.value })} style={inputStyle} />
                <input placeholder="Source (LinkedIn, Referral...)" value={candForm.source} onChange={e => setCandForm({ ...candForm, source: e.target.value })} style={inputStyle} />
              </div>
              {formError && <div style={{ color: "var(--danger)", fontSize: 12 }}>{formError}</div>}
              <button type="submit" style={btnPrimary}>Add Candidate</button>
            </form>
          )}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", fontSize: 10.5, textTransform: "uppercase", color: "var(--text-faint)", letterSpacing: ".06rem" }}>
                <th style={{ padding: "8px 10px" }}>Name</th>
                <th style={{ padding: "8px 10px" }}>Email</th>
                <th style={{ padding: "8px 10px" }}>Phone</th>
                <th style={{ padding: "8px 10px" }}>Source</th>
                <th style={{ padding: "8px 10px" }}>Added</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map(c => (
                <tr key={c.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "8px 10px", fontWeight: 600 }}>{c.name}</td>
                  <td style={{ padding: "8px 10px" }}>{c.email}</td>
                  <td style={{ padding: "8px 10px" }}>{c.phone || "—"}</td>
                  <td style={{ padding: "8px 10px" }}>{c.source || "—"}</td>
                  <td style={{ padding: "8px 10px", fontSize: 12, color: "var(--text-faint)" }}>{fmtDate(c.created_at?.slice(0, 10))}</td>
                </tr>
              ))}
              {candidates.length === 0 && <tr><td colSpan={5} style={{ padding: 20, textAlign: "center", color: "var(--text-faint)" }}>No candidates yet</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Applications Tab ── */}
      {tab === "applications" && (
        <div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", fontSize: 10.5, textTransform: "uppercase", color: "var(--text-faint)", letterSpacing: ".06rem" }}>
                <th style={{ padding: "8px 10px" }}>Candidate</th>
                <th style={{ padding: "8px 10px" }}>Job</th>
                <th style={{ padding: "8px 10px" }}>Source</th>
                <th style={{ padding: "8px 10px" }}>Status</th>
                <th style={{ padding: "8px 10px" }}>Applied</th>
                <th style={{ padding: "8px 10px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {applications.map(a => {
                const transitions = {
                  APPLIED: ["SCREENING", "REJECTED"],
                  SCREENING: ["INTERVIEW", "REJECTED"],
                  INTERVIEW: ["OFFERED", "REJECTED"],
                  OFFERED: ["HIRED", "REJECTED"],
                };
                const next = transitions[a.status] || [];
                return (
                  <tr key={a.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px 10px" }}>
                      <div style={{ fontWeight: 600 }}>{a.candidate_name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{a.candidate_email}</div>
                    </td>
                    <td style={{ padding: "8px 10px" }}>{a.job_title}</td>
                    <td style={{ padding: "8px 10px" }}>{a.source || "—"}</td>
                    <td style={{ padding: "8px 10px" }}><Badge status={a.status} /></td>
                    <td style={{ padding: "8px 10px", fontSize: 12, color: "var(--text-faint)" }}>{fmtDate(a.applied_at?.slice(0, 10))}</td>
                    <td style={{ padding: "8px 10px" }}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {next.map(s => (
                          <button key={s} onClick={() => patchAppStatus(a.id, s)}
                            style={{ ...btnPrimary, padding: "4px 10px", fontSize: 10,
                              background: s === "REJECTED" ? "var(--badge-danger-bg)" : s === "HIRED" ? "var(--lime)" : "var(--badge-blue-bg)",
                              color: s === "REJECTED" ? "var(--danger)" : s === "HIRED" ? "#ffffff" : "var(--badge-blue-text)",
                            }}>
                            {s}
                          </button>
                        ))}
                        {a.status === "INTERVIEW" && (
                          <button onClick={() => scheduleInterview(a.id)} style={{ ...btnPrimary, padding: "4px 10px", fontSize: 10, background: "var(--badge-purple-bg)", color: "var(--badge-purple-text)" }}>
                            + Interview
                          </button>
                        )}
                        {a.status === "OFFERED" && (
                          <button onClick={() => createOffer(a.id)} style={{ ...btnPrimary, padding: "4px 10px", fontSize: 10, background: "var(--badge-pink-bg)", color: "var(--badge-pink-text)" }}>
                            + Offer
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {applications.length === 0 && <tr><td colSpan={6} style={{ padding: 20, textAlign: "center", color: "var(--text-faint)" }}>No applications yet</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Interviews Tab ── */}
      {tab === "interviews" && (
        <div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", fontSize: 10.5, textTransform: "uppercase", color: "var(--text-faint)", letterSpacing: ".06rem" }}>
                <th style={{ padding: "8px 10px" }}>Candidate</th>
                <th style={{ padding: "8px 10px" }}>Job</th>
                <th style={{ padding: "8px 10px" }}>Interviewer</th>
                <th style={{ padding: "8px 10px" }}>Scheduled</th>
                <th style={{ padding: "8px 10px" }}>Mode</th>
                <th style={{ padding: "8px 10px" }}>Status</th>
                <th style={{ padding: "8px 10px" }}>Rating</th>
              </tr>
            </thead>
            <tbody>
              {interviews.map(i => (
                <tr key={i.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "8px 10px", fontWeight: 600 }}>{i.candidate_name}</td>
                  <td style={{ padding: "8px 10px" }}>{i.job_title}</td>
                  <td style={{ padding: "8px 10px" }}>{i.interviewer_name}</td>
                  <td style={{ padding: "8px 10px", fontSize: 12 }}>{i.scheduled_at ? new Date(i.scheduled_at).toLocaleString("en-IN") : "—"}</td>
                  <td style={{ padding: "8px 10px" }}>{i.mode}</td>
                  <td style={{ padding: "8px 10px" }}><Badge status={i.status} /></td>
                  <td style={{ padding: "8px 10px" }}>{i.rating ? Array.from({length: i.rating}, (_, idx) => <Icon key={idx} name="star" filled={true} style={{ fontSize: "13px" }} />) : "—"}</td>
                </tr>
              ))}
              {interviews.length === 0 && <tr><td colSpan={7} style={{ padding: 20, textAlign: "center", color: "var(--text-faint)" }}>No interviews scheduled</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
