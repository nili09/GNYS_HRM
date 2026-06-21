import { useState, useEffect, useRef } from "react";
import { api } from "../lib/api.js";

/**
 * Type-to-search employee picker. Hits GET /employees?q=&limit= instead of
 * loading the whole directory, so it stays fast regardless of org size.
 *
 * value: { id, name, code } | null
 * onChange: (employee|null) => void
 */
export default function EmployeePicker({
  value,
  onChange,
  placeholder = "Type a name or code…",
  excludeId,
  status,
  allowClear = true,
  disabled = false,
  style,
}) {
  const [text, setText] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function handleInput(v) {
    setText(v);
    clearTimeout(debounceRef.current);
    if (v.trim().length < 1) { setResults([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: v.trim(), limit: "10" });
        if (status) params.set("status", status);
        const res = await api.get(`/employees?${params.toString()}`);
        const rows = (res.data || []).filter((e) => e.id !== excludeId);
        setResults(rows);
        setOpen(true);
      } catch { setResults([]); }
    }, 250);
  }

  function pick(emp) {
    onChange(emp);
    setText("");
    setResults([]);
    setOpen(false);
  }

  function clear() {
    onChange(null);
    setText("");
  }

  return (
    <div ref={boxRef} style={{ position: "relative", ...style }}>
      {value ? (
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "6px 10px", border: "1px solid var(--line)",
          borderRadius: "var(--r-card)", fontSize: 13, boxSizing: "border-box",
        }}>
          <span style={{ fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {value.name}{value.code ? ` (${value.code})` : ""}
          </span>
          {allowClear && !disabled && (
            <button type="button" onClick={clear} style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--text-muted)", fontSize: 15, lineHeight: 1, padding: 0,
            }}>×</button>
          )}
        </div>
      ) : (
        <input
          type="text"
          value={text}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => { if (results.length) setOpen(true); }}
          placeholder={placeholder}
          disabled={disabled}
          style={{
            width: "100%", padding: "6px 10px", border: "1px solid var(--line)",
            borderRadius: "var(--r-card)", fontSize: 13, boxSizing: "border-box",
            opacity: disabled ? 0.6 : 1,
          }}
        />
      )}
      {open && results.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
          background: "var(--card)", border: "1px solid var(--line)",
          borderRadius: "var(--r-card)", boxShadow: "0 4px 16px rgba(0,0,0,.2)",
          maxHeight: 200, overflowY: "auto",
        }}>
          {results.map((e) => (
            <div
              key={e.id}
              onClick={() => pick(e)}
              style={{ padding: "7px 10px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid var(--line)" }}
              onMouseEnter={(ev) => ev.currentTarget.style.background = "var(--bg)"}
              onMouseLeave={(ev) => ev.currentTarget.style.background = "transparent"}
            >
              <span style={{ fontWeight: 600 }}>{e.name}</span>
              <span style={{ color: "var(--text-muted)", marginLeft: 6 }}>({e.code})</span>
            </div>
          ))}
        </div>
      )}
      {open && results.length === 0 && text.trim().length >= 1 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
          background: "var(--card)", border: "1px solid var(--line)",
          borderRadius: "var(--r-card)", padding: "8px 10px", fontSize: 12.5, color: "var(--text-faint)",
        }}>
          No matches
        </div>
      )}
    </div>
  );
}
