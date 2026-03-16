import type { Font } from 'opentype.js';
import type { WeightResult } from '../types';

/**
 * Measures the visual weight of the "o" glyph by rendering it to
 * an offscreen canvas and computing the ratio of filled pixels
 * within the bounding box.
 */
export function analyzeWeight(font: Font, renderSize = 200): WeightResult | null {
  const glyph = font.charToGlyph('o');
  if (!glyph) return null;

  const bb = glyph.getBoundingBox();
  if (bb.x2 - bb.x1 === 0 || bb.y2 - bb.y1 === 0) return null;

  const scale = renderSize / font.unitsPerEm;
  const width = Math.ceil((bb.x2 - bb.x1) * scale) + 4;
  const height = Math.ceil((bb.y2 - bb.y1) * scale) + 4;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const fontSize = font.unitsPerEm * scale;
  const xOffset = -bb.x1 * scale + 2;
  const yOffset = 2;

  glyph.draw(ctx, xOffset, height - yOffset, fontSize);

  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;

  let filledPixels = 0;
  const totalPixels = width * height;

  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] > 128) filledPixels++;
  }

  return {
    filledPixels,
    totalPixels,
    fillRatio: filledPixels / totalPixels,
    fillPercentage: (filledPixels / totalPixels) * 100,
  };
}
