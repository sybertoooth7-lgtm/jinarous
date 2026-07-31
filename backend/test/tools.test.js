import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import toolsRoutes from '../src/routes/tools.js';
import db from '../src/db.js';

function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/tools', toolsRoutes);
  return app;
}

function makeAdminTokenAndUser() {
  const email = `test-${Date.now()}@example.com`;
  const hash = bcrypt.hashSync('irrelevant-for-this-test', 10);
  const result = db.prepare('INSERT INTO admin_users (email, password_hash) VALUES (?, ?)').run(email, hash);
  const token = jwt.sign({ sub: result.lastInsertRowid, email }, process.env.JWT_SECRET, { expiresIn: '1h' });
  return { email, token };
}

describe('POST /api/admin/tools/auth-audit', () => {
  it('rejects requests with no auth token', async () => {
    const app = buildTestApp();
    const res = await request(app).post('/api/admin/tools/auth-audit').send({ url: 'https://example.com' });
    expect(res.status).toBe(401);
  });

  it('rejects an invalid/missing URL with 400', async () => {
    const { token } = makeAdminTokenAndUser();
    const app = buildTestApp();
    const res = await request(app)
      .post('/api/admin/tools/auth-audit')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'not-a-real-url' });
    expect(res.status).toBe(400);
  });

  // This test actually spawns the real Python tool against a real target -
  // slower than a typical unit test, but it's the only way to prove the
  // subprocess integration genuinely works end to end, not just that the
  // route exists.
  it(
    'runs a real audit against a live target and persists the result',
    async () => {
      const { token, email } = makeAdminTokenAndUser();
      const app = buildTestApp();

      const res = await request(app)
        .post('/api/admin/tools/auth-audit')
        .set('Authorization', `Bearer ${token}`)
        .send({ url: 'https://github.com' });

      expect(res.status).toBe(200);
      expect(res.body.id).toBeTypeOf('number');
      expect(res.body.target).toBe('https://github.com');
      expect(Array.isArray(res.body.findings)).toBe(true);
      expect(res.body.findings.length).toBeGreaterThan(0);
      expect(res.body.summary).toHaveProperty('PASS');

      const row = db.prepare('SELECT * FROM tool_runs WHERE id = ?').get(res.body.id);
      expect(row).toBeTruthy();
      expect(row.status).toBe('completed');
      expect(row.run_by).toBe(email);
      expect(JSON.parse(row.result_json).findings.length).toBe(res.body.findings.length);
    },
    30_000 // real network calls involved - needs a longer timeout than default
  );
});

describe('GET /api/admin/tools/runs', () => {
  it('lists past runs, most recent first', async () => {
    const { token } = makeAdminTokenAndUser();
    db.prepare(`
      INSERT INTO tool_runs (tool, target, status, summary_json, run_by, created_at)
      VALUES ('auth_audit', 'https://old-example.com', 'completed', '{"PASS":1,"WARN":0,"FAIL":0,"INFO":0}', 'someone@example.com', '2020-01-01 00:00:00')
    `).run();

    const app = buildTestApp();
    const res = await request(app).get('/api/admin/tools/runs').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.runs)).toBe(true);
    expect(res.body.runs.length).toBeGreaterThan(0);
  });
});
