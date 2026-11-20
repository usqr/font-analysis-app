// How a family maps to font files, axes and weights for the library tiles.
import type { StoredFontMeta, VariableAxis } from '../types';
import { groupByWidth, uniqueSortedWeights, weightLabel, type WidthStyleGroup } from './fontFamilies';

const isSlanted = (f: StoredFontMeta) => f.style === 'italic' || f.style === 'oblique';
const SLANT_TAGS = new Set(['ital', 'slnt']);

export interface FamilyFaces {
  variable: boolean;
  /** Variable: the upright variable file. Static: the regular file. */
  upright: StoredFontMeta;
  /** A separate italic variable file, if the family has one. */
  italicVf?: StoredFontMeta;
  /** Axes of the upright variable file (empty for static families). */
  axes: VariableAxis[];
  wghtAxis?: VariableAxis;
  /** An `ital` or `slnt` axis inside the upright variable file. */
  slantAxis?: VariableAxis;
  /** Axes for the second tile control: all except weight and slant. */
  otherAxes: VariableAxis[];
  groups: Map<string, WidthStyleGroup>;
  widthKeys: string[];
  canItalic: boolean;
  /** True when the slanted style is an oblique, not an italic. */
  oblique: boolean;
}

function regularStatic(fonts: StoredFontMeta[]): StoredFontMeta {
  return fonts.find((f) => f.weight >= 380 && f.weight <= 420 && f.style === 'normal')
    ?? fonts.find((f) => f.style === 'normal') ?? fonts[0];
}

function mostAxes(fonts: StoredFontMeta[]): StoredFontMeta | undefined {
  return fonts.reduce<StoredFontMeta | undefined>(
    (best, f) => (!best || f.variableAxes!.length > best.variableAxes!.length ? f : best), undefined);
}

export function familyFaces(fonts: StoredFontMeta[]): FamilyFaces {
  const variables = fonts.filter((f) => f.isVariable && f.variableAxes?.length);
  const uprightVf = mostAxes(variables.filter((f) => !isSlanted(f))) ?? mostAxes(variables);
  const italicVf = uprightVf && !isSlanted(uprightVf) ? mostAxes(variables.filter(isSlanted)) : undefined;
  const axes = uprightVf?.variableAxes ?? [];
  const slantAxis = axes.find((a) => SLANT_TAGS.has(a.tag));
  const groups = groupByWidth(fonts);
  const variable = !!uprightVf;
  return {
    variable,
    upright: uprightVf ?? regularStatic(fonts),
    italicVf,
    axes,
    wghtAxis: axes.find((a) => a.tag === 'wght'),
    slantAxis,
    otherAxes: axes.filter((a) => a.tag !== 'wght' && !SLANT_TAGS.has(a.tag)),
    groups,
    widthKeys: Array.from(groups.keys()),
    canItalic: variable ? !!italicVf || !!slantAxis : fonts.some(isSlanted),
    oblique: slantAxis?.tag === 'slnt' || fonts.some((f) => f.style === 'oblique'),
  };
}

/** Files of one width with the given slant, or the other slant if there are none. */
export function stylePool(group: WidthStyleGroup | undefined, italic: boolean): StoredFontMeta[] {
  if (!group) return [];
  const [want, other] = italic ? [group.italic, group.normal] : [group.normal, group.italic];
  return want.length ? want : other;
}

/** Weights in steps of 100 inside the axis range, for example 100…900. */
export function weightStops(axis: VariableAxis): number[] {
  const out: number[] = [];
  for (let w = Math.ceil(axis.minValue / 100) * 100; w <= axis.maxValue; w += 100) out.push(w);
  return out.length ? out : [Math.round(axis.defaultValue)];
}

/**
 * `font-variation-settings` for a variable preview. A separate italic file
 * makes the slant, so the slant axis is set only for the upright file.
 */
export function variationSettings(faces: FamilyFaces, values: Record<string, number>, italic: boolean): string {
  const useItalicFile = italic && !!faces.italicVf;
  const parts = faces.axes
    .filter((a) => !SLANT_TAGS.has(a.tag))
    .map((a) => `'${a.tag}' ${values[a.tag] ?? a.defaultValue}`);
  const s = faces.slantAxis;
  if (s && !useItalicFile) {
    const on = s.tag === 'ital' ? s.maxValue : s.minValue;
    parts.push(`'${s.tag}' ${italic ? on : s.defaultValue}`);
  }
  return parts.join(', ');
}

/* ───────────── Compare options ───────────── */

export interface CompareOption {
  fontId: string;
  /** A weight for a variable file. Static files have no `wght`. */
  wght?: number;
  weight: number;
  label: string;
}

export interface CompareGroup {
  legend: string;
  options: CompareOption[];
}

export function compareLabel(family: string, weight: number | null, italic: boolean, oblique: boolean): string {
  const slant = oblique ? 'Oblique' : 'Italic';
  if (weight == null) return italic ? `${family} ${slant}` : family;
  if (!italic) return `${family} ${weightLabel(weight)}`;
  return weight === 400 ? `${family} ${slant}` : `${family} ${weightLabel(weight)} ${slant}`;
}

function variableOptions(name: string, file: StoredFontMeta, italic: boolean, oblique: boolean): CompareOption[] {
  const axis = file.variableAxes?.find((a) => a.tag === 'wght');
  if (!axis) return [{ fontId: file.id, weight: file.weight, label: compareLabel(name, null, italic, oblique) }];
  return weightStops(axis).map((w) => ({ fontId: file.id, wght: w, weight: w, label: compareLabel(name, w, italic, oblique) }));
}

function staticOptions(name: string, files: StoredFontMeta[], italic: boolean, oblique: boolean): CompareOption[] {
  return uniqueSortedWeights(files).map((w) => ({
    fontId: files.find((f) => f.weight === w)!.id,
    weight: w,
    label: compareLabel(name, w, italic, oblique),
  }));
}

/**
 * Styles that the compare menu of a tile offers. `widthKey` selects the width
 * of a static family. `name` is the family name plus the width, if any.
 */
export function compareGroups(faces: FamilyFaces, name: string, widthKey: string): CompareGroup[] {
  const slantLegend = faces.oblique ? 'Oblique' : 'Italic';
  const [upright, italic] = faces.variable
    ? [
        variableOptions(name, faces.upright, false, faces.oblique),
        faces.italicVf ? variableOptions(name, faces.italicVf, true, faces.oblique) : [],
      ]
    : [
        staticOptions(name, faces.groups.get(widthKey)?.normal ?? [], false, faces.oblique),
        staticOptions(name, faces.groups.get(widthKey)?.italic ?? [], true, faces.oblique),
      ];
  const groups: CompareGroup[] = [];
  if (upright.length) groups.push({ legend: italic.length ? 'Upright' : 'Weights', options: upright });
  if (italic.length) groups.push({ legend: slantLegend, options: italic });
  return groups;
}

/** Name of a tile style: family name plus the width, if the width is not the default. */
export function styleName(family: string, widthKey: string): string {
  return widthKey === 'Default' ? family : `${family} ${widthKey}`;
}
