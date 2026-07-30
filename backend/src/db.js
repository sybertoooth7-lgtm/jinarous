import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMigrations } from './migrations-runner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || './data/alux.db';
const resolvedPath = path.isAbsolute(dbPath) ? dbPath : path.join(__dirname, '..', dbPath);

fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

export const db = new Database(resolvedPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Schema lives in migrations/*.sql now, not inline here - see
// migrations-runner.js. This runs synchronously at import time, so a fresh
// checkout (or CI run, or a new deploy after a schema change) always ends
// up with the correct, up-to-date schema with zero manual steps.
runMigrations(db);

export default db;
