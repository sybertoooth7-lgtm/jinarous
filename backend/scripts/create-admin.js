import 'dotenv/config';
import readline from 'node:readline/promises';
import bcrypt from 'bcryptjs';
import db from '../src/db.js';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function main() {
  console.log('=== Alux Plaza: Create / Reset Admin User ===\n');

  let email = (await rl.question('Admin email: ')).trim().toLowerCase();
  while (!isValidEmail(email)) {
    email = (await rl.question('That does not look like a valid email. Try again: ')).trim().toLowerCase();
  }

  let password = await rl.question('Admin password (min 10 chars): ');
  while (password.length < 10) {
    password = await rl.question('Password too short. Enter at least 10 characters: ');
  }

  const passwordHash = bcrypt.hashSync(password, 12);

  const existing = db.prepare('SELECT id FROM admin_users WHERE email = ?').get(email);

  if (existing) {
    db.prepare('UPDATE admin_users SET password_hash = ? WHERE email = ?').run(passwordHash, email);
    console.log(`\nPassword updated for existing admin: ${email}`);
  } else {
    db.prepare('INSERT INTO admin_users (email, password_hash) VALUES (?, ?)').run(email, passwordHash);
    console.log(`\nAdmin user created: ${email}`);
  }

  rl.close();
}

main().catch((err) => {
  console.error(err);
  rl.close();
  process.exit(1);
});
