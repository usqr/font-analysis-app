import { test, expect } from '@playwright/test';

test.describe('Library features', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('no family cards display with invalid names', async ({ page }) => {
    const listBtn = page.locator('[data-testid="view-list"]');
    await listBtn.click();
    await page.waitForTimeout(300);

    const cards = page.locator('[data-testid="family-card"]');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    const sampled = Math.min(count, 200);
    const step = Math.max(1, Math.floor(count / sampled));
    for (let i = 0; i < count && i / step < sampled; i += step) {
      const name = await cards.nth(i).locator('[data-testid="family-header"] h3').textContent();
      const cleanName = (name ?? '').replace(/^[▾▸]\s*/, '').trim();
      expect(
        /[a-zA-Z]/.test(cleanName) && cleanName.length >= 2,
        `Family card ${i} displays invalid name: "${cleanName}"`,
      ).toBe(true);
    }
  });

  test('American Auto variants have proper labels without abbreviation duplication', async ({ page }) => {
    await page.locator('[data-testid="view-list"]').click();
    await page.waitForTimeout(300);
    const searchInput = page.locator('input[placeholder="Search families..."]');
    await searchInput.fill('American Auto');
    await page.waitForTimeout(300);

    const cards = page.locator('[data-testid="family-card"]');
    const count = await cards.count();
    if (count === 0) {
      test.skip(true, 'No American Auto fonts in database');
      return;
    }

    const firstCard = cards.first();
    const variantList = firstCard.locator('[data-testid="variant-list"]');
    const variants = variantList.locator('span.text-xs');
    const variantCount = await variants.count();
    expect(variantCount).toBeGreaterThan(0);

    for (let i = 0; i < variantCount; i++) {
      const text = await variants.nth(i).textContent();
      expect(text).not.toMatch(/Bld\s+Bold/);
      expect(text).not.toMatch(/Blk\s+Black/);
      expect(text).not.toMatch(/Lgt\s+Light/);
      expect(text).not.toMatch(/Med\s+Medium/);
      expect(text).not.toMatch(/Thn\s+Thin/);
    }
  });

  test('family with multiple widths shows width tabs or dropdown', async ({ page }) => {
    await page.locator('[data-testid="view-list"]').click();
    await page.waitForTimeout(300);
    const searchInput = page.locator('input[placeholder="Search families..."]');
    await searchInput.fill('Amfibia');
    await page.waitForTimeout(300);

    const cards = page.locator('[data-testid="family-card"]');
    const count = await cards.count();
    if (count === 0) {
      test.skip(true, 'No Amfibia fonts in database');
      return;
    }

    const firstCard = cards.first();
    const widthTabs = firstCard.locator('[data-testid="width-tabs"]');
    await expect(widthTabs).toBeVisible();

    const widthSelect = widthTabs.locator('[data-testid="width-select"]');
    const tabButtons = widthTabs.locator('button');

    if (await widthSelect.isVisible()) {
      const options = widthSelect.locator('option');
      const optionCount = await options.count();
      expect(optionCount).toBeGreaterThan(1);

      const optionTexts: string[] = [];
      for (let i = 0; i < optionCount; i++) {
        optionTexts.push((await options.nth(i).textContent()) ?? '');
      }
      const expectedWidths = ['Condensed', 'Narrow', 'Wide', 'Expanded'];
      for (const w of expectedWidths) {
        expect(optionTexts.some((t) => t.includes(w))).toBe(true);
      }

      await widthSelect.selectOption({ label: optionTexts.find((t) => t.includes('Condensed')) ?? '' });
      await page.waitForTimeout(200);
    } else {
      const tabCount = await tabButtons.count();
      expect(tabCount).toBeGreaterThan(1);
    }

    await page.screenshot({ path: 'e2e/test-results/width-tabs.png' });
  });

  test('style switch toggles between regular and italic variants', async ({ page }) => {
    await page.locator('[data-testid="view-list"]').click();
    await page.waitForTimeout(300);
    const searchInput = page.locator('input[placeholder="Search families..."]');
    await searchInput.fill('Amfibia');
    await page.waitForTimeout(300);

    const cards = page.locator('[data-testid="family-card"]');
    if ((await cards.count()) === 0) {
      test.skip(true, 'No Amfibia fonts in database');
      return;
    }

    const firstCard = cards.first();
    const styleSwitch = firstCard.locator('[data-testid="style-switch"]');

    if (!(await styleSwitch.isVisible())) {
      test.skip(true, 'No style switch visible (family may not have italic variants)');
      return;
    }

    const italicBtn = firstCard.locator('[data-testid="style-italic"]');
    const regularBtn = firstCard.locator('[data-testid="style-regular"]');

    await expect(italicBtn).toBeVisible();
    await expect(regularBtn).toBeVisible();

    await italicBtn.click();
    await page.waitForTimeout(200);

    const variantTexts = firstCard.locator('[data-testid="variant-list"] span.text-sm');
    const count = await variantTexts.count();
    for (let i = 0; i < count; i++) {
      const txt = await variantTexts.nth(i).textContent();
      expect(txt?.toLowerCase()).toContain('italic');
    }

    await regularBtn.click();
    await page.waitForTimeout(200);

    await page.screenshot({ path: 'e2e/test-results/style-switch.png' });
  });

  test('family cards can be collapsed and expanded', async ({ page }) => {
    const listBtn = page.locator('[data-testid="view-list"]');
    await listBtn.click();
    await page.waitForTimeout(300);

    const cards = page.locator('[data-testid="family-card"]');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    const firstCard = cards.first();
    const header = firstCard.locator('[data-testid="family-header"]');
    const variantList = firstCard.locator('[data-testid="variant-list"]');

    await expect(variantList).toBeVisible();

    await header.click();
    await page.waitForTimeout(200);
    await expect(variantList).not.toBeVisible();

    await header.click();
    await page.waitForTimeout(200);
    await expect(variantList).toBeVisible();
  });

  test('collapse all / expand all buttons work', async ({ page }) => {
    const listBtn = page.locator('[data-testid="view-list"]');
    await listBtn.click();
    await page.waitForTimeout(300);

    const cards = page.locator('[data-testid="family-card"]');
    const count = await cards.count();
    if (count === 0) {
      test.skip(true, 'No fonts in database');
      return;
    }

    const toggleBtn = page.locator('[data-testid="toggle-collapse"]');
    await expect(toggleBtn).toBeVisible();
    await expect(toggleBtn).toHaveText('Collapse All');
    await toggleBtn.click();
    await page.waitForTimeout(300);

    const visibleVariantLists = page.locator('[data-testid="variant-list"]');
    expect(await visibleVariantLists.count()).toBe(0);
    await expect(toggleBtn).toHaveText('Expand All');

    await toggleBtn.click();
    await page.waitForTimeout(300);

    expect(await visibleVariantLists.count()).toBeGreaterThan(0);
    await expect(toggleBtn).toHaveText('Collapse All');
  });

  test('grid view toggle shows font preview cards', async ({ page }) => {
    const gridView = page.locator('[data-testid="grid-view"]');
    await expect(gridView).toBeVisible();

    const gridCards = page.locator('[data-testid="grid-card"]');
    const count = await gridCards.count();
    expect(count).toBeGreaterThan(0);

    const firstCard = gridCards.first();
    const preview = firstCard.locator('[data-testid="grid-card-preview"]');
    await expect(preview).toBeVisible();

    const familyName = firstCard.locator('h3');
    await expect(familyName).toBeVisible();
    const nameText = await familyName.textContent();
    expect(nameText?.length).toBeGreaterThan(0);

    const styleCount = firstCard.locator('h3, span').filter({ hasText: /\d+\s+styles?/i });
    await expect(styleCount.first()).toBeVisible();
    const styleText = await styleCount.first().textContent();
    expect(styleText).toMatch(/\d+\s+styles?/i);

    const listBtn = page.locator('[data-testid="view-list"]');
    await listBtn.click();
    await page.waitForTimeout(300);

    const listView = page.locator('[data-testid="list-view"]');
    await expect(listView).toBeVisible();

    const gridBtn = page.locator('[data-testid="view-grid"]');
    await gridBtn.click();
    await page.waitForTimeout(300);
    await expect(gridView).toBeVisible();
  });

  test('URW font families are grouped and variant labels are clean', async ({ page }) => {
    await page.locator('[data-testid="view-list"]').click();
    await page.waitForTimeout(300);
    const searchInput = page.locator('input[placeholder="Search families..."]');
    await searchInput.fill('URW');
    await page.waitForTimeout(300);

    const cards = page.locator('[data-testid="family-card"]');
    const count = await cards.count();
    if (count === 0) {
      test.skip(true, 'No URW fonts in database');
      return;
    }

    let hasGrouped = false;
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const variantCountText = await card.locator('[data-testid="family-header"] p').textContent();
      const numVariants = parseInt(variantCountText ?? '0');
      if (numVariants > 1) {
        hasGrouped = true;
        const variants = card.locator('[data-testid="variant-list"] span.text-sm');
        const vCount = await variants.count();
        for (let j = 0; j < vCount; j++) {
          const vText = (await variants.nth(j).textContent()) ?? '';
          expect(vText).toMatch(/^(Thin|Light|Regular|Medium|Bold|Black|Heavy|SemiBold|DemiBold|ExtraLight|ExtraBold|Book|Extra)/);
        }
      }
    }

    if (!hasGrouped) {
      test.skip(true, 'URW fonts need rescan to populate preferredFamilyName for grouping');
      return;
    }

    await page.screenshot({ path: 'e2e/test-results/urw-names.png' });
  });

  test('variant labels inside width groups do not repeat the width name', async ({ page }) => {
    await page.locator('[data-testid="view-list"]').click();
    await page.waitForTimeout(300);
    const searchInput = page.locator('input[placeholder="Search families..."]');
    await searchInput.fill('Amfibia');
    await page.waitForTimeout(300);

    const cards = page.locator('[data-testid="family-card"]');
    if ((await cards.count()) === 0) {
      test.skip(true, 'No Amfibia fonts in database');
      return;
    }

    const firstCard = cards.first();
    const widthTabs = firstCard.locator('[data-testid="width-tabs"]');
    await expect(widthTabs).toBeVisible();

    const widthSelect = widthTabs.locator('[data-testid="width-select"]');
    if (await widthSelect.isVisible()) {
      const options = widthSelect.locator('option');
      const optTexts: string[] = [];
      for (let i = 0; i < await options.count(); i++) {
        optTexts.push((await options.nth(i).textContent()) ?? '');
      }
      const narrowOpt = optTexts.find((t) => t.includes('Narrow') || t.includes('Condensed'));
      if (narrowOpt) {
        await widthSelect.selectOption({ label: narrowOpt });
        await page.waitForTimeout(200);

        const variants = firstCard.locator('[data-testid="variant-list"] span.text-sm');
        const vCount = await variants.count();
        for (let i = 0; i < vCount; i++) {
          const txt = (await variants.nth(i).textContent()) ?? '';
          expect(txt).not.toContain(narrowOpt.trim());
        }
      }
    }

    await page.screenshot({ path: 'e2e/test-results/variant-labels-no-width.png' });
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

  test('analyze view shows family navigation dropdowns for multi-variant family', async ({ page }) => {
    await page.locator('[data-testid="view-list"]').click();
    await page.waitForTimeout(300);
    const cards = page.locator('[data-testid="family-card"]');
    const count = await cards.count();
    if (count === 0) {
      test.skip(true, 'No fonts in database');
      return;
    }

    let analyzeBtn = null;
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const variantCount = await card.locator('[data-testid="variant-list"] > div').count();
      if (variantCount >= 2) {
        analyzeBtn = card.locator('[data-testid="variant-list"] > div').first().locator('button', { hasText: 'Analyze' });
        await card.locator('[data-testid="variant-list"] > div').first().hover();
        break;
      }
    }

    if (!analyzeBtn) {
      test.skip(true, 'No multi-variant family found');
      return;
    }

    await analyzeBtn.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const familyNav = page.locator('[data-testid="family-nav"]');
    await expect(familyNav).toBeVisible({ timeout: 10000 });

    const weightSelect = page.locator('[data-testid="family-weight-select"]');
    await expect(weightSelect).toBeVisible();
    const weightOptions = weightSelect.locator('option');
    expect(await weightOptions.count()).toBeGreaterThanOrEqual(2);

    await page.screenshot({ path: 'e2e/test-results/analyze-family-nav.png' });
  });

  test('source badges are visible on family cards', async ({ page }) => {
    await page.locator('[data-testid="view-list"]').click();
    await page.waitForTimeout(300);
    const cards = page.locator('[data-testid="family-card"]');
    const count = await cards.count();
    if (count === 0) {
      test.skip(true, 'No fonts in database');
      return;
    }

    const firstCard = cards.first();
    const badge = firstCard.locator('span[title="Local font"], span[title="Google Fonts"], span[title="Local + Google Fonts"]');
    await expect(badge).toBeVisible();

    const badgeText = await badge.textContent();
    expect(badgeText === 'L' || badgeText === 'G' || badgeText === 'L+G').toBe(true);

    await page.screenshot({ path: 'e2e/test-results/source-badges.png' });
  });

  test('source badges appear in grid view cards', async ({ page }) => {
    const gridView = page.locator('[data-testid="grid-view"]');
    await expect(gridView).toBeVisible();

    const gridCards = page.locator('[data-testid="grid-card"]');
    const count = await gridCards.count();
    if (count === 0) {
      test.skip(true, 'No fonts in database');
      return;
    }

    const firstCard = gridCards.first();
    const badge = firstCard.locator('span[title="Local font"], span[title="Google Fonts"], span[title="Local + Google Fonts"]');
    await expect(badge).toBeVisible();

    await page.screenshot({ path: 'e2e/test-results/grid-source-badges.png' });
  });

  test('category filter buttons filter the library', async ({ page }) => {
    await page.locator('[data-testid="view-list"]').click();
    await page.waitForTimeout(300);
    const cards = page.locator('[data-testid="family-card"]');
    const totalFamilies = await cards.count();
    if (totalFamilies === 0) {
      test.skip(true, 'No fonts in database');
      return;
    }

    const serifBtn = page.locator('button', { hasText: /^Serif$/ });
    await expect(serifBtn).toBeVisible();
    await serifBtn.click();
    await page.waitForTimeout(500);

    const filteredCount = await cards.count();
    expect(filteredCount).toBeLessThanOrEqual(totalFamilies);

    await serifBtn.click();
    await page.waitForTimeout(500);

    const restoredCount = await cards.count();
    expect(restoredCount).toBeGreaterThanOrEqual(totalFamilies);

    await page.screenshot({ path: 'e2e/test-results/category-filter.png' });
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

  test('analyze view shows source badge in header', async ({ page }) => {
    await page.locator('[data-testid="view-list"]').click();
    await page.waitForTimeout(300);
    const cards = page.locator('[data-testid="family-card"]');
    if ((await cards.count()) === 0) {
      test.skip(true, 'No fonts in database');
      return;
    }

    const firstCard = cards.first();
    const firstVariant = firstCard.locator('[data-testid="variant-list"] > div').first();
    await firstVariant.hover();
    await firstVariant.locator('button', { hasText: 'Analyze' }).click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const headerBadge = page.locator('header span[title="Local font"], header span[title="Google Fonts"]');
    await expect(headerBadge).toBeVisible({ timeout: 10000 });

    const text = await headerBadge.textContent();
    expect(text === 'L' || text === 'G').toBe(true);

    await page.screenshot({ path: 'e2e/test-results/analyze-source-badge.png' });
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
});
