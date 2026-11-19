import { test, expect, type Page } from '@playwright/test';

function failOnApiCalls(page: Page) {
  const apiCalls: string[] = [];
  page.on('request', (req) => {
    if (new URL(req.url()).pathname.startsWith('/api')) apiCalls.push(req.url());
  });
  return apiCalls;
}

test.describe('Static (GitHub Pages) build', () => {
  test('library shows Google Fonts without local-only controls', async ({ page }) => {
    const apiCalls = failOnApiCalls(page);
    await page.goto('/');
    await expect(page.locator('[data-testid="grid-card"]').first()).toBeVisible();

    await expect(page.getByRole('button', { name: 'Scan Folder' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Clear Library' })).toHaveCount(0);
    await expect(page.locator('[data-testid="dedup-btn"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Local', exact: true })).toHaveCount(0);
    expect(apiCalls).toEqual([]);
  });

  test('tile previews load font files from the CDN', async ({ page }) => {
    const fontResponse = page.waitForResponse((res) => res.url().startsWith('https://cdn.jsdelivr.net/gh/google/fonts@'));
    await page.goto('/');
    const res = await fontResponse;
    expect(res.status()).toBe(200);
  });

  test('a star persists after reload', async ({ page }) => {
    await page.goto('/');
    const card = page.locator('[data-testid="grid-card"]').first();
    await card.locator('[title="Star family"]').click();
    await expect(card.locator('[title="Unstar family"]')).toBeVisible();

    await page.reload();
    await expect(page.locator('[data-testid="grid-card"]').first().locator('[title="Unstar family"]')).toBeVisible();
  });

  test('analyze opens a font from the CDN in a hash route', async ({ page }) => {
    const apiCalls = failOnApiCalls(page);
    await page.goto('/');
    await page.locator('[data-testid="grid-card"]').first().click();
    await expect(page).toHaveURL(/#\/analyze\/[0-9a-f-]+$/);
    await expect(page.getByRole('button', { name: /Change font/ })).toBeVisible({ timeout: 30_000 });

    await page.reload();
    await expect(page.getByRole('button', { name: /Change font/ })).toBeVisible({ timeout: 30_000 });
    expect(apiCalls).toEqual([]);
  });

  test('analyze without a font has no upload control', async ({ page }) => {
    await page.goto('/#/analyze');
    await expect(page.getByRole('link', { name: 'library', exact: true })).toBeVisible();
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
  });
});
