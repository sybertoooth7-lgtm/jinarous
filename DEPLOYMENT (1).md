# Deployment Guide — Post-Audit Fixes

## 1. Install New Dependencies

```bash
cd backend
npm install rate-limit-redis ioredis
```

## 2. Run Migrations

```bash
# Migration 004 — Add contact columns (company, status, updated_at)
psql $DATABASE_URL -f migrations/004_add_contact_details_and_status.sql

# Migration 005 — Add audit_logs indexes
psql $DATABASE_URL -f migrations/005_add_audit_logs_index.sql
```

## 3. Environment Variables

Copy `.env.example` to `.env` and fill in real values:

```bash
cp .env.example .env
```

**Critical:** Change `JWT_SECRET` to a cryptographically random string (≥64 chars).

## 4. Verify Admin Dashboard XSS Safety

Open `backend/public/admin/dashboard.js` and confirm:
- ✅ All user data uses `.textContent` (not `.innerHTML`)
- ✅ The `createEl()` helper uses `textContent`
- ✅ No `dangerouslySetInnerHTML` or similar patterns

## 5. Start the Server

### Single instance (development):
```bash
npm start
```

### Cluster mode (production):
```bash
CLUSTER_MODE=true npm start
```

**Note:** When `CLUSTER_MODE=true`, Redis **must** be running for rate limiting to work correctly across workers.

## 6. Verify Endpoints

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/admin/login` | POST | No | Login |
| `/api/admin/logout` | POST | Yes | Logout + revoke token |
| `/api/admin/me` | GET | Yes | Current user info |
| `/api/admin/submissions` | GET | Yes | List with pagination/filter |
| `/api/admin/submissions/:id/status` | PATCH | Yes | Update status |
| `/api/admin/submissions/:id` | DELETE | Yes | Delete submission |
| `/api/contact` | POST | No | Submit contact form |

## 7. Security Checklist

- [ ] JWT_SECRET is random and ≥64 characters
- [ ] Redis is running (for cluster mode)
- [ ] HTTPS enabled in production (secure cookies)
- [ ] Migrations applied successfully
- [ ] Admin dashboard uses `textContent` for all user data
- [ ] Rate limiter working (test with rapid requests)
- [ ] Token revocation working (login → logout → try old token)

## 8. Production Hardening (Optional but Recommended)

1. **Replace in-memory blocklist with Redis:**
   In `admin.js`, swap `const tokenBlocklist = new Set()` for a Redis Set.

2. **Add request logging:**
   Use `morgan` or `winston` to log all admin actions.

3. **Add CSRF protection:**
   If serving frontend and backend from different origins, ensure CORS is strict.

4. **Database connection pooling:**
   Ensure `pg.Pool` has appropriate `max` and `idleTimeoutMillis` settings.

5. **Helmet CSP:**
   Review `helmet.contentSecurityPolicy` directives in `index.js` for your assets.
