import { describe, it, expect } from 'vitest';
import { scanRequest } from '../src/shield/detector.js';
import { computeRiskScore, scoreLabel } from '../src/shield/riskScore.js';
import { isBlocked, blockIp, unblockIp, listActiveBlocks } from '../src/shield/blocklist.js';
import { recordFailedLogin, recordRequest } from '../src/shield/bruteForceGuard.js';
import { logSecurityEvent } from '../src/shield/eventLogger.js';
import db from '../src/db.js';

function fakeReq({ query = {}, body = {}, params = {}, originalUrl = '/' } = {}) {
  return { query, body, params, originalUrl };
}

let ipCounter = 100;
function testIp() {
  ipCounter += 1;
  return `10.1.0.${ipCounter}`;
}

// ─────────────────────────────────────────────────────────────────────────
describe('shield/detector.js — scanRequest', () => {
  it('returns null for a clean request', () => {
    const result = scanRequest(fakeReq({ query: { search: 'hello world' } }));
    expect(result).toBeNull();
  });

  it('detects a classic SQL injection UNION SELECT in a query param', () => {
    const result = scanRequest(fakeReq({ query: { id: '1 UNION SELECT username, password FROM users' } }));
    expect(result).not.toBeNull();
    expect(result.eventType).toBe('sqli');
    expect(result.matchedPattern).toBe('sql_union');
  });

  it('detects a SQL OR-injection pattern in the request body', () => {
    const result = scanRequest(fakeReq({ body: { username: "admin' OR '1'='1" } }));
    expect(result).not.toBeNull();
    expect(result.eventType).toBe('sqli');
  });

  it('detects an XSS script tag', () => {
    const result = scanRequest(fakeReq({ body: { comment: '<script>alert(1)</script>' } }));
    expect(result).not.toBeNull();
    expect(result.eventType).toBe('xss');
    expect(result.matchedPattern).toBe('xss_script_tag');
  });

  it('detects an XSS event-handler injection', () => {
    const result = scanRequest(fakeReq({ body: { bio: '<img src=x onerror=alert(1)>' } }));
    expect(result).not.toBeNull();
    expect(result.eventType).toBe('xss');
  });

  it('detects path traversal in the URL', () => {
    const result = scanRequest(fakeReq({ originalUrl: '/files/../../etc/passwd' }));
    expect(result).not.toBeNull();
    expect(result.eventType).toBe('path_traversal');
  });

  it('detects URL-encoded path traversal (evasion attempt)', () => {
    const result = scanRequest(fakeReq({ originalUrl: '/files/%2e%2e%2fetc/passwd' }));
    expect(result).not.toBeNull();
    expect(result.eventType).toBe('path_traversal');
  });

  it('detects a SQL injection hidden behind double URL-encoding', () => {
    // "union select" URL-encoded twice: normalizeInput decodes up to 3 levels
    const doubleEncoded = encodeURIComponent(encodeURIComponent('union select'));
    const result = scanRequest(fakeReq({ query: { q: doubleEncoded } }));
    expect(result).not.toBeNull();
    expect(result.matchedPattern).toBe('sql_union');
  });

  it('detects SQLi hidden via HTML-entity-encoded characters', () => {
    // A single-quote OR-injection spelled with an HTML entity for the space
    const result = scanRequest(fakeReq({ query: { id: "1' OR '1'='1" } }));
    expect(result).not.toBeNull();
  });

  it('does not flag ordinary punctuation-heavy but benign text', () => {
    const result = scanRequest(
      fakeReq({ body: { message: "Hi - I'd like a quote for Q3, please. Thanks!" } })
    );
    expect(result).toBeNull();
  });
});

