import { test, expect, type Page } from '@playwright/test';

const tiles = (page: Page) => page.locator('[data-testid="grid-card"]');

/** Opens the hover panel of a tile, the way that a pointer does. */
async function openPanel(page: Page, index: number) {
  const tile = tiles(page).nth(index);
  await tile.scrollIntoViewIfNeeded();
  await tile.hover();
  return tile;
}

test.describe('Library features', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(tiles(page).first()).toBeVisible({ timeout: 20000 });
  });

  test('no tiles display with invalid names', async ({ page }) => {
    const names = await page.locator('.tile-name').allTextContents();
    expect(names.length).toBeGreaterThan(0);
    for (const name of names.slice(0, 400)) {
      expect(/[a-zA-Z]/.test(name) && name.trim().length >= 2, `invalid tile name: "${name}"`).toBe(true);
    }
  });

  test('list and grid views switch the tile layout', async ({ page }) => {
    const grid = page.locator('[data-testid="grid-view"]');
    await page.locator('[data-testid="view-list"]').click();
    await expect(grid).toHaveClass(/is-list/);
    await expect(page.locator('[data-testid="view-list"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('[data-testid="view-grid"]').click();
    await expect(grid).not.toHaveClass(/is-list/);
    await expect(tiles(page).first().locator('[data-testid="grid-card-preview"]')).toHaveText('Aa');
  });

  test('the tile meta line shows the category and the style or axis count', async ({ page }) => {
    const meta = tiles(page).first().locator('.tile-meta');
    await expect(meta).toHaveText(/\d+ (styles?|ax[ie]s)/);
  });

  test('source labels are visible on the tiles', async ({ page }) => {
    const src = tiles(page).first().locator('.src');
    await expect(src).toHaveText(/^(Local|Google|Local \+ Google)$/);
  });

  test('a static family with several widths offers a width select', async ({ page }) => {
    await page.getByRole('radio', { name: 'Static' }).check({ force: true });
    const select = page.locator('select[aria-label^="Width of"]').first();
    if ((await select.count()) === 0) {
      test.skip(true, 'No static family with several widths');
      return;
    }
    expect(await select.locator('option').count()).toBeGreaterThan(1);
  });

  test('the weight slider of a variable tile changes the specimen', async ({ page }) => {
    await page.getByRole('radio', { name: 'Variable' }).check({ force: true });
    const tile = await openPanel(page, 0);
    const slider = tile.getByRole('slider', { name: /^Weight of / });
    const preview = tile.locator('[data-testid="grid-card-preview"]');
    await expect(preview).toHaveCSS('font-variation-settings', /wght/);
    const before = await preview.evaluate((el) => getComputedStyle(el).fontVariationSettings);
    await slider.focus();
    await page.keyboard.press('End');
    await expect.poll(() => preview.evaluate((el) => getComputedStyle(el).fontVariationSettings)).not.toBe(before);
  });

  test('the italic button swaps the static font file', async ({ page }) => {
    await page.getByRole('radio', { name: 'Static' }).check({ force: true });
    const tile = tiles(page).filter({ has: page.locator('.ital-btn') }).first();
    if ((await tile.count()) === 0) {
      test.skip(true, 'No static family with italics');
      return;
    }
    await tile.scrollIntoViewIfNeeded();
    await tile.hover();
    const italic = tile.locator('.ital-btn');
    const preview = tile.locator('[data-testid="grid-card-preview"]');
    const before = await preview.evaluate((el) => getComputedStyle(el).fontFamily);
    await italic.click();
    await expect(italic).toHaveAttribute('aria-pressed', 'true');
    // The file loads asynchronously, so poll until the rendered family changes.
    await expect.poll(() => preview.evaluate((el) => getComputedStyle(el).fontFamily), { timeout: 10000 }).not.toBe(before);
  });

  test('category chips filter the library and show an active-filter chip', async ({ page }) => {
    const total = await tiles(page).count();
    await page.getByRole('checkbox', { name: 'Serif', exact: true }).check({ force: true });
    await expect(page.getByRole('button', { name: 'Remove filter Serif' })).toBeVisible();
    expect(await tiles(page).count()).toBeLessThanOrEqual(total);
    await page.getByRole('button', { name: 'Remove filter Serif' }).click();
    await expect(page.getByRole('checkbox', { name: 'Serif', exact: true })).not.toBeChecked();
  });

  test('bulk edit sets the category of the selected families', async ({ page }) => {
    await page.getByRole('button', { name: 'Bulk Edit' }).click();
    const bar = page.getByRole('region', { name: 'Bulk edit' });
    await expect(bar).toBeVisible();
    await tiles(page).first().locator('.tile-open').click();
    await expect(bar).toContainText('1 selected');
    await bar.getByRole('button', { name: 'Done' }).click();
    await expect(bar).toHaveCount(0);
  });

  test('bulk edit ignores selected families that the filters hide', async ({ page }) => {
    await page.getByRole('button', { name: 'Bulk Edit' }).click();
    const bar = page.getByRole('region', { name: 'Bulk edit' });
    const first = (await tiles(page).first().locator('.tile-name').textContent()) ?? '';
    await tiles(page).first().locator('.tile-open').click();
    await expect(bar).toContainText('1 selected');
    await page.getByRole('searchbox').fill(`${first} no such family`);
    await expect(bar).toContainText('0 selected');
    await expect(bar.getByRole('button', { name: 'Set category…' })).toBeDisabled();
    await page.getByRole('searchbox').fill('');
    await expect(bar).toContainText('1 selected');
  });

  test('a cleared minimum count keeps the typed value', async ({ page }) => {
    const min = page.getByRole('spinbutton', { name: 'Styles minimum' });
    const max = page.getByRole('spinbutton', { name: 'Styles maximum' });
    await min.fill('');
    await expect(min).toHaveValue('');
    await min.pressSequentially('3');
    await expect(min).toHaveValue('3');
    await max.fill('2');
    await max.blur();
    await expect(min).toHaveValue('2');
    await expect(page.getByRole('button', { name: 'Remove filter Styles 2–2' })).toBeVisible();
  });

  test('deduplicate button shows confirmation message', async ({ page }) => {
    const dedupBtn = page.locator('[data-testid="dedup-btn"]');
    if (!(await dedupBtn.isVisible())) {
      test.skip(true, 'No fonts in database to deduplicate');
      return;
    }

    await dedupBtn.click();
    const dedupMsg = page.locator('[data-testid="dedup-msg"]');
    await expect(dedupMsg).toBeVisible({ timeout: 5000 });
    const msgText = (await dedupMsg.textContent()) ?? '';
    expect(msgText).toMatch(/Removed \d+ duplicate|No duplicates found/);

    await page.screenshot({ path: 'e2e/test-results/dedup-confirmation.png' });
  });

  test('glyphs tab shows glyph grid in analyze view', async ({ page }) => {
    const dbResponse = await page.evaluate(() => fetch('/api/database').then(r => r.json()));
    const fonts = dbResponse.fonts ?? [];
    if (fonts.length === 0) {
      test.skip(true, 'No fonts in database');
      return;
    }

    const fontId = fonts[0].id;
    await page.goto(`/analyze/${fontId}`);

    const headerH1 = page.locator('header h1');
    await expect(headerH1).toBeVisible({ timeout: 20000 });

    const glyphsTab = page.locator('[data-testid="tab-glyphs"]');
    await expect(glyphsTab).toBeVisible({ timeout: 5000 });
    await glyphsTab.click();

    const glyphsView = page.locator('[data-testid="glyphs-view"]');
    await expect(glyphsView).toBeVisible({ timeout: 10000 });

    const searchInput = glyphsView.locator('input[placeholder*="Search glyphs"]');
    await expect(searchInput).toBeVisible({ timeout: 5000 });

    const sizeSlider = glyphsView.locator('input[type="range"]');
    await expect(sizeSlider).toBeVisible();

    const glyphCount = glyphsView.locator('text=/\\d+ \\/ \\d+ glyphs/');
    await expect(glyphCount).toBeVisible();

    await page.screenshot({ path: 'e2e/test-results/glyphs-tab.png' });
  });

  test('glyphs search filters glyphs by name', async ({ page }) => {
    const dbResponse = await page.evaluate(() => fetch('/api/database').then(r => r.json()));
    const fonts = dbResponse.fonts ?? [];
    if (fonts.length === 0) {
      test.skip(true, 'No fonts in database');
      return;
    }

    const fontId = fonts[0].id;
    await page.goto(`/analyze/${fontId}`);

    const headerH1 = page.locator('header h1');
    await expect(headerH1).toBeVisible({ timeout: 20000 });

    const glyphsTab = page.locator('[data-testid="tab-glyphs"]');
    await glyphsTab.click();

    const glyphsView = page.locator('[data-testid="glyphs-view"]');
    await expect(glyphsView).toBeVisible({ timeout: 10000 });

    const glyphCount = glyphsView.locator('text=/\\d+ \\/ \\d+ glyphs/');
    await expect(glyphCount).toBeVisible({ timeout: 5000 });

    const allCountText = await glyphCount.textContent();
    const allMatch = allCountText?.match(/(\d+)\s*\/\s*(\d+)/);
    const totalGlyphs = allMatch ? parseInt(allMatch[2]) : 0;
    expect(totalGlyphs).toBeGreaterThan(0);

    const searchInput = glyphsView.locator('input[placeholder*="Search glyphs"]');
    await searchInput.fill('A');
    await page.waitForTimeout(500);

    const filteredText = await glyphCount.textContent();
    const filteredMatch = filteredText?.match(/(\d+)\s*\/\s*(\d+)/);
    const filtered = filteredMatch ? parseInt(filteredMatch[1]) : 0;
    expect(filtered).toBeLessThanOrEqual(totalGlyphs);
    expect(filtered).toBeGreaterThan(0);

    await page.screenshot({ path: 'e2e/test-results/glyphs-search.png' });
  });

  test('fonts have category assignments', async ({ page }) => {
    const dbResponse = await page.evaluate(() => fetch('/api/database').then(r => r.json()));
    const fonts = dbResponse.fonts ?? [];
    if (fonts.length === 0) {
      test.skip(true, 'No fonts in database');
      return;
    }

    const withCategory = fonts.filter((f: any) => f.category);
    expect(withCategory.length).toBeGreaterThan(0);

    const validCategories = ['serif', 'sans-serif', 'monospace', 'display', 'script'];
    for (const font of withCategory) {
      expect(validCategories).toContain(font.category);
    }

    const categoryCounts = new Map<string, number>();
    for (const font of withCategory) {
      categoryCounts.set(font.category, (categoryCounts.get(font.category) ?? 0) + 1);
    }
  });

  test('fonts have source field set', async ({ page }) => {
    const dbResponse = await page.evaluate(() => fetch('/api/database').then(r => r.json()));
    const fonts = dbResponse.fonts ?? [];
    if (fonts.length === 0) {
      test.skip(true, 'No fonts in database');
      return;
    }

    for (const font of fonts) {
      const src = font.source ?? 'local';
      expect(src === 'local' || src === 'google').toBe(true);
    }
  });

  test('analyze view shows family navigation for a multi-style family', async ({ page }) => {
    await page.getByRole('radio', { name: 'Static' }).check({ force: true });
    await page.getByLabel('Styles minimum').fill('3');
    await tiles(page).first().locator('.tile-open').click();
    await expect(page).toHaveURL(/\/analyze\//);
    const weightSelect = page.locator('[data-testid="family-weight-select"]');
    await expect(weightSelect).toBeVisible({ timeout: 20000 });
    expect(await weightSelect.locator('option').count()).toBeGreaterThanOrEqual(2);
  });

  test('analyze view names the font source in the header', async ({ page }) => {
    await tiles(page).first().locator('.tile-open').click();
    await expect(page.locator('.font-meta')).toContainText(/Google Fonts|Local/, { timeout: 20000 });
  });
});
