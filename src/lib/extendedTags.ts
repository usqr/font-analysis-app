import type { ExtendedTags, FontCategory, GlyphSvg, StoredFontMeta } from '../types/index.js';

export type { ExtendedTags };

/**
 * Extended tags: a classification derived from the glyph outlines that the
 * scanner stores (`glyphSvgs`), not only from the metadata inside the font
 * file (OS/2 class, PANOSE, names). It corrects serif fonts that the file
 * metadata labels as sans or display, and it detects slab serifs.
 */

export type SerifKind = 'serif' | 'slab' | 'sans';

type Pt = { x: number; y: number };

const CURVE_STEPS = 8;

/** Flattens an SVG path (absolute M/L/Q/C/Z, as the scanner writes it) into closed polygons. */
export function pathToPolygons(d: string): Pt[][] {
  const tokens = d.match(/[MLQCZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) ?? [];
  const polys: Pt[][] = [];
  let cur: Pt[] = [];
  let cmd = '';
  let i = 0;
  const num = () => parseFloat(tokens[i++]);
  let last: Pt = { x: 0, y: 0 };
  while (i < tokens.length) {
    if (/[MLQCZ]/i.test(tokens[i])) cmd = tokens[i++].toUpperCase();
    if (cmd === 'Z') {
      if (cur.length > 2) polys.push(cur);
      cur = [];
      continue;
    }
    if (cmd === 'M') {
      if (cur.length > 2) polys.push(cur);
      last = { x: num(), y: num() };
      cur = [last];
      cmd = 'L';
    } else if (cmd === 'L') {
      last = { x: num(), y: num() };
      cur.push(last);
    } else if (cmd === 'Q') {
      const c = { x: num(), y: num() };
      const e = { x: num(), y: num() };
      for (let s = 1; s <= CURVE_STEPS; s++) {
        const t = s / CURVE_STEPS, u = 1 - t;
        cur.push({ x: u * u * last.x + 2 * u * t * c.x + t * t * e.x, y: u * u * last.y + 2 * u * t * c.y + t * t * e.y });
      }
      last = e;
    } else if (cmd === 'C') {
      const c1 = { x: num(), y: num() };
      const c2 = { x: num(), y: num() };
      const e = { x: num(), y: num() };
      for (let s = 1; s <= CURVE_STEPS; s++) {
        const t = s / CURVE_STEPS, u = 1 - t;
        cur.push({
          x: u * u * u * last.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * e.x,
          y: u * u * u * last.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * e.y,
        });
      }
      last = e;
    } else {
      i++; // unknown token: skip it so that the loop always ends
    }
  }
  if (cur.length > 2) polys.push(cur);
  return polys;
}

/** Filled horizontal runs [x0, x1] where the line at `y` crosses the outline (nonzero winding rule). */
export function scanRuns(polys: Pt[][], y: number): [number, number][] {
  const hits: { x: number; dir: number }[] = [];
  for (const poly of polys) {
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k], b = poly[(k + 1) % poly.length];
      if ((a.y <= y) === (b.y <= y)) continue;
      hits.push({ x: a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x), dir: b.y > a.y ? 1 : -1 });
    }
  }
  hits.sort((p, q) => p.x - q.x);
  const runs: [number, number][] = [];
  let wind = 0;
  let start = 0;
  for (const { x, dir } of hits) {
    const before = wind;
    wind += dir;
    if (before === 0 && wind !== 0) start = x;
    else if (before !== 0 && wind === 0) runs.push([start, x]);
  }
  return runs;
}

function runAround(runs: [number, number][], x: number): [number, number] | undefined {
  return runs.find(([a, b]) => a <= x && x <= b);
}

export interface SerifMeasure {
  /** Widest stroke ending near the baseline or cap line, relative to the stem width. */
  foot: number;
  /** Serif thickness (height of the full-width part), relative to the stem width. */
  thick: number;
  /** Height of the bracket (taper above the full-width part), relative to the stem width. */
  bracket: number;
}

const STEP = 0.005;

/**
 * Measures the stroke endings of the "H" glyph. The left stem width is
 * measured at 30% of the cap height. Serifs show as a wider run near the
 * baseline and near the cap line.
 */
