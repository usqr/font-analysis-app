import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import * as opentype from 'opentype.js';
import { decompress as woff2Decompress } from 'wawoff2';
import type { StoredFont, FontMetrics, FontCategory, FontSource, GlyphSvg, FullAnalysis } from './database.js';
import type { ProportionsResult, SpacingResult } from '../src/types/index.js';
import { measureContrast, measureFillRatio, measureWeight, measureXHeight } from '../src/lib/glyphMeasures.js';

const FONT_EXTENSIONS = new Set(['.ttf', '.otf', '.woff', '.woff2']);

export function walkDir(dir: string): string[] {
  const results: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(full));
    } else if (FONT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      results.push(full);
    }
  }
  return results;
}

function inferStyle(subfamilyName: string): 'normal' | 'italic' | 'oblique' {
  const lower = subfamilyName.toLowerCase();
  if (lower.includes('oblique')) return 'oblique';
  if (lower.includes('italic')) return 'italic';
  if (/\bObl\b/.test(subfamilyName)) return 'oblique';
  if (/\bIt\b/.test(subfamilyName)) return 'italic';
  return 'normal';
}

function inferWeight(font: opentype.Font, subfamilyName: string): number {
  const os2 = font.tables.os2;
  if (os2?.usWeightClass) return os2.usWeightClass;

  const lower = subfamilyName.toLowerCase();
  const map: Record<string, number> = {
    thin: 100, hairline: 100,
    extralight: 200, 'extra light': 200, ultralight: 200,
    light: 300,
    regular: 400, normal: 400, book: 400,
    medium: 500,
    semibold: 600, 'semi bold': 600, demibold: 600,
    bold: 700,
    extrabold: 800, 'extra bold': 800, ultrabold: 800,
    black: 900, heavy: 900,
  };

  for (const [key, weight] of Object.entries(map)) {
    if (lower.includes(key)) return weight;
  }
  return 400;
}

function inferWeightFromName(subfamilyName: string): number {
  const lower = subfamilyName.toLowerCase();
  const map: [string, number][] = [
    ['extra bold', 800], ['extrabold', 800], ['ultra bold', 800], ['ultrabold', 800],
    ['extra light', 200], ['extralight', 200], ['ultra light', 200], ['ultralight', 200],
    ['semi bold', 600], ['semibold', 600], ['demi bold', 600], ['demibold', 600],
    ['hairline', 100], ['thin', 100],
    ['light', 300],
    ['medium', 500],
    ['bold', 700],
    ['black', 900], ['heavy', 900],
    ['book', 400],
  ];
  for (const [key, weight] of map) {
    if (lower.includes(key)) return weight;
  }
  return 400;
}

function familyNameFromFile(filePath: string): { family: string; subfamily: string | null } {
  const base = path.basename(filePath, path.extname(filePath));
  const cleaned = base.replace(/-webfont$/i, '');
  const parts = cleaned.split(/[-_]/);
  const family = parts[0] || 'Unknown';
  const subfamily = parts.length > 1 ? parts.slice(1).join(' ').replace(/-webfont$/i, '').trim() || null : null;
  return { family, subfamily };
}

function isUsableName(name: string | undefined): name is string {
  return !!name && name.length >= 2 && name !== 'Unknown' && /[a-zA-Z]{2,}/.test(name);
}

import {
  WEIGHT_ABBREVS,
  WIDTH_ABBREVS,
  STYLE_ABBREVS,
  splitCamelTokens,
  computeFamilyDiff,
} from '../src/lib/fontNameTokens.js';

