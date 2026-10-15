import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.js'],
    fileParallelism: false,
    // beforeEach deletes + reseeds ~107 foods; remote Neon latency exceeds the 10s default
    hookTimeout: 60000,
    testTimeout: 30000,
  },
});
