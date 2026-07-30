import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../src/migrations-runner.js';

describe('migrations-runner.js', () => {
  it('applies all migrations to a brand-new in-memory database', () => {
    const freshDb = new Database(':memory:');
    const count = runMigrations(freshDb);

    expect(count).toBeGreaterThanOrEqual(2); // 001_init + 002_add_metrics_table at minimum

    const tables = freshDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => r.name);
    expect(tables).toEqual(expect.arrayContaining(['submissions', 'admin_users', 'metrics', '_migrations']));

    freshDb.close();
  });

  it('is idempotent - running twice applies nothing the second time', () => {
    const freshDb = new Database(':memory:');
    runMigrations(freshDb);
    const secondRunCount = runMigrations(freshDb);

    expect(secondRunCount).toBe(0);
    freshDb.close();
  });

  it('records every applied migration in the _migrations ledger', () => {
    const freshDb = new Database(':memory:');
    runMigrations(freshDb);

    const applied = freshDb.prepare('SELECT filename FROM _migrations').all().map((r) => r.filename);
    expect(applied).toEqual(expect.arrayContaining(['001_init.sql', '002_add_metrics_table.sql']));

    freshDb.close();
  });
});
