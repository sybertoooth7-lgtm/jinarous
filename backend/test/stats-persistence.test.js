import { describe, it, expect, vi } from 'vitest';
import db from '../src/db.js';

// This is the test that actually matters for the original bug report:
// "restart the server and your uptime counter, request counts, and
// honeypot catches reset to zero." We simulate a restart by resetting
// the ESM module cache and re-importing stats.js fresh, against the SAME
// underlying SQLite file - exactly what happens on a real redeploy.
describe('stats persistence across a simulated restart', () => {
  it('reloads cumulative counters from SQLite instead of resetting to zero', async () => {
    const statsModuleA = await import('../src/stats.js');

    statsModuleA.recordRequest(20, false);
    statsModuleA.recordRequest(30, false);
    statsModuleA.recordHoneypotBlocked();
    statsModuleA.recordContactAttempt();
    statsModuleA.recordContactSuccess();

    const requestCountBeforeRestart = statsModuleA.stats.requestCount;
    const honeypotBeforeRestart = statsModuleA.stats.honeypotBlocked;
    const contactAttemptsBeforeRestart = statsModuleA.stats.contactAttempts;

    // Simulate the flush that happens periodically / on SIGTERM in real
    // deployments (Railway sends SIGTERM before killing the container).
    statsModuleA.persistStats();

    // Simulate a process restart: reset the module registry and re-import.
    // A brand-new process would do exactly this - run stats.js's top-level
    // code again, including the loadPersistedValue() calls.
    vi.resetModules();
    const statsModuleB = await import('../src/stats.js');

    expect(statsModuleB.stats.requestCount).toBe(requestCountBeforeRestart);
    expect(statsModuleB.stats.honeypotBlocked).toBe(honeypotBeforeRestart);
    expect(statsModuleB.stats.contactAttempts).toBe(contactAttemptsBeforeRestart);

    // Uptime SHOULD reset - that's correct, not a bug (it means "time since
    // this process started"), so we only assert it exists and is small.
    expect(statsModuleB.getUptimeSeconds()).toBeLessThan(5);
  });

  it('metrics table actually contains the persisted rows', () => {
    const rows = db.prepare('SELECT key, value FROM metrics').all();
    const keys = rows.map((r) => r.key);
    expect(keys).toEqual(
      expect.arrayContaining(['requestCount', 'honeypotBlocked', 'contactAttempts', 'contactSuccesses'])
    );
  });
});
