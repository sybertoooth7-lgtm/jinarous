// backend/src/jobs/cleanup.js
// Nightly (or periodic) cleanup of expired token blocklist rows and
// stale client sessions. Prevents unbounded table growth.

import db from '../db.js';
import { logger } from '../logger.js';

const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

async function cleanupTokenBlocklist() {
  const result = await db.query(
    `DELETE FROM token_blocklist WHERE expires_at < NOW() RETURNING jti`
  );
  if (result.rowCount > 0) {
    logger.info(`[cleanup] Purged ${result.rowCount} expired token blocklist entries`);
  }
  return result.rowCount;
}

async function cleanupClientSessions() {
  const result = await db.query(
    `DELETE FROM client_sessions WHERE expires_at < NOW() RETURNING jti`
  );
  if (result.rowCount > 0) {
    logger.info(`[cleanup] Purged ${result.rowCount} expired client sessions`);
  }
  return result.rowCount;
}

async function cleanupRateLimits() {
  const result = await db.query(
    `DELETE FROM rate_limits WHERE reset_time < NOW() RETURNING key`
  );
  if (result.rowCount > 0) {
    logger.info(`[cleanup] Purged ${result.rowCount} stale rate-limit rows`);
  }
  return result.rowCount;
}

async function cleanupBlockedIps() {
  const result = await db.query(
    `DELETE FROM blocked_ips WHERE expires_at < NOW() - INTERVAL '7 days' RETURNING ip_address`
  );
  if (result.rowCount > 0) {
    logger.info(`[cleanup] Purged ${result.rowCount} expired IP blocks older than 7 days`);
  }
  return result.rowCount;
}

export async function runCleanup() {
  logger.info('[cleanup] Starting periodic cleanup job...');
  try {
    const [tokens, sessions, rates, ips] = await Promise.all([
      cleanupTokenBlocklist(),
      cleanupClientSessions(),
      cleanupRateLimits(),
      cleanupBlockedIps(),
    ]);
    logger.info(`[cleanup] Complete. tokens=${tokens}, sessions=${sessions}, rateLimits=${rates}, ipBlocks=${ips}`);
  } catch (err) {
    logger.error('[cleanup] Error during cleanup:', err.message);
  }
}

export function startCleanupScheduler() {
  // Run immediately on boot, then every 24 hours
  runCleanup().catch(() => {});
  return setInterval(() => {
    runCleanup().catch(() => {});
  }, CLEANUP_INTERVAL_MS);
}
