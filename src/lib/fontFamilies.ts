import type { StoredFontMeta, FontFamily } from '../types';
import {
  WEIGHT_TOKENS,
  STYLE_TOKENS,
  WIDTH_TOKENS,
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
  const tokens = diff.split(/\s+/).filter((t) => t.length > 0);
  const allRecognized = tokens.every(
    (t) => WEIGHT_TOKENS.has(t) || STYLE_TOKENS.has(t) || WIDTH_TOKENS.has(t),
  );
  if (!allRecognized) return '';
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

export function groupByFamily(fonts: StoredFontMeta[]): FontFamily[] {
  const map = new Map<string, StoredFontMeta[]>();

  for (const font of fonts) {
    const src = font.source ?? 'local';
    const key = `${src}\0${superFamilyName(font)}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(font);
  }

  const families: FontFamily[] = [];
  for (const [key, members] of map) {
    const [src, familyName] = key.split('\0');
    members.sort((a, b) => {
      if (a.weight !== b.weight) return a.weight - b.weight;
      return a.style.localeCompare(b.style);
    });
    families.push({ familyName, fonts: members, source: src as any });
  }

  families.sort((a, b) => a.familyName.localeCompare(b.familyName));
  return families;
}
