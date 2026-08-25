import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
    projects: [
      {
        name: 'unit',
        testMatch: ['tests/smoke.spec.ts', 'tests/unit/**/*.spec.ts', 'packages/**/*.spec.ts'],
        exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
        environment: 'node',
      },
      {
        name: 'web-unit',
        testMatch: ['apps/web/**/*.test.tsx'],
        exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
        environment: 'jsdom',
        setupFiles: ['./apps/web/src/test-setup.ts'],
      },
      {
        name: 'integration',
        testMatch: ['tests/integration/**/*.spec.ts'],
        exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
        environment: 'node',
        testTimeout: 15000,
      },
    ],
  },
});
