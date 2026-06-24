export function indexEntity(db, entity, id, title, body, meta) {
  const entityId = String(id);
  db.prepare(
    "DELETE FROM search_index WHERE entity = ? AND entity_id = ?"
  ).run(entity, entityId);
  db.prepare(
    "INSERT INTO search_index(entity, entity_id, title, body, meta) VALUES(?,?,?,?,?)"
  ).run(entity, entityId, title || "", body || "", JSON.stringify(meta || {}));
}

export function removeEntity(db, entity, id) {
  db.prepare(
    "DELETE FROM search_index WHERE entity = ? AND entity_id = ?"
  ).run(entity, String(id));
}

export function search(db, query, { entity, limit = 20, userId, userRole } = {}) {
  if (!query || !query.trim()) return [];

  const terms = query.trim().replace(/[^\w\s@.-]/g, "").trim();
  if (!terms) return [];

  const ftsQuery = terms.split(/\s+/).map(t => `"${t}"*`).join(" ");

  let sql = `SELECT entity, entity_id, title, body, meta,
                    snippet(search_index, 3, '<mark>', '</mark>', '…', 32) as snippet
             FROM search_index
             WHERE search_index MATCH ?`;
  const params = [ftsQuery];

  if (entity) {
    sql += " AND entity = ?";
    params.push(entity);
  }

  sql += " ORDER BY rank LIMIT ?";
  params.push(limit);

  let results;
  try {
    results = db.prepare(sql).all(...params);
  } catch {
    return [];
  }

  return applyRBAC(db, results, userId, userRole);
}

function applyRBAC(db, results, userId, userRole) {
  const isHR = ["HR", "ADMIN"].includes(userRole);
  if (isHR) return results.map(formatResult);

  const directReportIds = new Set(
    db.prepare("SELECT id FROM employees WHERE manager_id = ?").all(userId).map(r => r.id)
  );

  return results.filter(r => {
    const eid = Number(r.entity_id);
    switch (r.entity) {
      case "employee":
        return eid === userId || directReportIds.has(eid);
      case "ticket": {
        const meta = safeParse(r.meta);
        return meta.employee_id === userId || meta.assigned_to === userId;
      }
      case "expense": {
        const meta = safeParse(r.meta);
        return meta.employee_id === userId;
      }
      case "asset": {
        const meta = safeParse(r.meta);
        return meta.assigned_to === userId;
      }
      case "announcement":
        return true;
      case "job":
        return false;
      default:
        return false;
    }
  }).map(formatResult);
}

function formatResult(r) {
  return {
    entity: r.entity,
    entity_id: Number(r.entity_id),
    title: r.title,
    snippet: r.snippet || r.body?.slice(0, 120) || "",
    meta: safeParse(r.meta),
  };
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
}

export function reindexAll(db) {
  db.prepare("DELETE FROM search_index").run();

  const employees = db.prepare(
    `SELECT e.id, e.name, e.code, e.email, e.status, e.role,
            d.name as dept_name, des.name as desig_name
     FROM employees e
     LEFT JOIN departments d ON e.dept_id = d.id
     LEFT JOIN designations des ON e.desig_id = des.id`
  ).all();
  for (const e of employees) {
    indexEntity(db, "employee", e.id, e.name,
      [e.code, e.email, e.dept_name, e.desig_name].filter(Boolean).join(" "),
      { dept: e.dept_name, status: e.status, role: e.role });
  }

  const hasJobOpenings = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='job_openings'"
  ).get();
  if (hasJobOpenings) {
    const jobs = db.prepare(
      `SELECT j.id, j.title, j.description, j.requirements, j.status,
              d.name as dept_name
       FROM job_openings j
       LEFT JOIN departments d ON j.dept_id = d.id`
    ).all();
    for (const j of jobs) {
      indexEntity(db, "job", j.id, j.title,
        [j.description, j.requirements].filter(Boolean).join(" "),
        { dept: j.dept_name, status: j.status });
    }
  }

  const hasTickets = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='tickets'"
  ).get();
  if (hasTickets) {
    const tickets = db.prepare(
      `SELECT t.id, t.subject, t.description, t.status, t.priority,
              t.employee_id, t.assigned_to, tc.name as category_name
       FROM tickets t
       JOIN ticket_categories tc ON t.category_id = tc.id`
    ).all();
    for (const t of tickets) {
      indexEntity(db, "ticket", t.id, t.subject, t.description,
        { category: t.category_name, status: t.status, priority: t.priority,
          employee_id: t.employee_id, assigned_to: t.assigned_to });
    }
  }

  const hasAssets = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='assets'"
  ).get();
  if (hasAssets) {
    const assets = db.prepare(
      `SELECT a.id, a.name, a.serial_no, a.status, a.notes,
              at.name as type_name
       FROM assets a
       JOIN asset_types at ON a.asset_type_id = at.id`
    ).all();
    for (const a of assets) {
      const assignedTo = db.prepare(
        "SELECT employee_id FROM asset_assignments WHERE asset_id = ? AND returned_at IS NULL LIMIT 1"
      ).get(a.id);
      indexEntity(db, "asset", a.id, a.name,
        [a.serial_no, a.type_name, a.notes].filter(Boolean).join(" "),
        { status: a.status, type: a.type_name, assigned_to: assignedTo?.employee_id || null });
    }
  }

  const hasAnnouncements = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='announcements'"
  ).get();
  if (hasAnnouncements) {
    const announcements = db.prepare(
      "SELECT id, title, body, priority FROM announcements WHERE active = 1"
    ).all();
    for (const a of announcements) {
      indexEntity(db, "announcement", a.id, a.title, a.body,
        { priority: a.priority });
    }
  }

  const hasExpenses = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='expenses'"
  ).get();
  if (hasExpenses) {
    const expenses = db.prepare(
      `SELECT e.id, e.amount, e.description, e.status, e.employee_id,
              ec.name as category_name
       FROM expenses e
       JOIN expense_categories ec ON e.category_id = ec.id`
    ).all();
    for (const e of expenses) {
      indexEntity(db, "expense", e.id,
        `${e.category_name} — ${e.amount}`,
        e.description || "",
        { status: e.status, employee_id: e.employee_id });
    }
  }

  return { ok: true };
}
