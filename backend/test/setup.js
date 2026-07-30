// Runs before any test file's imports. Sets required env vars to safe test
// values BEFORE db.js/config.js are ever imported, since those modules read
// process.env at module-load time (SQLite path, JWT secret, etc.).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const testDbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alux-test-db-'));

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-not-for-real-use-0123456789abcdef';
process.env.DB_PATH = path.join(testDbDir, 'test.db');
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.CONTACT_RATE_LIMIT_MAX = '1000'; // avoid rate-limit interference between tests
