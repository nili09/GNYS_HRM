import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";
import EmployeePicker from "../components/EmployeePicker.jsx";

const STATUS_BADGE = {
  AVAILABLE: { bg: "var(--lime-pale)", color: "var(--charcoal)" },
  ASSIGNED:  { bg: "var(--badge-sky-bg)", color: "var(--badge-sky-text)" },
  IN_REPAIR: { bg: "var(--badge-tan-bg)", color: "var(--badge-tan-text)" },
  RETIRED:   { bg: "var(--badge-danger-bg)", color: "var(--danger)" },
};

function Badge({ status }) {
  const s = STATUS_BADGE[status] || STATUS_BADGE.AVAILABLE;
  return (
    <span style={{
      padding: "2px 10px", borderRadius: "var(--r-pill)", fontSize: 10.5, fontWeight: 700,
      letterSpacing: ".04rem", textTransform: "uppercase", background: s.bg, color: s.color,
    }}>{status?.replace("_", " ")}</span>
  );
}

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtAmount(n) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

export default function HRAssets() {
  const [tab, setTab] = useState("inventory");
  const [assets, setAssets] = useState([]);
  const [types, setTypes] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(null);

  const [typeForm, setTypeForm] = useState({ name: "" });
  const [vendorForm, setVendorForm] = useState({ name: "", contact_email: "", contact_phone: "" });
  const [assetForm, setAssetForm] = useState({ asset_type_id: "", name: "", serial_no: "", purchase_date: "", purchase_cost: "", vendor_id: "", notes: "" });
  const [assignForm, setAssignForm] = useState({ asset_id: null, employee: null, is_temporary: false });
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const qs = [statusFilter && `status=${statusFilter}`, typeFilter && `type_id=${typeFilter}`].filter(Boolean).join("&");
      const [assetList, typeList, vendorList, dash] = await Promise.all([
        api.get(`/assets${qs ? `?${qs}` : ""}`),
        api.get("/assets/asset-types"),
        api.get("/assets/vendors"),
        api.get("/assets/dashboard"),
      ]);
      setAssets(assetList);
      setTypes(typeList);
      setVendors(vendorList);
      setDashboard(dash);
    } catch { /* ignore */ }
    setLoading(false);
  }, [statusFilter, typeFilter]);

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

  async function addType(e) {
    e.preventDefault();
    setFormError(""); setFormSuccess("");
    try {
      await api.post("/assets/asset-types", { name: typeForm.name });
      setTypeForm({ name: "" });
      setFormSuccess("Asset type created");
      fetchData();
    } catch (err) { setFormError(err.message || "Failed"); }
  }

  async function addVendor(e) {
    e.preventDefault();
    setFormError(""); setFormSuccess("");
    try {
      await api.post("/assets/vendors", {
        name: vendorForm.name,
        contact_email: vendorForm.contact_email || null,
        contact_phone: vendorForm.contact_phone || null,
      });
      setVendorForm({ name: "", contact_email: "", contact_phone: "" });
      setFormSuccess("Vendor created");
      fetchData();
    } catch (err) { setFormError(err.message || "Failed"); }
  }

  async function addAsset(e) {
    e.preventDefault();
    setFormError(""); setFormSuccess("");
    try {
      await api.post("/assets", {
        asset_type_id: Number(assetForm.asset_type_id),
        name: assetForm.name,
        serial_no: assetForm.serial_no || null,
        purchase_date: assetForm.purchase_date || null,
        purchase_cost: assetForm.purchase_cost ? Number(assetForm.purchase_cost) : null,
        vendor_id: assetForm.vendor_id ? Number(assetForm.vendor_id) : null,
        notes: assetForm.notes || null,
      });
      setAssetForm({ asset_type_id: assetForm.asset_type_id, name: "", serial_no: "", purchase_date: "", purchase_cost: "", vendor_id: "", notes: "" });
      setFormSuccess("Asset created");
      fetchData();
    } catch (err) { setFormError(err.message || "Failed"); }
  }

  async function handleAssign(e) {
    e.preventDefault();
    if (!assignForm.employee) { setFormError("Select an employee"); return; }
    setFormError(""); setFormSuccess(""); setActing(`assign-${assignForm.asset_id}`);
    try {
      await api.post(`/assets/${assignForm.asset_id}/assign`, {
        employee_id: assignForm.employee.id,
        is_temporary: assignForm.is_temporary ? 1 : 0,
      });
      setAssignForm({ asset_id: null, employee: null, is_temporary: false });
      setFormSuccess("Asset assigned");
      fetchData();
    } catch (err) { setFormError(err.message || "Failed"); }
    setActing(null);
  }

  async function handleReturn(assetId) {
    setActing(`return-${assetId}`);
    try {
      await api.post(`/assets/${assetId}/return`);
      fetchData();
    } catch { /* ignore */ }
    setActing(null);
  }

  const tabStyle = (active) => ({
    padding: "8px 16px", border: "none", cursor: "pointer", fontWeight: 600, fontSize: 12,
    borderBottom: active ? "2px solid var(--lime)" : "2px solid transparent",
    color: active ? "var(--lime)" : "var(--text-muted)",
    background: "transparent", textTransform: "uppercase", letterSpacing: ".05em",
  });

  const inputStyle = {
    display: "block", width: "100%", marginTop: 4, padding: "7px 10px", borderRadius: 4,
    border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 13,
  };

  if (loading) return <p style={{ color: "var(--text-muted)", padding: 24 }}>Loading...</p>;

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, fontFamily: "var(--font-display)" }}>
        Asset Management
      </h2>

      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", marginBottom: 20 }}>
        <button style={tabStyle(tab === "inventory")} onClick={() => setTab("inventory")}>Inventory</button>
        <button style={tabStyle(tab === "add")} onClick={() => setTab("add")}>Add Asset</button>
        <button style={tabStyle(tab === "types")} onClick={() => setTab("types")}>Types & Vendors</button>
        <button style={tabStyle(tab === "dashboard")} onClick={() => setTab("dashboard")}>Dashboard</button>
      </div>

      {formError && <div style={{ color: "var(--danger)", fontSize: 13, marginBottom: 12 }}>{formError}</div>}
      {formSuccess && <div style={{ color: "var(--lime)", fontSize: 13, marginBottom: 12 }}>{formSuccess}</div>}

      {tab === "inventory" && (
        <>
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              style={{ ...inputStyle, width: 160 }}>
              <option value="">All Statuses</option>
              <option value="AVAILABLE">Available</option>
              <option value="ASSIGNED">Assigned</option>
              <option value="IN_REPAIR">In Repair</option>
              <option value="RETIRED">Retired</option>
            </select>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
              style={{ ...inputStyle, width: 160 }}>
              <option value="">All Types</option>
              {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border)", textAlign: "left" }}>
                  <th style={{ padding: "8px 10px" }}>Name</th>
                  <th style={{ padding: "8px 10px" }}>Type</th>
                  <th style={{ padding: "8px 10px" }}>Serial No.</th>
                  <th style={{ padding: "8px 10px" }}>Status</th>
                  <th style={{ padding: "8px 10px" }}>Vendor</th>
                  <th style={{ padding: "8px 10px" }}>Cost</th>
                  <th style={{ padding: "8px 10px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {assets.map(a => (
                  <tr key={a.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px 10px", fontWeight: 600 }}>{a.name}</td>
                    <td style={{ padding: "8px 10px" }}>{a.type_name}</td>
                    <td style={{ padding: "8px 10px", fontFamily: "monospace" }}>{a.serial_no || "—"}</td>
                    <td style={{ padding: "8px 10px" }}><Badge status={a.status} /></td>
                    <td style={{ padding: "8px 10px" }}>{a.vendor_name || "—"}</td>
                    <td style={{ padding: "8px 10px" }}>{fmtAmount(a.purchase_cost)}</td>
                    <td style={{ padding: "8px 10px" }}>
                      {a.status === "AVAILABLE" && (
                        <button onClick={() => { setAssignForm({ asset_id: a.id, employee: null, is_temporary: false }); setTab("assign"); }}
                          style={{ padding: "4px 12px", borderRadius: 4, border: "none", background: "var(--lime)", color: "#ffffff", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>
                          Assign
                        </button>
                      )}
                      {a.status === "ASSIGNED" && (
                        <button onClick={() => handleReturn(a.id)} disabled={acting === `return-${a.id}`}
                          style={{ padding: "4px 12px", borderRadius: 4, border: "1px solid var(--border)", background: "transparent", color: "var(--text)", fontWeight: 600, fontSize: 11, cursor: "pointer" }}>
                          {acting === `return-${a.id}` ? "..." : "Return"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {assets.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: 20, textAlign: "center", color: "var(--text-muted)" }}>No assets found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "assign" && assignForm.asset_id && (
        <form onSubmit={handleAssign} style={{ maxWidth: 400, display: "flex", flexDirection: "column", gap: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Assign Asset #{assignForm.asset_id}</h3>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
            Employee
            <EmployeePicker
              value={assignForm.employee}
              onChange={(emp) => setAssignForm(f => ({ ...f, employee: emp }))}
              status="ACTIVE"
              placeholder="Type employee name or code…"
              style={{ marginTop: 4 }}
            />
          </label>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={assignForm.is_temporary} onChange={e => setAssignForm(f => ({ ...f, is_temporary: e.target.checked }))} />
            Temporary assignment
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" disabled={acting || !assignForm.employee}
              style={{ padding: "8px 24px", borderRadius: 4, border: "none", background: "var(--lime)", color: "#ffffff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              Assign
            </button>
            <button type="button" onClick={() => { setAssignForm({ asset_id: null, employee: null, is_temporary: false }); setTab("inventory"); }}
              style={{ padding: "8px 24px", borderRadius: 4, border: "1px solid var(--border)", background: "transparent", color: "var(--text)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {tab === "add" && (
        <form onSubmit={addAsset} style={{ maxWidth: 520, display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
            Type
            <select value={assetForm.asset_type_id} onChange={e => setAssetForm(f => ({ ...f, asset_type_id: e.target.value }))} required style={inputStyle}>
              <option value="">Select type</option>
              {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
            Name
            <input value={assetForm.name} onChange={e => setAssetForm(f => ({ ...f, name: e.target.value }))} required style={inputStyle} />
          </label>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
            Serial No.
            <input value={assetForm.serial_no} onChange={e => setAssetForm(f => ({ ...f, serial_no: e.target.value }))} style={inputStyle} />
          </label>
          <div style={{ display: "flex", gap: 12 }}>
            <label style={{ flex: 1, fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
              Purchase Date
              <input type="date" value={assetForm.purchase_date} onChange={e => setAssetForm(f => ({ ...f, purchase_date: e.target.value }))} style={inputStyle} />
            </label>
            <label style={{ flex: 1, fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
              Purchase Cost (INR)
              <input type="number" value={assetForm.purchase_cost} onChange={e => setAssetForm(f => ({ ...f, purchase_cost: e.target.value }))} style={inputStyle} />
            </label>
          </div>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
            Vendor
            <select value={assetForm.vendor_id} onChange={e => setAssetForm(f => ({ ...f, vendor_id: e.target.value }))} style={inputStyle}>
              <option value="">None</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
            Notes
            <textarea value={assetForm.notes} onChange={e => setAssetForm(f => ({ ...f, notes: e.target.value }))} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
          </label>
          <button type="submit"
            style={{ alignSelf: "flex-start", padding: "8px 24px", borderRadius: 4, border: "none", background: "var(--lime)", color: "#ffffff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            Add Asset
          </button>
        </form>
      )}

      {tab === "types" && (
        <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Asset Types</h3>
            <form onSubmit={addType} style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input value={typeForm.name} onChange={e => setTypeForm({ name: e.target.value })} placeholder="Type name" required style={{ ...inputStyle, flex: 1 }} />
              <button type="submit" style={{ padding: "7px 16px", borderRadius: 4, border: "none", background: "var(--lime)", color: "#ffffff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Add</button>
            </form>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <tbody>
                {types.map(t => (
                  <tr key={t.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "6px 10px" }}>{t.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ flex: 1, minWidth: 320 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Vendors</h3>
            <form onSubmit={addVendor} style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
              <input value={vendorForm.name} onChange={e => setVendorForm(f => ({ ...f, name: e.target.value }))} placeholder="Vendor name" required style={inputStyle} />
              <div style={{ display: "flex", gap: 8 }}>
                <input value={vendorForm.contact_email} onChange={e => setVendorForm(f => ({ ...f, contact_email: e.target.value }))} placeholder="Email" style={{ ...inputStyle, flex: 1 }} />
                <input value={vendorForm.contact_phone} onChange={e => setVendorForm(f => ({ ...f, contact_phone: e.target.value }))} placeholder="Phone" style={{ ...inputStyle, flex: 1 }} />
              </div>
              <button type="submit" style={{ alignSelf: "flex-start", padding: "7px 16px", borderRadius: 4, border: "none", background: "var(--lime)", color: "#ffffff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Add Vendor</button>
            </form>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border)", textAlign: "left" }}>
                  <th style={{ padding: "6px 10px" }}>Name</th>
                  <th style={{ padding: "6px 10px" }}>Email</th>
                  <th style={{ padding: "6px 10px" }}>Phone</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map(v => (
                  <tr key={v.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "6px 10px" }}>{v.name}</td>
                    <td style={{ padding: "6px 10px" }}>{v.contact_email || "—"}</td>
                    <td style={{ padding: "6px 10px" }}>{v.contact_phone || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "dashboard" && dashboard && (
        <div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
            <div style={{ background: "var(--card)", borderRadius: 8, padding: "16px 24px", border: "1px solid var(--border)", minWidth: 140 }}>
              <div style={{ fontSize: 11, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>Total Assets</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{dashboard.totalAssets}</div>
            </div>
            {dashboard.byStatus.map(s => (
              <div key={s.status} style={{ background: "var(--card)", borderRadius: 8, padding: "16px 24px", border: "1px solid var(--border)", minWidth: 120 }}>
                <div style={{ fontSize: 11, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>{s.status.replace("_", " ")}</div>
                <div style={{ fontSize: 28, fontWeight: 700 }}>{s.count}</div>
              </div>
            ))}
          </div>

          {dashboard.unreturnedByExited.length > 0 && (
            <>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: "var(--danger)" }}>Unreturned Assets (Exited Employees)</h3>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 24 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--border)", textAlign: "left" }}>
                    <th style={{ padding: "8px 10px" }}>Asset</th>
                    <th style={{ padding: "8px 10px" }}>Employee</th>
                    <th style={{ padding: "8px 10px" }}>Exit Date</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.unreturnedByExited.map(u => (
                    <tr key={u.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "8px 10px" }}>{u.asset_name}</td>
                      <td style={{ padding: "8px 10px" }}>{u.employee_name}</td>
                      <td style={{ padding: "8px 10px" }}>{fmtDate(u.exit_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {dashboard.recentAssignments.length > 0 && (
            <>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Recent Assignments</h3>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--border)", textAlign: "left" }}>
                    <th style={{ padding: "8px 10px" }}>Asset</th>
                    <th style={{ padding: "8px 10px" }}>Employee</th>
                    <th style={{ padding: "8px 10px" }}>Assigned</th>
                    <th style={{ padding: "8px 10px" }}>Returned</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.recentAssignments.map(a => (
                    <tr key={a.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "8px 10px" }}>{a.asset_name}</td>
                      <td style={{ padding: "8px 10px" }}>{a.employee_name}</td>
                      <td style={{ padding: "8px 10px" }}>{fmtDate(a.assigned_at)}</td>
                      <td style={{ padding: "8px 10px" }}>{a.returned_at ? fmtDate(a.returned_at) : "Active"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  );
}