function parseAbbreviatedSubfamily(diff: string): { subfamilyName: string; style: 'normal' | 'italic' | 'oblique'; widthRemainder: string } {
  const tokens = diff.split(/\s+/).filter(t => t.length > 0);
  const weightParts: string[] = [];
  let style: 'normal' | 'italic' | 'oblique' = 'normal';
  const remainderParts: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const next = tokens[i + 1];

    if (tok === 'Ext' || tok === 'Extra' || tok === 'Ultra' || tok === 'Semi') {
      if (next && WIDTH_ABBREVS[next]) {
        remainderParts.push(`${WEIGHT_ABBREVS[tok] ?? tok} ${WIDTH_ABBREVS[next]}`);
        i++;
        continue;
      }
      if (next && WEIGHT_ABBREVS[next]) {
        weightParts.push(`${WEIGHT_ABBREVS[tok] ?? tok} ${WEIGHT_ABBREVS[next]}`);
        i++;
        continue;
      }
    }

    if (STYLE_ABBREVS[tok]) {
      style = STYLE_ABBREVS[tok];
    } else if (WEIGHT_ABBREVS[tok]) {
      weightParts.push(WEIGHT_ABBREVS[tok]);
    } else if (WIDTH_ABBREVS[tok]) {
      remainderParts.push(WIDTH_ABBREVS[tok]);
    } else {
      remainderParts.push(tok);
    }
  }

  const parts = [...weightParts];
  if (style === 'italic') parts.push('Italic');
  if (style === 'oblique') parts.push('Oblique');

  return {
    subfamilyName: parts.length > 0 ? parts.join(' ') : 'Regular',
    style,
    widthRemainder: remainderParts.join(' '),
  };
}

/**
 * For fonts without preferredFamilyName, try to infer one by stripping
 * known weight/style/width abbreviation tokens from the end of the
 * camelCase-split familyName. Handles URW-style names like "BodoniURWExtBol".
 * Also normalizes pure concatenated names like "BodoniURW" → "Bodoni URW".
 */
function inferPreferredFamily(familyName: string): { preferredFamily: string; diff: string } | null {
  const expanded = splitCamelTokens(familyName);

  const tokens = expanded.split(/\s+/);
  if (tokens.length < 2) return null;

  let lastBase = tokens.length;
  for (let i = tokens.length - 1; i >= 1; i--) {
    const tok = tokens[i];
    if (WEIGHT_ABBREVS[tok] || WIDTH_ABBREVS[tok] || STYLE_ABBREVS[tok]) {
      lastBase = i;
    } else {
      break;
    }
  }

  // For already-space-separated names (CamelCase splitting had no effect),
  // only infer a preferredFamily when trailing tokens were actually stripped
  if (expanded === familyName && lastBase === tokens.length) return null;

  const baseParts = tokens.slice(0, lastBase);
  const diffParts = tokens.slice(lastBase);

  if (baseParts.length === 0) return null;

  return {
    preferredFamily: baseParts.join(' '),
    diff: diffParts.join(' '),
  };
}

// --- Pure-math font metrics computation (no DOM/Canvas dependencies) ---

type PathCmd = { type: string; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number };

function flattenCommands(commands: PathCmd[]): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  let cx = 0, cy = 0;
  for (const cmd of commands) {
    if (cmd.type === 'M') {
      cx = cmd.x!; cy = cmd.y!;
      pts.push({ x: cx, y: cy });
    } else if (cmd.type === 'L') {
      cx = cmd.x!; cy = cmd.y!;
      pts.push({ x: cx, y: cy });
    } else if (cmd.type === 'Q') {
      const steps = 8;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const mt = 1 - t;
        pts.push({
          x: mt * mt * cx + 2 * mt * t * cmd.x1! + t * t * cmd.x!,
          y: mt * mt * cy + 2 * mt * t * cmd.y1! + t * t * cmd.y!,
        });
      }
      cx = cmd.x!; cy = cmd.y!;
    } else if (cmd.type === 'C') {
      const steps = 10;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const mt = 1 - t;
        pts.push({
          x: mt * mt * mt * cx + 3 * mt * mt * t * cmd.x1! + 3 * mt * t * t * cmd.x2! + t * t * t * cmd.x!,
          y: mt * mt * mt * cy + 3 * mt * mt * t * cmd.y1! + 3 * mt * t * t * cmd.y2! + t * t * t * cmd.y!,
        });
      }
      cx = cmd.x!; cy = cmd.y!;
    }
  }
  return pts;
}

/**
 * Library metrics (0..1 scales for the filters). Contrast is thin / thick of
 * the "o" stroke, weight is the filled part of the "o" box.
 */
