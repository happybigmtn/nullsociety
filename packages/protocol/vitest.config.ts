import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // Vitest handles .js -> .ts resolution automatically with TypeScript
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'lcov'],
      reportsDirectory: 'coverage',
      exclude: ['node_modules', 'dist'],
    },
  },
  resolve: {
    // Ensure .js imports resolve to .ts source files during test
    extensions: ['.ts', '.js', '.json'],
  },
});
