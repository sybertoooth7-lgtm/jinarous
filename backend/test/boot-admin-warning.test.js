import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import path from 'node:path';
import pg from 'pg';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, '..');

// index.js starts a real HTTP server (it never exits on its own), so we
// spawn it as a real child process, capture its stdout for a short window
// while it boots, then kill it.
async function bootServerAndCaptureLogs(env, port) {
  // A fresh, migrated Postgres database, same approach as test/setup.js -
  // this needs to boot the real app against a database with no admin
  // users yet, which the shared suite-wide test DB won't have by the time
  // this file runs (other test files may have inserted one).
  const baseUrl = process.env.DATABASE_URL.replace(/\/[^/]+$/, '');
  const dbName = `alux_boottest_${Date.now()}`;
  const adminPool = new pg.Pool({ connectionString: `${baseUrl}/postgres` });
  await adminPool.query(`CREATE DATABASE ${dbName}`);
  await adminPool.end();

  return new Promise((resolve) => {
    const proc = spawn('node', ['src/index.js'], {
      cwd: backendRoot,
      env: {
        ...process.env,
        ...env,
        DATABASE_URL: `${baseUrl}/${dbName}`,
        PORT: String(port),
      },
    });

    let output = '';
    let resolved = false;
    const finish = async () => {
      if (resolved) return;
      resolved = true;
      proc.kill('SIGTERM');
      const cleanupPool = new pg.Pool({ connectionString: `${baseUrl}/postgres` });
      await cleanupPool.query(`DROP DATABASE IF EXISTS ${dbName}`).catch(() => {});
      await cleanupPool.end();
      resolve(output);
    };

    proc.stdout.on('data', (chunk) => {
      output += chunk.toString();
      if (output.includes('No admin users exist yet')) {
        setTimeout(finish, 200);
      }
    });
    proc.stderr.on('data', (chunk) => { output += chunk.toString(); });

    // Safety net in case the server never logs the expected line at all
    // (e.g. it crashed) - don't hang the test suite forever.
    setTimeout(finish, 8000);
  });
}

describe('boot-time admin-user warning', () => {
  it('warns when no admin users exist yet on a fresh database', async () => {
    const output = await bootServerAndCaptureLogs(
      { NODE_ENV: 'development', JWT_SECRET: 'a-sufficiently-long-random-test-secret-value-here' },
      5011
    );
    expect(output).toMatch(/No admin users exist yet/);
    expect(output).toMatch(/npm run create-admin/);
  }, 15_000);
});
