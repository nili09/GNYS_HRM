import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import Icon from "./Icon.jsx";

const ENTITY_META = {
  employee:     { icon: "person",                  label: "Employee",     path: (id) => `/hr/employees` },
  job:          { icon: "work",                    label: "Job Opening",  path: (id) => `/hr/recruitment` },
  ticket:       { icon: "confirmation_number",     label: "Ticket",       path: (id) => `/my/tickets` },
  asset:        { icon: "laptop_mac",              label: "Asset",        path: (id) => `/hr/assets` },
  announcement: { icon: "campaign",               label: "Announcement", path: (id) => `/announcements` },
  expense:      { icon: "account_balance_wallet",  label: "Expense",      path: (id) => `/my/expenses` },
};

export default function SearchBar() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef(null);
  const timerRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen(o => !o);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const doSearch = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const data = await api.get(`/search?q=${encodeURIComponent(q)}&limit=15`);
      setResults(data);
      setSelectedIdx(0);
    } catch { setResults([]); }
    setLoading(false);
  }, []);

  function handleInput(val) {
    setQuery(val);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSearch(val), 300);
  }

  function handleSelect(result) {
    const meta = ENTITY_META[result.entity];
    if (meta) navigate(meta.path(result.entity_id));
    setOpen(false);
    setQuery("");
    setResults([]);
  }

  function handleKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[selectedIdx]) {
      handleSelect(results[selectedIdx]);
    }
  }

  const grouped = {};
  for (const r of results) {
    if (!grouped[r.entity]) grouped[r.entity] = [];
    grouped[r.entity].push(r);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "6px 14px", borderRadius: 6,
          border: "1px solid var(--border)", background: "var(--card)",
          color: "var(--text-muted)", fontSize: 12, cursor: "pointer",
          minWidth: 180,
        }}
      >
        <Icon name="search" style={{ fontSize: 16 }} />
        <span style={{ flex: 1, textAlign: "left" }}>Search...</span>
        <kbd style={{
          fontSize: 10, padding: "1px 5px", borderRadius: 3,
          border: "1px solid var(--border)", color: "var(--text-faint)",
          fontFamily: "monospace",
        }}>Ctrl+K</kbd>
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,.5)", display: "flex",
        alignItems: "flex-start", justifyContent: "center",
        paddingTop: 80,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
    >
      <div style={{
        width: "100%", maxWidth: 560, background: "var(--card)",
        borderRadius: 12, border: "1px solid var(--border)",
        boxShadow: "0 20px 60px rgba(0,0,0,.3)",
        overflow: "hidden",
      }}>
        <div style={{ display: "flex", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
          <Icon name="search" style={{ fontSize: 18, marginRight: 10, color: "var(--text-muted)" }} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => handleInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search employees, tickets, assets, announcements..."
            style={{
              flex: 1, border: "none", outline: "none", background: "transparent",
              color: "var(--text)", fontSize: 14, fontFamily: "inherit",
            }}
          />
          {loading && <span style={{ color: "var(--text-faint)", fontSize: 11 }}>...</span>}
          <kbd
            onClick={() => setOpen(false)}
            style={{
              fontSize: 10, padding: "2px 6px", borderRadius: 3,
              border: "1px solid var(--border)", color: "var(--text-faint)",
              fontFamily: "monospace", cursor: "pointer", marginLeft: 8,
            }}
          >ESC</kbd>
        </div>

        <div style={{ maxHeight: 400, overflowY: "auto" }}>
          {query && results.length === 0 && !loading && (
            <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              No results found.
            </div>
          )}

          {Object.entries(grouped).map(([entity, items]) => {
            const meta = ENTITY_META[entity] || { icon: "description", label: entity };
            return (
              <div key={entity}>
                <div style={{
                  padding: "8px 16px 4px", fontSize: 10, fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: ".08em",
                  color: "var(--text-faint)",
                  display: "flex", alignItems: "center", gap: 4,
                }}>
                  <Icon name={meta.icon} style={{ fontSize: 12 }} /> {meta.label}
                </div>
                {items.map((r) => {
                  const flatIdx = results.indexOf(r);
                  const isSelected = flatIdx === selectedIdx;
                  return (
                    <div
                      key={`${r.entity}-${r.entity_id}`}
                      onClick={() => handleSelect(r)}
                      onMouseEnter={() => setSelectedIdx(flatIdx)}
                      style={{
                        padding: "8px 16px", cursor: "pointer",
                        background: isSelected ? "rgba(25,25,112,.10)" : "transparent",
                        borderLeft: isSelected ? "2px solid var(--lime)" : "2px solid transparent",
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>
                        {r.title}
                      </div>
                      {r.snippet && (
                        <div
                          style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}
                          dangerouslySetInnerHTML={{ __html: r.snippet }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {results.length > 0 && (
          <div style={{
            padding: "8px 16px", borderTop: "1px solid var(--border)",
            fontSize: 10, color: "var(--text-faint)", display: "flex", gap: 16,
          }}>
            <span>↑↓ Navigate</span>
            <span>↵ Open</span>
            <span>ESC Close</span>
          </div>
        )}
      </div>
    </div>
  );
}
