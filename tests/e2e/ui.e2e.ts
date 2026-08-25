import { test, expect } from '@playwright/test';
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

test.describe('E2E UI & Responsive Invariants', () => {
  test.beforeAll(() => {
    const dir = join(process.cwd(), 'artifacts', 'screenshots');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  });

  test('exercises primary flows, verifies layout and captures screenshots', async ({ page }) => {
    // 1. Navigate to home
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('AI Knowledge Inbox');

    // 2. Click composer prompt to expand
    const prompt = page.locator('text=Take a note or paste a URL…').first();
    await prompt.click();

    // 3. Fill text note form
    await page.fill('input[placeholder="Title (optional)"]', 'RAG System Architecture Notes');
    await page.fill('textarea[placeholder="Write your note content..."]', 'The AI Knowledge Inbox uses SQLite WAL for durable state and exact cosine similarity over Float32 embeddings.');
    await page.click('button:has-text("Save")');

    // 4. Verify note card appears
    await expect(page.locator('text=RAG System Architecture Notes').first()).toBeVisible({ timeout: 10000 });

    // 5. Check no horizontal overflow
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);

    // 6. Capture screenshot per project viewport
    const viewport = page.viewportSize();
    const width = viewport?.width ?? 1440;
    const height = viewport?.height ?? 1000;

    let screenshotName = `desktop-${width}x${height}.png`;
    if (width === 768) screenshotName = `tablet-${width}x${height}.png`;
    if (width === 390) screenshotName = `mobile-${width}x${height}.png`;

    const screenshotPath = join(process.cwd(), 'artifacts', 'screenshots', screenshotName);
    await page.screenshot({ path: screenshotPath, fullPage: false });

    console.log(`Saved screenshot ${screenshotName} (${width}x${height})`);
  });
});
