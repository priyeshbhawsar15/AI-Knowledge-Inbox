import { defineConfig, devices } from '@playwright/test';
import { existsSync, unlinkSync } from 'node:fs';

// Remove stale test DB before E2E runs
['./test-e2e.db', './test-e2e.db-shm', './test-e2e.db-wal'].forEach((f) => {
  if (existsSync(f)) {
    try {
      unlinkSync(f);
    } catch {
      // Ignore stale lock files
    }
  }
});

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
    {
      name: 'tablet-chrome',
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: [
    {
      command: 'npx tsx tests/fixtures/startTestServices.ts',
      url: 'http://127.0.0.1:8081/fixture-article.html',
      reuseExistingServer: false,
      timeout: 15000,
    },
    {
      command: 'npx tsx apps/api/src/index.ts',
      url: 'http://127.0.0.1:3000/health/live',
      reuseExistingServer: false,
      timeout: 15000,
      env: {
        PORT: '3000',
        NODE_ENV: 'test',
        DATABASE_PATH: './test-e2e.db',
        AI_BASE_URL: 'http://127.0.0.1:8080/v1',
        AI_API_KEY: 'test-fake-key',
        MIN_RELEVANCE_SCORE: '0.0',
      },
    },
  ],
});
