#!/usr/bin/env node
// Standalone CLI for running pending migrations explicitly - e.g. as a
// deploy-script step before the app starts, or to inspect what would run.
// db.js also runs these automatically at boot, so this is mainly useful
// for deploy pipelines that want migrations as an explicit, separate step
// (so a migration failure blocks the deploy clearly, rather than surfacing
// as a confusing app-boot failure).
//
// Usage:
//   node src/migrate.js
//   npm run migrate

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { runMigrations } from './migrations-runner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || './data/alux.db';
const resolvedPath = path.isAbsolute(dbPath) ? dbPath : path.join(__dirname, '..', dbPath);
fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

const db = new Database(resolvedPath);
db.pragma('journal_mode = WAL');

const appliedCount = runMigrations(db);

if (appliedCount === 0) {
  console.log('No pending migrations - database is up to date.');
} else {
  console.log(`Applied ${appliedCount} migration(s).`);
}

db.close();