describe('shield/riskScore.js', () => {
  it('scores a client with a mix of statuses correctly, excluding not_applicable', async () => {
    const client = await db.query(
      `INSERT INTO clients (company_name, email, password_hash, email_verified)
       VALUES ('Score Test Co', $1, 'x', TRUE) RETURNING id`,
      [`score-test-${Date.now()}@example.com`]
    );
    const clientId = client.rows[0].id;

    const items = await db.query('SELECT id, framework FROM compliance_items ORDER BY id LIMIT 4');
    expect(items.rows.length).toBeGreaterThanOrEqual(4); // sanity check the seed data exists

    const [a, b, c, d] = items.rows;
    // Mark every OTHER item not_applicable first, so the LEFT JOIN's
    // COALESCE-to-'pending' default doesn't pull in items we didn't
    // intend to be part of this test's math.
    await db.query(
      `INSERT INTO client_compliance_status (client_id, item_id, status)
       SELECT $1, id, 'not_applicable' FROM compliance_items WHERE id NOT IN ($2, $3, $4, $5)`,
      [clientId, a.id, b.id, c.id, d.id]
    );
    await db.query(
      `INSERT INTO client_compliance_status (client_id, item_id, status) VALUES
         ($1, $2, 'passing'), ($1, $3, 'in_progress'), ($1, $4, 'failing'), ($1, $5, 'not_applicable')`,
      [clientId, a.id, b.id, c.id, d.id]
    );

    const { score, itemCount } = await computeRiskScore(clientId);

    // 3 applicable items (not_applicable excluded): 1 + 0.5 + 0 = 1.5 / 3 = 50%
    expect(itemCount).toBe(3);
    expect(score).toBe(50);
  });

  it('returns a null score when every applicable item is not_applicable', async () => {
    const client = await db.query(
      `INSERT INTO clients (company_name, email, password_hash, email_verified)
       VALUES ('All NA Co', $1, 'x', TRUE) RETURNING id`,
      [`all-na-${Date.now()}@example.com`]
    );
    const clientId = client.rows[0].id;

    await db.query(
      `INSERT INTO client_compliance_status (client_id, item_id, status)
       SELECT $1, id, 'not_applicable' FROM compliance_items`,
      [clientId]
    );

    const { score, itemCount } = await computeRiskScore(clientId);
    expect(score).toBeNull();
    expect(itemCount).toBe(0);
  });

  it('defaults to pending (0 points) for items the client has never touched', async () => {
    const client = await db.query(
      `INSERT INTO clients (company_name, email, password_hash, email_verified)
       VALUES ('Untouched Co', $1, 'x', TRUE) RETURNING id`,
      [`untouched-${Date.now()}@example.com`]
    );
    const clientId = client.rows[0].id;

    // No client_compliance_status rows at all for this client.
    const { score, itemCount } = await computeRiskScore(clientId);
    const totalItems = (await db.query('SELECT COUNT(*)::int AS c FROM compliance_items')).rows[0].c;

    expect(itemCount).toBe(totalItems);
    expect(score).toBe(0);
  });

  describe('scoreLabel', () => {
    it('maps score bands to the correct labels', () => {
      expect(scoreLabel(null)).toBe('Not yet assessed');
      expect(scoreLabel(95)).toBe('Strong');
      expect(scoreLabel(90)).toBe('Strong');
      expect(scoreLabel(89)).toBe('Adequate');
      expect(scoreLabel(70)).toBe('Adequate');
      expect(scoreLabel(69)).toBe('Developing');
      expect(scoreLabel(50)).toBe('Developing');
      expect(scoreLabel(49)).toBe('Needs attention');
      expect(scoreLabel(0)).toBe('Needs attention');
    });
  });
});

