// shield/bruteForceGuard.js
// Tracks failed-login and rapid-request patterns per IP in-memory,
// escalating to an automatic block once a threshold is crossed.
//
// NOTE: in-memory counters reset on server restart and don't share state
// across multiple instances. If Alux Plaza ever runs more than one backend
// instance, move these counts into Postgres or Redis. For a single-instance
// Railway deployment this is fine to start with.

import { blockIp } from './blocklist.js';
import { logSecurityEvent } from './eventLogger.js';

const FAILED_LOGIN_THRESHOLD = 5;      // failed attempts
const FAILED_LOGIN_WINDOW_MS = 5 * 60 * 1000; // within 5 minutes
const REQUEST_RATE_THRESHOLD = 100;    // requests
const REQUEST_RATE_WINDOW_MS = 60 * 1000;     // within 1 minute

const failedLogins = new Map(); // ip -> array of timestamps
const requestCounts = new Map(); // ip -> array of timestamps

function pruneOld(timestamps, windowMs) {
  const cutoff = Date.now() - windowMs;
  return timestamps.filter(t => t > cutoff);
}

/**
 * Call this from your login route whenever authentication fails.
 */
export async function recordFailedLogin(ip) {
  const existing = pruneOld(failedLogins.get(ip) || [], FAILED_LOGIN_WINDOW_MS);
  existing.push(Date.now());
  failedLogins.set(ip, existing);

  if (existing.length >= FAILED_LOGIN_THRESHOLD) {
    await logSecurityEvent({ ip, eventType: 'brute_force', severity: 'high', blocked: true });
    await blockIp(ip, `${existing.length} failed login attempts in ${FAILED_LOGIN_WINDOW_MS / 60000}min`, 'high');
    failedLogins.delete(ip);
    return true; // signal caller that this IP is now blocked
  }
  return false;
}

/**
 * Call this from Shield middleware on every request to track abnormal volume.
 */
export async function recordRequest(ip) {
  const existing = pruneOld(requestCounts.get(ip) || [], REQUEST_RATE_WINDOW_MS);
  existing.push(Date.now());
  requestCounts.set(ip, existing);

  if (existing.length >= REQUEST_RATE_THRESHOLD) {
    await logSecurityEvent({ ip, eventType: 'rate_abuse', severity: 'medium', blocked: true });
    await blockIp(ip, `${existing.length} requests in ${REQUEST_RATE_WINDOW_MS / 1000}s`, 'medium');
    requestCounts.delete(ip);
    return true;
  }
  return false;
}