export function computeFontMetrics(font: opentype.Font): FontMetrics | null {
  try {
    const oGlyph = font.charToGlyph('o');
    const xGlyph = font.charToGlyph('x');
    if (!oGlyph || !xGlyph || oGlyph.index === 0 || xGlyph.index === 0) return null;
    const oBB = oGlyph.getBoundingBox();
    const oW = oBB.x2 - oBB.x1;
    const oH = oBB.y2 - oBB.y1;
    const xh = measureXHeight(font);
    if (oW === 0 || oH === 0 || !xh) return null;
    const c = measureContrast(font, 'o');
    return {
      contrast: c ? Math.max(0, Math.min(1, 1 / c.contrastRatio)) : 1,
      weight: measureFillRatio(font, 'o') ?? 0,
      width: Math.max(0, Math.min(2, oW / oH)),
      xHeight: Math.max(0, Math.min(1, xh.xHeightToEm)),
    };
  } catch {
    return null;
  }
}

function isMonoByWidths(font: opentype.Font): boolean {
  const chars = ['i', 'm', 'w', 'M', 'l', 'W'];
  const widths = new Set<number>();
  for (const ch of chars) {
    const g = font.charToGlyph(ch);
    if (g && g.index !== 0 && g.advanceWidth != null && g.advanceWidth > 0) {
      widths.add(g.advanceWidth);
    }
  }
  return widths.size === 1 && widths.size > 0;
}

function classifyByPanose(os2: any): FontCategory | null {
  const panose = os2?.panose;
  if (!panose || !Array.isArray(panose)) return null;
  if (panose.every((b: number) => b === 0)) return null;

  const familyKind = panose[0];
  if (familyKind === 3) return 'script';
  if (familyKind === 4) return 'display';
  if (familyKind === 5) return 'display';

  if (familyKind === 2) {
    if (panose[3] === 9) return 'monospace';
    const serifStyle = panose[1];
    if (serifStyle >= 2 && serifStyle <= 10) return 'serif';
    if (serifStyle >= 11 && serifStyle <= 15) return 'sans-serif';
  }

  return null;
}

function detectSerifFromGlyph(font: opentype.Font): 'serif' | 'sans-serif' | null {
  const iGlyph = font.charToGlyph('I');
  if (!iGlyph || iGlyph.index === 0) return null;

  const bb = iGlyph.getBoundingBox();
  const gW = bb.x2 - bb.x1;
  const gH = bb.y2 - bb.y1;
  if (gW === 0 || gH === 0) return null;

  const p = iGlyph.getPath(0, 0, font.unitsPerEm);
  const cmds = p.commands as PathCmd[];
  const pts = flattenCommands(cmds);
  if (pts.length < 4) return null;

  const bottom = bb.y1;
  const top = bb.y2;
  const heightThreshold = gH * 0.1;

  const bottomPts = pts.filter(pt => Math.abs(pt.y - bottom) < heightThreshold);
  const topPts = pts.filter(pt => Math.abs(pt.y - top) < heightThreshold);

  const spanX = (points: { x: number }[]) => {
    if (points.length < 2) return 0;
    const xs = points.map(pt => pt.x);
    return Math.max(...xs) - Math.min(...xs);
  };

  const bottomSpan = spanX(bottomPts);
  const topSpan = spanX(topPts);
  const stemWidth = gW;

  const serifRatio = Math.max(bottomSpan, topSpan) / stemWidth;
  if (serifRatio > 1.4) return 'serif';
  if (serifRatio < 1.15) return 'sans-serif';
  return null;
}

const STRONG_NAME_PATTERNS: { pattern: RegExp; category: FontCategory }[] = [
  { pattern: /(?<!\w)serif\b/i, category: 'serif' },
  { pattern: /\b(slab)\b/i, category: 'serif' },
  { pattern: /\b(bodoni|garamond|baskerville|didot|caslon|palatino|bookman)\b/i, category: 'serif' },
  { pattern: /\b(script|handwrit|brush|calligraph)\b/i, category: 'script' },
  { pattern: /\b(display|stencil|shadow|shadowed|inline|outline|awesome|icon|bitmap|pixel|color)\b/i, category: 'display' },
];

