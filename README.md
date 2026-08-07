EVERYTHING FIXED — full instructions
======================================

This was a big pass. Do these in order: DELETE first, then RENAME, then
REPLACE/CREATE the code files, in the order listed (migrations before
code, since the code assumes the new columns exist).

-----------------------------------------------------------------------
STEP 1 — DELETE these (confirmed dead/orphaned, safe to remove)
-----------------------------------------------------------------------
  backend/migrations/004 add contact details and status · SQL
    (the malformed-filename version — replaced by the properly-named
    004_add_contact_details_and_status.sql below)

  backend/migrations/005_add_indexes.sql
    (renamed to 009_add_contact_indexes.sql below — there were two
    different files both numbered 005)

  backend/migrations/008_add_tool_runs.sql
    (a no-op — 003 already created tool_runs, and 008 used CREATE TABLE
    IF NOT EXISTS so its intended changes never applied. Replaced by
    010_alter_tool_runs_columns.sql below, which actually works.)

  backend/public/admin/admin.js
  backend/public/admin/admin.css
    (dead duplicates — index.html actually loads dashboard.js/styles.css)

  backend/src/scripts/create-admin.js
    (duplicate of backend/scripts/create-admin.js — that one is what
    npm run create-admin actually runs; this copy was unused. Note
    there are TWO different directories: backend/scripts/ (keep) and
    backend/src/scripts/ (delete).)

  migrations/  (the WHOLE folder, at repo ROOT — not backend/migrations)
    Two files were sitting here that never ran: the migration runner
    only reads backend/migrations/. Delete this entire root-level folder.

-----------------------------------------------------------------------
STEP 2 — RENAME these (browser-upload artifacts, no functional change)
-----------------------------------------------------------------------
  DEPLOYMENT (1).md          -> DEPLOYMENT.md
  ISSUES_FIXED (1).md        -> ISSUES_FIXED.md
  frontend/Dockerfile (1)    -> frontend/Dockerfile
  frontend/dockerignore (1)  -> frontend/.dockerignore

  In GitHub's web editor: open the file, click the pencil, click the
  filename field at the top, retype it, commit. No content changes needed
  for these four.

-----------------------------------------------------------------------
STEP 3 — CREATE these NEW files
-----------------------------------------------------------------------
  outputs/backend/migrations/004_add_contact_details_and_status.sql
    -> backend/migrations/004_add_contact_details_and_status.sql
    Corrected version of the malformed one deleted in step 1. Adds
    company, status, updated_at to contacts; status constrained to
    new/read/replied/archived (matches what dashboard.js actually offers).

  outputs/backend/migrations/009_add_contact_indexes.sql
    -> backend/migrations/009_add_contact_indexes.sql
    (renamed from the old 005_add_indexes.sql, content unchanged)

  outputs/backend/migrations/010_alter_tool_runs_columns.sql
    -> backend/migrations/010_alter_tool_runs_columns.sql
    Does with ALTER TABLE what the deleted 008 tried and failed to do
    with CREATE TABLE IF NOT EXISTS.

-----------------------------------------------------------------------
STEP 4 — REPLACE these existing files (full content swap)
-----------------------------------------------------------------------
  outputs/backend/src/index.js                  -> backend/src/index.js
  outputs/backend/src/stats.js                  -> backend/src/stats.js
  outputs/backend/src/middleware/auth.js        -> backend/src/middleware/auth.js
  outputs/backend/src/middleware/rate-limit.js  -> backend/src/middleware/rate-limit.js
  outputs/backend/src/lib/rate-limit-store.js   -> backend/src/lib/rate-limit-store.js
  outputs/backend/src/routes/admin.js           -> backend/src/routes/admin.js
  outputs/backend/src/routes/contact.js         -> backend/src/routes/contact.js
  outputs/backend/src/routes/tools.js           -> backend/src/routes/tools.js
  outputs/frontend/src/sections/Contact.tsx     -> frontend/src/sections/Contact.tsx

=========================================================================
WHY EACH ONE WAS BROKEN
=========================================================================

THE BIG ONE — nothing ran at all
---------------------------------
7 files (index.js, stats.js, routes/admin.js, routes/contact.js,
routes/tools.js, middleware/auth.js, middleware/rate-limit.js) had been
rewritten using require()/module.exports (CommonJS), but
backend/package.json has "type": "module", which means Node treats every
.js file as an ES module. I proved this by actually trying to boot it:

  BOOT FAIL: require is not defined in ES module scope

The whole backend was down. All 7 are now proper ESM (import/export).

The malformed migration filename
---------------------------------
"004 add contact details and status · SQL" — no .sql extension (ends in
"· SQL" with a middle-dot character, not a real extension). The migration
runner filters strictly on files ending in .sql, so this one was silently
skipped forever. Its content was correct, just unreachable. Renamed and
recreated properly.

Table name mismatch
---------------------
routes/admin.js queried `SELECT * FROM admins`, but the only table ever
created (migrations/001_init.sql) is `admin_users`. Every login attempt
would have failed with a Postgres error, not even a clean 401. Fixed.

