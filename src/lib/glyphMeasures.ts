/**
 * Font measurements that the server (scan, DB build) and the browser (local
 * fonts) share. No DOM: the outlines are filled on a grid with the nonzero
 * rule, so overlapping contours of variable fonts give correct results.
 */
import type { Font, Glyph } from 'opentype.js';
import type { ContrastResult, WeightResult, XHeightResult } from '../types/index.js';
import { rasterizePath, filledArea, type PathCmd } from './glyphRaster.js';
import { measureStrokeContrast } from './strokeContrast.js';

/** Grid cells per em for the fill area. Area error is far below 1%. */
const FILL_CELLS_PER_EM = 400;
/** The pixel counts in WeightResult are for a 200 px em, as in the old canvas method. */
const WEIGHT_RENDER_EM = 200;

function realGlyph(font: Font, char: string): Glyph | null {
  const g = font.charToGlyph(char);
  return g && g.index !== 0 ? g : null;
}

function commandsOf(font: Font, g: Glyph): PathCmd[] {
  return g.getPath(0, 0, font.unitsPerEm).commands as PathCmd[];
}

/** A scan asks for the "o" contrast two times (metrics and analysis); measure it once. */
const contrastCache = new WeakMap<Font, Map<string, ContrastResult | null>>();

export function measureContrast(font: Font, char: string): ContrastResult | null {
  let perFont = contrastCache.get(font);
  if (!perFont) contrastCache.set(font, (perFont = new Map()));
  if (perFont.has(char)) return perFont.get(char)!;
  const g = realGlyph(font, char);
  const result = g ? measureStrokeContrast(commandsOf(font, g), char, font.unitsPerEm) : null;
  perFont.set(char, result);
  return result;
}

/** Filled part of the glyph's bounding box (0..1), with overlaps counted once. */
export function measureFillRatio(font: Font, char = 'o'): number | null {
  const g = realGlyph(font, char);
  if (!g) return null;
  const bb = g.getBoundingBox();
  const boxArea = (bb.x2 - bb.x1) * (bb.y2 - bb.y1);
  if (!(boxArea > 0)) return null;
  const r = rasterizePath(commandsOf(font, g), font.unitsPerEm / FILL_CELLS_PER_EM);
  if (!r) return null;
  return Math.max(0, Math.min(1, filledArea(r) / boxArea));
}

export function measureWeight(font: Font): WeightResult | null {
  const g = realGlyph(font, 'o');
  const fillRatio = measureFillRatio(font, 'o');
  if (!g || fillRatio === null) return null;
  const bb = g.getBoundingBox();
  const scale = WEIGHT_RENDER_EM / font.unitsPerEm;
  const totalPixels = Math.ceil((bb.x2 - bb.x1) * scale) * Math.ceil((bb.y2 - bb.y1) * scale);
  return {
    filledPixels: Math.round(totalPixels * fillRatio),
    totalPixels,
    fillRatio,
    fillPercentage: fillRatio * 100,
  };
}

function glyphTop(font: Font, chars: string[]): number | null {
  for (const ch of chars) {
    const g = realGlyph(font, ch);
    if (!g) continue;
    const top = g.getBoundingBox().y2;
    if (top > 0) return top;
  }
  return null;
}

/** An OS/2 height if the font sets one in a plausible range (part of the em). */
function os2Height(font: Font, key: 'sxHeight' | 'sCapHeight', min: number, max: number): number | null {
  const v = font.tables.os2?.[key];
  if (typeof v !== 'number' || v <= 0) return null;
  const share = v / font.unitsPerEm;
  return share >= min && share <= max ? v : null;
}

/**
 * X-height and cap height. The OS/2 values come first: they are the values of
 * the designer, and script or swash glyphs ("x", "T") do not change them.
 * If the font does not set them, the top of flat-topped glyphs is used.
 */
export function measureXHeight(font: Font): XHeightResult | null {
  const xHeight = os2Height(font, 'sxHeight', 0.2, 0.9) ?? glyphTop(font, ['x', 'z', 'v']);
  const capHeight = os2Height(font, 'sCapHeight', 0.3, 1.2) ?? glyphTop(font, ['H', 'I', 'T']);
  if (!xHeight || !capHeight) return null;
  const upm = font.unitsPerEm;
  return {
    xHeight,
    capHeight,
    ascender: font.ascender,
    descender: font.descender,
    unitsPerEm: upm,
    xHeightToCapHeight: xHeight / capHeight,
    xHeightToEm: xHeight / upm,
    capHeightToEm: capHeight / upm,
  };
}
