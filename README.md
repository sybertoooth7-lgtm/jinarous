WHERE EACH FILE GOES — round 2 (admin dashboard fix)
======================================================

  outputs/backend/migrations/004_add_contact_details_and_status.sql
    -> backend/migrations/004_add_contact_details_and_status.sql
    NEW FILE — create it, don't replace anything. Runs automatically on
    next deploy; adds first_name/last_name/company/status columns to
    `contacts` and backfills existing rows.

  outputs/backend/src/routes/admin.js   -> backend/src/routes/admin.js
    Adds GET /me, GET /stats, PATCH /submissions/:id/status,
    DELETE /submissions/:id. Fixes /submissions to support status/search
    filters and `pageSize` (was `limit`), and to return a flat `total`
    (the dashboard JS expected this, not the old nested `pagination.total`).
    Also fixes the login cookie's maxAge to track JWT_EXPIRES_IN instead of
    a hardcoded 8h, and normalizes login timing so a wrong password and a
    nonexistent email both take about the same time to respond.

  outputs/backend/src/routes/contact.js   -> backend/src/routes/contact.js
    Now accepts firstName/lastName/company separately (was: a single
    combined `name`, and `company` was silently thrown away).

  outputs/backend/src/lib/email.js   -> backend/src/lib/email.js
    Notification email now includes the company name when provided.

  outputs/backend/src/db.js   -> backend/src/db.js
    Migration failures now log a clean "[db] FATAL: migration failed: ..."
    message and exit, instead of an unhandled-rejection stack trace.

  outputs/frontend/src/sections/Contact.tsx   -> frontend/src/sections/Contact.tsx
    Sends firstName/lastName/company separately to match the updated
    backend, instead of combining them into one `name` field and dropping
    company on the floor.

TESTING NOTE
------------
All of the above was tested end-to-end against a real local PostgreSQL
instance: login, /me, /stats, contact submission (with company), search,
status filtering, PATCH status, DELETE, wrong-password / unknown-email
login attempts, and invalid-status rejection all verified working via
actual HTTP requests — not just read over. Frontend was rebuilt with
`npm run build` afterward with no errors.
