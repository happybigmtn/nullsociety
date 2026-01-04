import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.test.ts'],
    exclude: ['tests/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'lcov'],
      reportsDirectory: 'coverage',
      exclude: ['node_modules', 'dist', 'tests'],
    },
  },
  resolve: {
    extensions: ['.ts', '.js', '.json'],
  },
});
