import { describe, test, expect, beforeAll } from "vitest";
import supertest from "supertest";
import { buildApp, insertEmployee, loginAs } from "./helpers.js";

function seedAssetType(db, name) {
  const result = db.prepare("INSERT INTO asset_types(name) VALUES(?)").run(name || `Type-${Date.now()}`);
  return { id: Number(result.lastInsertRowid), name };
}

function seedVendor(db, name) {
  const result = db.prepare("INSERT INTO vendors(name) VALUES(?)").run(name || `Vendor-${Date.now()}`);
  return { id: Number(result.lastInsertRowid) };
}

function seedAsset(db, typeId, overrides = {}) {
  const name = overrides.name || `Asset-${Date.now()}`;
  const result = db.prepare(
    "INSERT INTO assets(asset_type_id, name, serial_no, status) VALUES(?,?,?,?)"
  ).run(typeId, name, overrides.serial_no ?? null, overrides.status ?? "AVAILABLE");
  return { id: Number(result.lastInsertRowid), name };
}

// ── Asset Types & Vendors ────────────────────────────────────────────────

describe("Assets: Types & Vendors", () => {
  let app, db, hrCookie, empCookie;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    await insertEmployee(db, { email: "hr@at.com", code: "HRAT1", role: "HR" });
    await insertEmployee(db, { email: "emp@at.com", code: "EAT1", role: "EMPLOYEE" });
    hrCookie = await loginAs(app, "hr@at.com");
    empCookie = await loginAs(app, "emp@at.com");
  });

  test("HR can create an asset type", async () => {
    const res = await supertest(app).post("/api/assets/asset-types")
      .set("Cookie", hrCookie).send({ name: "Laptop" });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Laptop");
  });

  test("duplicate asset type name returns 409", async () => {
    seedAssetType(db, "Monitor");
    const res = await supertest(app).post("/api/assets/asset-types")
      .set("Cookie", hrCookie).send({ name: "Monitor" });
    expect(res.status).toBe(409);
  });

  test("employee cannot create asset type (403)", async () => {
    const res = await supertest(app).post("/api/assets/asset-types")
      .set("Cookie", empCookie).send({ name: "Nope" });
    expect(res.status).toBe(403);
  });

  test("HR can list asset types", async () => {
    const res = await supertest(app).get("/api/assets/asset-types").set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test("HR can create a vendor", async () => {
    const res = await supertest(app).post("/api/assets/vendors")
      .set("Cookie", hrCookie)
      .send({ name: "Dell India", contact_email: "sales@dell.com" });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Dell India");
  });

  test("HR can list vendors", async () => {
    const res = await supertest(app).get("/api/assets/vendors").set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ── Asset CRUD ───────────────────────────────────────────────────────────

describe("Assets: CRUD", () => {
  let app, db, hrCookie, empCookie, typeId, vendorId;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    await insertEmployee(db, { email: "hr@ac.com", code: "HRAC1", role: "HR" });
    await insertEmployee(db, { email: "emp@ac.com", code: "EAC1", role: "EMPLOYEE" });
    hrCookie = await loginAs(app, "hr@ac.com");
    empCookie = await loginAs(app, "emp@ac.com");
    typeId = seedAssetType(db, "Laptop").id;
    vendorId = seedVendor(db, "Dell").id;
  });

  test("HR can create an asset", async () => {
    const res = await supertest(app).post("/api/assets")
      .set("Cookie", hrCookie)
      .send({ asset_type_id: typeId, name: "Dell XPS 15", serial_no: "SN001", vendor_id: vendorId });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Dell XPS 15");
    expect(res.body.status).toBe("AVAILABLE");
  });

  test("duplicate serial_no returns 409", async () => {
    seedAsset(db, typeId, { serial_no: "DUP001" });
    const res = await supertest(app).post("/api/assets")
      .set("Cookie", hrCookie)
      .send({ asset_type_id: typeId, name: "Another", serial_no: "DUP001" });
    expect(res.status).toBe(409);
  });

  test("invalid asset_type_id returns 400", async () => {
    const res = await supertest(app).post("/api/assets")
      .set("Cookie", hrCookie)
      .send({ asset_type_id: 99999, name: "Ghost type" });
    expect(res.status).toBe(400);
  });

  test("employee cannot create assets (403)", async () => {
    const res = await supertest(app).post("/api/assets")
      .set("Cookie", empCookie)
      .send({ asset_type_id: typeId, name: "Nope" });
    expect(res.status).toBe(403);
  });

  test("HR can list assets", async () => {
    const res = await supertest(app).get("/api/assets").set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty("type_name");
  });

  test("HR can patch an asset", async () => {
    const asset = seedAsset(db, typeId);
    const res = await supertest(app).patch(`/api/assets/${asset.id}`)
      .set("Cookie", hrCookie)
      .send({ status: "RETIRED", notes: "End of life" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("RETIRED");
  });

  test("patch non-existent asset returns 404", async () => {
    const res = await supertest(app).patch("/api/assets/99999")
      .set("Cookie", hrCookie).send({ notes: "Ghost" });
    expect(res.status).toBe(404);
  });

  test("serial_no uniqueness on patch", async () => {
    seedAsset(db, typeId, { serial_no: "TAKEN001" });
    const other = seedAsset(db, typeId);
    const res = await supertest(app).patch(`/api/assets/${other.id}`)
      .set("Cookie", hrCookie).send({ serial_no: "TAKEN001" });
    expect(res.status).toBe(409);
  });
});

// ── Assign & Return ──────────────────────────────────────────────────────

describe("Assets: Assign & Return", () => {
  let app, db, hrCookie, empCookie, typeId, empId;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    await insertEmployee(db, { email: "hr@ar.com", code: "HRAR1", role: "HR" });
    const emp = await insertEmployee(db, { email: "emp@ar.com", code: "EAR1", role: "EMPLOYEE" });
    empId = emp.id;
    hrCookie = await loginAs(app, "hr@ar.com");
    empCookie = await loginAs(app, "emp@ar.com");
    typeId = seedAssetType(db, "Laptop").id;
  });

  test("HR can assign an available asset", async () => {
    const asset = seedAsset(db, typeId);
    const res = await supertest(app).post(`/api/assets/${asset.id}/assign`)
      .set("Cookie", hrCookie)
      .send({ employee_id: empId, is_temporary: false });
    expect(res.status).toBe(201);
    expect(res.body.asset_id).toBe(asset.id);
    expect(res.body.employee_id).toBe(empId);
  });

  test("cannot assign a non-AVAILABLE asset (400)", async () => {
    const asset = seedAsset(db, typeId, { status: "IN_REPAIR" });
    const res = await supertest(app).post(`/api/assets/${asset.id}/assign`)
      .set("Cookie", hrCookie)
      .send({ employee_id: empId });
    expect(res.status).toBe(400);
  });

  test("assign to inactive employee returns 400", async () => {
    const asset = seedAsset(db, typeId);
    const exited = await insertEmployee(db, { email: "exited@ar.com", code: "EX1", status: "EXITED" });
    const res = await supertest(app).post(`/api/assets/${asset.id}/assign`)
      .set("Cookie", hrCookie)
      .send({ employee_id: exited.id });
    expect(res.status).toBe(400);
  });

  test("HR can return an assigned asset", async () => {
    const asset = seedAsset(db, typeId);
    // Assign first
    await supertest(app).post(`/api/assets/${asset.id}/assign`)
      .set("Cookie", hrCookie).send({ employee_id: empId });
    // Return
    const res = await supertest(app).post(`/api/assets/${asset.id}/return`)
      .set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    // Verify status
    const updated = db.prepare("SELECT status FROM assets WHERE id = ?").get(asset.id);
    expect(updated.status).toBe("AVAILABLE");
  });

  test("return non-ASSIGNED asset returns 400", async () => {
    const asset = seedAsset(db, typeId);
    const res = await supertest(app).post(`/api/assets/${asset.id}/return`)
      .set("Cookie", hrCookie);
    expect(res.status).toBe(400);
  });

  test("employee can view own assignments", async () => {
    const res = await supertest(app).get(`/api/assets/employee/${empId}`)
      .set("Cookie", empCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test("employee cannot view others' assignments (403)", async () => {
    const other = await insertEmployee(db, { email: "other@ar.com", code: "OAR1" });
    const res = await supertest(app).get(`/api/assets/employee/${other.id}`)
      .set("Cookie", empCookie);
    expect(res.status).toBe(403);
  });

  test("HR can view any employee's assignments", async () => {
    const res = await supertest(app).get(`/api/assets/employee/${empId}`)
      .set("Cookie", hrCookie);
    expect(res.status).toBe(200);
  });
});

// ── Dashboard ────────────────────────────────────────────────────────────

describe("Assets: Dashboard", () => {
  let app, db, hrCookie, empCookie;

  beforeAll(async () => {
    ({ app, db } = buildApp());
    await insertEmployee(db, { email: "hr@ad.com", code: "HRAD1", role: "HR" });
    await insertEmployee(db, { email: "emp@ad.com", code: "EAD1", role: "EMPLOYEE" });
    hrCookie = await loginAs(app, "hr@ad.com");
    empCookie = await loginAs(app, "emp@ad.com");
  });

  test("HR can access asset dashboard", async () => {
    const res = await supertest(app).get("/api/assets/dashboard").set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("totalAssets");
    expect(res.body).toHaveProperty("byStatus");
    expect(res.body).toHaveProperty("recentAssignments");
    expect(res.body).toHaveProperty("unreturnedByExited");
  });

  test("employee cannot access asset dashboard (403)", async () => {
    const res = await supertest(app).get("/api/assets/dashboard").set("Cookie", empCookie);
    expect(res.status).toBe(403);
  });
});

// ── Auth guards ──────────────────────────────────────────────────────────

describe("Assets: Auth guards", () => {
  let app;
  beforeAll(() => { ({ app } = buildApp()); });

  test("unauthenticated requests are rejected", async () => {
    const endpoints = [
      ["GET", "/api/assets"],
      ["POST", "/api/assets"],
      ["GET", "/api/assets/asset-types"],
      ["GET", "/api/assets/vendors"],
      ["GET", "/api/assets/dashboard"],
    ];
    for (const [method, path] of endpoints) {
      const res = await supertest(app)[method.toLowerCase()](path);
      expect(res.status).toBe(401);
    }
  });
});
