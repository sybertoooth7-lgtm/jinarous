# Alux Plaza — Backend

Node.js/Express (ESM) + PostgreSQL API for Alux Plaza. It handles:

- **Contact form submissions** (`POST /api/contact`) — validated,
  honeypot-guarded, rate-limited per IP, stored in PostgreSQL
- **Admin auth & dashboard data** (`/api/admin/*`) — JWT in an
  httpOnly cookie, per-account lockout after repeated failed logins
- **Client portal** (`/api/client/*`, `/api/verify`) — client login,
  compliance tracker, risk-score sharing with verification codes
- **Shield middleware** — request scanning for attack signatures, IP
  blocklisting, and volume abuse detection (see `src/shield/`)
- **Admin dashboard UI** at `/admin` — plain HTML/JS (no build step)

PostgreSQL is required — there is no SQLite fallback.

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

- `DATABASE_URL` — Postgres connection string
- `JWT_SECRET` — long random string:
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
  (config.js refuses to boot on weak secrets)
- `CORS_ORIGIN` — the frontend's URL, scheme included

## 3. Migrate & create your admin account

```bash
npm run migrate         # applies migrations/*.sql in filename order
npm run create-admin    # interactive prompt; rerun to reset a password
```

## 4. Run

```bash
npm start        # production
npm run dev      # auto-restarts on file changes
```

The API is live at `http://localhost:4000`; admin dashboard at
`http://localhost:4000/admin`.

`CLUSTER_MODE=true` forks one worker per CPU — leave it off unless you
have provisioned the connections for it (each worker opens its own
Postgres pool). Note that Shield's request-volume counter is in-memory
per process, so cluster mode also weakens volume-based blocking.

## Tests

```bash
npm test
```

Vitest suite (`test/`) runs against a real disposable Postgres database
(see `test/setup.js`; override via `TEST_DATABASE_URL`). The role needs
CREATEDB — a fresh uniquely-named DB is created per test file.

## Deploying

Production deploys to Railway automatically: pushes to `main` trigger
Backend CI (`.github/workflows/backend-ci.yml`), and on success
`deploy-backend.yml` runs `railway up`. That workflow needs a
`RAILWAY_TOKEN` repo secret (Railway → Account Settings → API Tokens).
Required env vars on the Railway service mirror `.env.railway`.

Run `npm run migrate` against production once after the first deploy,
then `npm run create-admin`.

## Security notes

- Passwords bcrypt-hashed (12 rounds); plaintext never stored.
- Sessions are stateless JWTs (default expiry 8h) delivered as
  httpOnly cookies; separate cookies for admins (`token`) and clients
  (`clientToken`). Per-account lockout on repeated failures for both.
- CSRF double-submit cookie enforced globally on non-GET requests.
- Contact endpoint rate-limited (default 5 / 15 min / IP) plus hidden
  honeypot field; login endpoints have their own stricter limiter.
- Helmet sets a real Content-Security-Policy; CORS restricted to
  `CORS_ORIGIN`.
- Malformed bodies return plain `400` and skip error-tracking noise.

## Monitoring, logging & alerts

- **Logs**: structured JSON via pino/pino-http to stdout; health-check
  pings excluded. Verbosity via `LOG_LEVEL`.
- **Error tracking**: optional Sentry (`SENTRY_DSN`); blank = no-op.
- **Alerts**: optional Slack/Discord webhook (`ALERT_WEBHOOK_URL`) on
  unhandled errors and Shield high-severity blocks; throttled per type.
- **Uptime monitoring**: point external checkers at
  `GET /api/health/deep` (queries the database), not `/api/health`.
