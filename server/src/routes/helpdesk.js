import { Router } from "express";
import { requireAuth, requireHR } from "../middleware/auth.js";
import {
  TicketCategoryCreateSchema, TicketCreateSchema,
  TicketPatchSchema, TicketCommentSchema,
} from "@hrms/shared/schemas";
import { broadcast } from "../utils/sse.js";
import { audit } from "../utils/audit.js";
import { indexEntity } from "../utils/search.js";
import { notify } from "../utils/notify.js";

const router = Router();

// ── Ticket Categories ────────────────────────────────────────────────────

router.get("/ticket-categories", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const rows = db.prepare(
    `SELECT tc.*, e.name as assigned_to_name
     FROM ticket_categories tc
     LEFT JOIN employees e ON tc.assigned_to = e.id
     ORDER BY tc.name`
  ).all();
  res.json(rows);
});

router.post("/ticket-categories", ...requireHR, (req, res) => {
  const parsed = TicketCategoryCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const db = req.app.locals.db;
  const d = parsed.data;
  const existing = db.prepare("SELECT id FROM ticket_categories WHERE name = ?").get(d.name);
  if (existing) return res.status(409).json({ error: "Category already exists" });
  const result = db.prepare(
    "INSERT INTO ticket_categories(name, assigned_to) VALUES(?,?)"
  ).run(d.name, d.assigned_to ?? null);
  const id = Number(result.lastInsertRowid);
  audit(db, { actorId: req.user.id, action: "CREATE", entity: "ticket_category", entityId: id, detail: d });
  res.status(201).json({ id, ...d, active: 1 });
});

// ── Tickets ──────────────────────────────────────────────────────────────

router.get("/tickets", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const isHR = ["HR", "ADMIN"].includes(req.user.role);
  const { status, category_id } = req.query;

  let sql = `SELECT t.*, tc.name as category_name, e.name as employee_name,
                    ae.name as assigned_to_name
             FROM tickets t
             JOIN ticket_categories tc ON t.category_id = tc.id
             JOIN employees e ON t.employee_id = e.id
             LEFT JOIN employees ae ON t.assigned_to = ae.id`;

  const conditions = [];
  const params = [];

  if (!isHR) {
    conditions.push("(t.employee_id = ? OR t.assigned_to = ?)");
    params.push(req.user.id, req.user.id);
  }
  if (status) {
    const statuses = Array.isArray(status) ? status : [status];
    conditions.push(`t.status IN (${statuses.map(() => "?").join(",")})`);
    params.push(...statuses);
  }
  if (category_id) { conditions.push("t.category_id = ?"); params.push(parseInt(category_id, 10)); }

  if (conditions.length) sql += " WHERE " + conditions.join(" AND ");
  sql += ` ORDER BY
    CASE t.priority WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
    t.created_at DESC`;
  res.json(db.prepare(sql).all(...params));
});

router.post("/tickets", requireAuth, (req, res) => {
  const parsed = TicketCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const db = req.app.locals.db;
  const d = parsed.data;

  const category = db.prepare("SELECT * FROM ticket_categories WHERE id = ? AND active = 1").get(d.category_id);
  if (!category) return res.status(400).json({ error: "Category not found or inactive" });

  const assignedTo = category.assigned_to ?? null;

  const result = db.prepare(
    "INSERT INTO tickets(employee_id, category_id, subject, description, priority, assigned_to) VALUES(?,?,?,?,?,?)"
  ).run(req.user.id, d.category_id, d.subject, d.description, d.priority, assignedTo);
  const id = Number(result.lastInsertRowid);
  audit(db, { actorId: req.user.id, action: "CREATE", entity: "ticket", entityId: id, detail: { ...d, assigned_to: assignedTo } });
  broadcast({ type: "mutation", entity: "tickets" });
  indexEntity(db, "ticket", id, d.subject, d.description,
    { category: category.name, status: "OPEN", priority: d.priority, employee_id: req.user.id, assigned_to: assignedTo });

  // Notify the assigned agent that a new ticket has been raised
  if (assignedTo && assignedTo !== req.user.id) {
    notify(db, {
      userId: assignedTo, type: "ticket_assigned", title: "New ticket assigned",
      body: `New ${d.priority} ticket: "${d.subject}"`,
      link: "/hr/helpdesk", entity: "ticket", entityId: id,
    });
  }

  res.status(201).json({ id, employee_id: req.user.id, ...d, status: "OPEN", assigned_to: assignedTo });
});