export function measureSerifs(glyph: GlyphSvg | undefined): SerifMeasure | null {
  if (!glyph?.d) return null;
  const polys = pathToPolygons(glyph.d);
  let minY = Infinity, maxY = -Infinity;
  for (const p of polys) for (const pt of p) { minY = Math.min(minY, pt.y); maxY = Math.max(maxY, pt.y); }
  const h = maxY - minY;
  if (!(h > 0)) return null;

  const stemRuns = scanRuns(polys, maxY - 0.3 * h);
  if (stemRuns.length < 2) return null;
  const [a, b] = stemRuns[0];
  const w = b - a;
  if (!(w > 0)) return null;
  const mid = (a + b) / 2;

  // Width of the left stroke at `frac` of the height, from the baseline and from the cap line.
  const widthAt = (frac: number) => {
    const at = (y: number) => {
      const r = runAround(scanRuns(polys, y), mid);
      return r ? r[1] - r[0] : w;
    };
    return Math.max(at(maxY - frac * h), at(minY + frac * h));
  };

  const foot = Math.max(widthAt(0.005), widthAt(0.01), widthAt(0.02), widthAt(0.03));
  // The full-width part keeps at least 70% of the extra width. The bracket
  // continues until the stroke is less than 10% wider than the stem.
  const keep = w + 0.7 * (foot - w);
  let f = STEP;
  while (f <= 0.3 && widthAt(f) >= keep) f += STEP;
  const thick = f - STEP;
  while (f <= 0.4 && widthAt(f) > 1.1 * w) f += STEP;
  return { foot: foot / w, thick: (thick * h) / w, bracket: ((f - thick) * h) / w };
}

/** Minimum serif thickness, relative to the stem width, for a slab serif. */
export const SLAB_MIN_THICKNESS = 0.55;
/** Maximum bracket height, relative to the stem width, for a slab serif (slabs are unbracketed). */
export const SLAB_MAX_BRACKET = 0.35;

export function classifySerifs(glyph: GlyphSvg | undefined): SerifKind | null {
  const m = measureSerifs(glyph);
  if (!m) return null;
  if (m.foot < 1.15) return 'sans';
  if (m.foot < 1.35) return null;
  return m.thick >= SLAB_MIN_THICKNESS && m.bracket <= SLAB_MAX_BRACKET ? 'slab' : 'serif';
}

/**
 * Categories from the file metadata that the outline analysis can correct.
 * Display, script and monospace stay as they are: a serif on "H" does not
 * make a decorative face a text serif.
 */
const CORRECTABLE: ReadonlySet<FontCategory | undefined> = new Set<FontCategory | undefined>([
  undefined, 'serif', 'sans-serif',
]);

export function extendedTagsFor(font: Pick<StoredFontMeta, 'category' | 'glyphSvgs'>): ExtendedTags {
  const kind = classifySerifs(font.glyphSvgs?.H);
  if (!kind || !CORRECTABLE.has(font.category)) return { category: font.category, slab: false };
  if (kind === 'sans') return { category: 'sans-serif', slab: false };
  return { category: 'serif', slab: kind === 'slab' };
}

const hasOutline = (f: StoredFontMeta) => !!f.glyphSvgs?.H;
const hasTags = (f: StoredFontMeta) => hasOutline(f) || !!f.extendedTags;

/** Extended tags of one font: computed from its "H" outline, or the precomputed value. */
export function extendedTagsOf(font: StoredFontMeta): ExtendedTags {
  if (hasOutline(font)) return extendedTagsFor(font);
  return font.extendedTags ?? { category: font.category, slab: false };
}

/**
 * Extended tags for a family. Uses `preferred` when it has analysis data,
 * otherwise the first font of the family that has it.
 */
export function familyExtendedTags(preferred: StoredFontMeta, fonts: StoredFontMeta[]): ExtendedTags {
  return extendedTagsOf(hasTags(preferred) ? preferred : fonts.find(hasTags) ?? preferred);
}

export type CategoryOrigin = 'override' | 'metadata' | 'analysis';

export interface ResolvedCategory {
  category?: FontCategory;
  slab: boolean;
  origin: CategoryOrigin;
}

/**
 * The category to show for a family. A user override always wins. With
 * `extended` on, the outline analysis can correct the metadata category
 * and add the slab tag.
 */
export function resolveCategory(preferred: StoredFontMeta, fonts: StoredFontMeta[], extended: boolean): ResolvedCategory {
  const ext = extended ? familyExtendedTags(preferred, fonts) : undefined;
  if (preferred.categoryOverride) {
    return { category: preferred.categoryOverride, slab: preferred.categoryOverride === 'serif' && !!ext?.slab, origin: 'override' };
  }
  if (!ext) return { category: preferred.category, slab: false, origin: 'metadata' };
  const changed = ext.category !== preferred.category || ext.slab;
  return { category: ext.category, slab: ext.slab, origin: changed ? 'analysis' : 'metadata' };
}
