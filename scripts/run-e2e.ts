import { execSync } from 'node:child_process';

const projects = ['desktop-chrome', 'tablet-chrome', 'mobile-chrome'];

console.log('Running E2E projects sequentially with isolated process & database lifecycles...');

for (const project of projects) {
  console.log(`\n=== Running Playwright project: ${project} ===`);
  try {
    execSync(`npx playwright test --project=${project}`, {
      stdio: 'inherit',
      env: { ...process.env },
    });
  } catch {
    console.error(`Playwright project ${project} failed!`);
    process.exit(1);
  }
}

console.log('\nAll Playwright E2E projects passed successfully with clean isolation.');