const NAME_CATEGORY_PATTERNS: { pattern: RegExp; category: FontCategory }[] = [
  { pattern: /\b(script|handwrit|hand|brush|calligraph)\b/i, category: 'script' },
  { pattern: /\b(mono|monospace|code|console|terminal)\b/i, category: 'monospace' },
  { pattern: /\b(display|decorat|ornament|poster|stencil)\b/i, category: 'display' },
  { pattern: /(?<!\w)serif\b/i, category: 'serif' },
  { pattern: /\bsans\b/i, category: 'sans-serif' },
];

function getFontNameCandidates(font: opentype.Font): string {
  const names = font.names as any;
  return [
    names?.fontFamily?.en,
    names?.preferredFamily?.en,
    names?.fontSubfamily?.en,
    names?.preferredSubfamily?.en,
  ].filter(Boolean).join(' ');
}

function classifyByStrongName(font: opentype.Font): FontCategory | null {
  const candidates = getFontNameCandidates(font);
  if (!candidates) return null;
  if (/\bsans\b/i.test(candidates)) return null;
  for (const { pattern, category } of STRONG_NAME_PATTERNS) {
    if (pattern.test(candidates)) return category;
  }
  return null;
}

function classifyByName(font: opentype.Font): FontCategory | null {
  const candidates = getFontNameCandidates(font);
  if (!candidates) return null;
  for (const { pattern, category } of NAME_CATEGORY_PATTERNS) {
    if (pattern.test(candidates)) return category;
  }
  return null;
}

export function classifyFont(font: opentype.Font, metrics?: FontMetrics | null): FontCategory {
  const post = font.tables.post as any;
  if (post?.isFixedPitch) return 'monospace';
  if (isMonoByWidths(font)) return 'monospace';

  const strongName = classifyByStrongName(font);
  if (strongName) return strongName;

  const os2 = font.tables.os2 as any;

  if (os2 && os2.sFamilyClass != null) {
    const classId = (os2.sFamilyClass >> 8) & 0xFF;
    if (classId >= 1 && classId <= 5 || classId === 7) return 'serif';
    if (classId === 8) return 'sans-serif';
    if (classId === 10) return 'script';
  }

  const panoseResult = classifyByPanose(os2);
  if (panoseResult) return panoseResult;

  const serifResult = detectSerifFromGlyph(font);
  if (serifResult) return serifResult;

  if (metrics) {
    if (metrics.contrast < 0.4) return 'serif';
    if (metrics.contrast > 0.85) return 'sans-serif';
  }

  const nameResult = classifyByName(font);
  if (nameResult) return nameResult;

  return 'display';
}

// Unicode script ranges for language/script detection
const SCRIPT_RANGES: { name: string; start: number; end: number; minGlyphs: number }[] = [
  { name: 'Basic Latin', start: 0x0020, end: 0x007F, minGlyphs: 26 },
  { name: 'Latin Extended', start: 0x0080, end: 0x024F, minGlyphs: 30 },
  { name: 'Cyrillic', start: 0x0400, end: 0x04FF, minGlyphs: 30 },
  { name: 'Greek', start: 0x0370, end: 0x03FF, minGlyphs: 20 },
  { name: 'Arabic', start: 0x0600, end: 0x06FF, minGlyphs: 20 },
  { name: 'Hebrew', start: 0x0590, end: 0x05FF, minGlyphs: 20 },
  { name: 'Devanagari', start: 0x0900, end: 0x097F, minGlyphs: 20 },
  { name: 'Thai', start: 0x0E00, end: 0x0E7F, minGlyphs: 20 },
  { name: 'CJK', start: 0x4E00, end: 0x9FFF, minGlyphs: 100 },
  { name: 'Hangul', start: 0xAC00, end: 0xD7AF, minGlyphs: 100 },
  { name: 'Japanese Kana', start: 0x3040, end: 0x30FF, minGlyphs: 40 },
  { name: 'Georgian', start: 0x10A0, end: 0x10FF, minGlyphs: 15 },
  { name: 'Armenian', start: 0x0530, end: 0x058F, minGlyphs: 15 },
  { name: 'Bengali', start: 0x0980, end: 0x09FF, minGlyphs: 15 },
  { name: 'Tamil', start: 0x0B80, end: 0x0BFF, minGlyphs: 15 },
  { name: 'Telugu', start: 0x0C00, end: 0x0C7F, minGlyphs: 15 },
  { name: 'Vietnamese', start: 0x01A0, end: 0x01B0, minGlyphs: 4 },
];

