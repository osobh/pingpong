import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.config.ts',
        'tests/**/*.test.ts',
      ],
    },
    testTimeout: 30000, // 30s for tests with real Ollama calls
    hookTimeout: 10000,
  },
});
