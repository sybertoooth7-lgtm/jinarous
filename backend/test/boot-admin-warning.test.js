import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, '..');

// index.js starts a real HTTP server (it never exits on its own), so we
// spawn it as a real child process, capture its stdout for a short window
// while it boots, then kill it - the same approach used successfully for
// the manual restart-persistence verification during development.
function bootServerAndCaptureLogs(env, port) {
  return new Promise((resolve) => {
    const tmpDb = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'alux-boot-test-')), 'test.db');
    const proc = spawn('node', ['src/index.js'], {
      cwd: backendRoot,
      env: { ...process.env, ...env, DB_PATH: tmpDb, PORT: String(port) },
    });

    let output = '';
    let resolved = false;
    const finish = () => {
      if (resolved) return;
      resolved = true;
      proc.kill('SIGTERM');
      resolve(output);
    };

    proc.stdout.on('data', (chunk) => {
      output += chunk.toString();
      if (output.includes('backend listening')) {
        // Give the boot-time log lines a brief moment to fully flush,
        // then stop - more robust than a fixed timer that can be too
        // short under machine load.
        setTimeout(finish, 200);
      }
    });
    proc.stderr.on('data', (chunk) => { output += chunk.toString(); });

    // Safety net in case the server never logs the expected line at all
    // (e.g. it crashed) - don't hang the test suite forever.
    setTimeout(finish, 5000);
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
  });
});
