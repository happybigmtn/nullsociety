import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.test.ts'],
    exclude: ['tests/**', 'node_modules/**'],
  },
  resolve: {
    extensions: ['.ts', '.js', '.json'],
  },
});
