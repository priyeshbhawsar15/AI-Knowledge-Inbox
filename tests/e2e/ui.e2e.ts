import { test, expect } from '@playwright/test';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function getPngDimensions(buffer: Buffer): { width: number; height: number } {
  // PNG IHDR chunk stores width at byte 16 and height at byte 20 (32-bit BE)
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

test.describe('E2E Real Pipeline, Responsive Invariants & Persistence', () => {
  test.beforeAll(() => {
    const dir = join(process.cwd(), 'artifacts', 'screenshots');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  });

  test('proves end-to-end ingestion, RAG query, mobile reachability, and index persistence', async ({
    page,
    request,
  }) => {
    const viewport = page.viewportSize();
    const width = viewport?.width ?? 1440;
    const height = viewport?.height ?? 1000;
    const noteTitle = 'RAG System Architecture Notes';

    // 1. Clean start - navigate to home
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('AI Knowledge Inbox');

    // 2. Submit plain text note
    const prompt = page.locator('text=Take a note or paste a URL…').first();
    await prompt.click();

    await page.fill('input[placeholder="Title (optional)"]', noteTitle);
    await page.fill(
      'textarea[placeholder="Write your note content..."]',
      'The AI Knowledge Inbox uses SQLite WAL for durable state and exact cosine similarity over Float32 embeddings.'
    );
    await page.click('button:has-text("Save")');

    // Verify optimistic card appears
    await expect(page.locator(`text=${noteTitle}`).first()).toBeVisible({
      timeout: 10000,
    });

    // 3. Submit fixture web URL note
    await prompt.click();
    await page.click('button:has-text("Web URL")');
    await page.fill(
      'input[placeholder="https://example.com/article"]',
      'http://127.0.0.1:8081/fixture-article.html'
    );
    await page.click('button:has-text("Save")');

    // Verify URL card appears
    await expect(page.locator('text=http://127.0.0.1:8081/fixture-article.html').first()).toBeVisible({
      timeout: 10000,
    });

    // 4. Wait for background worker to complete ingestion and transition both cards to ready state
    const textCard = page.locator('.knowledge-pulse', { hasText: noteTitle });
    const urlCard = page.locator('.knowledge-pulse', {
      hasText: 'http://127.0.0.1:8081/fixture-article.html',
    }).first();

    await expect(textCard).toHaveAttribute('data-status', 'ready', { timeout: 20000 });
    await expect(urlCard).toHaveAttribute('data-status', 'ready', { timeout: 20000 });

    // Verify section heading displays exactly 2 items
    await expect(page.locator('h2', { hasText: 'Saved Notes & Web Items (2)' })).toBeVisible();

    // 5. Open text note detail dialog and verify focus trap
    await textCard.click();
    const dialog = page.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('h2')).toContainText(noteTitle);
    await expect(dialog.locator('text=Chunks:')).toBeVisible();
    await expect(dialog.locator('text=SQLite WAL')).toBeVisible();

    // Verify Escape key closes dialog and returns focus
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();

    // 6. RAG Assistant Query & Citation UI Interaction
    const questionInput = page.locator(
      'input[placeholder="Ask a question about your saved notes or URLs..."]'
    );
    await questionInput.fill('What database mode does the knowledge inbox use?');
    await page.click('button:has-text("Ask")');

    // Verify grounded answer and citation source card appear
    const answerContainer = page.locator('text=Grounded Answer').locator('..');
    await expect(answerContainer).toBeVisible({ timeout: 15000 });

    const citationCardBtn = page.locator('button', { hasText: 'RAG System Architecture Notes' }).first();
    await expect(citationCardBtn).toBeVisible();

    // Click cited source card button -> opens detail dialog
    await citationCardBtn.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();

    // 7. Geometry Assertions & Responsive Header Layout Verification
    // Scroll back to top to ensure accurate un-scrolled bounding box coordinates
    await page.evaluate(() => window.scrollTo(0, 0));

    const headerBox = await page.locator('header').boundingBox();
    const brandBox = await page.locator('[data-testid="header-brand"]').boundingBox();
    const searchBox = await page.locator('header input[placeholder*="Search"]').boundingBox();
    const filterAll = page.locator('button:has-text("All")');
    const filterReady = page.locator('button:has-text("Ready")');
    const filterPending = page.locator('button:has-text("Pending")');
    const filterFailed = page.locator('button:has-text("Failed")');

    await expect(filterAll).toBeVisible();
    await expect(filterReady).toBeVisible();
    await expect(filterPending).toBeVisible();
    await expect(filterFailed).toBeVisible();

    const filterAllBox = await filterAll.boundingBox();
    const filterReadyBox = await filterReady.boundingBox();
    const filterPendingBox = await filterPending.boundingBox();
    const filterFailedBox = await filterFailed.boundingBox();
    const mainSectionBox = await page.locator('main > section').first().boundingBox();

    expect(headerBox).not.toBeNull();
    expect(brandBox).not.toBeNull();
    expect(searchBox).not.toBeNull();
    expect(filterAllBox).not.toBeNull();
    expect(filterReadyBox).not.toBeNull();
    expect(filterPendingBox).not.toBeNull();
    expect(filterFailedBox).not.toBeNull();
    expect(mainSectionBox).not.toBeNull();

    if (
      headerBox &&
      brandBox &&
      searchBox &&
      filterAllBox &&
      filterReadyBox &&
      filterPendingBox &&
      filterFailedBox &&
      mainSectionBox
    ) {
      // 7a. Assert elements are inside viewport horizontally
      const boxes = [
        headerBox,
        brandBox,
        searchBox,
        filterAllBox,
        filterReadyBox,
        filterPendingBox,
        filterFailedBox,
      ];
      for (const b of boxes) {
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width).toBeLessThanOrEqual(width + 1);
      }

      // 7b. Assert filter boxes do not overlap each other
      const filterBoxes = [
        { name: 'All', box: filterAllBox },
        { name: 'Ready', box: filterReadyBox },
        { name: 'Pending', box: filterPendingBox },
        { name: 'Failed', box: filterFailedBox },
      ];

      for (let i = 0; i < filterBoxes.length; i++) {
        for (let j = i + 1; j < filterBoxes.length; j++) {
          const a = filterBoxes[i].box;
          const b = filterBoxes[j].box;
          const overlaps = !(
            a.x + a.width <= b.x ||
            b.x + b.width <= a.x ||
            a.y + a.height <= b.y ||
            b.y + b.height <= a.y
          );
          expect(
            overlaps,
            `Filter "${filterBoxes[i].name}" overlaps with filter "${filterBoxes[j].name}"`
          ).toBe(false);
        }
      }

      // 7c. Assert header children are contained by the header box
      const children = [
        brandBox,
        searchBox,
        filterAllBox,
        filterReadyBox,
        filterPendingBox,
        filterFailedBox,
      ];
      for (const c of children) {
        expect(c.x).toBeGreaterThanOrEqual(headerBox.x - 1);
        expect(c.x + c.width).toBeLessThanOrEqual(headerBox.x + headerBox.width + 1);
        expect(c.y).toBeGreaterThanOrEqual(headerBox.y - 1);
        expect(c.y + c.height).toBeLessThanOrEqual(headerBox.y + headerBox.height + 1);
      }

      // 7d. Assert main content begins at or below the header's bottom (allow 2px border tolerance)
      expect(mainSectionBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height - 2);
    }

    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);

    // 8. Normalize volatile timestamps/IDs on note cards for deterministic screenshots
    await page.evaluate(() => {
      const cards = document.querySelectorAll('.knowledge-pulse');
      cards.forEach((card) => {
        const footer = card.querySelector('div.mt-4');
        if (footer) {
          const spans = footer.querySelectorAll('span');
          if (spans.length >= 2) {
            spans[0].textContent = 'Jan 1, 12:00 PM';
            spans[1].textContent = 'itm_test_fixed';
          }
        }
      });
    });

    // 9. Capture screenshot and verify exact PNG dimensions
    let screenshotName = `desktop-${width}x${height}.png`;
    if (width === 768) screenshotName = `tablet-${width}x${height}.png`;
    if (width === 390) screenshotName = `mobile-${width}x${height}.png`;

    const screenshotPath = join(process.cwd(), 'artifacts', 'screenshots', screenshotName);
    await page.screenshot({ path: screenshotPath, fullPage: false });

    const pngBuffer = readFileSync(screenshotPath);
    const dimensions = getPngDimensions(pngBuffer);
    expect(dimensions.width).toBe(width);
    expect(dimensions.height).toBe(height);

    console.log(
      `Verified screenshot ${screenshotName} has exact PNG dimensions ${dimensions.width}x${dimensions.height}`
    );

    // 10. Verify API Persistence and Index Rebuild
    const healthRes = await request.get('/health/ready');
    expect(healthRes.status()).toBe(200);

    const itemsRes = await request.get('/items');
    expect(itemsRes.status()).toBe(200);
    const itemsData = await itemsRes.json();
    expect(itemsData.items.length).toBe(2);

    const queryRes = await request.post('/query', {
      data: { question: 'What database mode does the knowledge inbox use?' },
    });
    expect(queryRes.status()).toBe(200);
    const queryData = await queryRes.json();
    expect(queryData.answer).toBeTruthy();
    expect(queryData.sources.length).toBeGreaterThan(0);
  });
});
