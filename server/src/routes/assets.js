import { Router } from "express";
import { requireAuth, requireHR } from "../middleware/auth.js";
import {
  AssetTypeCreateSchema, VendorCreateSchema,
  AssetCreateSchema, AssetPatchSchema, AssetAssignSchema,
} from "@hrms/shared/schemas";
import { broadcast } from "../utils/sse.js";
import { audit } from "../utils/audit.js";
import { indexEntity } from "../utils/search.js";

const router = Router();

// ── Asset Types ──────────────────────────────────────────────────────────

router.get("/asset-types", ...requireHR, (req, res) => {
  res.json(req.app.locals.db.prepare("SELECT * FROM asset_types ORDER BY name").all());
});

router.post("/asset-types", ...requireHR, (req, res) => {
  const parsed = AssetTypeCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const db = req.app.locals.db;
  const existing = db.prepare("SELECT id FROM asset_types WHERE name = ?").get(parsed.data.name);
  if (existing) return res.status(409).json({ error: "Asset type already exists" });
  const result = db.prepare("INSERT INTO asset_types(name) VALUES(?)").run(parsed.data.name);
  const id = Number(result.lastInsertRowid);
  audit(db, { actorId: req.user.id, action: "CREATE", entity: "asset_type", entityId: id, detail: parsed.data });
  res.status(201).json({ id, ...parsed.data, active: 1 });
});

// ── Vendors ──────────────────────────────────────────────────────────────

router.get("/vendors", ...requireHR, (req, res) => {
  res.json(req.app.locals.db.prepare("SELECT * FROM vendors ORDER BY name").all());
});

router.post("/vendors", ...requireHR, (req, res) => {
  const parsed = VendorCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const db = req.app.locals.db;
  const d = parsed.data;
  const result = db.prepare(
    "INSERT INTO vendors(name, contact_email, contact_phone) VALUES(?,?,?)"
  ).run(d.name, d.contact_email ?? null, d.contact_phone ?? null);
  const id = Number(result.lastInsertRowid);
  audit(db, { actorId: req.user.id, action: "CREATE", entity: "vendor", entityId: id, detail: d });
  res.status(201).json({ id, ...d, active: 1 });
});

// ── Assets ───────────────────────────────────────────────────────────────

router.get("/", ...requireHR, (req, res) => {
  const db = req.app.locals.db;
  const { status, type_id } = req.query;
  let sql = `SELECT a.*, at.name as type_name, v.name as vendor_name
             FROM assets a
             JOIN asset_types at ON a.asset_type_id = at.id
             LEFT JOIN vendors v ON a.vendor_id = v.id`;
  const conditions = [];
  const params = [];
  if (status) { conditions.push("a.status = ?"); params.push(status); }
  if (type_id) { conditions.push("a.asset_type_id = ?"); params.push(parseInt(type_id, 10)); }
  if (conditions.length) sql += " WHERE " + conditions.join(" AND ");
  sql += " ORDER BY a.created_at DESC";
  res.json(db.prepare(sql).all(...params));
});

router.post("/", ...requireHR, (req, res) => {
  const parsed = AssetCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const db = req.app.locals.db;
  const d = parsed.data;

  const type = db.prepare("SELECT id FROM asset_types WHERE id = ?").get(d.asset_type_id);
  if (!type) return res.status(400).json({ error: "Asset type not found" });

  if (d.vendor_id) {
    const vendor = db.prepare("SELECT id FROM vendors WHERE id = ?").get(d.vendor_id);
    if (!vendor) return res.status(400).json({ error: "Vendor not found" });
  }

  if (d.serial_no) {
    const dup = db.prepare("SELECT id FROM assets WHERE serial_no = ?").get(d.serial_no);
    if (dup) return res.status(409).json({ error: "Serial number already exists" });
  }

  const result = db.prepare(
    "INSERT INTO assets(asset_type_id, name, serial_no, purchase_date, purchase_cost, vendor_id, notes) VALUES(?,?,?,?,?,?,?)"
  ).run(d.asset_type_id, d.name, d.serial_no ?? null, d.purchase_date ?? null, d.purchase_cost ?? null, d.vendor_id ?? null, d.notes ?? null);
  const id = Number(result.lastInsertRowid);
  audit(db, { actorId: req.user.id, action: "CREATE", entity: "asset", entityId: id, detail: d });
  broadcast({ type: "mutation", entity: "assets" });
  const typeName = db.prepare("SELECT name FROM asset_types WHERE id=?").get(d.asset_type_id)?.name;
  indexEntity(db, "asset", id, d.name,
    [d.serial_no, typeName, d.notes].filter(Boolean).join(" "),
    { status: "AVAILABLE", type: typeName, assigned_to: null });
  res.status(201).json({ id, ...d, status: "AVAILABLE" });
});