UUID validation on integer IDs
---------------------------------
The PATCH/DELETE submission routes validated `:id` with .isUUID(), but
contacts.id is a SERIAL integer, not a UUID (nothing anywhere ever
changed that). Every real request like PATCH /submissions/1/status would
have been rejected by validation before it even reached the database.
Changed to .isInt().

Wrong package
---------------
routes/admin.js did `require('bcrypt')` (the native-binding package),
but package.json only has bcryptjs installed. This alone would have
crashed the route on load even if the CommonJS issue were fixed. Now
uses bcryptjs, matching what's actually installed.

Double-escaping (from the earlier security-audit review)
------------------------------------------------------------
contact.js called .escape() on name/company/message before storing them.
But dashboard.js already HTML-escapes every field at render time. Escaping
twice doesn't add security — express-validator's parameterized queries
already prevent SQL injection, and dashboard.js's render-time escaping
already prevents XSS. It just permanently corrupts the data: I proved
this with a real example — "AT&T" submitted, stored as "AT&amp;T",
displayed as "AT&amp;amp;T". Verified the fix with real special characters
end-to-end: "OBrien & Sons" and 'AT&T "Ventures"' now store and return
exactly as submitted.

Token blocklist that couldn't actually block anything
-----------------------------------------------------------
routes/admin.js exported an in-memory `tokenBlocklist` Set, and
middleware/auth.js required it back — a circular require, on top of
everything else. Even if that worked, an in-memory Set doesn't survive a
restart, and under CLUSTER_MODE each worker has its own copy — logging
out via the worker that handles your request wouldn't block the token on
any other worker. Rewired to use the token_blocklist Postgres table
(migration 005 already created it, just wasn't being used) — shared
across every worker and survives restarts. Verified live: logged in, hit
/me successfully, logged out, hit /me again with the same cookie — 401.

CORS_ORIGIN silently ignored
-------------------------------
index.js read `config.corsOrigin` (singular) — a field that doesn't exist
on the config object (it's `corsOrigins`, plural, already parsed into an
array). This always silently fell back to localhost regardless of what
CORS_ORIGIN was actually set to in the environment. Fixed to read the
real field.

Rate limiter using a store that was never actually active
---------------------------------------------------------------
middleware/rate-limit.js tried to use Redis (rate-limit-redis/ioredis),
falling back to a plain in-memory store if REDIS_URL wasn't set — which
it never was, and there's no Redis infrastructure anywhere in this
project. So it was silently running the non-cluster-safe in-memory store
this whole time. Meanwhile, a Postgres-backed store
(lib/rate-limit-store.js) already existed, matching the rate_limits table
from migration 005 — but it used the OLD express-rate-limit v2-5 callback
API (incr(key, cb)), while package.json has express-rate-limit@8, which
requires the newer async increment()/decrement()/resetKey() interface.
Rewrote the store to match the installed version and wired it in as the
actual store — no Redis needed, uses the Postgres you already have.
Also fixed an IPv6 key-generation bug this introduced (express-rate-limit
warns loudly if you build a rate-limit key from req.ip without their
ipKeyGenerator() helper, since raw IPv6 addresses have multiple
equivalent notations that could bypass the limit) — caught this during
testing, not initially.

A tool endpoint that called a script that doesn't exist
---------------------------------------------------------------
routes/tools.js spawned `scripts/login-tool.js` — a file that isn't
anywhere in the repo. Every call would fail with ENOENT. (In practice
this was never reachable anyway — dashboard.js doesn't call this route
at all.) Repointed it at tools/auth_audit.py, which is real, already in
the repo, and actually does something. Requires python3 + the `requests`
package on whatever host runs this.

Frontend calling a hardcoded relative path
---------------------------------------------
Contact.tsx did `fetch('/api/contact')` instead of using API_BASE (which
this project already has, and other components like DefenseMatrix.tsx
already use correctly). This only works if the frontend and backend are
on the same domain — if you deploy the frontend to Vercel and the backend
somewhere else (which the whole VITE_API_BASE_URL mechanism exists to
support), this would 404 against Vercel's own domain. Fixed.

=========================================================================
TESTED, NOT JUST WRITTEN
=========================================================================
Ran a full boot against a real local PostgreSQL instance and confirmed,
via actual HTTP requests: server starts clean (zero errors, including the
IPv6 warning I introduced and then fixed) — all 9 migrations apply in
order — admin login works — /me works — contact form submission works,
including with & and " in the input, verified NOT double-escaped —
public status endpoint returns real data with no auth header — list/
search/PATCH status/DELETE all work on real rows — logout genuinely
revokes the token (401 on next request with the same cookie, not just a
cleared cookie client-side) — both health check endpoints work, and the
deep one correctly reflects real DB connectivity.

Frontend: full npm run build with the Contact.tsx fix — clean, zero
TypeScript errors.

One thing I could NOT test end-to-end: the tools.js -> auth_audit.py path,
since that needs python3 + pip packages installed, which isn't part of
this Node sandbox. The Node side (spawning, JSON parsing, error handling,
storing the run) is written and would fail cleanly with a clear error
message if python3/requests aren't available on whatever host runs it —
worth an early real-world test after deploying.
