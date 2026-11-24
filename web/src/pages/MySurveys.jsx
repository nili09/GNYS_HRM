import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../hooks/useAuth.jsx";

function fmtDate(d) {
  if (!d) return "";
  const dt = new Date(d.includes("T") ? d : d + "T00:00:00");
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function MySurveys() {
  const { user } = useAuth();
  const [surveys, setSurveys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Track which surveys the user has completed
  const [completedIds, setCompletedIds] = useState(new Set());

  // Active survey state
  const [activeSurveyId, setActiveSurveyId] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");

  const fetchSurveys = useCallback(async () => {
    try {
      const data = await api.get("/engagement/surveys");
      setSurveys(data);
    } catch (err) {
      setError(err.data?.error || err.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSurveys();
  }, [fetchSurveys]);

  async function handleTakeSurvey(surveyId) {
    if (completedIds.has(surveyId)) return;
    setActiveSurveyId(surveyId);
    setLoadingQuestions(true);
    setSubmitError("");
    setSubmitSuccess("");
    setAnswers({});

    try {
      const qs = await api.get(`/engagement/surveys/${surveyId}/questions`);
      setQuestions(qs);
    } catch (err) {
      setSubmitError(err.data?.error || err.message);
      setQuestions([]);
    }
    setLoadingQuestions(false);
  }

  function handleCloseForm() {
    setActiveSurveyId(null);
    setQuestions([]);
    setAnswers({});
    setSubmitError("");
    setSubmitSuccess("");
  }

  function setAnswer(questionId, value) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  async function handleSubmit() {
    if (!activeSurveyId) return;
    setSubmitting(true);
    setSubmitError("");
    setSubmitSuccess("");

    const answerPayload = questions.map((q) => ({
      question_id: q.id,
      answer: String(answers[q.id] ?? ""),
    }));

    try {
      await api.post(`/engagement/surveys/${activeSurveyId}/respond`, {
        answers: answerPayload,
      });
      setCompletedIds((prev) => new Set([...prev, activeSurveyId]));
      setSubmitSuccess("Your response has been submitted. Thank you!");
      setTimeout(() => {
        handleCloseForm();
      }, 1500);
    } catch (err) {
      if (err.status === 409) {
        setCompletedIds((prev) => new Set([...prev, activeSurveyId]));
        setSubmitError("You have already responded to this survey.");
      } else {
        setSubmitError(err.data?.error || err.message);
      }
    }
    setSubmitting(false);
  }

  if (loading) {
    return <div style={{ padding: 20, color: "var(--text-muted)" }}>Loading...</div>;
  }

  if (error) {
    return <div style={{ padding: 20, color: "var(--danger)" }}>{error}</div>;
  }

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: 18 }}>My Surveys</h1>

      {surveys.length === 0 && (
        <div style={{
          background: "var(--card)",
          borderRadius: 0,
          padding: 32,
          border: "1px solid var(--line)",
          textAlign: "center",
          color: "var(--text-faint)",
          fontSize: 14,
        }}>
          No active surveys at this time.
        </div>
      )}

      {/* Survey list */}
      {surveys.map((s) => {
        const isCompleted = completedIds.has(s.id);
        const isActive = activeSurveyId === s.id;

        return (
          <div key={s.id} style={{ marginBottom: 12 }}>
            <div style={{
              background: "var(--card)",
              borderRadius: 0,
              padding: 16,
              border: isActive ? "2px solid var(--lime)" : "1px solid var(--line)",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>
                    {s.title}
                  </div>
                  {s.description && (
                    <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 6 }}>
                      {s.description}
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: "var(--text-faint)" }}>
                    {s.closes_at ? `Closes ${fmtDate(s.closes_at)}` : "No closing date"}
                    {s.anonymous === 1 && (
                      <span style={{ marginLeft: 10, fontStyle: "italic" }}>Anonymous</span>
                    )}
                  </div>
                </div>

                <div style={{ marginLeft: 16 }}>
                  {isCompleted ? (
                    <span style={{
                      padding: "2px 8px",
                      borderRadius: 0,
                      fontSize: 11,
                      fontWeight: 600,
                      background: "var(--badge-green-bg)",
                      color: "var(--badge-green-text)",
                    }}>
                      Completed
                    </span>
                  ) : (
                    <button
                      onClick={() => isActive ? handleCloseForm() : handleTakeSurvey(s.id)}
                      style={{
                        padding: "7px 16px",
                        borderRadius: 0,
                        border: "none",
                        cursor: "pointer",
                        fontWeight: 600,
                        fontSize: 13,
                        background: isActive ? "var(--line)" : "var(--lime)",
                        color: isActive ? "var(--text)" : "var(--bg)",
                      }}
                    >
                      {isActive ? "Close" : "Take Survey"}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Inline survey form */}
            {isActive && !isCompleted && (
              <div style={{
                background: "var(--bg)",
                borderRadius: "0 0 var(--r-card) var(--r-card)",
                padding: 20,
                border: "1px solid var(--line)",
                borderTop: "none",
                marginTop: -2,
              }}>
                {loadingQuestions ? (
                  <div style={{ color: "var(--text-muted)", fontSize: 13 }}>Loading questions...</div>
                ) : questions.length === 0 ? (
                  <div style={{ color: "var(--text-faint)", fontSize: 13 }}>No questions found for this survey.</div>
                ) : (
                  <div>
                    {questions.map((q, idx) => (
                      <div key={q.id} style={{ marginBottom: 20 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
                          {idx + 1}. {q.question}
                        </div>

                        {q.type === "RATING" && (
                          <div style={{ display: "flex", gap: 6 }}>
                            {[1, 2, 3, 4, 5].map((n) => (
                              <button
                                key={n}
                                type="button"
                                onClick={() => setAnswer(q.id, n)}
                                style={{
                                  width: 40,
                                  height: 40,
                                  borderRadius: 0,
                                  border: answers[q.id] === n ? "2px solid var(--lime)" : "1px solid var(--line)",
                                  background: answers[q.id] === n ? "var(--lime)" : "var(--card)",
                                  color: answers[q.id] === n ? "var(--bg)" : "var(--text)",
                                  fontSize: 15,
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                {n}
                              </button>
                            ))}
                          </div>
                        )}

                        {q.type === "TEXT" && (
                          <textarea
                            value={answers[q.id] || ""}
                            onChange={(e) => setAnswer(q.id, e.target.value)}
                            rows={3}
                            style={{
                              width: "100%",
                              padding: "8px 10px",
                              borderRadius: 0,
                              border: "1px solid var(--line)",
                              fontSize: 13,
                              resize: "vertical",
                              boxSizing: "border-box",
                              fontFamily: "inherit",
                            }}
                            placeholder="Type your response..."
                          />
                        )}

                        {q.type === "CHOICE" && q.options && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {q.options.split("|").map((opt) => {
                              const trimmed = opt.trim();
                              const selected = answers[q.id] === trimmed;
                              return (
                                <label
                                  key={trimmed}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    padding: "8px 12px",
                                    borderRadius: 0,
                                    border: selected ? "2px solid var(--lime)" : "1px solid var(--line)",
                                    background: selected ? "var(--lime-subtle)" : "var(--card)",
                                    cursor: "pointer",
                                    fontSize: 13,
                                  }}
                                >
                                  <input
                                    type="radio"
                                    name={`q_${q.id}`}
                                    checked={selected}
                                    onChange={() => setAnswer(q.id, trimmed)}
                                    style={{ accentColor: "var(--text)" }}
                                  />
                                  {trimmed}
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}

                    {submitError && (
                      <div style={{ color: "var(--danger)", fontSize: 13, marginBottom: 10 }}>{submitError}</div>
                    )}
                    {submitSuccess && (
                      <div style={{ color: "var(--badge-green-text)", fontSize: 13, marginBottom: 10 }}>{submitSuccess}</div>
                    )}

                    <button
                      onClick={handleSubmit}
                      disabled={submitting}
                      style={{
                        padding: "7px 16px",
                        borderRadius: 0,
                        border: "none",
                        cursor: submitting ? "not-allowed" : "pointer",
                        fontWeight: 600,
                        fontSize: 13,
                        background: "var(--lime)",
                        color: "var(--bg)",
                        opacity: submitting ? 0.6 : 1,
                      }}
                    >
                      {submitting ? "Submitting..." : "Submit Response"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
