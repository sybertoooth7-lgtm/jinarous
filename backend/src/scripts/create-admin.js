import 'dotenv/config';
import readline from 'node:readline';
import bcrypt from 'bcryptjs';
import db, { initDb } from '../db.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
  // Initialize DB connection and migrations before doing anything else.
  // This prevents the script from crashing with an unhandled rejection
  // if PostgreSQL isn't ready yet.
  await initDb();

  const email = (await ask('Admin email: ')).trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Invalid email address.');
    rl.close();
    process.exit(1);
  }

  const password = await ask('Admin password: ');
  if (!password || password.length < 8) {
    console.error('Password must be at least 8 characters.');
    rl.close();
    process.exit(1);
  }

  const confirm = await ask('Confirm password: ');
  if (password !== confirm) {
    console.error('Passwords do not match.');
    rl.close();
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);

  try {
    await db.query(
      'INSERT INTO admin_users (email, password_hash) VALUES ($1, $2) ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash',
      [email, hash]
    );
    console.log(`Admin user created/updated: ${email}`);
  } catch (err) {
    console.error('Failed to create admin user:', err.message);
    rl.close();
    process.exit(1);
  }

  rl.close();
}

main();
