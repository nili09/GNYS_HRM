import { Router } from "express";
import multer from "multer";
import { join, extname } from "path";
import { mkdirSync, existsSync, createReadStream } from "fs";
import { randomUUID } from "crypto";
import { requireAuth } from "../middleware/auth.js";
import { broadcast } from "../utils/sse.js";
import { audit } from "../utils/audit.js";

const UPLOAD_DIR = process.env.UPLOAD_DIR || join(process.cwd(), "data", "uploads");
if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
]);
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase();
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) cb(null, true);
    else cb(new Error(`File type ${file.mimetype} not allowed`));
  },
});

const router = Router();

// POST /api/attachments — upload a file
// Body (multipart): file, owner_type, owner_id
router.post("/", requireAuth, (req, res) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") return res.status(400).json({ error: "File too large (max 5MB)" });
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const { owner_type, owner_id } = req.body;
    if (!owner_type || !owner_id) return res.status(400).json({ error: "owner_type and owner_id required" });

    const validTypes = ["expense", "ticket", "doc_checklist", "profile_photo", "announcement"];
    if (!validTypes.includes(owner_type)) return res.status(400).json({ error: "Invalid owner_type" });

    const db = req.app.locals.db;

    // RBAC check: can the user upload to this owner?
    if (!canUpload(db, req.user, owner_type, owner_id)) {
      return res.status(403).json({ error: "Not authorized to upload here" });
    }

    // For profile_photo: delete old attachment if exists
    if (owner_type === "profile_photo") {
      const old = db.prepare("SELECT id FROM attachments WHERE owner_type = 'profile_photo' AND owner_id = ?").get(owner_id);
      if (old) db.prepare("DELETE FROM attachments WHERE id = ?").run(old.id);
    }

    const result = db.prepare(
      `INSERT INTO attachments(owner_type, owner_id, filename, mime, size, path, uploaded_by)
       VALUES(?,?,?,?,?,?,?)`
    ).run(owner_type, owner_id, req.file.originalname, req.file.mimetype, req.file.size, req.file.filename, req.user.id);
    const id = Number(result.lastInsertRowid);

    if (owner_type === "profile_photo") {
      db.prepare("UPDATE employees SET profile_photo_id = ? WHERE id = ?").run(id, parseInt(owner_id, 10));
    }

    audit(db, { actorId: req.user.id, action: "CREATE", entity: "attachment", entityId: id, detail: { owner_type, owner_id, filename: req.file.originalname } });
    broadcast({ type: "mutation", entity: "attachments" });

    res.status(201).json({ id, filename: req.file.originalname, mime: req.file.mimetype, size: req.file.size });
  });
});

// GET /api/attachments/:id/download — download with RBAC
router.get("/:id/download", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const att = db.prepare("SELECT * FROM attachments WHERE id = ?").get(parseInt(req.params.id, 10));
  if (!att) return res.status(404).json({ error: "Attachment not found" });

  if (!canDownload(db, req.user, att)) {
    return res.status(403).json({ error: "Not authorized" });
  }

  const filePath = join(UPLOAD_DIR, att.path);
  res.setHeader("Content-Disposition", `attachment; filename="${att.filename}"`);
  res.setHeader("Content-Type", att.mime);
  createReadStream(filePath).pipe(res);
});

// GET /api/attachments?owner_type=X&owner_id=Y — list attachments for an entity
router.get("/", requireAuth, (req, res) => {
  const { owner_type, owner_id } = req.query;
  if (!owner_type || !owner_id) return res.status(400).json({ error: "owner_type and owner_id required" });
  const db = req.app.locals.db;

  if (!canDownload(db, req.user, { owner_type, owner_id })) {
    return res.status(403).json({ error: "Not authorized" });
  }

  const rows = db.prepare(
    "SELECT id, filename, mime, size, created_at FROM attachments WHERE owner_type = ? AND owner_id = ? ORDER BY created_at DESC"
  ).all(owner_type, owner_id);
  res.json(rows);
});

// GET /api/attachments/:id/thumb — serve image inline (for profile photos)
router.get("/:id/thumb", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const att = db.prepare("SELECT * FROM attachments WHERE id = ?").get(parseInt(req.params.id, 10));
  if (!att) return res.status(404).json({ error: "Not found" });
  if (!att.mime.startsWith("image/")) return res.status(400).json({ error: "Not an image" });

  if (att.owner_type !== "profile_photo" && att.owner_type !== "announcement" && !canDownload(db, req.user, att)) {
    return res.status(403).json({ error: "Not authorized" });
  }

  const filePath = join(UPLOAD_DIR, att.path);
  res.setHeader("Content-Type", att.mime);
  res.setHeader("Cache-Control", "public, max-age=3600");
  createReadStream(filePath).pipe(res);
});

function canUpload(db, user, ownerType, ownerId) {
  const isHR = user.role === "HR" || user.role === "ADMIN";
  switch (ownerType) {
    case "expense": {
      const exp = db.prepare("SELECT employee_id FROM expenses WHERE id = ?").get(parseInt(ownerId, 10));
      return exp && (exp.employee_id === user.id || isHR);
    }
    case "ticket": {
      const t = db.prepare("SELECT employee_id, assigned_to FROM tickets WHERE id = ?").get(parseInt(ownerId, 10));
      return t && (t.employee_id === user.id || t.assigned_to === user.id || isHR);
    }
    case "doc_checklist": {
      // owner_id format: "empId:key"
      const empId = parseInt(ownerId.split(":")[0], 10);
      return empId === user.id || isHR;
    }
    case "profile_photo": {
      const empId = parseInt(ownerId, 10);
      return empId === user.id || isHR;
    }
    case "announcement":
      return isHR;
    default:
      return false;
  }
}

function canDownload(db, user, att) {
  const isHR = user.role === "HR" || user.role === "ADMIN";
  if (isHR) return true;
  switch (att.owner_type) {
    case "expense": {
      const exp = db.prepare("SELECT employee_id FROM expenses WHERE id = ?").get(parseInt(att.owner_id, 10));
      return exp && exp.employee_id === user.id;
    }
    case "ticket": {
      const t = db.prepare("SELECT employee_id, assigned_to FROM tickets WHERE id = ?").get(parseInt(att.owner_id, 10));
      return t && (t.employee_id === user.id || t.assigned_to === user.id);
    }
    case "doc_checklist": {
      const empId = parseInt(att.owner_id.split(":")[0], 10);
      return empId === user.id;
    }
    case "profile_photo":
    case "announcement":
      return true;
    default:
      return false;
  }
}

// Export for test helper mounting
export { UPLOAD_DIR };
export default router;
