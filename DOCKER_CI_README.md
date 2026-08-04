# Docker + CI/CD Setup

This directory contains Docker and GitHub Actions configurations for deploying and continuously verifying the 16 security audit fixes.

---

## Docker Compose Stack

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Frontend   │────▶│   Nginx     │────▶│  Backend    │
│  (React)    │     │  (reverse)  │     │  (Express)  │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                          ┌────────────────────┼────────────────────┐
                          ▼                    ▼                    ▼
                    ┌──────────┐        ┌──────────┐        ┌──────────┐
                    │ Postgres │        │  Redis   │        │  Admin   │
                    │   16     │        │    7     │        │ Dashboard│
                    └──────────┘        └──────────┘        └──────────┘
```

### Services

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| `postgres` | postgres:16-alpine | 5432 | Primary database |
| `redis` | redis:7-alpine | 6379 | Cluster-safe rate limiting |
| `backend` | Node 20 Alpine | 3001 | API server |
| `frontend` | Nginx Alpine | 3000 | Static SPA + API proxy |

---

## Quick Start with Docker

```bash
# 1. Clone and enter repo
cd your-repo

# 2. Create environment file
cp .env.example .env
# Edit .env with your secrets

# 3. Start everything
docker compose up --build

# 4. Run migrations (first time only)
docker compose exec postgres psql -U appuser -d appdb -f /docker-entrypoint-initdb.d/004_add_contact_details_and_status.sql
docker compose exec postgres psql -U appuser -d appdb -f /docker-entrypoint-initdb.d/005_add_audit_logs_index.sql

# 5. Access
# Frontend:  http://localhost:3000
# Backend:   http://localhost:3001
# Admin:     http://localhost:3001/admin
```

---

## Environment Variables

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `POSTGRES_USER` | `appuser` | Yes | DB username |
| `POSTGRES_PASSWORD` | `changeme` | Yes | DB password |
| `POSTGRES_DB` | `appdb` | Yes | DB name |
| `JWT_SECRET` | — | **Yes** | Min 64 chars, random |
| `JWT_EXPIRES_IN` | `8h` | No | Token lifetime |
| `REDIS_URL` | `redis://redis:6379` | No | Redis connection |
| `CLUSTER_MODE` | `false` | No | Enable cluster mode |
| `WORKERS` | `4` | No | Cluster workers |
| `FRONTEND_URL` | `http://localhost:3000` | No | CORS origin |

---

## Production Deployment

### 1. Secrets Management

Never commit `.env` files. Use Docker secrets or your cloud provider's secret manager:

```yaml
# docker-compose.prod.yml
secrets:
  jwt_secret:
    external: true

services:
  backend:
    secrets:
      - jwt_secret
    environment:
      JWT_SECRET_FILE: /run/secrets/jwt_secret
```

### 2. HTTPS / SSL

Use a reverse proxy (Traefik, Nginx, Caddy) for SSL termination:

```yaml
# Add to docker-compose.prod.yml
services:
  traefik:
    image: traefik:v3
    command:
      - "--providers.docker=true"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.letsencrypt.acme.tlschallenge=true"
    ports:
      - "443:443"
```

### 3. Redis Persistence

Redis is configured with AOF (`appendonly yes`). For production, also set:

```
redis:
  command: redis-server --appendonly yes --save 60 1000
```

### 4. Database Backups

Add a backup service:

```yaml
  backup:
    image: postgres:16-alpine
    command: >
      sh -c "while true; do
        pg_dump $$DATABASE_URL > /backups/db-$$(date +%Y%m%d-%H%M%S).sql;
        find /backups -name '*.sql' -mtime +7 -delete;
        sleep 86400;
      done"
    volumes:
      - ./backups:/backups
```

---

## GitHub Actions CI Pipeline

### Jobs Overview

| Job | Purpose | Triggers |
|-----|---------|----------|
| **lint** | ESLint, TypeScript, dangerous pattern scan | PR, push |
| **unit-tests** | Jest unit tests with coverage | PR, push |
| **integration-tests** | Full DB + Redis integration tests | PR, push |
| **security-tests** | Live verification of all 16 audit fixes | PR, push |
| **docker-build** | Verify Docker images build cleanly | PR, push |
| **security-scan** | npm audit + Snyk vulnerability scan | PR, push |
| **all-checks-pass** | Gate — all above must succeed | PR, push |

### Security Test Coverage

The `security-tests` job actively verifies:

| Fix | Test Method |
|-----|-------------|
| #3 Timing Attack | Measures response time for valid vs invalid users |
| #5 Rate Limiting | Sends 105 requests, verifies 429 after 100 |
| #6 Input Escaping | Injects `<script>` payload, verifies escaped response |
| #9 Path Validation | Sends `../../etc/passwd`, verifies rejection |
| #10 Pagination | Checks `page`, `limit`, `totalPages` in response |
| #11 Filtering | Tests `status` and `search` query params |
| #12 Flat Response | Verifies `total` at root, not `pagination.total` |
| #15 Company Field | Submits with company, verifies in GET response |
| #16 Char Counters | Checks `Contact.tsx` for counter logic |

### Required Secrets

| Secret | Purpose | Where to Get |
|--------|---------|--------------|
| `SNYK_TOKEN` | Vulnerability scanning | [snyk.io](https://snyk.io) |

Set in: **Repo Settings → Secrets and variables → Actions**

### Branch Protection

Enable in **Settings → Branches**:

```
Branch: main
✅ Require a pull request before merging
✅ Require status checks to pass before merging
   - lint
   - unit-tests
   - integration-tests
   - security-tests
   - docker-build
   - all-checks-pass
✅ Require branches to be up to date before merging
```

---

## Local CI Testing

Run the same checks locally before pushing:

```bash
# Lint
cd backend && npx eslint src/ --ext .js
cd ../frontend && npx tsc --noEmit

# Unit tests
cd backend && npm test

# Integration tests (requires local Postgres + Redis)
cd backend && npm run test:integration

# Security pattern check
cd backend
if grep -r "innerHTML" public/admin/dashboard.js; then echo "FAIL"; else echo "PASS"; fi

# Docker build
cd backend && docker build -t app-backend:test .
cd ../frontend && docker build -t app-frontend:test .
```

---

## Troubleshooting

### "Redis connection refused"
```bash
docker compose up -d redis
docker compose logs redis
```

### "Migration failed — column already exists"
The migrations use `IF NOT EXISTS` — safe to re-run:
```bash
docker compose exec postgres psql -U appuser -d appdb -f /docker-entrypoint-initdb.d/004_add_contact_details_and_status.sql
```

### "Rate limiter not using Redis"
Check `REDIS_URL` is set and Redis is healthy:
```bash
docker compose exec redis redis-cli ping  # Should return PONG
```

### "JWT token expired immediately"
Check `JWT_EXPIRES_IN` format. Valid: `8h`, `30m`, `1d`, `3600s`.

---

## Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| **Redis for rate limiting** | Required for cluster mode (#5). Falls back to memory with warning. |
| **In-memory token blocklist** | Simple for single-instance. Upgrade to Redis Set for multi-instance. |
| **Dummy hash for timing safety** | `bcrypt.compare()` always runs, preventing user enumeration (#3). |
| **Separate Dockerfiles** | Backend and frontend have different build/runtime needs. |
| **Nginx proxy for frontend** | Handles SPA routing, static asset caching, and API proxying. |
| **Health checks on all services** | Docker Compose waits for dependencies before starting dependents. |
