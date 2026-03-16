import { test, expect } from '@playwright/test';

test.describe('Contrast view stroke rendering', () => {
  test('investigate thinnest and thickest stroke rendering', async ({ page }) => {
    await page.goto('http://localhost:5175/');
    await page.waitForLoadState('networkidle');

    // Load a serif font (Merriweather) - has clear contrast between thick/thin
    const merriweatherBtn = page.locator('button', { hasText: 'Merriweather' });
    await expect(merriweatherBtn).toBeVisible();
    await merriweatherBtn.click();

    // Wait for analysis to complete
    await page.waitForFunction(() => {
      const canvas = document.querySelector('canvas');
      return canvas && canvas.width > 0;
    }, { timeout: 10000 });

    // Give canvas time to finish rendering
    await page.waitForTimeout(1500);

    // Take screenshot of the initial contrast view
    await page.screenshot({ path: 'e2e/screenshots/contrast-view-merriweather.png', fullPage: true });

    // Extract analysis data from the sidebar
    const sidebarText = await page.locator('aside').textContent();
    console.log('=== SIDEBAR DATA ===');
    console.log(sidebarText);

    // Extract the contrast data by evaluating in page context
    const contrastData = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return { error: 'No canvas found' };

      return {
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        clientWidth: canvas.clientWidth,
        clientHeight: canvas.clientHeight,
        dpr: window.devicePixelRatio,
      };
    });
    console.log('=== CANVAS INFO ===');
    console.log(JSON.stringify(contrastData, null, 2));

    // Now let's do pixel-level analysis of the canvas to find the stroke markers
    const pixelAnalysis = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return { error: 'No canvas' };
      const ctx = canvas.getContext('2d');
      if (!ctx) return { error: 'No context' };

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      let redPixels = 0;
      let bluePixels = 0;
      let glyphPixels = 0;
      const redPositions: { x: number; y: number }[] = [];
      const bluePositions: { x: number; y: number }[] = [];

      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const i = (y * canvas.width + x) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];

          if (a < 10) continue;

          // Red pixels (ef4444 = rgb(239, 68, 68)) - thickest stroke markers
          if (r > 180 && g < 100 && b < 100) {
            redPixels++;
            if (redPixels <= 5 || redPixels % 100 === 0) {
              redPositions.push({ x, y });
            }
          }

          // Blue pixels (3b82f6 = rgb(59, 130, 246)) - thinnest stroke markers
          if (b > 180 && r < 100 && g < 160) {
            bluePixels++;
            if (bluePixels <= 5 || bluePixels % 100 === 0) {
              bluePositions.push({ x, y });
            }
          }

          // Glyph pixels (semi-transparent white)
          if (r > 30 && g > 30 && b > 30 && r === g && g === b && r < 200) {
            glyphPixels++;
          }
        }
      }

      // Find bounding boxes of red and blue markers
      const redBounds = redPositions.length > 0 ? {
        minX: Math.min(...redPositions.map(p => p.x)),
        maxX: Math.max(...redPositions.map(p => p.x)),
        minY: Math.min(...redPositions.map(p => p.y)),
        maxY: Math.max(...redPositions.map(p => p.y)),
      } : null;

      const blueBounds = bluePositions.length > 0 ? {
        minX: Math.min(...bluePositions.map(p => p.x)),
        maxX: Math.max(...bluePositions.map(p => p.x)),
        minY: Math.min(...bluePositions.map(p => p.y)),
        maxY: Math.max(...bluePositions.map(p => p.y)),
      } : null;

      return {
        redPixels,
        bluePixels,
        glyphPixels,
        redBounds,
        blueBounds,
        firstRedPositions: redPositions.slice(0, 10),
        firstBluePositions: bluePositions.slice(0, 10),
        canvasSize: { w: canvas.width, h: canvas.height },
      };
    });

    console.log('=== PIXEL ANALYSIS ===');
    console.log(JSON.stringify(pixelAnalysis, null, 2));

    // Check if red/blue markers overlap with the glyph area
    // by sampling pixels around the marker locations
    const overlapCheck = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return { error: 'No canvas' };
      const ctx = canvas.getContext('2d');
      if (!ctx) return { error: 'No context' };

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const w = canvas.width;

      // Find all distinct colored regions (red dots/lines)
      const redClusters: { cx: number; cy: number; count: number }[] = [];
      const blueClusters: { cx: number; cy: number; count: number }[] = [];

      // Scan for red and blue circle centers (dots with radius ~6*dpr)
      const dpr = window.devicePixelRatio || 1;
      const dotRadius = Math.ceil(6 * dpr);
      const visited = new Set<string>();

      for (let y = 0; y < canvas.height; y += 2) {
        for (let x = 0; x < w; x += 2) {
          const key = `${x},${y}`;
          if (visited.has(key)) continue;

          const i = (y * w + x) * 4;
          const r = data[i], g = data[i + 1], b = data[i + 2];

          if (r > 200 && g < 80 && b < 80) {
            // Found a red pixel - check if it's a circle center
            let isCenter = true;
            for (const dy of [-dotRadius, dotRadius]) {
              const checkY = y + dy;
              if (checkY < 0 || checkY >= canvas.height) { isCenter = false; break; }
              const ci = (checkY * w + x) * 4;
              if (!(data[ci] > 180 && data[ci + 1] < 100 && data[ci + 2] < 100)) {
                isCenter = false;
                break;
              }
            }
            if (isCenter) {
              redClusters.push({ cx: x / dpr, cy: y / dpr, count: 1 });
              for (let dy = -dotRadius; dy <= dotRadius; dy++) {
                for (let dx = -dotRadius; dx <= dotRadius; dx++) {
                  visited.add(`${x + dx},${y + dy}`);
                }
              }
            }
          }

          if (b > 200 && r < 80 && g < 160) {
            let isCenter = true;
            for (const dy of [-dotRadius, dotRadius]) {
              const checkY = y + dy;
              if (checkY < 0 || checkY >= canvas.height) { isCenter = false; break; }
              const ci = (checkY * w + x) * 4;
              if (!(data[ci + 2] > 180 && data[ci] < 100)) {
                isCenter = false;
                break;
              }
            }
            if (isCenter) {
              blueClusters.push({ cx: x / dpr, cy: y / dpr, count: 1 });
              for (let dy = -dotRadius; dy <= dotRadius; dy++) {
                for (let dx = -dotRadius; dx <= dotRadius; dx++) {
                  visited.add(`${x + dx},${y + dy}`);
                }
              }
            }
          }
        }
      }

      // For each dot center, check if there are glyph pixels nearby
      const checkNearGlyph = (cx: number, cy: number) => {
        const checkRadius = 20;
        let nearbyGlyphPixels = 0;
        const sx = Math.round(cx * dpr);
        const sy = Math.round(cy * dpr);

        for (let dy = -checkRadius; dy <= checkRadius; dy++) {
          for (let dx = -checkRadius; dx <= checkRadius; dx++) {
            const px = sx + dx;
            const py = sy + dy;
            if (px < 0 || px >= w || py < 0 || py >= canvas.height) continue;
            const i = (py * w + px) * 4;
            const r = data[i], g = data[i + 1], b = data[i + 2];
            if (r > 30 && g > 30 && b > 30 && Math.abs(r - g) < 5 && Math.abs(g - b) < 5 && r < 200) {
              nearbyGlyphPixels++;
            }
          }
        }
        return nearbyGlyphPixels;
      };

      return {
        redDotCenters: redClusters.map(c => ({
          ...c,
          nearbyGlyphPixels: checkNearGlyph(c.cx, c.cy)
        })),
        blueDotCenters: blueClusters.map(c => ({
          ...c,
          nearbyGlyphPixels: checkNearGlyph(c.cx, c.cy)
        })),
      };
    });

    console.log('=== OVERLAP CHECK (dots near glyph) ===');
    console.log(JSON.stringify(overlapCheck, null, 2));

    // Now let's check if the stroke measurement lines are within the glyph bounds
    // by tracing where the glyph actually is rendered
    const glyphBounds = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return null;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const w = canvas.width;
      const h = canvas.height;
      const dpr = window.devicePixelRatio || 1;
      const halfW = w / 2;

      // Find glyph bounds for the left glyph ("o") and right glyph ("O")
      const findGlyphBounds = (startX: number, endX: number) => {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (let y = 0; y < h; y++) {
          for (let x = startX; x < endX; x++) {
            const i = (y * w + x) * 4;
            const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
            // Glyph is drawn semi-transparent white - check for grayish pixels
            if (a > 10 && r > 20 && g > 20 && b > 20 && Math.abs(r - g) < 10 && Math.abs(g - b) < 10 && r < 200) {
              minX = Math.min(minX, x);
              maxX = Math.max(maxX, x);
              minY = Math.min(minY, y);
              maxY = Math.max(maxY, y);
            }
          }
        }
        return minX < Infinity ? {
          minX: minX / dpr,
          maxX: maxX / dpr,
          minY: minY / dpr,
          maxY: maxY / dpr,
          width: (maxX - minX) / dpr,
          height: (maxY - minY) / dpr,
        } : null;
      };

      const leftGlyph = findGlyphBounds(0, Math.floor(halfW));
      const rightGlyph = findGlyphBounds(Math.floor(halfW), w);

      // Find red and blue line endpoints
      const findColoredLineEndpoints = (startX: number, endX: number, isRed: boolean) => {
        const points: { x: number; y: number }[] = [];
        for (let y = 0; y < h; y++) {
          for (let x = startX; x < endX; x++) {
            const i = (y * w + x) * 4;
            const r = data[i], g = data[i + 1], b = data[i + 2];
            if (isRed && r > 200 && g < 80 && b < 80) {
              points.push({ x: x / dpr, y: y / dpr });
            }
            if (!isRed && b > 200 && r < 80) {
              points.push({ x: x / dpr, y: y / dpr });
            }
          }
        }
        if (points.length === 0) return null;
        return {
          minX: Math.min(...points.map(p => p.x)),
          maxX: Math.max(...points.map(p => p.x)),
          minY: Math.min(...points.map(p => p.y)),
          maxY: Math.max(...points.map(p => p.y)),
          pixelCount: points.length,
        };
      };

      return {
        leftGlyph,
        rightGlyph,
        leftRedLine: findColoredLineEndpoints(0, Math.floor(halfW), true),
        leftBlueLine: findColoredLineEndpoints(0, Math.floor(halfW), false),
        rightRedLine: findColoredLineEndpoints(Math.floor(halfW), w, true),
        rightBlueLine: findColoredLineEndpoints(Math.floor(halfW), w, false),
      };
    });

    console.log('=== GLYPH BOUNDS & LINE POSITIONS ===');
    console.log(JSON.stringify(glyphBounds, null, 2));

    // Check if red/blue lines are inside or outside glyph bounds
    if (glyphBounds) {
      const checkContainment = (
        glyphBound: typeof glyphBounds.leftGlyph,
        lineBound: typeof glyphBounds.leftRedLine,
        name: string
      ) => {
        if (!glyphBound || !lineBound) {
          console.log(`${name}: Missing data (glyph: ${!!glyphBound}, line: ${!!lineBound})`);
          return;
        }
        const xInside = lineBound.minX >= glyphBound.minX && lineBound.maxX <= glyphBound.maxX;
        const yInside = lineBound.minY >= glyphBound.minY && lineBound.maxY <= glyphBound.maxY;
        const xOverlap = lineBound.maxX >= glyphBound.minX && lineBound.minX <= glyphBound.maxX;
        const yOverlap = lineBound.maxY >= glyphBound.minY && lineBound.minY <= glyphBound.maxY;

        console.log(`${name}:`);
        console.log(`  Glyph: x[${glyphBound.minX.toFixed(0)}-${glyphBound.maxX.toFixed(0)}] y[${glyphBound.minY.toFixed(0)}-${glyphBound.maxY.toFixed(0)}]`);
        console.log(`  Line:  x[${lineBound.minX.toFixed(0)}-${lineBound.maxX.toFixed(0)}] y[${lineBound.minY.toFixed(0)}-${lineBound.maxY.toFixed(0)}]`);
        console.log(`  X inside: ${xInside}, Y inside: ${yInside}`);
        console.log(`  X overlaps: ${xOverlap}, Y overlaps: ${yOverlap}`);
        
        if (!xOverlap || !yOverlap) {
          console.log(`  *** PROBLEM: Line is completely outside glyph bounds! ***`);
        }
      };

      checkContainment(glyphBounds.leftGlyph, glyphBounds.leftRedLine, '"o" Red (thickest)');
      checkContainment(glyphBounds.leftGlyph, glyphBounds.leftBlueLine, '"o" Blue (thinnest)');
      checkContainment(glyphBounds.rightGlyph, glyphBounds.rightRedLine, '"O" Red (thickest)');
      checkContainment(glyphBounds.rightGlyph, glyphBounds.rightBlueLine, '"O" Blue (thinnest)');
    }

    // Also try with a sans-serif font (Lato) for comparison
    await page.locator('button', { hasText: 'Change font' }).click();
    await page.waitForTimeout(500);

    const latoBtn = page.locator('button', { hasText: 'Lato' });
    await expect(latoBtn).toBeVisible();
    await latoBtn.click();

    await page.waitForFunction(() => {
      const canvas = document.querySelector('canvas');
      return canvas && canvas.width > 0;
    }, { timeout: 10000 });
    await page.waitForTimeout(1500);

    await page.screenshot({ path: 'e2e/screenshots/contrast-view-lato.png', fullPage: true });

    const latoSidebar = await page.locator('aside').textContent();
    console.log('=== LATO SIDEBAR DATA ===');
    console.log(latoSidebar);
  });
});
