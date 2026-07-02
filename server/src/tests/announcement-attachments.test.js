import { describe, test, expect, beforeAll } from "vitest";
import supertest from "supertest";
import { buildApp, insertEmployee, loginAs } from "./helpers.js";

let app, db, hrCookie, empCookie, hrId, empId;

beforeAll(async () => {
  ({ app, db } = buildApp());
  const hr = await insertEmployee(db, { role: "HR", email: "hr_ann@igenesys.com" });
  hrId = hr.id;
  hrCookie = await loginAs(app, hr.email);
  const emp = await insertEmployee(db, { role: "EMPLOYEE", email: "emp_ann@igenesys.com" });
  empId = emp.id;
  empCookie = await loginAs(app, emp.email);
});

function seedAnnouncement(overrides = {}) {
  const title = overrides.title || `Ann-${Date.now()}`;
  const r = db.prepare(
    "INSERT INTO announcements(title, body, priority, published_by, expires_at, active) VALUES(?,?,?,?,?,?)"
  ).run(title, overrides.body ?? "Body", overrides.priority ?? "NORMAL", hrId, overrides.expires_at ?? null, overrides.active ?? 1);
  return { id: Number(r.lastInsertRowid), title };
}

function seedAttachment(announcementId) {
  const r = db.prepare(
    "INSERT INTO attachments(owner_type, owner_id, filename, mime, size, path, uploaded_by) VALUES(?,?,?,?,?,?,?)"
  ).run("announcement", String(announcementId), "test.png", "image/png", 1024, "fake-uuid.png", hrId);
  return Number(r.lastInsertRowid);
}

describe("Announcement attachments", () => {
  test("HR can upload to owner_type=announcement", async () => {
    const ann = seedAnnouncement();
    const res = await supertest(app)
      .post("/api/attachments")
      .set("Cookie", hrCookie)
      .field("owner_type", "announcement")
      .field("owner_id", String(ann.id))
      .attach("file", Buffer.from("fake-image"), { filename: "photo.png", contentType: "image/png" });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeGreaterThan(0);
  });

  test("EMPLOYEE cannot upload to owner_type=announcement (403)", async () => {
    const ann = seedAnnouncement();
    const res = await supertest(app)
      .post("/api/attachments")
      .set("Cookie", empCookie)
      .field("owner_type", "announcement")
      .field("owner_id", String(ann.id))
      .attach("file", Buffer.from("fake-image"), { filename: "photo.png", contentType: "image/png" });
    expect(res.status).toBe(403);
  });

  test("EMPLOYEE can download announcement attachment", async () => {
    const ann = seedAnnouncement();
    const attId = seedAttachment(ann.id);
    const res = await supertest(app)
      .get(`/api/attachments?owner_type=announcement&owner_id=${ann.id}`)
      .set("Cookie", empCookie);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].id).toBe(attId);
  });

  test("announcement GET includes attachments array", async () => {
    const ann = seedAnnouncement({ title: "With-Attachment" });
    seedAttachment(ann.id);
    const res = await supertest(app)
      .get("/api/engagement/announcements")
      .set("Cookie", empCookie);
    expect(res.status).toBe(200);
    const found = res.body.find(a => a.id === ann.id);
    expect(found).toBeDefined();
    expect(found.attachments).toBeInstanceOf(Array);
    expect(found.attachments.length).toBe(1);
    expect(found.attachments[0]).toHaveProperty("id");
    expect(found.attachments[0]).toHaveProperty("filename");
    expect(found.attachments[0]).toHaveProperty("mime");
  });

  test("announcement without attachments has empty array", async () => {
    const ann = seedAnnouncement({ title: "No-Attachment" });
    const res = await supertest(app)
      .get("/api/engagement/announcements")
      .set("Cookie", empCookie);
    const found = res.body.find(a => a.id === ann.id);
    expect(found.attachments).toEqual([]);
  });

  test("GET /dashboard/me includes announcementsFeed with attachments", async () => {
    const ann = seedAnnouncement({ title: "Dashboard-Feed-Ann" });
    seedAttachment(ann.id);
    const res = await supertest(app)
      .get("/api/dashboard/me")
      .set("Cookie", empCookie);
    expect(res.status).toBe(200);
    expect(res.body.announcementsFeed).toBeInstanceOf(Array);
    const found = res.body.announcementsFeed.find(a => a.id === ann.id);
    expect(found).toBeDefined();
    expect(found.attachments.length).toBe(1);
    expect(found.published_by_name).toBeTruthy();
  });

  test("GET /dashboard/hr includes announcementsFeed", async () => {
    const res = await supertest(app)
      .get("/api/dashboard/hr")
      .set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    expect(res.body.announcementsFeed).toBeInstanceOf(Array);
  });

  test("GET /dashboard/manager includes announcementsFeed", async () => {
    const res = await supertest(app)
      .get("/api/dashboard/manager")
      .set("Cookie", hrCookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("announcementsFeed");
  });

  test("expired announcements excluded from feed", async () => {
    const ann = seedAnnouncement({ title: "Expired-Ann", expires_at: "2020-01-01" });
    const res = await supertest(app)
      .get("/api/dashboard/me")
      .set("Cookie", empCookie);
    const found = res.body.announcementsFeed.find(a => a.id === ann.id);
    expect(found).toBeUndefined();
  });

  test("inactive announcements excluded from feed", async () => {
    const ann = seedAnnouncement({ title: "Inactive-Ann", active: 0 });
    const res = await supertest(app)
      .get("/api/dashboard/me")
      .set("Cookie", empCookie);
    const found = res.body.announcementsFeed.find(a => a.id === ann.id);
    expect(found).toBeUndefined();
  });
});
