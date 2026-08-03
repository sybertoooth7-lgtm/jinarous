import pg from 'pg';
const { Pool } = pg;
import { runMigrations } from './migrations-runner.js';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' && process.env.DB_SSL !== 'false'
    ? { rejectUnauthorized: process.env.DB_SSL_VERIFY !== 'false' }
    : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

try {
  await pool.query('SELECT 1');
  console.log('[db] PostgreSQL connected');
} catch (err) {
  console.error('[db] FATAL:', err.message);
  process.exit(1);
}

await runMigrations(pool);

export const db = {
  query(sql, params) {
    return pool.query(sql, params);
  },
  exec(sql) {
    return pool.query(sql);
  },
  async transaction(fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },
};

export default db;
