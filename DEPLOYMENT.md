[DEPLOYMENT.md](https://github.com/user-attachments/files/30561871/DEPLOYMENT.md)
# Deploying Alux Plaza

This covers getting the project into version control, then live on Railway (backend) + Vercel (frontend), with GitHub Actions running tests on every push.

---

## 1. Push to GitHub

A local git repo has already been initialized in this folder. To get it onto GitHub:

```bash
git add .
git commit -m "Initial commit: Alux Plaza full stack"

# create a new repo on github.com first, then:
git remote add origin https://github.com/<your-username>/alux-plaza.git
git branch -M main
git push -u origin main
```

---

## 2. Backend → Railway

**Cost reality check first:** Railway's free option is a one-time $5 trial credit that lasts ~30 days, not a permanent free tier. After that, you're on the Hobby plan (~$5/month) for an always-on service with persistent storage. Budget for that if this needs to stay live.

### Easiest path — Railway's native GitHub integration (recommended)

1. Go to [railway.app](https://railway.app) → New Project → **Deploy from GitHub repo** → select your repo.
2. When it asks for a root directory, set it to **`backend`**. Railway auto-detects the Node app via `package.json` and reads `backend/railway.json` for build/start/healthcheck settings.
3. **Add a persistent volume** (Settings → Volumes) — mount it at `/app/data`. Without this, your SQLite database resets every time Railway redeploys.
4. Set environment variables (Settings → Variables) using `backend/.env.example` as the checklist:
   - `JWT_SECRET` — generate a real one: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
   - `CORS_ORIGIN` — your Vercel frontend URL once you have it (step 3 below), e.g. `https://alux-plaza.vercel.app`
   - `DB_PATH` → `/app/data/alux.db`
   - `PORT` — Railway sets this automatically; you generally don't need to set it
5. Deploy. Railway gives you a public URL like `https://alux-plaza-backend.up.railway.app`.
6. Open a shell on the deployed service (Railway dashboard → your service → the `...` menu → **Shell**, or via `railway run`) and run:
   ```bash
   npm run create-admin
   ```
   to create your real admin login on the live database.
7. Visit `https://<your-railway-url>/admin` to confirm it's live.

With this option, Railway auto-redeploys on every push to `main` — you don't need the `deploy-backend.yml` GitHub Action below at all.

### Alternative — GitHub Actions-driven deploy (tighter CI gating)

Included in this repo: `.github/workflows/backend-ci.yml` (runs tests) and `.github/workflows/deploy-backend.yml` (deploys only after CI passes). To use this instead of native auto-deploy:

1. In Railway: Settings → disable "Auto Deploy" for the GitHub connection (so Railway doesn't also deploy on its own).
2. Get a Railway token: `railway login` locally, then `railway whoami --token` (or generate one from Account Settings → Tokens).
3. In your GitHub repo: Settings → Secrets and variables → Actions → New repository secret → `RAILWAY_TOKEN` → paste it.
4. Push to `main`. `backend-ci.yml` runs first (boots the server, hits `/api/health`, `/api/status/defense-matrix`, submits a real test contact form, verifies the honeypot rejects spam). If that passes, `deploy-backend.yml` triggers automatically.

---

## 3. Frontend → Vercel

1. Go to [vercel.com](https://vercel.com) → New Project → import the same GitHub repo.
2. Set **Root Directory** to `frontend`. Vercel reads `frontend/vercel.json` for the rest (it's a standard Vite build).
3. Add an environment variable: `VITE_API_BASE_URL` = your Railway backend URL from step 2 (e.g. `https://alux-plaza-backend.up.railway.app`), **no trailing slash**.
4. Deploy. Vercel gives you a URL like `https://alux-plaza.vercel.app`.
5. Go back to Railway and update `CORS_ORIGIN` to this exact Vercel URL, then redeploy the backend so it accepts requests from the live frontend.
6. `frontend-ci.yml` in this repo runs `npm run build` on every push to catch type errors before Vercel even builds — Vercel's own git integration handles the actual deploy, no extra Action needed.

(Netlify works the same way if you prefer it: root directory `frontend`, build command `npm run build`, publish directory `dist`, same `VITE_API_BASE_URL` env var.)

---

## 4. Verify it end to end

1. Visit your live Vercel URL.
2. Scroll to Contact, submit the form.
3. Visit `https://<railway-url>/admin`, log in, confirm the submission shows up.
4. Scroll to the Defense Matrix section on the live site — the metrics should reflect real traffic against your live Railway backend.

---

## What this CI/CD setup does and doesn't cover

**Does:**
- Runs real smoke tests against a real running server on every push (not just "does it compile")
- Blocks deployment if those tests fail
- Auto-deploys backend + frontend on push to `main`

**Doesn't (yet):**
- No staging/preview environments per PR (Railway and Vercel both support this natively if you want it later — Vercel does it automatically for every PR by default)
- Automated database migrations now exist (`backend/migrations/*.sql`, run automatically at boot via `db.js`, or explicitly via `npm run migrate`) - schema changes are tracked in a `_migrations` ledger table instead of being untracked inline DDL.
- No rollback automation — if a deploy breaks something, you currently roll back manually from Railway/Vercel's dashboard (both keep deploy history and support one-click rollback)
