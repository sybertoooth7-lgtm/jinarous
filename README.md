# Alux Plaza — Full Stack

This package contains the Alux Plaza cybersecurity landing page plus a real backend for the contact form.

```
alux-plaza-fullstack/
├── frontend/     React/Vite landing page (Hero, Services, DefenseMatrix, NeuralLab, Contact, etc.)
├── backend/      Node/Express + SQLite API: contact form intake, admin login, admin dashboard
├── alux-plaza.html          Standalone single-file version of the page (no backend wiring)
└── generate_alux_plaza.py   Python script that generates the standalone HTML file
```

## Quick start (local development)

**1. Start the backend** (handles the contact form + admin dashboard):

```bash
cd backend
npm install
cp .env.example .env        # edit JWT_SECRET / CORS_ORIGIN if needed
npm run create-admin        # set your admin email + password
npm start
```

Backend runs at `http://localhost:4000`. Admin dashboard: `http://localhost:4000/admin`.

**2. Start the frontend:**

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:3000` (or `5173`, check the terminal output) and automatically proxies `/api/*` requests to the backend — no extra config needed for local dev.

**3. Test it end to end:** open the site, scroll to the Contact section, submit the form, then check `http://localhost:4000/admin` (log in with the account from step 1) — the submission should appear there in real time.

## What changed from the original

- `frontend/src/sections/Contact.tsx` — the form now actually `POST`s to `/api/contact` instead of just flipping a local "submitted" flag. Added a loading state, error display, and a hidden honeypot field for basic bot protection.
- `frontend/src/sections/DefenseMatrix.tsx` — the six "layer" cards now show **real, live metrics** fetched from `/api/status/defense-matrix` (polled every 8s) instead of hardcoded fake numbers: actual request count & throughput, real average API latency, real contact-form success rate, real uptime, and a real count of bot submissions caught by the honeypot. Falls back to a plain placeholder if the backend is unreachable — it never fakes a number.
- `backend/src/stats.js` + `backend/src/routes/status.js` — new: an in-memory counter of real server traffic (requests, latency, contact attempts/successes, honeypot catches) exposed via a public read-only endpoint.
- `frontend/vite.config.ts` — added a dev proxy so `/api` calls reach the backend without CORS issues locally.
- `frontend/.env.example` — new; set `VITE_API_BASE_URL` when deploying frontend and backend separately.
- `backend/` — entirely new: Express API, SQLite database, JWT-based admin auth, rate limiting, and a static admin dashboard (plain HTML/CSS/JS, no build step).

**Worth knowing:** the live Defense Matrix numbers are genuinely computed from this server's own traffic — they are not a real AI threat-detection system. Alux Plaza remains a fictional cybersecurity brand; what's real is the engineering (the numbers reflect actual server behavior, not scripted fiction).

## Tools

`tools/auth_audit.py` — a real, working Access Control & Authentication Audit scanner. This backs the "Access Control & Authentication Audit" service card on the landing page (formerly "Behavioral Biometric AI") — every finding it produces is real and independently reproducible, not simulated.

**What it checks:**
1. Transport security — HTTPS enforcement, TLS redirect behavior, certificate validity
2. Security headers — HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, server/version disclosure
3. Cookie security — Secure / HttpOnly / SameSite flags on session cookies
4. JWT hygiene — signing algorithm, expiry, sensitive data in payload (optional, pass a sample token)
5. Login endpoint hardening — a small, capped probe to check for rate-limiting/lockout behavior

**Setup:**
```bash
pip install requests
```

**Usage:**
```bash
python3 tools/auth_audit.py https://example.com
python3 tools/auth_audit.py https://example.com --login-path /api/login --jwt <sample_token>
python3 tools/auth_audit.py https://example.com --out report.json
```

**Important:** this is a passive-first, non-destructive tool — it does not brute-force credentials or exploit anything. Only run it against systems you own or have explicit written authorization to test. See `docs/access-control-audit-methodology.md` for the full service methodology, engagement scope, and severity framework this tool supports.

## Deploying to production

See `backend/README.md` for full details. Short version:

1. Deploy `backend/` to any Node host (Railway, Render, Fly.io, a VPS...) with persistent storage for `backend/data/`.
2. Run `npm run create-admin` once on the deployed backend.
3. Set `VITE_API_BASE_URL` in `frontend/.env` to the deployed backend's URL, then build and deploy the frontend (`npm run build`) to your usual static host or Shopify-adjacent hosting.
4. Set `CORS_ORIGIN` in the backend's environment to your live frontend domain.

The standalone `alux-plaza.html` / `generate_alux_plaza.py` files are unrelated to this backend — they're the older single-file version of the page and still work as static HTML with no server.