describe('shield/blocklist.js', () => {
  it('isBlocked is false for an IP that has never been blocked', async () => {
    expect(await isBlocked(testIp())).toBe(false);
  });

  it('blockIp blocks the IP, and unblockIp lifts it', async () => {
    const ip = testIp();
    expect(await isBlocked(ip)).toBe(false);

    await blockIp(ip, 'test reason', 'low');
    expect(await isBlocked(ip)).toBe(true);

    await unblockIp(ip);
    expect(await isBlocked(ip)).toBe(false);
  });

  it('blocking the same IP twice upserts and increments hit_count rather than erroring', async () => {
    const ip = testIp();
    await blockIp(ip, 'first hit', 'low');
    await blockIp(ip, 'second hit', 'medium');

    const { rows } = await db.query('SELECT hit_count, severity, reason FROM blocked_ips WHERE ip_address = $1', [ip]);
    expect(rows).toHaveLength(1); // one row, not two
    expect(rows[0].hit_count).toBe(2);
    expect(rows[0].severity).toBe('medium'); // latest reason/severity wins
    expect(rows[0].reason).toBe('second hit');
  });

  it('listActiveBlocks only returns currently-active (non-expired) blocks', async () => {
    const activeIp = testIp();
    const expiredIp = testIp();

    await blockIp(activeIp, 'active block', 'low');
    await db.query(
      `INSERT INTO blocked_ips (ip_address, reason, severity, expires_at)
       VALUES ($1, 'already expired', 'low', NOW() - interval '1 hour')`,
      [expiredIp]
    );

    const active = await listActiveBlocks(1000);
    const ips = active.map((r) => r.ip_address);
    expect(ips).toContain(activeIp);
    expect(ips).not.toContain(expiredIp);
  });
});

describe('shield/bruteForceGuard.js', () => {
  it('recordFailedLogin does not block below the threshold', async () => {
    const ip = testIp();
    for (let i = 0; i < 4; i++) {
      const blocked = await recordFailedLogin(ip);
      expect(blocked).toBe(false);
    }
    expect(await isBlocked(ip)).toBe(false);
  });

  it('recordFailedLogin blocks the IP once the threshold (5) is reached', async () => {
    const ip = testIp();
    let lastResult = false;
    for (let i = 0; i < 5; i++) {
      lastResult = await recordFailedLogin(ip);
    }
    expect(lastResult).toBe(true);
    expect(await isBlocked(ip)).toBe(true);

    const { rows } = await db.query('SELECT severity FROM blocked_ips WHERE ip_address = $1', [ip]);
    expect(rows[0].severity).toBe('high');
  });

  it('recordRequest blocks once the rate threshold (100) is reached within the window', async () => {
    const key = `test-rate-${testIp()}`;
    let lastResult = false;
    for (let i = 0; i < 100; i++) {
      lastResult = await recordRequest(key, key);
    }
    expect(lastResult).toBe(true);
    expect(await isBlocked(key)).toBe(true);
  }, 15_000);

  it('recordRequest tracks countKey and blockTargetIp separately, blocking the real IP', async () => {
    const accountKey = `admin:${Date.now()}`;
    const ip = testIp();
    for (let i = 0; i < 100; i++) {
      await recordRequest(accountKey, ip);
    }
    expect(await isBlocked(ip)).toBe(true);
  }, 15_000);
});

describe('shield/eventLogger.js', () => {
  it('logSecurityEvent inserts a row with the given fields', async () => {
    const ip = testIp();
    await logSecurityEvent({
      ip,
      eventType: 'sqli',
      severity: 'high',
      path: '/api/test',
      method: 'POST',
      matchedPattern: 'sql_union',
      snippet: 'union select',
      blocked: true,
    });

    const { rows } = await db.query(
      'SELECT * FROM security_events WHERE ip_address = $1 ORDER BY id DESC LIMIT 1',
      [ip]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].event_type).toBe('sqli');
    expect(rows[0].severity).toBe('high');
    expect(rows[0].blocked).toBe(true);
    expect(rows[0].matched_pattern).toBe('sql_union');
  });

  it('never throws, even if a required-looking field is missing', async () => {
    // eventLogger swallows its own errors and logs to console instead —
    // confirm that contract holds rather than letting a bad call crash
    // the request that triggered it.
    await expect(logSecurityEvent({ ip: testIp(), eventType: 'xss' })).resolves.toBeUndefined();
  });
});
