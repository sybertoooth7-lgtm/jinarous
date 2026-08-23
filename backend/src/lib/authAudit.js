// backend/src/lib/authAudit.js
// Pure Node.js security audit — no Python subprocess needed.

import { URL } from 'url';
import dns from 'dns/promises';

const BLOCKED_IPV4_RANGES = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24],
  ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4],
];

function ipv4ToInt(ip) {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

function isBlockedIPv4(ip) {
  const target = ipv4ToInt(ip);
  return BLOCKED_IPV4_RANGES.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (target & mask) === (ipv4ToInt(base) & mask);
  });
}

function isBlockedIPv6(ip) {
  const lower = ip.toLowerCase();
  return (
    lower === '::1' ||
    lower.startsWith('fc') ||
    lower.startsWith('fd') ||
    lower.startsWith('fe8') ||
    lower.startsWith('fe9') ||
    lower.startsWith('fea') ||
    lower.startsWith('feb') ||
    lower.startsWith('::ffff:127.')
  );
}

async function assertPublicTarget(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Target is not a valid URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Target must use http:// or https://.');
  }

  let addresses;
  try {
    addresses = await dns.lookup(url.hostname, { all: true, verbatim: true });
  } catch {
    throw new Error('Target hostname could not be resolved.');
  }
  for (const { address, family } of addresses) {
    if (family === 4 && isBlockedIPv4(address)) {
      throw new Error('Target resolves to a private or internal address — not allowed.');
    }
    if (family === 6 && isBlockedIPv6(address)) {
      throw new Error('Target resolves to a private or internal address — not allowed.');
    }
  }
}

export async function runAuthAudit(target, loginPath = null) {
  await assertPublicTarget(target);

  const url = new URL(target);
  if (loginPath) {
    url.pathname = loginPath.startsWith('/') ? loginPath : '/' + loginPath;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  let resp;
  try {
    resp = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': 'AluxPlaza-SecurityAudit/1.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
  } finally {
    clearTimeout(timeout);
  }

  const body = await resp.text();
  const headers = Object.fromEntries(resp.headers.entries());
  const headersLower = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
  );
  const bodyLower = body.toLowerCase();

  const checks = {};
  let passed = 0;
  let total = 0;

  const httpsEnforced = url.protocol === 'https:';
  checks.https_enforced = { passed: httpsEnforced, description: 'Site uses HTTPS' };
  total++; if (httpsEnforced) passed++;

  const reachable = resp.status < 500;
  checks.reachable = { passed: reachable, description: 'Target is reachable', status_code: resp.status };
  total++; if (reachable) passed++;

  const securityHeaders = {
    'strict-transport-security': 'HSTS (HTTPS enforcement header)',
    'x-frame-options': 'Clickjacking protection',
    'content-security-policy': 'Content Security Policy',
    'x-content-type-options': 'MIME sniffing protection',
    'referrer-policy': 'Referrer policy',
  };

  for (const [header, description] of Object.entries(securityHeaders)) {
    const present = header in headersLower;
    checks[`header_${header.replace(/-/g, '_')}`] = {
      passed: present,
      description,
      value: headersLower[header] || null,
    };
    total++; if (present) passed++;
  }

  const hasPasswordField = bodyLower.includes('type="password"') || bodyLower.includes("type='password'");
  checks.login_form_detected = {
    passed: hasPasswordField,
    description: 'Password input field detected (indicates login form)',
  };
  total++; if (hasPasswordField) passed++;

  const autocompleteGood =
    bodyLower.includes('autocomplete="new-password"') ||
    bodyLower.includes("autocomplete='new-password'") ||
    bodyLower.includes('autocomplete="off"') ||
    bodyLower.includes("autocomplete='off'");
  checks.password_autocomplete_safe = {
    passed: autocompleteGood,
    description: 'Password field has safe autocomplete attribute',
  };
  total++; if (autocompleteGood) passed++;

  let score = 0;
  if (httpsEnforced) score += 25;
  if (reachable) score += 10;
  const headerCount = Object.keys(securityHeaders).filter((h) => h in headersLower).length;
  score += headerCount * 10;
  if (hasPasswordField) score += 15;
  if (autocompleteGood) score += 10;

  return {
    target: url.toString(),
    login_path: loginPath,
    checks,
    summary: {
      score: Math.min(score, 100),
      total_checks: total,
      passed,
    },
  };
}
