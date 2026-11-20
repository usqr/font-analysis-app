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
    const star = () => page.locator('[data-testid="grid-card"]').first().getByRole('button', { name: /^Star / });
    await expect(star()).toHaveAttribute('aria-pressed', 'false');
    await star().click();
    await expect(star()).toHaveAttribute('aria-pressed', 'true');

    await page.reload();
    await expect(star()).toHaveAttribute('aria-pressed', 'true');
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

  test('analyze without a font offers an upload and samples that load from the app base', async ({ page }) => {
    const apiCalls = failOnApiCalls(page);
    await page.goto('/#/analyze');
    await expect(page.locator('input[type="file"]')).toHaveCount(1);
    await page.getByRole('button', { name: /Lato/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Lato' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('tab', { name: 'Glyphs' })).toHaveCount(0);
    expect(apiCalls).toEqual([]);
  });

  test('compare shows two weights of a variable font from the tray', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('radio', { name: 'Variable' }).check({ force: true });
    const card = page.locator('[data-testid="grid-card"]').first();
    await card.hover();
    await card.getByRole('button', { name: /^Add .* to compare$/ }).click();
    const menu = page.getByRole('dialog', { name: 'Add styles to compare' });
    const boxes = menu.locator('input[type="checkbox"]');
    await boxes.first().check();
    await boxes.last().check();
    await page.keyboard.press('Escape');
    await page.getByRole('region', { name: 'Compare tray' }).getByRole('button', { name: 'Compare 2' }).click();
    await expect(page).toHaveURL(/#\/compare\?ids=[^,]+@\d+,[^,]+@\d+$/);
    await expect(page.getByRole('heading', { name: 'Comparing 2 fonts' })).toBeVisible();
    await expect(page.locator('svg.stage text')).toHaveCount(2 + 5, { timeout: 30_000 });
  });
});
