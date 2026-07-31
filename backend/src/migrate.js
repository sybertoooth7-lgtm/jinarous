import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
import { runMigrations } from './migrations-runner.js';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

try {
  const count = await runMigrations(pool);
  console.log(`Applied ${count} migration(s).`);
  process.exit(0);
} catch (err) {
  console.error('Migration failed:', err);
  process.exit(1);
} finally {
  await pool.end();
}
