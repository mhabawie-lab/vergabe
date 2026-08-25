import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      // `server-only` throws outside a React Server Component. The modules
      // under test are server modules, so it is stubbed rather than removed
      // from the source — the guard stays in place for the real build.
      'server-only': path.resolve(import.meta.dirname, 'tests/stubs/server-only.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // The import pipeline touches several modules per case; a generous but
    // finite timeout keeps a hang from stalling CI.
    testTimeout: 15_000,
  },
});
