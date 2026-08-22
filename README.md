# Alux Plaza

A standards-based cybersecurity consultancy platform for SMEs in East
Africa, grounded in NIST SP 800-61, PCI DSS, and the Kenya Data
Protection Act 2019.

- **Backend:** Node.js/Express (ESM), PostgreSQL, JWT auth (double
  cookie: separate `token` for admins, `clientToken` for clients),
  CSRF via double-submit cookie, Postgres-backed rate limiting (no
  Redis dependency).
- **Frontend:** React 19 / Vite / TypeScript / Tailwind.
- **Repo:** `github.com/sybertoooth7-lgtm/jinarous`
- **Deploy:** frontend on Vercel (`jinarous.vercel.app`), backend on
  Railway.

## Local setup

\`\`\`bash
# Backend
cd backend
cp env.example .env   # fill in DATABASE_URL, JWT_SECRET (random, ≥32
                       # chars, no dictionary words — config.js checks
                       # this at boot), CORS_ORIGIN
npm install
npm run migrate        # applies backend/migrations/*.sql in order
npm run create-admin    # interactive prompt, run in a real terminal
npm run dev

# Frontend
cd frontend
npm install
VITE_API_BASE_URL=http://localhost:3001 npm run dev
\`\`\`

`VITE_API_BASE_URL` is required for any production build
(`npm run build` fails fast without it — see `scripts/check-env.js`) so
the deployed frontend can reach a backend on a different host.

## Structure

\`\`\`
backend/
  migrations/          numbered .sql files, applied in filename order
                        (currently 001–017; run `npm run migrate`)
  src/
    routes/             admin.js, adminClients.js, adminRiskScore.js,
                         adminSecurity.js, clientAuth.js,
                         clientRiskScore.js, clientSecurityEvents.js,
                         compliance.js, contact.js, status.js, tools.js,
                         verifyScore.js
    middleware/          auth.js, clientAuth.js, csrf.js,
                          rate-limit.js, adaptiveRateLimit.js,
                          shieldMiddleware.js, helmetConfig.js,
                          loginAudit.js
    scripts/create-admin.js   the one npm run create-admin actually runs
  test/                 vitest suite, runs against a real disposable
                         Postgres database (see test/setup.js)

frontend/
  src/sections/          landing-page sections (Contact, DefenseMatrix, …)
  src/pages/              ClientLogin, ClientDashboard, VerifyScore, …
  src/lib/                api.ts (API_BASE), secureFetch.ts, security.ts
                          — two separate CSRF-aware fetch helpers used in
                          different places; both correct, worth
                          consolidating into one eventually
  tools/                  security tooling (Python), the /api/admin/tools
                          route spawns tools/auth_audit.py — needs
                          python3 + `requests` on whatever host runs it
\`\`\`

## Known limitations

- Shield's request-volume counter (`bruteForceGuard.js`) is in-memory
  per process: with `CLUSTER_MODE=true` each worker counts separately
  and blocks later than expected. Production runs single-process
  (`CLUSTER_MODE=false`, see `.env.railway`), where this is fine; CI's
  security job forces cluster mode off for the same reason. Move the
  counters into Postgres if you ever scale past one backend instance.
- Migration numbering skips 008 (file was removed after being
  superseded). The runner applies whatever files exist in filename
  order, so the gap is harmless.

## License

MIT — see [LICENSE](LICENSE).
