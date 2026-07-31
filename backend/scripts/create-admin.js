import readline from 'node:readline';
import bcrypt from 'bcryptjs';
import db from '../src/db.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt) {
  return new Promise(resolve => rl.question(prompt, resolve));
}

async function main() {
  const email = await question('Admin email: ');
  const password = await question('Admin password: ');
  rl.close();

  if (!email || !password) {
    console.error('Email and password are required.');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);

  try {
    await db.query(
      `INSERT INTO admin_users (email, password_hash)
       VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [email, hash]
    );
    console.log(`Admin user ${email} created/updated.`);
    process.exit(0);
  } catch (err) {
    console.error('Failed to create admin:', err);
    process.exit(1);
  }
}

main();
