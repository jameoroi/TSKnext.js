import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const srcDirectory = fileURLToPath(new URL('./src/', import.meta.url));

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov'],
      thresholds: {
        statements: 80,
        lines: 80,
        branches: 80,
        functions: 80,
      },
    },
  },
  resolve: { alias: { '@': srcDirectory } },
});
