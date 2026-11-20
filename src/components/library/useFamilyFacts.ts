import { useMemo } from 'react';
import type { FontFamily, StoredFontMeta } from '../../types';
import { resolveCategory, type ResolvedCategory } from '../../lib/extendedTags';
import { catKeyOf, metricExtents, METRICS, type FamilyFacts, type MetricKey } from '../../lib/libraryFilters';

const SCRIPT_ORDER = ['Latin Extended', 'Cyrillic', 'Greek', 'Arabic', 'Hebrew', 'Devanagari',
  'Bengali', 'Tamil', 'Telugu', 'Thai', 'Georgian', 'Armenian', 'CJK', 'Hangul', 'Japanese Kana', 'Vietnamese'];

/** The font that stands for the family in metrics and categories: the upright regular. */
function regularOf(fonts: StoredFontMeta[]): StoredFontMeta {
  return fonts.find((f) => f.weight >= 380 && f.weight <= 420 && f.style === 'normal')
    ?? fonts.find((f) => f.style === 'normal') ?? fonts[0];
}

function scriptsOf(fonts: StoredFontMeta[]): Set<string> {
  const out = new Set<string>();
  for (const f of fonts) for (const s of f.scriptSupport ?? []) out.add(s);
  return out;
}

function factsOf(fam: FontFamily, resolved: ResolvedCategory | undefined, starred: boolean): FamilyFacts {
  const fonts = fam.fonts;
  return {
    name: fam.familyName,
    starred,
    sources: fam.sources ?? [fam.source ?? 'local'],
    variable: !!fam.hasVariable,
    cat: catKeyOf(resolved),
    styleCount: fonts.length,
    axisCount: Math.max(0, ...fonts.map((f) => f.variableAxes?.length ?? 0)),
    metrics: regularOf(fonts)?.metrics,
    scripts: scriptsOf(fonts),
    latinOnly: !fonts.some((f) => !f.scriptSupport || f.scriptSupport.some((s) => s !== 'Basic Latin')),
  };
}

/**
 * Per-family data for the filters. `resolved` changes only with the families
 * or the tag mode, so a star change does not re-render the tiles.
 */
export function useFamilyFacts(families: FontFamily[], extended: boolean, isStarred: (name: string) => boolean) {
  const resolved = useMemo(() => {
    const map = new Map<string, ResolvedCategory>();
    for (const fam of families) map.set(fam.familyName, resolveCategory(regularOf(fam.fonts), fam.fonts, extended));
    return map;
  }, [families, extended]);

  const facts = useMemo(() => {
    const map = new Map<string, FamilyFacts>();
    for (const fam of families) map.set(fam.familyName, factsOf(fam, resolved.get(fam.familyName), isStarred(fam.familyName)));
    return map;
  }, [families, resolved, isStarred]);

  const metricsData = useMemo(() => {
    const all = families.map((fam) => regularOf(fam.fonts)?.metrics);
    const values = Object.fromEntries(METRICS.map(({ key }) => [key, all.flatMap((m) => (m ? [m[key]] : []))])) as Record<MetricKey, number[]>;
    return { extents: metricExtents(all), values };
  }, [families]);

  const scripts = useMemo(() => {
    const present = scriptsOf(families.flatMap((f) => f.fonts));
    return SCRIPT_ORDER.filter((s) => present.has(s));
  }, [families]);

  return { resolved, facts, scripts, ...metricsData };
}
