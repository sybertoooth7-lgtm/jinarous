# Sandbox-verified fixes — complete apply list

Everything here was reproduced, fixed, and re-verified in a clean
sandbox: fresh Postgres + all 15 migrations, full backend test suite
(31/31 passing), live server + real auth/CSRF/CORS round trips
(including cross-origin, matching your Vercel+Railway split), frontend
typecheck + build, and a contact-form submission traced end-to-end into
Postgres. Re-verified again after the deletions below — still 15/15,
31/31, clean build.

## DELETE these (confirmed dead, safe to remove)

- `backend/migrations/012_security_enhancements.sql` — replaced by
  `016_security_enhancements.sql` below (see why in section 1)
- `backend/public/admin/admin.js`
- `backend/public/admin/admin.css`
  — dead duplicates; `index.html` actually loads `dashboard.js` /
  `styles.css`, not these
- `migrations/004_add_contact_details_and_status.sql`
- `migrations/005_add_audit_logs_index.sql`
  — the whole root-level `migrations/` folder. It's separate from
  `backend/migrations/`, which is the only one your migration runner
  reads. These two files have never actually run.
- `DEPLOYMENT (1).md`
- `ISSUES_FIXED (1).md`
- `DOCKER_CI_README.md`
- `PACKAGE_INSTALL.md`
  — all four describe an earlier, Redis-based rate-limiting design
  that's since been replaced by the Postgres-backed store already in
  `backend/src/lib/rate-limit-store.js`. Verified: current code has no
  Redis dependency anywhere. These docs are stale, not just outdated —
  keeping them risks someone (including a future AI assistant) reading
  them as current instructions.

## RENAME (browser-upload artifacts — same content, just fix the filename)

- `frontend/Dockerfile (1)` → `frontend/Dockerfile` **but use the
  version below**, which also fixes a real bug (see section 3)
- `frontend/dockerignore (1)` → `frontend/.dockerignore` (needs the
  leading dot to actually work — Docker won't recognize it otherwise).
  Content unchanged, just the filename.

## NEW FILE: `backend/migrations/016_security_enhancements.sql`

Content provided in this package. This migration does `ALTER TABLE
client_login_attempts`, but that table isn't created until
`014_create_client_login_attempts.sql`. Migrations run in
filename-sort order, so on a fresh database (new dev machine, CI,
disaster recovery) the old `012_...` name ran before `014` and failed
outright. Your production DB only worked because the table already
existed from an earlier manual run. Renaming to `016` makes it run
after its dependency. Verified: all 15 migrations now apply cleanly
from an empty database, both before and after all other changes below.

## `backend/src/index.js` — one-line change

Add `import 'dotenv/config';` as the very first line, above your
existing first import. Rest of the file unchanged (full file included
in this package for convenience).

Why: only `migrate.js` was loading `.env`; the server itself never
was. Your own README's documented setup flow (`cp .env.example .env` →
`npm start`) silently didn't work locally — it only worked in
production because Railway injects env vars directly.

## `backend/Dockerfile` — one-line change

The built-in `HEALTHCHECK` hits `http://localhost:3001/health`, but
the real route is `/api/health`. Docker will eventually mark a
perfectly healthy container as unhealthy and restart it. Full
corrected file included.

## `frontend/Dockerfile` (replaces the mangled `Dockerfile (1)`)

Same content as before, just correctly named. Included in this
package. Note: `docker-compose.yml` looks for exactly `Dockerfile` —
with the old mangled name, **the frontend Docker build could not find
the file at all**. This was a full build breakage, not cosmetic.

## `frontend/.dockerignore` (replaces the mangled `dockerignore (1)`)

Included in this package — same content, correct filename (leading dot
required).

## `backend/src/scripts/create-admin.js` — full file replacement

Included. Fixes a Node.js `readline` ordering quirk with piped stdin.
Doesn't affect your normal interactive usage (`npm run create-admin`
in a real terminal — verified that still works correctly end-to-end,
including a real login afterward) but makes the script robust if you
ever automate admin creation later.

## `backend/test/setup.js`, `backend/test/config.test.js`,
   `backend/test/boot-admin-warning.test.js` — full file replacements

Included. These hardcoded a `JWT_SECRET` value containing the words
"secret" and "test" — both on your own app's weak-secret denylist in
`config.js`. Your validator was correctly rejecting them, so these
tests were failing (or in `setup.js`'s case, crashing the whole test
worker) in CI too, not just locally. Swapped in a clean random value.
Verified: 7/7 test files, 31/31 tests passing.

## `frontend/src/sections/Contact.tsx` — full file replacement

Included. Two separate bugs:
- Leftover instructional comment text left in as literal top-level
  code (an `await` outside any function, plus a literal `...`), which
  failed `tsc` outright — the whole frontend wouldn't build.
- The real form submission used a raw `fetch()` instead of your
  `secureFetch()` helper, so it never sent the CSRF header or
  credentials. This would fail on every real submission once deployed
  cross-origin (Vercel + Railway) with "CSRF token missing." Verified
  fixed with a live cross-origin CORS+CSRF round trip that landed a
  real row in the `contacts` table.

## `frontend/src/pages/ClientDashboard.tsx` — full file replacement

Included. Same raw-`fetch` CSRF bug as `Contact.tsx`, in the client
logout call. Fixed to use `secureFetch`.

## `frontend/src/pages/ClientLogin.tsx` — full file replacement

Included. Minor lint fix only (`catch (err: any)` → `catch (err:
unknown)` with a proper type guard). No behavior change — verified
this file's separate `secureFetch` implementation (from
`lib/security.ts`) was already correct with a live cross-origin client
login round trip.

## `README.md` — full file replacement

Included. Your old `README.md` was a leftover fix-checklist from an
earlier session, describing a major backend rewrite (CommonJS→ESM,
table-name fixes, wrong bcrypt package, etc.) as still pending. I
checked every item in it against the current code — **all already
fixed**. The new version is a normal, accurate project README:
description, setup steps, current file structure, and a short honest
list of remaining tidiness items (the dead files/docs deleted above,
plus a note that you have two separate-but-both-correct `secureFetch`
implementations worth consolidating someday).

---

## Not touched, worth a quick look yourself

`RAILWAY_SETUP.md` — spot-checked and looks current, unlike the four
deleted docs, but I didn't do a full line-by-line pass on it the way I
did everything else here.
