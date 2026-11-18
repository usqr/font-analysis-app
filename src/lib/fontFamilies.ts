import type { StoredFontMeta, FontFamily, FontSource } from '../types';
import {
  WEIGHT_TOKENS,
  STYLE_TOKENS,
  WIDTH_TOKENS,
  TYPE_TOKENS,
  extractTrailingWidth,
  extractTrailingType,
  stripTrailingQualifiers,
  computeFamilyDiff,
} from './fontNameTokens.js';

export { extractTrailingWidth };

const WEIGHT_LABELS: Record<number, string> = {
  100: 'Thin',
  200: 'ExtraLight',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'SemiBold',
  700: 'Bold',
  800: 'ExtraBold',
  900: 'Black',
};

export function superFamilyName(font: StoredFontMeta): string {
  const name = font.preferredFamilyName ?? font.familyName;
  return stripTrailingQualifiers(name).baseName;
}

export function weightLabel(weight: number): string {
  if (WEIGHT_LABELS[weight]) return WEIGHT_LABELS[weight];
  const keys = Object.keys(WEIGHT_LABELS).map(Number).sort((a, b) => a - b);
  let closest = keys[0];
  for (const k of keys) {
    if (Math.abs(k - weight) < Math.abs(closest - weight)) closest = k;
  }
  return WEIGHT_LABELS[closest] ?? String(weight);
}

export function displayFamilyName(font: StoredFontMeta): string {
  return superFamilyName(font);
}

export function widthQualifier(font: StoredFontMeta): string {
  const groupName = font.preferredFamilyName;

  if (groupName) {
    const { width } = extractTrailingWidth(groupName);
    if (width) return width;

    const { typeName } = extractTrailingType(groupName);
    if (typeName) return typeName;
  }

  const name = font.preferredFamilyName ?? font.familyName;
  const { typeName } = extractTrailingType(name);
  if (typeName) return typeName;

  if (!groupName || groupName === font.familyName) return '';
  const diff = computeFamilyDiff(font.familyName, groupName);
  if (!diff) return '';

  const rawTokens = diff.split(/\s+/).filter((t) => t.length > 0);
  const isKnown = (t: string) => WEIGHT_TOKENS.has(t) || STYLE_TOKENS.has(t) || WIDTH_TOKENS.has(t) || TYPE_TOKENS.has(t);
  const tokens: string[] = [];
  for (let i = 0; i < rawTokens.length; i++) {
    if (i + 1 < rawTokens.length) {
      const compound = rawTokens[i] + ' ' + rawTokens[i + 1];
      if (isKnown(compound)) { tokens.push(compound); i++; continue; }
    }
    tokens.push(rawTokens[i]);
  }

  if (!tokens.every(isKnown)) return '';
  const remaining = tokens.filter(
    (t) => !WEIGHT_TOKENS.has(t) && !STYLE_TOKENS.has(t),
  );
  return remaining.join(' ');
}

export function variantLabel(font: StoredFontMeta, excludeWidth = false): string {
  const qualifier = excludeWidth ? '' : widthQualifier(font);
  const w = weightLabel(font.weight);
  const parts: string[] = [];
  if (qualifier) parts.push(qualifier);
  parts.push(w);
  if (font.style === 'italic') parts.push('Italic');
  if (font.style === 'oblique') parts.push('Oblique');
  return parts.join(' ');
}

export interface WidthStyleGroup {
  normal: StoredFontMeta[];
  italic: StoredFontMeta[];
}

export function groupByWidth(fonts: StoredFontMeta[]): Map<string, WidthStyleGroup> {
  const map = new Map<string, WidthStyleGroup>();

  for (const font of fonts) {
    const width = widthQualifier(font) || 'Default';
    if (!map.has(width)) map.set(width, { normal: [], italic: [] });
    const group = map.get(width)!;
    if (font.style === 'italic' || font.style === 'oblique') {
      group.italic.push(font);
    } else {
      group.normal.push(font);
    }
  }

  const sortFn = (a: StoredFontMeta, b: StoredFontMeta) => a.weight - b.weight;
  for (const group of map.values()) {
    group.normal.sort(sortFn);
    group.italic.sort(sortFn);
  }

  return map;
}

export function uniqueSortedWeights(fonts: StoredFontMeta[]): number[] {
  return Array.from(new Set(fonts.map((f) => f.weight))).sort((a, b) => a - b);
}

export function fontForWeightStyleWidth(
  fonts: StoredFontMeta[],
  weight: number,
  widthKey: string | null,
  italic: boolean,
): StoredFontMeta | undefined {
  const groups = groupByWidth(fonts);
  const group = (widthKey ? groups.get(widthKey) : undefined) ?? groups.values().next().value;
  if (!group) return undefined;
  const pool = italic
    ? (group.italic.length > 0 ? group.italic : group.normal)
    : (group.normal.length > 0 ? group.normal : group.italic);
  if (pool.length === 0) return undefined;
  let closest = pool[0];
  for (const f of pool) {
    if (Math.abs(f.weight - weight) < Math.abs(closest.weight - weight)) closest = f;
  }
  return closest;
}

export function familyKey(familyName: string): string {
  return familyName;
}

export function groupByFamily(fonts: StoredFontMeta[], starredFamilies?: Set<string>): FontFamily[] {
  const map = new Map<string, StoredFontMeta[]>();

  for (const font of fonts) {
    const name = superFamilyName(font);
    if (!map.has(name)) map.set(name, []);
    map.get(name)!.push(font);
  }

  const families: FontFamily[] = [];
  for (const [name, members] of map) {
    members.sort((a, b) => {
      if (a.weight !== b.weight) return a.weight - b.weight;
      return a.style.localeCompare(b.style);
    });
    const sourcesSet = new Set(members.map((f) => f.source ?? 'local' as FontSource));
    const sources = Array.from(sourcesSet) as FontSource[];
    const dominantSource = sources.includes('local') ? 'local' as FontSource : sources[0];
    const fKey = familyKey(name);
    const hasVariable = members.some((f) => f.isVariable);
    families.push({ familyName: name, fonts: members, source: dominantSource, sources, starred: starredFamilies?.has(fKey), ...(hasVariable ? { hasVariable } : {}) });
  }

  families.sort((a, b) => a.familyName.localeCompare(b.familyName));
  return families;
}
