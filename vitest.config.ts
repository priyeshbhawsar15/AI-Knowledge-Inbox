import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        name: 'unit',
        test: {
          include: ['tests/smoke.spec.ts', 'tests/unit/**/*.spec.ts', 'packages/**/*.spec.ts'],
          exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
          environment: 'node',
        },
      },
      {
        name: 'web-unit',
        test: {
          include: ['apps/web/**/*.test.tsx'],
          exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
          environment: 'jsdom',
          setupFiles: ['./apps/web/src/test-setup.ts'],
        },
      },
      {
        name: 'integration',
        test: {
          include: ['tests/integration/**/*.spec.ts'],
          exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
          environment: 'node',
          testTimeout: 15000,
        },
      },
    ],
  },
});
