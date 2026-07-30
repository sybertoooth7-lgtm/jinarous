import { describe, it, expect } from 'vitest';
import {
  stats,
  recordRequest,
  recordContactAttempt,
  recordContactSuccess,
  recordHoneypotBlocked,
  getAverageLatencyMs,
  getRequestsPerSecond,
  getAutoResponseRate,
  persistStats,
} from '../src/stats.js';
import db from '../src/db.js';

describe('stats.js', () => {
  it('starts with zeroed counters on a fresh database', () => {
    // Note: this only holds true because tests/setup.js points DB_PATH at a
    // brand-new temp file per test run - a real deployment persists these
    // across restarts, which is the entire point of this module.
    expect(stats.requestCount).toBe(0);
    expect(stats.contactAttempts).toBe(0);
  });

  it('recordRequest increments requestCount and tracks latency', () => {
    const before = stats.requestCount;
    recordRequest(42, false);
    recordRequest(58, false);
    expect(stats.requestCount).toBe(before + 2);
    expect(getAverageLatencyMs()).toBe(50);
  });

  it('recordRequest with isError=true increments errorCount', () => {
    const before = stats.errorCount;
    recordRequest(100, true);
    expect(stats.errorCount).toBe(before + 1);
  });

  it('caps the latency sample window at 200 entries', () => {
    for (let i = 0; i < 250; i++) recordRequest(10, false);
    expect(stats.latencies.length).toBeLessThanOrEqual(200);
  });

  it('getAutoResponseRate returns null when there have been no contact attempts yet', () => {
    // Fresh module state per file thanks to the temp DB, but guard anyway:
    if (stats.contactAttempts === 0) {
      expect(getAutoResponseRate()).toBeNull();
    }
  });

  it('recordContactAttempt/Success track the contact form success rate correctly', () => {
    const attemptsBefore = stats.contactAttempts;
    const successesBefore = stats.contactSuccesses;

    recordContactAttempt();
    recordContactAttempt();
    recordContactSuccess();

    expect(stats.contactAttempts).toBe(attemptsBefore + 2);
    expect(stats.contactSuccesses).toBe(successesBefore + 1);

    const rate = getAutoResponseRate();
    expect(rate).toBeCloseTo((stats.contactSuccesses / stats.contactAttempts) * 100, 5);
  });

  it('recordHoneypotBlocked increments the honeypot counter', () => {
    const before = stats.honeypotBlocked;
    recordHoneypotBlocked();
    expect(stats.honeypotBlocked).toBe(before + 1);
  });

  it('getRequestsPerSecond returns a non-negative number once there is uptime', () => {
    expect(getRequestsPerSecond()).toBeGreaterThanOrEqual(0);
  });

  it('persistStats writes current counters to the metrics table (the actual fix for issue #2)', () => {
    recordRequest(15, false);
    const expectedCount = stats.requestCount;

    persistStats();

    const row = db.prepare('SELECT value FROM metrics WHERE key = ?').get('requestCount');
    expect(row).toBeTruthy();
    expect(row.value).toBe(expectedCount);
  });
});
