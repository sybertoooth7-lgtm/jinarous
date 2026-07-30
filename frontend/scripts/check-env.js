#!/usr/bin/env node
// Runs automatically before `npm run build` (via the `prebuild` npm
// lifecycle hook). Vite bakes VITE_* env vars into the built JS at build
// time - there is no runtime proxy in production like there is in local
// dev (see vite.config.ts's server.proxy, which only applies to `vite
// dev`, never to the built output). Forgetting to set VITE_API_BASE_URL
// before a production build means every fetch() call in the built app
// silently targets a relative path with no backend behind it - every
// contact form submission and Defense Matrix poll will 404 (or hit
// whatever happens to be at that path on the frontend's own host).
//
// This is a WARNING, not a hard failure: a same-origin deployment (frontend
// and backend served from the same host/path) can legitimately want this
// unset, so relative /api paths resolve correctly on their own. But that's
// the less common setup for this project (see DEPLOYMENT.md, which
// describes separate Vercel + Railway hosts), so an unset value gets a
// loud, impossible-to-miss warning rather than silent acceptance.

const YELLOW = '\x1b[93m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

const apiBase = process.env.VITE_API_BASE_URL;

if (!apiBase) {
  console.warn(`
${YELLOW}${BOLD}⚠ WARNING: VITE_API_BASE_URL is not set for this build.${RESET}
${YELLOW}
If your frontend and backend are deployed to DIFFERENT hosts (e.g. Vercel +
Railway, as described in DEPLOYMENT.md), this build will have NO way to
reach the backend. The contact form and the "live" Defense Matrix metrics
will silently fail with 404s in production - there is no dev-server proxy
in a built/deployed app.

Set VITE_API_BASE_URL to your deployed backend's URL before building, e.g.:
  VITE_API_BASE_URL=https://your-backend.up.railway.app npm run build

If frontend and backend genuinely share the same host/path in your setup,
this warning does not apply to you - ignore it.
${RESET}`);
}
