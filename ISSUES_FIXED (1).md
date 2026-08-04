# 16 Audit Issues — Fixed

This document maps every issue to its fix location.

---

## 🔴 Critical / High Severity

### #1 — Admin Dashboard XSS Risk
**Problem:** Admin dashboard rendered user-submitted contact data with `innerHTML`, creating stored XSS.
**Fix:** 
- `backend/src/routes/contact.js` — Added `.escape()` to all input validators
- `backend/public/admin/dashboard.js` — All user data rendered via `textContent` (see `createEl()` helper). Zero `innerHTML` usage with user data.

### #2 — No Admin Token Revocation
**Problem:** JWTs had no `jti` claim and no blocklist. Deleted/compromised accounts retained valid tokens.
**Fix:**
- `backend/src/routes/admin.js` — Login generates `jti` (UUID). Logout adds `jti` to `tokenBlocklist`.
- `backend/src/middleware/auth.js` — Verifies token `jti` is not in blocklist before allowing access.

### #3 — Timing Attack on Login
**Problem:** Login returned immediately for wrong password vs nonexistent email, enabling user enumeration.
**Fix:**
- `backend/src/routes/admin.js` — Always runs `bcrypt.compare()` using a dummy hash when user doesn't exist. Response timing is now constant.

### #4 — Hardcoded Cookie maxAge
**Problem:** Cookie `maxAge` was hardcoded to `8 * 60 * 60 * 1000` instead of tracking `JWT_EXPIRES_IN`.
**Fix:**
- `backend/src/routes/admin.js` — Parses `JWT_EXPIRES_IN` env var (e.g., `8h`, `30m`, `1d`) and computes matching `maxAge` in milliseconds.

### #5 — Rate Limiting Doesn't Work Across Cluster Workers
**Problem:** `express-rate-limit` used MemoryStore. Each worker had independent counters.
**Fix:**
- `backend/src/middleware/rate-limit.js` — Uses `rate-limit-redis` with `ioredis` when `REDIS_URL` is set. Falls back to memory store with warning if Redis unavailable.
- `backend/src/index.js` — Applies the shared limiter to all `/api/` routes.

### #6 — No Input Sanitization on Contact Form
**Problem:** Validation existed but no `.escape()` or HTML sanitization. Raw data stored.
**Fix:**
- `backend/src/routes/contact.js` — All fields use `.escape()` from `express-validator`. Data is HTML-escaped before storage.

---

## 🟠 Medium Severity

### #7 — stats.js Top-Level Awaits
**Problem:** `await loadPersistedValue(...)` ran at module import. If DB was down, stats silently defaulted to 0 with no recovery.
**Fix:**
- `backend/src/stats.js` — Removed top-level await. Exports `loadPersistedValues()` as explicit async function.
- `backend/src/index.js` — Calls `loadPersistedValues()` only after DB connection is verified.

### #8 — No Index on audit_logs.created_at
**Problem:** `audit_logs` table lacked index on `created_at`, causing slow queries as it grew.
**Fix:**
- `migrations/005_add_audit_logs_index.sql` — Adds `idx_audit_logs_created_at` (DESC). Also adds indexes on `admin_id` and `action`.

### #9 — tools.js Doesn't Validate loginPath Format
**Problem:** `loginPath` passed to `spawn` without regex validation against shell-sensitive characters.
**Fix:**
- `backend/src/routes/tools.js` — Added `SAFE_PATH_REGEX = /^[a-zA-Z0-9_\-\/\.]+$/` validator. Rejects any path with shell metacharacters.

### #10 — No Pagination on /api/admin/submissions
**Problem:** Endpoint returned `LIMIT 100` but no offset/pagination. Would break at scale.
**Fix:**
- `backend/src/routes/admin.js` — Added `page`, `limit`, `offset` query params with validation. Returns `totalPages` for UI.

### #11 — No Status Filtering or Search on Submissions
**Problem:** Admin endpoint returned all contacts with no filtering.
**Fix:**
- `backend/src/routes/admin.js` — Added `status` filter (enum) and `search` filter (ILIKE on name/email/company/message).
- `backend/public/admin/dashboard.js` — UI provides dropdown for status and text search input.

### #12 — Nested pagination.total Instead of Flat total
**Problem:** Dashboard JS expected `total` at root, but backend returned `pagination.total`.
**Fix:**
- `backend/src/routes/admin.js` — Response is now flat: `{ data, total, page, limit, totalPages }`.

### #13 — Missing GET /me Endpoint
**Problem:** No way for admin dashboard to verify current user's identity.
**Fix:**
- `backend/src/routes/admin.js` — New `GET /api/admin/me` endpoint returns `{ user: { id, email, created_at } }`.
- `backend/public/admin/dashboard.js` — Calls `/me` on load to display user email in topbar.

### #14 — Missing PATCH /submissions/:id/status and DELETE /submissions/:id
**Problem:** No way to update submission status or delete from admin dashboard.
**Fix:**
- `backend/src/routes/admin.js` — Added `PATCH /submissions/:id/status` and `DELETE /submissions/:id`.
- `backend/public/admin/dashboard.js` — Status dropdown and Delete button per row.

### #15 — Contact Form Silently Drops company Field
**Problem:** Frontend sent `company` but backend didn't store it (or column didn't exist).
**Fix:**
- `backend/src/routes/contact.js` — Explicitly stores `company` in INSERT query.
- `migrations/004_add_contact_details_and_status.sql` — Adds `company VARCHAR(150)` column if missing.

### #16 — No Frontend Length Indicators
**Problem:** Backend capped message at 5000 chars and company at 150, but frontend showed no counters.
**Fix:**
- `frontend/src/sections/Contact.tsx` — Real-time character counters for name, company, and message fields. Input blocked at max length.

---

## Files Changed / Created

| File | Purpose |
|------|---------|
| `backend/src/routes/admin.js` | Login, logout, me, submissions (paginated/filtered), status update, delete |
| `backend/src/middleware/auth.js` | JWT verification with blocklist check |
| `backend/src/routes/contact.js` | Escaped contact form submission |
| `backend/src/routes/tools.js` | Path-validated tool execution |
| `backend/src/stats.js` | Async-init stats module |
| `backend/src/middleware/rate-limit.js` | Redis-backed cluster-safe rate limiter |
| `backend/src/index.js` | Updated server bootstrap with security middleware |
| `frontend/src/sections/Contact.tsx` | Contact form with character counters |
| `backend/public/admin/index.html` | Admin dashboard markup |
| `backend/public/admin/dashboard.js` | Admin dashboard logic (XSS-safe rendering) |
| `backend/public/admin/styles.css` | Admin dashboard styles |
| `migrations/004_add_contact_details_and_status.sql` | Add company, status, updated_at columns + indexes |
| `migrations/005_add_audit_logs_index.sql` | Add audit_logs indexes |
| `.env.example` | Required environment variables |
| `DEPLOYMENT.md` | Step-by-step deployment instructions |
