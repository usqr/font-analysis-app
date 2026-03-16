import { test } from '@playwright/test';

test('diagnose stroke rendering with debug overlay', async ({ page }) => {
  page.on('console', msg => console.log('BROWSER:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  await page.goto('http://localhost:5175/');
  await page.waitForLoadState('networkidle');

  // Click Merriweather sample font
  const btn = page.locator('button', { hasText: 'Merriweather' });
  await btn.waitFor({ state: 'visible', timeout: 5000 });
  await btn.click();

  // Wait for analysis - the canvas should appear and sidebar should have results
  await page.waitForSelector('canvas', { timeout: 10000 });
  // Wait for sidebar to have contrast data
  await page.waitForFunction(() => {
    const aside = document.querySelector('aside');
    return aside && aside.textContent?.includes('contrast');
  }, { timeout: 10000 });
  await page.waitForTimeout(2000);

  // Check if __FA_ANALYSIS__ is available
  const hasAnalysis = await page.evaluate(() => !!(window as any).__FA_ANALYSIS__);
  console.log('Has __FA_ANALYSIS__:', hasAnalysis);

  if (!hasAnalysis) {
    console.log('Analysis not exposed on window, extracting from DOM instead');
  }

  // Extract analysis data directly by re-running analysis in the browser
  const rawData = await page.evaluate(async () => {
    // Fetch and parse the font
    const resp = await fetch('/fonts/Merriweather-Regular.ttf');
    const buffer = await resp.arrayBuffer();

    // Access opentype via Vite's module graph
    const opentypeModule = (window as any).__vite_module_opentype__;
    
    // If the analysis was exposed, use it
    const analysis = (window as any).__FA_ANALYSIS__;
    if (analysis) {
      const fontMeta = (window as any).__FA_FONT_DATA__;
      const extract = (result: any) => {
        if (!result) return null;
        return {
          maxWidth: result.maxWidth,
          minWidth: result.minWidth,
          contrastRatio: result.contrastRatio,
          thickest: {
            outerPoint: result.thickestSample.outerPoint,
            innerPoint: result.thickestSample.innerPoint,
            width: result.thickestSample.width,
          },
          thinnest: {
            outerPoint: result.thinnestSample.outerPoint,
            innerPoint: result.thinnestSample.innerPoint,
            width: result.thinnestSample.width,
          },
        };
      };
      return { fontMeta, contrastLower: extract(analysis.contrastLower), contrastUpper: extract(analysis.contrastUpper) };
    }

    // Otherwise, parse from the sidebar text
    const aside = document.querySelector('aside');
    const sidebarText = aside?.textContent || '';
    return { sidebarText, noAnalysisData: true };
  });

  console.log('=== RAW DATA ===');
  console.log(JSON.stringify(rawData, null, 2));

  // If we have the analysis data, do coordinate checks
  if (rawData && !rawData.noAnalysisData) {
    const coordCheck = await page.evaluate((data: any) => {
      const canvas = document.querySelector('canvas')!;
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      const dpr = window.devicePixelRatio || 1;

      const pad = 40;
      const results = [
        { result: data.contrastLower, label: 'o', bbox: data.fontMeta.oBBox },
        { result: data.contrastUpper, label: 'O', bbox: data.fontMeta.OBBox },
      ].filter(r => r.result !== null);

      const gap = results.length > 1 ? 40 : 0;
      const areaW = (W - pad * 2 - gap) / results.length;
      const areaH = H - pad * 2 - 60;

      const checks: any[] = [];

      for (let i = 0; i < results.length; i++) {
        const { result, label, bbox } = results[i];
        const bb = bbox;
        const gW = bb.x2 - bb.x1;
        const gH = bb.y2 - bb.y1;
        if (gW === 0 || gH === 0) continue;

        const scale = Math.min(areaW / gW, areaH / gH) * 0.7;
        const cx = pad + i * (areaW + gap) + areaW / 2;
        const cy = pad + areaH / 2 + 10;
        const drawX = cx - (bb.x1 + gW / 2) * scale;
        const drawY = cy + (bb.y1 + gH / 2) * scale;

        // Glyph bounding box on canvas:
        // Font pt (fx, fy) -> screen from getPath(0,0,upm): (fx, -fy)
        // Canvas: screenPt * scale + draw offset
        const glyphCanvasBounds = {
          left: bb.x1 * scale + drawX,
          right: bb.x2 * scale + drawX,
          top: (-bb.y2) * scale + drawY,
          bottom: (-bb.y1) * scale + drawY,
        };

        const thick = result.thickest;
        const thickCanvas = {
          outer: { x: thick.outerPoint.x * scale + drawX, y: thick.outerPoint.y * scale + drawY },
          inner: { x: thick.innerPoint.x * scale + drawX, y: thick.innerPoint.y * scale + drawY },
        };

        const thin = result.thinnest;
        const thinCanvas = {
          outer: { x: thin.outerPoint.x * scale + drawX, y: thin.outerPoint.y * scale + drawY },
          inner: { x: thin.innerPoint.x * scale + drawX, y: thin.innerPoint.y * scale + drawY },
        };

        const isInBounds = (pt: { x: number; y: number }, bounds: any) => ({
          xOk: pt.x >= bounds.left - 2 && pt.x <= bounds.right + 2,
          yOk: pt.y >= bounds.top - 2 && pt.y <= bounds.bottom + 2,
          xDist: pt.x < bounds.left ? pt.x - bounds.left : pt.x > bounds.right ? pt.x - bounds.right : 0,
          yDist: pt.y < bounds.top ? pt.y - bounds.top : pt.y > bounds.bottom ? pt.y - bounds.bottom : 0,
        });

        // Also check pixels at the computed positions
        const ctx = canvas.getContext('2d')!;
        const getPixel = (x: number, y: number) => {
          const px = Math.round(x * dpr);
          const py = Math.round(y * dpr);
          if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) return { r: 0, g: 0, b: 0, a: 0 };
          const d = ctx.getImageData(px, py, 1, 1).data;
          return { r: d[0], g: d[1], b: d[2], a: d[3] };
        };

        checks.push({
          glyph: label,
          scale: Math.round(scale * 1000) / 1000,
          canvasSize: { W, H },
          glyphCanvasBounds: {
            left: Math.round(glyphCanvasBounds.left),
            right: Math.round(glyphCanvasBounds.right),
            top: Math.round(glyphCanvasBounds.top),
            bottom: Math.round(glyphCanvasBounds.bottom),
          },
          thickCanvas: {
            outer: { x: Math.round(thickCanvas.outer.x), y: Math.round(thickCanvas.outer.y) },
            inner: { x: Math.round(thickCanvas.inner.x), y: Math.round(thickCanvas.inner.y) },
          },
          thinCanvas: {
            outer: { x: Math.round(thinCanvas.outer.x), y: Math.round(thinCanvas.outer.y) },
            inner: { x: Math.round(thinCanvas.inner.x), y: Math.round(thinCanvas.inner.y) },
          },
          thickOuterBounds: isInBounds(thickCanvas.outer, glyphCanvasBounds),
          thickInnerBounds: isInBounds(thickCanvas.inner, glyphCanvasBounds),
          thinOuterBounds: isInBounds(thinCanvas.outer, glyphCanvasBounds),
          thinInnerBounds: isInBounds(thinCanvas.inner, glyphCanvasBounds),
          pixels: {
            thickOuter: getPixel(thickCanvas.outer.x, thickCanvas.outer.y),
            thickInner: getPixel(thickCanvas.inner.x, thickCanvas.inner.y),
            thinOuter: getPixel(thinCanvas.outer.x, thinCanvas.outer.y),
            thinInner: getPixel(thinCanvas.inner.x, thinCanvas.inner.y),
          },
        });
      }

      return checks;
    }, rawData);

    console.log('=== COORDINATE CHECKS ===');
    console.log(JSON.stringify(coordCheck, null, 2));
  }

  await page.screenshot({ path: 'e2e/screenshots/merriweather-contrast-final.png', fullPage: true });
});