router.patch("/tickets/:id", requireAuth, (req, res) => {
  const parsed = TicketPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const db = req.app.locals.db;
  const ticketId = parseInt(req.params.id, 10);
  const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId);
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });

  const isHR = ["HR", "ADMIN"].includes(req.user.role);
  const isAssigned = ticket.assigned_to === req.user.id;
  if (!isHR && !isAssigned) return res.status(403).json({ error: "Forbidden" });

  const fields = parsed.data;
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) { sets.push(`${k} = ?`); vals.push(v); }
  }

  if (fields.status === "RESOLVED" || fields.status === "CLOSED") {
    sets.push("resolved_at = datetime('now')");
  }

  if (sets.length === 0) return res.json(ticket);
  vals.push(ticketId);
  db.prepare(`UPDATE tickets SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  audit(db, { actorId: req.user.id, action: "UPDATE", entity: "ticket", entityId: ticketId, detail: fields });
  broadcast({ type: "mutation", entity: "tickets" });
  const updated = db.prepare(
    "SELECT t.*, tc.name as category_name FROM tickets t JOIN ticket_categories tc ON t.category_id=tc.id WHERE t.id=?"
  ).get(ticketId);
  if (updated) {
    indexEntity(db, "ticket", ticketId, updated.subject, updated.description,
      { category: updated.category_name, status: updated.status, priority: updated.priority, employee_id: updated.employee_id, assigned_to: updated.assigned_to });
  }
  res.json({ ...ticket, ...fields });
});

// ── Ticket Comments ──────────────────────────────────────────────────────

router.get("/tickets/:id/comments", requireAuth, (req, res) => {
  const db = req.app.locals.db;
  const ticketId = parseInt(req.params.id, 10);
  const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId);
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });

  const isHR = ["HR", "ADMIN"].includes(req.user.role);
  const isCreator = ticket.employee_id === req.user.id;
  const isAssigned = ticket.assigned_to === req.user.id;
  if (!isHR && !isCreator && !isAssigned) return res.status(403).json({ error: "Forbidden" });

  const rows = db.prepare(
    `SELECT tc.*, e.name as author_name
     FROM ticket_comments tc
     JOIN employees e ON tc.author_id = e.id
     WHERE tc.ticket_id = ?
     ORDER BY tc.created_at ASC`
  ).all(ticketId);
  res.json(rows);
});

router.post("/tickets/:id/comments", requireAuth, (req, res) => {
  const parsed = TicketCommentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const db = req.app.locals.db;
  const ticketId = parseInt(req.params.id, 10);
  const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId);
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });

  const isHR = ["HR", "ADMIN"].includes(req.user.role);
  const isCreator = ticket.employee_id === req.user.id;
  const isAssigned = ticket.assigned_to === req.user.id;
  if (!isHR && !isCreator && !isAssigned) return res.status(403).json({ error: "Forbidden" });

  const result = db.prepare(
    "INSERT INTO ticket_comments(ticket_id, author_id, body) VALUES(?,?,?)"
  ).run(ticketId, req.user.id, parsed.data.body);
  const id = Number(result.lastInsertRowid);
  audit(db, { actorId: req.user.id, action: "CREATE", entity: "ticket_comment", entityId: id, detail: { ticket_id: ticketId } });
  broadcast({ type: "mutation", entity: "tickets" });

  const commentAuthor = db.prepare("SELECT name FROM employees WHERE id = ?").get(req.user.id);
  const notifBody = `${commentAuthor?.name || "Someone"} replied on "${ticket.subject}"`;
  // Ticket creator sees the ticket in My Tickets; assigned agent sees it in HR Helpdesk
  if (ticket.employee_id !== req.user.id) {
    notify(db, {
      userId: ticket.employee_id, type: "helpdesk_reply", title: "New reply on ticket",
      body: notifBody, link: "/my/tickets", entity: "ticket", entityId: ticketId,
    });
  }
  if (ticket.assigned_to && ticket.assigned_to !== req.user.id && ticket.assigned_to !== ticket.employee_id) {
    notify(db, {
      userId: ticket.assigned_to, type: "helpdesk_reply", title: "New reply on ticket",
      body: notifBody, link: "/hr/helpdesk", entity: "ticket", entityId: ticketId,
    });
  }

  res.status(201).json({ id, ticket_id: ticketId, author_id: req.user.id, body: parsed.data.body });
});

// ── Dashboard ────────────────────────────────────────────────────────────

router.get("/dashboard", ...requireHR, (req, res) => {
  const db = req.app.locals.db;

  const openByCategory = db.prepare(
    `SELECT tc.name as category, COUNT(*) as count
     FROM tickets t
     JOIN ticket_categories tc ON t.category_id = tc.id
     WHERE t.status IN ('OPEN','IN_PROGRESS')
     GROUP BY tc.name
     ORDER BY count DESC`
  ).all();

  const avgResolutionTime = db.prepare(
    `SELECT ROUND(AVG(
       (julianday(resolved_at) - julianday(created_at)) * 24
     ), 1) as avg_hours
     FROM tickets
     WHERE resolved_at IS NOT NULL`
  ).get().avg_hours || 0;

  const agentLoad = db.prepare(
    `SELECT e.name, COUNT(*) as open_tickets
     FROM tickets t
     JOIN employees e ON t.assigned_to = e.id
     WHERE t.status IN ('OPEN','IN_PROGRESS')
     GROUP BY t.assigned_to
     ORDER BY open_tickets DESC`
  ).all();

  const totalOpen = db.prepare("SELECT COUNT(*) as c FROM tickets WHERE status IN ('OPEN','IN_PROGRESS')").get().c;
  const totalResolved = db.prepare("SELECT COUNT(*) as c FROM tickets WHERE status IN ('RESOLVED','CLOSED')").get().c;

  res.json({ totalOpen, totalResolved, openByCategory, avgResolutionTime, agentLoad });
});

export default router;
