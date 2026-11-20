// Filter model of the library sidebar. Pure functions, so `node --test` runs them.
import type { FontCategory, FontMetrics, FontSource } from '../types';
import type { ResolvedCategory } from './extendedTags';

export type CatKey = FontCategory | 'slab';
export type VfFilter = 'all' | 'variable' | 'static';
export type MetricKey = keyof FontMetrics;
export type Range = [number, number];

export const CAT_ORDER: CatKey[] = ['serif', 'sans-serif', 'monospace', 'display', 'script', 'slab'];

/** `short` goes on tiles, `long` in filters and menus. */
export const CAT_LABELS: Record<CatKey, { short: string; long: string }> = {
  'serif': { short: 'Serif', long: 'Serif' },
  'sans-serif': { short: 'Sans', long: 'Sans-Serif' },
  'monospace': { short: 'Mono', long: 'Monospace' },
  'display': { short: 'Display', long: 'Display' },
  'script': { short: 'Script', long: 'Script' },
  'slab': { short: 'Slab', long: 'Slab' },
};

/** The filter key of a resolved category: a slab serif counts as "slab". */
export function catKeyOf(resolved?: ResolvedCategory): CatKey | undefined {
  return resolved?.slab ? 'slab' : resolved?.category;
}

/** CSS color token of each category dot. */
export const CAT_COLOR: Record<CatKey, string> = {
  'serif': 'var(--cat-serif)',
  'sans-serif': 'var(--cat-sans)',
  'monospace': 'var(--cat-mono)',
  'display': 'var(--cat-display)',
  'script': 'var(--cat-script)',
  'slab': 'var(--cat-slab)',
};

export const METRICS: { key: MetricKey; label: string }[] = [
  { key: 'contrast', label: 'Contrast' },
  { key: 'weight', label: 'Weight' },
  { key: 'width', label: 'Width' },
  { key: 'xHeight', label: 'X-Height' },
];

export interface Filters {
  search: string;
  starred: boolean;
  source: FontSource | null;
  vf: VfFilter;
  cats: CatKey[];
  stylesMin: number;
  stylesMax: number | null;
  axesMin: number;
  axesMax: number | null;
  /** A missing key means the full range. */
  ranges: Partial<Record<MetricKey, Range>>;
  excludeLatinOnly: boolean;
  scripts: string[];
}

export const DEFAULT_FILTERS: Filters = {
  search: '', starred: false, source: null, vf: 'all', cats: [],
  stylesMin: 1, stylesMax: null, axesMin: 1, axesMax: null,
  ranges: {}, excludeLatinOnly: false, scripts: [],
};

/** What the filters need to know about one family. */
export interface FamilyFacts {
  name: string;
  starred: boolean;
  sources: FontSource[];
  variable: boolean;
  cat?: CatKey;
  styleCount: number;
  axisCount: number;
  metrics?: FontMetrics;
  scripts: Set<string>;
  /** True when every font of the family supports Basic Latin only. */
  latinOnly: boolean;
}

export type Extents = Partial<Record<MetricKey, Range>>;

/** The axes filter exists only for variable families, so a change of type clears it. */
export function setVf(f: Filters, vf: VfFilter): Filters {
  return vf === 'variable' ? { ...f, vf } : { ...f, vf, axesMin: 1, axesMax: null };
}

export function rangeActive(f: Filters, key: MetricKey, ext: Extents): boolean {
  const r = f.ranges[key];
  const e = ext[key];
  return !!r && !!e && (r[0] > e[0] || r[1] < e[1]);
}

function inCount(n: number, min: number, max: number | null): boolean {
  return n >= min && (max == null || n <= max);
}

function passesMetrics(fam: FamilyFacts, f: Filters, ext: Extents): boolean {
  if (!fam.metrics) return true;
  for (const { key } of METRICS) {
    const r = f.ranges[key];
    if (!r || !rangeActive(f, key, ext)) continue;
    const v = fam.metrics[key];
    if (v < r[0] || v > r[1]) return false;
  }
  return true;
}

