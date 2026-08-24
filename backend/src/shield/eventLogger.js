// backend/src/shield/eventLogger.js
import db from '../db.js';

export async function logSecurityEvent({
  ip,
  eventType,
  severity = 'medium',
  path = null,
  method = null,
  matchedPattern = null,
  snippet = null,
  blocked = false,
}) {
  try {
    await db.query(
      `INSERT INTO security_events
         (ip_address, event_type, severity, request_path, request_method, matched_pattern, payload_snippet, blocked)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [ip, eventType, severity, path, method, matchedPattern, snippet, blocked]
    );
  } catch (err) {
    console.error('[eventLogger] Failed to log security event:', err.message);
  }
}
