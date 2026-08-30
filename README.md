# Alux Plaza

A standards-based cybersecurity consultancy platform for SMEs in East
Africa, grounded in NIST SP 800-61, PCI DSS, and the Kenya Data
Protection Act 2019.

- **Backend:** Node.js/Express (ESM), PostgreSQL, JWT auth (double
  cookie: separate `adminToken` for admins, `clientToken` for clients),
  CSRF via double-submit cookie, Postgres-backed rate limiting (no
  Redis dependency).
- **Frontend:** React 19 / Vite / TypeScript / Tailwind.
- **Repo:** `github.com/sybertoooth7-lgtm/jinarous`
- **Deploy:** frontend on Vercel (`jinarous.vercel.app`), backend on
  Render (free) with a Neon Postgres — see [RENDER_SETUP.md](RENDER_SETUP.md).

## Local setup

```bash
# Backend
cd backend
cp .env.example .env   # fill in DATABASE_URL, JWT_SECRET (random, ≥32
                       # chars, no dictionary words — config.js checks
                       # this at boot), CORS_ORIGIN
npm install
npm run migrate        # applies backend/migrations/*.sql in order
                       # (also auto-runs on every server boot)
npm run create-admin    # interactive prompt; or set ADMIN_BOOTSTRAP_EMAIL
                        # + ADMIN_BOOTSTRAP_PASSWORD and skip this
npm run dev

# Frontend
cd frontend
npm install
VITE_API_BASE_URL=http://localhost:3001 npm run dev
```

`VITE_API_BASE_URL` is required for any production build
(`npm run build` fails fast without it — see `scripts/check-env.js`) so
the deployed frontend can reach a backend on a different host.

## Structure
