import type { Font } from 'opentype.js';
import type { ProportionsResult } from '../types';
import { getGlyphBounds } from '../lib/pathUtils';

export function analyzeProportions(font: Font): ProportionsResult | null {
  const oGlyph = font.charToGlyph('o');
  if (!oGlyph) return null;

  const bounds = getGlyphBounds(oGlyph);

  return {
    glyphWidth: bounds.width,
    glyphHeight: bounds.height,
    widthToHeightRatio: bounds.width / bounds.height,
    advanceWidth: oGlyph.advanceWidth ?? 0,
  };
}
