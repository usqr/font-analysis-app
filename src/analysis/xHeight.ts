import type { Font } from 'opentype.js';
import type { XHeightResult } from '../types';
import { getGlyphBounds } from '../lib/pathUtils';

export function analyzeXHeight(font: Font): XHeightResult | null {
  const xGlyph = font.charToGlyph('x');
  const tGlyph = font.charToGlyph('T');

  if (!xGlyph || !tGlyph) return null;

  const xBounds = getGlyphBounds(xGlyph);
  const tBounds = getGlyphBounds(tGlyph);

  const xHeight = xBounds.height;
  const capHeight = tBounds.height;
  const ascender = font.ascender;
  const descender = font.descender;
  const unitsPerEm = font.unitsPerEm;

  return {
    xHeight,
    capHeight,
    ascender,
    descender,
    unitsPerEm,
    xHeightToCapHeight: xHeight / capHeight,
    xHeightToEm: xHeight / unitsPerEm,
    capHeightToEm: capHeight / unitsPerEm,
  };
}
