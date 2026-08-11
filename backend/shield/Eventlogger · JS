// shield/eventLogger.js
import db from '../db.js';

/**
 * Logs a security event. This feeds your existing incident response
 * process — every detection/block is auditable after the fact.
 */
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
  await db.query(
    `INSERT INTO security_events
       (ip_address, event_type, severity, request_path, request_method, matched_pattern, payload_snippet, blocked)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [ip, eventType, severity, path, method, matchedPattern, snippet, blocked]
  );
}
