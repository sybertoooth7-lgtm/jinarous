import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.js'],
    // Each test file gets its own freshly-created, freshly-migrated
    // Postgres database (see test/setup.js) and drops it in an afterAll
    // hook. Keeping this false avoids any chance of two files' setup
    // hooks racing on database creation at the same instant.
    fileParallelism: false,
  },
});