router.patch("/:id", ...requireHR, (req, res) => {
  const parsed = AssetPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const db = req.app.locals.db;
  const assetId = parseInt(req.params.id, 10);
  const existing = db.prepare("SELECT * FROM assets WHERE id = ?").get(assetId);
  if (!existing) return res.status(404).json({ error: "Asset not found" });

  const fields = parsed.data;

  if (fields.serial_no) {
    const dup = db.prepare("SELECT id FROM assets WHERE serial_no = ? AND id != ?").get(fields.serial_no, assetId);
    if (dup) return res.status(409).json({ error: "Serial number already exists" });
  }

  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) { sets.push(`${k} = ?`); vals.push(v); }
  }
  if (sets.length === 0) return res.json(existing);
  vals.push(assetId);
  db.prepare(`UPDATE assets SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  audit(db, { actorId: req.user.id, action: "UPDATE", entity: "asset", entityId: assetId, detail: fields });
  broadcast({ type: "mutation", entity: "assets" });
  const updatedAsset = db.prepare(
    "SELECT a.*, at.name as type_name FROM assets a JOIN asset_types at ON a.asset_type_id=at.id WHERE a.id=?"
  ).get(assetId);
  if (updatedAsset) {
    const assignedTo = db.prepare(
      "SELECT employee_id FROM asset_assignments WHERE asset_id=? AND returned_at IS NULL LIMIT 1"
    ).get(assetId);
    indexEntity(db, "asset", assetId, updatedAsset.name,
      [updatedAsset.serial_no, updatedAsset.type_name, updatedAsset.notes].filter(Boolean).join(" "),
      { status: updatedAsset.status, type: updatedAsset.type_name, assigned_to: assignedTo?.employee_id || null });
  }
  res.json({ ...existing, ...fields });
});

// ── Assign / Return ──────────────────────────────────────────────────────

router.post("/:id/assign", ...requireHR, (req, res) => {
  const parsed = AssetAssignSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const db = req.app.locals.db;
  const assetId = parseInt(req.params.id, 10);
  const asset = db.prepare("SELECT * FROM assets WHERE id = ?").get(assetId);
  if (!asset) return res.status(404).json({ error: "Asset not found" });
  if (asset.status !== "AVAILABLE") return res.status(400).json({ error: "Asset is not available for assignment" });

  const emp = db.prepare("SELECT id FROM employees WHERE id = ? AND status = 'ACTIVE'").get(parsed.data.employee_id);
  if (!emp) return res.status(400).json({ error: "Employee not found or inactive" });

  const txn = db.transaction(() => {
    db.prepare("UPDATE assets SET status = 'ASSIGNED' WHERE id = ?").run(assetId);
    const result = db.prepare(
      "INSERT INTO asset_assignments(asset_id, employee_id, assigned_by, is_temporary, notes) VALUES(?,?,?,?,?)"
    ).run(assetId, parsed.data.employee_id, req.user.id, parsed.data.is_temporary, parsed.data.notes ?? null);
    return Number(result.lastInsertRowid);
  });
  const assignId = txn();

  audit(db, { actorId: req.user.id, action: "ASSIGN", entity: "asset", entityId: assetId, detail: { ...parsed.data, assignment_id: assignId } });
  broadcast({ type: "mutation", entity: "assets" });
  res.status(201).json({ id: assignId, asset_id: assetId, ...parsed.data, assigned_by: req.user.id });
});

router.post("/:id/return", ...requireHR, (req, res) => {
  const db = req.app.locals.db;
  const assetId = parseInt(req.params.id, 10);
  const asset = db.prepare("SELECT * FROM assets WHERE id = ?").get(assetId);
  if (!asset) return res.status(404).json({ error: "Asset not found" });
  if (asset.status !== "ASSIGNED") return res.status(400).json({ error: "Asset is not currently assigned" });

  const activeAssignment = db.prepare(
    "SELECT * FROM asset_assignments WHERE asset_id = ? AND returned_at IS NULL ORDER BY assigned_at DESC LIMIT 1"
  ).get(assetId);

  const txn = db.transaction(() => {
    db.prepare("UPDATE assets SET status = 'AVAILABLE' WHERE id = ?").run(assetId);
    if (activeAssignment) {
      db.prepare("UPDATE asset_assignments SET returned_at = datetime('now') WHERE id = ?").run(activeAssignment.id);
    }
  });
  txn();

  audit(db, { actorId: req.user.id, action: "RETURN", entity: "asset", entityId: assetId, detail: { assignment_id: activeAssignment?.id } });
  broadcast({ type: "mutation", entity: "assets" });
  res.json({ ok: true });
});

// ── Employee assets ──────────────────────────────────────────────────────

router.get("/employee/:empId", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const empId = parseInt(req.params.empId, 10);
  const isHR = ["HR", "ADMIN"].includes(req.user.role);
  if (!isHR && req.user.id !== empId) return res.status(403).json({ error: "Forbidden" });

  const rows = db.prepare(
    `SELECT aa.*, a.name as asset_name, a.serial_no, a.status as asset_status,
            at.name as type_name, e.name as assigned_by_name
     FROM asset_assignments aa
     JOIN assets a ON aa.asset_id = a.id
     JOIN asset_types at ON a.asset_type_id = at.id
     JOIN employees e ON aa.assigned_by = e.id
     WHERE aa.employee_id = ?
     ORDER BY aa.assigned_at DESC`
  ).all(empId);
  res.json(rows);
});

// ── Dashboard ────────────────────────────────────────────────────────────

router.get("/dashboard", ...requireHR, (req, res) => {
  const db = req.app.locals.db;

  const byStatus = db.prepare(
    "SELECT status, COUNT(*) as count FROM assets GROUP BY status"
  ).all();

  const totalAssets = db.prepare("SELECT COUNT(*) as c FROM assets").get().c;

  const recentAssignments = db.prepare(
    `SELECT aa.*, a.name as asset_name, e.name as employee_name
     FROM asset_assignments aa
     JOIN assets a ON aa.asset_id = a.id
     JOIN employees e ON aa.employee_id = e.id
     ORDER BY aa.assigned_at DESC LIMIT 10`
  ).all();

  const unreturnedByExited = db.prepare(
    `SELECT aa.id, a.name as asset_name, e.name as employee_name, e.exit_date
     FROM asset_assignments aa
     JOIN assets a ON aa.asset_id = a.id
     JOIN employees e ON aa.employee_id = e.id
     WHERE e.status = 'EXITED' AND aa.returned_at IS NULL`
  ).all();

  res.json({ totalAssets, byStatus, recentAssignments, unreturnedByExited });
});

export default router;
