# Genesys HRMS

Internal multi-user HR Management System for Genesys International Corporation Ltd. Replaces the v1 single-file app with a full-stack web application.

## Architecture

Monorepo with three workspaces:

- **`/server`** — Node 22 + Express + better-sqlite3. REST API + SSE for real-time updates.
- **`/web`** — React 18 + Vite + Tailwind. Single-page app with role-based views.
- **`/shared`** — Pure functions + zod schemas shared between client and server.

**Database:** SQLite (single file `data/hrms.db`, WAL mode). Handles up to 5,000 employees.

**Auth:** Email + password (bcrypt cost 12), httpOnly JWT cookie (12h sliding expiry). RBAC roles: EMPLOYEE, HR, ADMIN. Manager is derived from `manager_id`.

**Real-time:** SSE at `/api/events` with 30s polling fallback on disconnect.

## Modules

- **Core HR** — Employees, departments, designations, locations, CSV import/export, HROne field parity (32 columns).
- **Attendance** — Daily/monthly views, bulk mark, multi-code (P, HD, WFH, OD, L, A), weekoff/holiday engine.
- **Leave** — Apply/approve/reject, balances, 6 leave types, carry-forward, adjustments.
- **Payroll** — India/Maharashtra: PF, ESI, PT, TDS new regime. Draft/finalize/payslip.
- **Expense Management** — Submit/approve/settle, policies, categories, manager + HR workflows.
- **Recruitment** — Job openings, candidates, applications pipeline, interviews, offer letters.
- **Performance** — Review cycles, goals (self/manager rating), 360 reviews, 1-on-1s.
- **Engagement** — Announcements, surveys (with questions + responses), badges, recognition wall.
- **Asset Management** — Asset types, vendors, inventory, assign/return, employee asset view.
- **Helpdesk** — Ticket categories, ticket lifecycle (open → in_progress → resolved → closed), comments, auto-assignment.
- **Smart Search** — FTS5 full-text search across all modules, RBAC-filtered, Ctrl+K search bar.
- **Dashboards** — HR (headcount, attendance, payroll, recruitment, expenses, performance, engagement, assets, helpdesk KPIs), Manager (team overview, pending approvals, expense claims, team goals), Employee (leave, attendance, pay, expenses, tickets, assets, interviews, surveys, recognitions).
- **Admin** — Settings (weekoffs, Saturday policy, statutory), audit log, search reindex.

## Quick Start (Development)

```bash
cd hrms
npm install

# Configure
cp server/.env.example server/.env
# Edit server/.env — set JWT_SECRET to a strong random string

# Seed database (creates admin user, leave types, departments)
npm run seed

# Run tests
npm test

# Start dev servers (API :8321 + Vite :5173)
npm run dev
```

## Production Deployment

### Option A: Docker

```bash
# Create .env at project root with at minimum:
echo "JWT_SECRET=$(openssl rand -hex 32)" > .env
echo "ADMIN_EMAIL=admin@yourcompany.com" >> .env
echo "ADMIN_PASSWORD=YourSecurePassword123" >> .env

docker compose up -d

# Seed the database (first run only)
docker compose exec hrms node server/src/db/seed.js

# Access at http://localhost:8321
```

### Option B: Plain VM (Windows or Linux)

**Prerequisites:** Node.js 22+, npm, sqlite3 (for backups).

```bash
cd hrms
npm install
npm run build                    # Build web app
cp server/.env.example server/.env
# Edit server/.env — set JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, NODE_ENV=production, TRUST_PROXY=1

npm run seed                     # First run only
node server/src/index.js         # Or: npm start --workspace=server
```

For Windows, run as a service using `nssm` or `pm2`:
```powershell
npm install -g pm2
pm2 start server/src/index.js --name genesys-hrms
pm2 save
pm2 startup
```

**Reverse proxy (nginx):**
```nginx
server {
    listen 443 ssl;
    server_name hrms.yourcompany.com;

    location / {
        proxy_pass http://127.0.0.1:8321;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection '';
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;  # SSE needs long timeout
    }
}
```

Set `TRUST_PROXY=1` in `.env` when behind a reverse proxy.

## Backup & Restore

### Backup (online, no downtime)

```bash
# Manual
./scripts/backup.sh

# With custom paths
./scripts/backup.sh ./data/hrms.db ./backups

# Docker
docker compose exec hrms ./scripts/backup.sh /app/data/hrms.db /app/backups
```

The script uses SQLite's online backup (no locking), timestamps the file, and keeps the latest 30 backups. Schedule via cron for nightly backups:

```cron
0 2 * * * cd /path/to/hrms && ./scripts/backup.sh >> /var/log/hrms-backup.log 2>&1
```

### Restore

```bash
# Stop the server
# Copy backup over the database file
cp backups/hrms-2026-06-13_020000.db data/hrms.db
# Start the server
```

## v1 Data Migration

Import data from the v1 single-file app's JSON export:

```bash
npm run import:v1 -- path/to/genesys-hrms-data.json
```

This maps employees, salary structures, leaves, attendance, holidays, adjustments, and settings. Idempotent — safe to run multiple times.

## Admin Tasks

### Create a user

Users are created by HR/ADMIN through the Employees screen. The new user logs in with the generated initial password and is forced to change it.

### Reset a password

1. **Admin UI:** Settings → Users & Roles → click "Reset PW" next to the user.
2. **HR UI:** Employees → open the employee → Reset Password button.

Both set `must_change_pw` — the user must set a new password on next login.

### Change a user's role

Settings → Users & Roles → click "Role" next to the user → select EMPLOYEE / HR / ADMIN.

### Import employees via CSV

HR → Employees → Import CSV. The wizard auto-maps column headers and supports Indian date formats, ₹-formatted salaries, and PAN/IFSC normalization.

## Troubleshooting

**"JWT_SECRET is missing or set to the default value"**
Set a strong secret in `server/.env`. The server refuses to boot without it.

**Login fails with "Incorrect email or password"**
Check that the database was seeded (`npm run seed`) and that you're using the email/password from `.env`.

**SSE not working (no real-time updates)**
Verify the reverse proxy passes SSE correctly (`proxy_read_timeout 86400`, `Connection ''`). Check browser console for EventSource errors.

**SQLite "database is locked"**
Ensure only one server instance writes to the database. WAL mode handles concurrent reads.

**Docker "better-sqlite3" build fails**
The Dockerfile rebuilds the native addon for the container architecture. If it still fails, ensure `node-gyp` build tools are available (python3, make, g++).

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| JWT_SECRET | Yes | — | Session signing secret (refuse "changeme") |
| ADMIN_EMAIL | For seed | — | Initial admin email |
| ADMIN_PASSWORD | For seed | — | Initial admin password |
| ADMIN_NAME | No | HR Admin | Initial admin display name |
| PORT | No | 8321 | Server listen port |
| DB_PATH | No | ./data/hrms.db | SQLite database path |
| TRUST_PROXY | No | 0 | Set to "1" behind reverse proxy |
| NODE_ENV | No | development | "production" serves built web app |

## Testing

```bash
npm test                # Run all tests (vitest)
npm test -- --watch     # Watch mode
```

Tests use in-memory SQLite — no filesystem or network side effects.