export function detectScriptSupport(font: opentype.Font): string[] {
  const counts = new Map<string, number>();
  for (const range of SCRIPT_RANGES) counts.set(range.name, 0);

  for (let i = 0; i < font.glyphs.length; i++) {
    try {
      const g = font.glyphs.get(i);
      if (!g || g.unicode === undefined || g.unicode === null || g.unicode < 0) continue;
      const cp = g.unicode;
      for (const range of SCRIPT_RANGES) {
        if (cp >= range.start && cp <= range.end) {
          counts.set(range.name, (counts.get(range.name) ?? 0) + 1);
        }
      }
    } catch { /* skip broken glyphs */ }
  }

  const supported: string[] = [];
  for (const range of SCRIPT_RANGES) {
    if ((counts.get(range.name) ?? 0) >= range.minGlyphs) {
      supported.push(range.name);
    }
  }
  return supported;
}

const SVG_CHARS = ['A', 'a', 'o', 'O', 'H', 'x', 'n'];

export function extractGlyphSvgs(font: opentype.Font): Record<string, GlyphSvg> | undefined {
  const result: Record<string, GlyphSvg> = {};
  for (const ch of SVG_CHARS) {
    try {
      const glyph = font.charToGlyph(ch);
      if (!glyph || glyph.index === 0) continue;
      const p = glyph.getPath(0, 0, font.unitsPerEm);
      const d = p.toPathData(2);
      if (!d || d.length === 0) continue;
      result[ch] = { d, advWidth: glyph.advanceWidth ?? 0 };
    } catch { /* skip broken glyphs */ }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export function computeFullAnalysis(font: opentype.Font): FullAnalysis {
  let proportions: ProportionsResult | null = null;
  const oGlyph = font.charToGlyph('o');
  if (oGlyph && oGlyph.index !== 0) {
    const bb = oGlyph.getBoundingBox();
    const w = bb.x2 - bb.x1;
    const h = bb.y2 - bb.y1;
    if (w > 0 && h > 0) {
      proportions = { glyphWidth: w, glyphHeight: h, widthToHeightRatio: w / h, advanceWidth: oGlyph.advanceWidth ?? 0 };
    }
  }

  let spacing: SpacingResult | null = null;
  const mGlyph = font.charToGlyph('M');
  if (mGlyph && mGlyph.index !== 0 && (mGlyph.advanceWidth ?? 0) > 0) {
    const testStr = 'Hamburgerfonsz';
    const totalAdv = font.getAdvanceWidth(testStr, font.unitsPerEm);
    const mAdv = mGlyph.advanceWidth!;
    spacing = { testString: testStr, totalAdvanceWidth: totalAdv, mAdvanceWidth: mAdv, ratio: totalAdv / mAdv, charCount: testStr.length, avgCharWidth: totalAdv / testStr.length };
  }

  return {
    contrastLower: measureContrast(font, 'o'),
    contrastUpper: measureContrast(font, 'O'),
    xHeight: measureXHeight(font),
    proportions,
    weight: measureWeight(font),
    spacing,
  };
}

export interface ScanFontResult {
  meta: StoredFont;
}

export async function scanFont(filePath: string, source: FontSource = 'local'): Promise<ScanFontResult | null> {
  try {
    const rawBuffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const isWoff2 = ext === '.woff2';

    let fontBuffer: Buffer;
    if (isWoff2) {
      const decompressed = await woff2Decompress(rawBuffer);
      fontBuffer = Buffer.from(decompressed);
    } else {
      fontBuffer = rawBuffer;
    }

    const arrayBuffer = fontBuffer.buffer.slice(fontBuffer.byteOffset, fontBuffer.byteOffset + fontBuffer.byteLength);
    const font = opentype.parse(arrayBuffer as ArrayBuffer);
    const stat = fs.statSync(filePath);
    let subfamilyName = font.names.fontSubfamily?.en ?? 'Regular';
    let preferredFamily =
      font.names.preferredFamily?.en ??
      (font.names as any).typographicFamily?.en ??
      undefined;
    const preferredSubfamily =
      (font.names as any).preferredSubfamily?.en ??
      (font.names as any).typographicSubfamily?.en ??
      undefined;

    if (preferredSubfamily && /^(Regular|Normal)$/i.test(subfamilyName)) {
      subfamilyName = preferredSubfamily;
    }

    let familyName = font.names.fontFamily?.en;
    if (!isUsableName(familyName)) {
      const fromFile = familyNameFromFile(filePath);
      familyName = fromFile.family;
      if (fromFile.subfamily && subfamilyName === 'Regular') {
        subfamilyName = fromFile.subfamily;
      }
    }

    let style = inferStyle(subfamilyName);

    if (
      preferredFamily &&
      familyName !== preferredFamily &&
      /^(Regular|Normal)$/i.test(subfamilyName)
    ) {
      const diff = computeFamilyDiff(familyName, preferredFamily);
      if (diff) {
        const parsed = parseAbbreviatedSubfamily(diff);
        if (parsed.subfamilyName !== 'Regular' || parsed.style !== 'normal') {
          subfamilyName = parsed.subfamilyName;
          style = parsed.style;
        }
      }
    }

    let inferredFromName = false;
    if (!preferredFamily) {
      const inferred = inferPreferredFamily(familyName);
      if (inferred) {
        const parsed = parseAbbreviatedSubfamily(inferred.diff);
        preferredFamily = parsed.widthRemainder
          ? `${inferred.preferredFamily} ${parsed.widthRemainder}`
          : inferred.preferredFamily;
        if (/^(Regular|Normal)$/i.test(subfamilyName) && (parsed.subfamilyName !== 'Regular' || parsed.style !== 'normal')) {
          subfamilyName = parsed.subfamilyName;
          style = parsed.style;
          inferredFromName = true;
        }
      }
    }

    let weight = inferWeight(font, subfamilyName);
    if (inferredFromName && weight === 400) {
      const fallback = inferWeightFromName(subfamilyName);
      if (fallback !== 400) weight = fallback;
    }

    const metrics = computeFontMetrics(font) ?? undefined;
    const category = classifyFont(font, metrics);
    const glyphSvgs = extractGlyphSvgs(font);
    const analysis = computeFullAnalysis(font);
    const scriptSupport = detectScriptSupport(font);

    const fvar = (font.tables as any).fvar;
    const isVariable = !!fvar?.axes?.length;
    const variableAxes = fvar?.axes?.map((a: any) => ({
      tag: a.tag as string,
      minValue: a.minValue as number,
      defaultValue: a.defaultValue as number,
      maxValue: a.maxValue as number,
      name: typeof a.name === 'object' ? (a.name.en as string | undefined) : (a.name as string | undefined),
    })) ?? [];

    return {
      meta: {
        id: uuidv4(),
        filePath,
        fileName: path.basename(filePath),
        familyName,
        ...(preferredFamily ? { preferredFamilyName: preferredFamily } : {}),
        subfamilyName,
        weight,
        style,
        format: isWoff2 ? 'ttf' : ext.slice(1),
        fileSize: stat.size,
        glyphCount: font.glyphs.length,
        unitsPerEm: font.unitsPerEm,
        ascender: font.ascender,
        descender: font.descender,
        lastModified: stat.mtime.toISOString(),
        addedAt: new Date().toISOString(),
        ...(metrics ? { metrics } : {}),
        category,
        source,
        ...(glyphSvgs ? { glyphSvgs } : {}),
        analysis,
        ...(scriptSupport.length > 0 ? { scriptSupport } : {}),
        ...(isVariable ? { isVariable, variableAxes } : {}),
      },
    };
  } catch {
    return null;
  }
}

export async function scanFolder(folderPath: string, source: FontSource = 'local'): Promise<ScanFontResult[]> {
  const resolved = path.resolve(folderPath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`Not a valid directory: ${folderPath}`);
  }

  const files = walkDir(resolved);
  const fonts: ScanFontResult[] = [];

  for (const file of files) {
    const result = await scanFont(file, source);
    if (result) fonts.push(result);
  }

  return fonts;
}
