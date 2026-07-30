import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import contactRoutes from '../src/routes/contact.js';
import db from '../src/db.js';

function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/contact', contactRoutes);
  return app;
}

describe('POST /api/contact', () => {
  it('accepts a valid submission and stores it in the database', async () => {
    const app = buildTestApp();
    const res = await request(app)
      .post('/api/contact')
      .send({
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        company: 'Acme Ltd',
        message: 'Interested in an access control audit.',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.id).toBe('number');

    const row = db.prepare('SELECT * FROM submissions WHERE id = ?').get(res.body.id);
    expect(row).toBeTruthy();
    expect(row.email).toBe('jane@example.com');
  });

  it('rejects a submission missing required fields with 400', async () => {
    const app = buildTestApp();
    const res = await request(app).post('/api/contact').send({ firstName: 'OnlyFirstName' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed.');
  });

  it('rejects a submission with an invalid email with 400', async () => {
    const app = buildTestApp();
    const res = await request(app).post('/api/contact').send({
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'not-an-email',
    });

    expect(res.status).toBe(400);
  });

  it('rejects a bot-shaped submission that fills in the honeypot field', async () => {
    const app = buildTestApp();
    const res = await request(app).post('/api/contact').send({
      firstName: 'Bot',
      lastName: 'Spam',
      email: 'bot@spam.com',
      website: 'http://spam.example.com', // honeypot field - real users never fill this in
    });

    expect(res.status).toBe(400);
  });

  it('does not store a rejected/honeypot submission in the database', async () => {
    const app = buildTestApp();
    const countBefore = db.prepare('SELECT COUNT(*) AS c FROM submissions').get().c;

    await request(app).post('/api/contact').send({
      firstName: 'Bot',
      lastName: 'Spam',
      email: 'bot2@spam.com',
      website: 'http://spam.example.com',
    });

    const countAfter = db.prepare('SELECT COUNT(*) AS c FROM submissions').get().c;
    expect(countAfter).toBe(countBefore);
  });
});
