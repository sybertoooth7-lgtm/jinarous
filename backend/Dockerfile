# Backend - Node/Express + SQLite
FROM node:22-slim AS base

# better-sqlite3 needs build tools to compile its native binding on install
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# Data directory for the SQLite file. In production, mount a real
# persistent volume at this path (see DEPLOYMENT.md) - without one, a
# container restart/redeploy loses all submissions and metrics, since a
# container's own filesystem is ephemeral by default.
RUN mkdir -p /app/data
VOLUME ["/app/data"]

ENV NODE_ENV=production
ENV PORT=4000
ENV DB_PATH=/app/data/alux.db

EXPOSE 4000

# Migrations run automatically at boot (see src/db.js), so no separate
# migration step is required here - a fresh container always ends up with
# the correct schema.
CMD ["node", "src/index.js"]
