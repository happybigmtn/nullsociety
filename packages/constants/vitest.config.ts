import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'lcov'],
      reportsDirectory: 'coverage',
      exclude: ['node_modules', 'dist'],
    },
  },
  resolve: {
    extensions: ['.ts', '.js', '.json'],
  },
});
