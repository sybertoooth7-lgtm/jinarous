// shield/blocklist.js
import db from '../db.js';
import { sendAlert } from '../monitoring.js';

const DEFAULT_BLOCK_DURATIONS = {
  low: 15 * 60 * 1000,        // 15 min
  medium: 60 * 60 * 1000,     // 1 hour
  high: 6 * 60 * 60 * 1000,   // 6 hours
  critical: 24 * 60 * 60 * 1000, // 24 hours
};

// Only alert for severities at or above this level, so routine low/medium
// noise (a single odd request, a mild rate blip) doesn't spam the channel.
// high and critical are the ones worth a human looking at right away.
const ALERT_SEVERITIES = new Set(['high', 'critical']);

/**
 * Checks if an IP is currently blocked (and not expired).
 */
export async function isBlocked(ip) {
  const result = await db.query(
    `SELECT id FROM blocked_ips
     WHERE ip_address = $1
       AND (expires_at IS NULL OR expires_at > NOW())
     LIMIT 1`,
    [ip]
  );
  return result.rows.length > 0;
}

/**
 * Blocks an IP automatically. If already blocked, extends/refreshes the block
 * and increments hit_count instead of creating a duplicate row.
 */
export async function blockIp(ip, reason, severity = 'medium') {
  const durationMs = DEFAULT_BLOCK_DURATIONS[severity] ?? DEFAULT_BLOCK_DURATIONS.medium;
  const expiresAt = new Date(Date.now() + durationMs);

  await db.query(
    `INSERT INTO blocked_ips (ip_address, reason, severity, expires_at, auto_blocked, hit_count)
     VALUES ($1, $2, $3, $4, TRUE, 1)
     ON CONFLICT (ip_address) WHERE expires_at IS NULL OR expires_at > NOW()
     DO UPDATE SET
       expires_at = EXCLUDED.expires_at,
       hit_count = blocked_ips.hit_count + 1,
       reason = EXCLUDED.reason,
       severity = EXCLUDED.severity`,
    [ip, reason, severity, expiresAt]
  );

  if (ALERT_SEVERITIES.has(severity)) {
    // Throttle key is per-IP-per-severity, not per-message: an attacker
    // retrying the same payload shouldn't generate a fresh alert every
    // time just because hit_count changed in the message text.
    await sendAlert(
      `🛡️ Shield auto-blocked ${ip} (${severity}): ${reason}`,
      `shield-block-${ip}-${severity}`
    );
  }
}

/**
 * Manually unblock an IP (e.g. after confirming a false positive).
 */
export async function unblockIp(ip) {
  await db.query(
    `UPDATE blocked_ips SET expires_at = NOW() WHERE ip_address = $1`,
    [ip]
  );
}

/**
 * Returns currently active blocks, most recent first — useful for an admin endpoint.
 */
export async function listActiveBlocks(limit = 100) {
  const result = await db.query(
    `SELECT ip_address, reason, severity, blocked_at, expires_at, hit_count
     FROM blocked_ips
     WHERE expires_at IS NULL OR expires_at > NOW()
     ORDER BY blocked_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}
