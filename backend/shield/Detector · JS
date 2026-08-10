// shield/detector.js
// Pattern-based request inspection for common injection attacks.
// This is signature-based detection — fast and dependency-free, but not
// a substitute for parameterized queries / output encoding, which you
// should already have. Shield is a second layer, not the only layer.

const SQLI_PATTERNS = [
  { name: 'sql_union', regex: /\bunion\b.{0,40}\bselect\b/i },
  { name: 'sql_or_injection', regex: /\bor\b\s+['"]?\d+['"]?\s*=\s*['"]?\d+['"]?/i },
  { name: 'sql_comment', regex: /(--|#|\/\*)\s*$/ },
  { name: 'sql_stacked', regex: /;\s*(drop|delete|insert|update)\s+/i },
  { name: 'sql_sleep', regex: /\b(sleep|benchmark|pg_sleep|waitfor\s+delay)\s*\(/i },
];

const XSS_PATTERNS = [
  { name: 'xss_script_tag', regex: /<script[\s\S]*?>/i },
  { name: 'xss_event_handler', regex: /on(error|load|click|mouseover)\s*=/i },
  { name: 'xss_javascript_uri', regex: /javascript\s*:/i },
  { name: 'xss_iframe', regex: /<iframe[\s\S]*?>/i },
];

const PATH_TRAVERSAL_PATTERNS = [
  { name: 'path_traversal_dotdot', regex: /\.\.[/\\]/ },
  { name: 'path_traversal_encoded', regex: /%2e%2e[%2f%5c]/i },
];

const ALL_PATTERNS = [
  ...SQLI_PATTERNS.map(p => ({ ...p, category: 'sqli', severity: 'high' })),
  ...XSS_PATTERNS.map(p => ({ ...p, category: 'xss', severity: 'high' })),
  ...PATH_TRAVERSAL_PATTERNS.map(p => ({ ...p, category: 'path_traversal', severity: 'medium' })),
];

/**
 * Flattens req.query, req.body, req.params into a single string for scanning.
 * Keeps it shallow/cheap — deep recursive scanning is a future improvement.
 */
function extractScannableContent(req) {
  const parts = [];
  if (req.query) parts.push(JSON.stringify(req.query));
  if (req.body) parts.push(JSON.stringify(req.body));
  if (req.params) parts.push(JSON.stringify(req.params));
  if (req.originalUrl) parts.push(req.originalUrl);
  return parts.join(' ');
}

/**
 * Scans a request for known attack signatures.
 * Returns the first match found, or null if clean.
 */
export function scanRequest(req) {
  const content = extractScannableContent(req);
  if (!content) return null;

  for (const pattern of ALL_PATTERNS) {
    const match = content.match(pattern.regex);
    if (match) {
      return {
        eventType: pattern.category,
        matchedPattern: pattern.name,
        severity: pattern.severity,
        snippet: match[0].slice(0, 100), // truncated for storage
      };
    }
  }
  return null;
}
