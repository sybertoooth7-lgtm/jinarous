# Alux Plaza — Backend

A Node/Express + **PostgreSQL** backend for the Alux Plaza landing page. It handles:

- **Contact form submissions** (`POST /api/contact`) — validated, rate-limited, stored in Postgres, with an optional email notification on each new submission
- **Admin login** (`POST /api/admin/login`) — email/password, returns a JWT
- **Admin dashboard** at `/admin` — a plain HTML/JS page (no build step) to view, filter, mark as read/archived, and delete submissions

Requires a PostgreSQL database (local, or a hosted one like Railway Postgres, Neon, or Supabase) — this backend does **not** use SQLite.

## 1. Install

```bash
cd backend
npm install
```

## 2. Configure

```bash
cp .env.example .env
```

Open `.env` and set:
- `DATABASE_URL` — a PostgreSQL connection string, e.g. `postgresql://user:password@host:5432/alux_plaza`. Required — the server refuses to start without it.
- `DB_SSL` — set to `true` for most hosted Postgres providers in production; `false` for local Postgres without SSL.
- `JWT_SECRET` — a long random string, 32+ characters (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`). Required — the server refuses to start without it.
- `CORS_ORIGIN` — the URL your frontend runs on (e.g. `http://localhost:3000` for dev, your real domain in production, comma-separated for multiple origins). Required in production, and must include the `https://`/`http://` scheme.
- `PORT` — defaults to `4000`.
- `RESEND_API_KEY`, `FROM_EMAIL`, `ADMIN_EMAIL` — optional. If all three are set, you get an email notification (via [Resend](https://resend.com)) every time someone submits the contact form. If any are missing, submissions still save to the database — you just won't be emailed about them.
- `CLUSTER_MODE` — set to `true` to run one worker process per CPU core (higher throughput). Each worker opens its own Postgres connection pool (up to 20 connections), so on a small/free-tier Postgres plan with a low connection limit, leave this `false` unless you've checked your plan's connection cap.

## 3. Create your admin account

```bash
npm run create-admin
```

This prompts for an email and password and stores a bcrypt-hashed password in the database. Run it again any time to reset a password. There are no default credentials — the admin dashboard won't let anyone in until you run this once.

## 4. Run

```bash
npm start        # production
npm run dev       # auto-restarts on file changes
```

On startup, the server automatically applies any pending database migrations (see below) before it starts accepting requests. The API is then live at `http://localhost:4000`, and the admin dashboard at `http://localhost:4000/admin`.

## 5. Connect the frontend

In the `frontend/` project:

- **Local dev**: the frontend is already configured to talk to the backend. Vite runs on `http://localhost:3000` and proxies `/api/*` to `http://localhost:4000`; you can also point `frontend/.env` at `http://localhost:4000` if you prefer direct calls. Just run the backend and `npm run dev` in `frontend/` side by side.
- **Production**: set `VITE_API_BASE_URL` in the frontend's `.env` (copy from `.env.example`) to your deployed backend's public URL, then rebuild the frontend. The build prints a loud warning if this is unset, but it won't block the build — check for it.

## API reference

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | — | Shallow health check — is the process up |
| GET | `/api/health/deep` | — | Deep health check — is the process up **and** can it reach the database. Point real uptime monitoring at this one. |
| GET | `/api/status/defense-matrix` | Bearer token | Real-time + cumulative server metrics powering the landing page's "Defense Matrix" section. Cumulative counters (request count, error count, honeypot catches, contact success rate) are read from Postgres so they reflect the whole cluster, not just one worker; latency/throughput are per-instance. |
| POST | `/api/contact` | — | Submit the contact form. Rate-limited per IP (`CONTACT_RATE_LIMIT_MAX` / `CONTACT_RATE_LIMIT_WINDOW_MINUTES`, default 5 per 15 min). |
| POST | `/api/admin/login` | — | Log in, returns `{ token, email }`. Separately rate-limited (10 attempts / 15 min) regardless of the general request limit. |
| GET | `/api/admin/me` | Bearer token | Confirm current session |
| GET | `/api/admin/submissions` | Bearer token | List submissions. Query params: `status`, `search`, `page`, `pageSize` |
| PATCH | `/api/admin/submissions/:id/status` | Bearer token | Body: `{ "status": "new" \| "read" \| "archived" }` |
| DELETE | `/api/admin/submissions/:id` | Bearer token | Permanently delete a submission |
| GET | `/api/admin/stats` | Bearer token | Totals by status + last 7 days |
| POST | `/api/admin/tools` | Bearer token | Runs a security tool from `tools/` against a target and stores the result |

All admin routes require `Authorization: Bearer <token>` from the login response.

## Database & migrations

All data — admin users, contact submissions, persisted metrics, and security-tool run history — lives in PostgreSQL, wherever `DATABASE_URL` points.

Schema changes live in `migrations/*.sql`, applied in filename order. On every server startup, `runMigrations()` checks a `_migrations` tracking table and applies anything not yet run, inside a transaction — so deploying is enough to bring the schema up to date, no manual step needed. To add a schema change, add a new numbered `.sql` file to `migrations/`; don't edit an already-applied one.

Because Postgres is a real, persistent database (unlike a SQLite file on ephemeral hosting), submissions and metrics survive restarts and redeploys as long as `DATABASE_URL` keeps pointing at the same database. Back up your Postgres instance the way you'd back up any production database — most hosted providers (Railway, Neon, Supabase) offer this built in.

## Deploying

This is a standard Node app, so it runs on any Node host: Railway, Render, Fly.io, a small VPS, etc.

1. Provision a PostgreSQL database (a Railway Postgres plugin, Neon, Supabase, or your own instance) and get its connection string.
2. Set the environment variables from `.env.example` in your host's dashboard/secrets — at minimum `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`.
3. Run `npm install && npm start` (or let your host run these automatically). Migrations apply automatically on boot.
4. Run `npm run create-admin` once, in a shell on the host, to create your login.
5. Update the frontend's `VITE_API_BASE_URL` to the deployed backend URL and rebuild/redeploy the frontend.

## Security notes

- Passwords are hashed with bcrypt (12 rounds); plaintext passwords are never stored.
- Admin sessions are stateless JWTs (default expiry 8h, configurable via `JWT_EXPIRES_IN`).
- The contact endpoint is rate-limited (default: 5 requests / 15 minutes / IP) and includes a hidden honeypot field to deter simple bots — this stops naive bots, not a targeted scraper that ignores hidden fields, so don't treat it as a substitute for the rate limit. Admin login has its own stricter limit (10 attempts / 15 min).
- A real `Content-Security-Policy` is enforced via `helmet` (not disabled), applied to every route including `/admin` — the admin dashboard has no inline scripts/styles, so this doesn't need any relaxing. `Strict-Transport-Security` is enabled automatically when `NODE_ENV=production`.
- CORS is restricted to `CORS_ORIGIN`; the server refuses to start in production if this isn't set with a valid scheme.
- Malformed request bodies return a plain `400` and are not treated as server errors — they don't get logged to error tracking or trigger alerts, keeping that signal meaningful.
- The admin dashboard is served at `/admin` but is **not** listed anywhere on the public site — bookmark the URL. For stronger protection, put it behind your host's IP allowlist or a VPN in production.

## Monitoring, logging & alerts

- **Logs**: structured JSON via `pino`/`pino-http`, written to stdout. On Railway (and most hosts) stdout is automatically captured and searchable in the platform's logs dashboard — no extra log-shipping setup needed. Health-check pings are excluded from the request log to keep it readable. Set verbosity with `LOG_LEVEL` (`.env`).
- **Error tracking**: optional Sentry integration. Set `SENTRY_DSN` in `.env` to start sending exceptions there; leave it blank and it's a no-op (errors still get logged locally either way — nothing is lost, you just won't have Sentry's dashboard/grouping/alerting on top).
- **Alerts**: set `ALERT_WEBHOOK_URL` to a Slack or Discord "incoming webhook" URL to get pinged there on unhandled server errors and crashes. Throttled to once per 5 minutes per error type so a burst of the same failure doesn't spam the channel.
- **Uptime monitoring**: not built into the app itself (that's an external service's job) — point a free uptime checker (e.g. UptimeRobot, Better Uptime, or your host's built-in health checks) at `GET /api/health/deep`, not `/api/health`. The deep check actually queries the database, so it catches "server is up but can't reach its data" failures that the shallow check would miss.