function passesBasic(fam: FamilyFacts, f: Filters): boolean {
  if (f.search && !fam.name.toLowerCase().includes(f.search.trim().toLowerCase())) return false;
  if (f.starred && !fam.starred) return false;
  if (f.source && !fam.sources.includes(f.source)) return false;
  if (f.vf !== 'all' && fam.variable !== (f.vf === 'variable')) return false;
  if (f.cats.length && (!fam.cat || !f.cats.includes(fam.cat))) return false;
  if (!inCount(fam.styleCount, f.stylesMin, f.stylesMax)) return false;
  return f.vf !== 'variable' || inCount(fam.axisCount, f.axesMin, f.axesMax);
}

export function matches(fam: FamilyFacts, f: Filters, ext: Extents): boolean {
  if (!passesBasic(fam, f) || !passesMetrics(fam, f, ext)) return false;
  if (f.excludeLatinOnly && fam.latinOnly) return false;
  return f.scripts.every((s) => fam.scripts.has(s));
}

export interface ActiveChip {
  id: string;
  label: string;
  cat?: CatKey;
  advanced?: boolean;
}

const fmt2 = (n: number) => n.toFixed(2);

export function activeChips(f: Filters, ext: Extents): ActiveChip[] {
  const list: ActiveChip[] = [];
  if (f.search.trim()) list.push({ id: 'search', label: `“${f.search.trim()}”` });
  if (f.starred) list.push({ id: 'starred', label: 'Starred' });
  if (f.source) list.push({ id: 'source', label: f.source === 'local' ? 'Local' : 'Google' });
  if (f.vf !== 'all') list.push({ id: 'vf', label: f.vf === 'variable' ? 'Variable' : 'Static' });
  for (const c of f.cats) list.push({ id: `cat:${c}`, label: CAT_LABELS[c].long, cat: c });
  if (f.stylesMin > 1 || f.stylesMax != null) list.push({ id: 'styles', label: `Styles ${f.stylesMin}–${f.stylesMax ?? '∞'}` });
  if (f.vf === 'variable' && (f.axesMin > 1 || f.axesMax != null)) list.push({ id: 'axes', label: `Axes ${f.axesMin}–${f.axesMax ?? '∞'}` });
  for (const { key, label } of METRICS) {
    const r = f.ranges[key];
    if (r && rangeActive(f, key, ext)) list.push({ id: `range:${key}`, label: `${label} ${fmt2(r[0])}–${fmt2(r[1])}`, advanced: true });
  }
  if (f.excludeLatinOnly) list.push({ id: 'latin', label: 'No basic-Latin-only', advanced: true });
  for (const s of f.scripts) list.push({ id: `script:${s}`, label: `Requires ${s}`, advanced: true });
  return list;
}

/** Returns the filters without the filter that the chip `id` shows. */
export function clearChip(f: Filters, id: string): Filters {
  const [kind, value] = id.split(/:(.*)/s);
  switch (kind) {
    case 'search': return { ...f, search: '' };
    case 'starred': return { ...f, starred: false };
    case 'source': return { ...f, source: null };
    case 'vf': return setVf(f, 'all');
    case 'cat': return { ...f, cats: f.cats.filter((c) => c !== value) };
    case 'styles': return { ...f, stylesMin: 1, stylesMax: null };
    case 'axes': return { ...f, axesMin: 1, axesMax: null };
    case 'range': {
      const ranges = { ...f.ranges };
      delete ranges[value as MetricKey];
      return { ...f, ranges };
    }
    case 'latin': return { ...f, excludeLatinOnly: false };
    case 'script': return { ...f, scripts: f.scripts.filter((s) => s !== value) };
    default: return f;
  }
}

/** Adds `item` to `list` or removes it. */
export function toggleItem<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

/** Smallest and largest value of each metric, over the families that have metrics. */
export function metricExtents(metrics: (FontMetrics | undefined)[]): Extents {
  const ext: Extents = {};
  for (const m of metrics) {
    if (!m) continue;
    for (const { key } of METRICS) {
      const e = ext[key];
      ext[key] = e ? [Math.min(e[0], m[key]), Math.max(e[1], m[key])] : [m[key], m[key]];
    }
  }
  return ext;
}
