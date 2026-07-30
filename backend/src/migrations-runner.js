import fs from 'node:fs';
import path from 'node:path';

const migrationsDir = path.join(import.meta.dirname, '..', 'migrations');

/**
 * Applies any pending .sql migration files (in migrations/, sorted by
 * filename) to the given better-sqlite3 database instance, tracked in a
 * `_migrations` ledger table so each file only ever runs once.
 *
 * Used both by db.js (run automatically, synchronously, at server boot -
 * so a fresh checkout or a new column always ends up with the right
 * schema with zero manual steps) and by src/migrate.js (a standalone CLI
 * for running migrations explicitly, e.g. in a deploy script before the
 * app starts).
 */
export function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(db.prepare('SELECT filename FROM _migrations').all().map((r) => r.filename));

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let appliedCount = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    const runOne = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO _migrations (filename) VALUES (?)').run(file);
    });
    runOne();
    appliedCount += 1;
  }
  return appliedCount;
}
