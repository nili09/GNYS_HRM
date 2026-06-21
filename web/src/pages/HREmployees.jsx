import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";
import EmployeeDrawer from "../components/EmployeeDrawer.jsx";
import ImportWizard from "../components/ImportWizard.jsx";

const STATUS_STYLE = {
  ACTIVE:     { bg: "var(--badge-lime-bg)",   fg: "var(--badge-lime-text)" },
  ONBOARDING: { bg: "var(--badge-lime-bg)",   fg: "var(--badge-lime-text)" },
  NOTICE:     { bg: "var(--badge-tan-bg)",    fg: "var(--badge-tan-text)" },
  EXITED:     { bg: "var(--badge-danger-bg)", fg: "var(--badge-danger-text)" },
};

const PAGE_SIZE = 50;

export default function HREmployees() {
  const [employees, setEmployees] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ q: "", dept: "", status: "", location: "" });
  const [departments, setDepartments] = useState([]);
  const [locations, setLocations] = useState([]);
  const [drawerEmpId, setDrawerEmpId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.q)        params.set("q", filters.q);
      if (filters.dept)     params.set("dept", filters.dept);
      if (filters.status)   params.set("status", filters.status);
      if (filters.location) params.set("location", filters.location);
      params.set("page", String(page));
      params.set("limit", String(PAGE_SIZE));
      const res = await api.get(`/employees?${params.toString()}`);
      setEmployees(res.data || []);
      setTotal(res.total || 0);
    } catch (e) {
      console.error("fetch employees:", e);
    }
    setLoading(false);
  }, [filters, page]);

  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);

  function updateFilter(key, value) {
    setFilters(f => ({ ...f, [key]: value }));
    setPage(1);
  }

  useEffect(() => {
    (async () => {
      try {
        const [d, l] = await Promise.all([api.get("/departments"), api.get("/locations")]);
        setDepartments(d);
        setLocations(l);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    let es;
    try {
      es = new EventSource("/api/events", { withCredentials: true });
      es.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data);
          if (d.type === "mutation" && d.entity === "employees") fetchEmployees();
        } catch {}
      };
    } catch {}
    const poll = setInterval(fetchEmployees, 30000);
    return () => { es?.close(); clearInterval(poll); };
  }, [fetchEmployees]);

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <h2 style={{ fontSize: 20, margin: 0 }}>Employees</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => { window.location.href = "/api/employees/export"; }} className="btn-sm">
            Export CSV
          </button>
          <button onClick={() => setShowImport(true)} className="btn-sm">
            Import CSV
          </button>
          <button
            onClick={() => { setDrawerEmpId("new"); setShowAdd(true); }}
            className="btn-primary"
            style={{ padding: "7px 18px" }}
          >
            + Add Employee
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <input
          placeholder="Search name, code, email…"
          value={filters.q}
          onChange={e => updateFilter("q", e.target.value)}
          style={{ flex: "1 1 200px" }}
        />
        <select value={filters.dept}     onChange={e => updateFilter("dept", e.target.value)}     style={{ minWidth: 140 }}>
          <option value="">All Departments</option>
          {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
        </select>
        <select value={filters.status}   onChange={e => updateFilter("status", e.target.value)}   style={{ minWidth: 120 }}>
          <option value="">All Status</option>
          {["ACTIVE", "ONBOARDING", "NOTICE", "EXITED"].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filters.location} onChange={e => updateFilter("location", e.target.value)} style={{ minWidth: 140 }}>
          <option value="">All Locations</option>
          {locations.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
        </select>
      </div>

      {/* Table */}
      <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r-card)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--bg)" }}>
              {["Code", "Name", "Department", "Designation", "Location", "Status", "Joined"].map(h => (
                <th key={h} className="table-th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: 32, textAlign: "center", color: "var(--text-faint)" }}>Loading…</td></tr>
            ) : employees.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 32, textAlign: "center", color: "var(--text-faint)" }}>No employees found</td></tr>
            ) : employees.map(emp => {
              const sc = STATUS_STYLE[emp.status] || { bg: "var(--line)", fg: "var(--text-muted)" };
              return (
                <tr
                  key={emp.id}
                  onClick={() => { setDrawerEmpId(emp.id); setShowAdd(false); }}
                  className="table-row"
                  style={{ borderBottom: "1px solid var(--line)", cursor: "pointer" }}
                >
                  <td className="table-td" style={{ color: "var(--text-muted)", fontSize: 12.5 }}>{emp.code}</td>
                  <td className="table-td">
                    <div style={{ fontWeight: 600 }}>{emp.name}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-faint)" }}>{emp.email}</div>
                  </td>
                  <td className="table-td">{emp.dept || "—"}</td>
                  <td className="table-td">{emp.desig || "—"}</td>
                  <td className="table-td">{emp.location || "—"}</td>
                  <td className="table-td">
                    <span className="badge" style={{ background: sc.bg, color: sc.fg }}>
                      {emp.status}
                    </span>
                  </td>
                  <td className="table-td" style={{ color: "var(--text-muted)", fontSize: 12.5 }}>{emp.doj || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, marginTop: 10 }}>
        <span style={{ fontSize: 12, color: "var(--text-faint)" }}>
          {total === 0
            ? "0 employees"
            : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`}
        </span>
        <button
          className="btn-sm"
          disabled={page <= 1}
          onClick={() => setPage(p => p - 1)}
          style={{ opacity: page <= 1 ? 0.5 : 1 }}
        >
          ‹ Prev
        </button>
        <button
          className="btn-sm"
          disabled={page * PAGE_SIZE >= total}
          onClick={() => setPage(p => p + 1)}
          style={{ opacity: page * PAGE_SIZE >= total ? 0.5 : 1 }}
        >
          Next ›
        </button>
      </div>

      {drawerEmpId != null && (
        <EmployeeDrawer
          empId={drawerEmpId}
          isNew={showAdd}
          departments={departments}
          locations={locations}
          onClose={() => { setDrawerEmpId(null); setShowAdd(false); }}
          onSaved={() => { fetchEmployees(); }}
        />
      )}

      {showImport && (
        <ImportWizard
          onClose={() => setShowImport(false)}
          onDone={() => { setShowImport(false); fetchEmployees(); }}
        />
      )}
    </div>
  );
}
