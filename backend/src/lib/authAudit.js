// backend/src/lib/authAudit.js
// Pure Node.js authentication audit — replaces auth_audit.py.
// No subprocess, no python3 dependency, no child_process attack surface.

const MAX_BODY_SIZE = 1024 * 1024; // 1 MB
const REQUEST_TIMEOUT = 15_000;    // 15 seconds

/**
 * Audit a target URL for authentication security best practices.
 * @param {string} target     Full URL (e.g. https://example.com)
 * @param {string} [loginPath]  Optional path override (e.g. /login)
 * @returns {Promise<object>}  Audit result JSON matching auth_audit.py output
 */
export async function audit(target, loginPath) {
  const results = {
    target,
    login_path: loginPath || null,
    checks: {},
    summary: {
      score: 0,
      total_checks: 0,
      passed: 0,
    },
  };

  // --- Parse target ---
  let parsed;
  try {
    parsed = new URL(target);
  } catch (e) {
    return { error: `Invalid URL: ${e.message}` };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { error: 'Only http:// and https:// schemes are supported.' };
  }

  // Build audit URL
  let auditUrl = target;
  if (loginPath) {
    let path = loginPath;
    if (!path.startsWith('/')) path = '/' + path;
    parsed.pathname = path;
    auditUrl = parsed.toString();
  }

  // --- Check 1: HTTPS enforcement ---
  const httpsEnforced = parsed.protocol === 'https:';
  results.checks.https_enforced = {
    passed: httpsEnforced,
    description: 'Site uses HTTPS',
  };
  results.summary.total_checks += 1;
  if (httpsEnforced) results.summary.passed += 1;

  // --- Fetch the page ---
  let headers = {};
  let body = '';
  let statusCode = 0;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const resp = await fetch(auditUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'AluxPlaza-SecurityAudit/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    });
    clearTimeout(timeoutId);

    statusCode = resp.status;
    headers = Object.fromEntries(resp.headers.entries());

    // Read up to MAX_BODY_SIZE
    const reader = resp.body?.getReader();
    if (reader) {
      let received = 0;
      const chunks = [];
      while (received < MAX_BODY_SIZE) {
        const { done, value } = await reader.read();
        if (done) break;
        const toTake = Math.min(value.length, MAX_BODY_SIZE - received);
        chunks.push(value.slice(0, toTake));
        received += toTake;
        if (received >= MAX_BODY_SIZE) break;
      }
      reader.cancel?.();
      const all = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) {
        all.set(chunk, offset);
        offset += chunk.length;
      }
      body = new TextDecoder('utf-8', { fatal: false }).decode(all);
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      return { error: 'Request failed: timeout' };
    }
    return { error: `Request failed: ${err.message}` };
  }

  results.checks.reachable = {
    passed: statusCode < 500,
    description: 'Target is reachable',
    status_code: statusCode,
  };
  results.summary.total_checks += 1;
  if (statusCode < 500) results.summary.passed += 1;

  // --- Check 2: Security headers ---
  const headersLower = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
  );
  const securityHeaders = {
    'strict-transport-security': 'HSTS (HTTPS enforcement header)',
    'x-frame-options': 'Clickjacking protection',
    'content-security-policy': 'Content Security Policy',
    'x-content-type-options': 'MIME sniffing protection',
    'referrer-policy': 'Referrer policy',
  };

  for (const [header, description] of Object.entries(securityHeaders)) {
    const present = header in headersLower;
    results.checks[`header_${header.replace(/-/g, '_')}`] = {
      passed: present,
      description,
      value: headersLower[header] || null,
    };
    results.summary.total_checks += 1;
    if (present) results.summary.passed += 1;
  }

  // --- Check 3: Login form detection ---
  const bodyLower = body.toLowerCase();
  const hasPasswordField = bodyLower.includes('type="password"') || bodyLower.includes("type='password'");
  results.checks.login_form_detected = {
    passed: hasPasswordField,
    description: 'Password input field detected (indicates login form)',
  };
  results.summary.total_checks += 1;
  if (hasPasswordField) results.summary.passed += 1;

  // --- Check 4: Password field autocomplete ---
  const autocompleteGood =
    bodyLower.includes('autocomplete="new-password"') ||
    bodyLower.includes("autocomplete='new-password'") ||
    bodyLower.includes('autocomplete="off"') ||
    bodyLower.includes("autocomplete='off'");
  results.checks.password_autocomplete_safe = {
    passed: autocompleteGood,
    description: 'Password field has safe autocomplete attribute',
  };
  results.summary.total_checks += 1;
  if (autocompleteGood) results.summary.passed += 1;

  // --- Calculate score ---
  let score = 0;
  if (httpsEnforced) score += 25;
  if (statusCode < 500) score += 10;
  const headerCount = Object.keys(securityHeaders).filter((h) => h in headersLower).length;
  score += headerCount * 10;
  if (hasPasswordField) score += 15;
  if (autocompleteGood) score += 10;

  results.summary.score = Math.min(score, 100);
  return results;
}
