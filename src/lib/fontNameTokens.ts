export const WEIGHT_ABBREVS: Record<string, string> = {
  Bld: 'Bold', Blk: 'Black', Lgt: 'Light', Med: 'Medium',
  Reg: 'Regular', Thn: 'Thin', Ult: 'Ultra',
  Hvy: 'Heavy', Smb: 'SemiBold', Dmb: 'DemiBold',
  Ext: 'Extra', Bk: 'Book',
  Bol: 'Bold', Lig: 'Light', Hea: 'Heavy', Boo: 'Book',
  Dem: 'DemiBold', Bla: 'Black', Sem: 'SemiBold', Thi: 'Thin',
  Nor: 'Regular',
  Bold: 'Bold', Black: 'Black', Light: 'Light', Medium: 'Medium',
  Regular: 'Regular', Thin: 'Thin', Heavy: 'Heavy',
  SemiBold: 'SemiBold', DemiBold: 'DemiBold', Book: 'Book',
  ExtraLight: 'ExtraLight', UltraLight: 'UltraLight',
  ExtraBold: 'ExtraBold', UltraBold: 'UltraBold',
  Hairline: 'Hairline',
};

export const WIDTH_ABBREVS: Record<string, string> = {
  Nar: 'Narrow', Con: 'Condensed', Wid: 'Wide',
  Exp: 'Expanded', Com: 'Compressed', Cnd: 'Condensed',
  Narrow: 'Narrow', Condensed: 'Condensed', Wide: 'Wide',
  Expanded: 'Expanded', Compressed: 'Compressed',
  SemiCondensed: 'SemiCondensed', SemiExpanded: 'SemiExpanded',
};

export const STYLE_ABBREVS: Record<string, 'italic' | 'oblique'> = {
  It: 'italic', Obl: 'oblique',
  Italic: 'italic', Oblique: 'oblique',
};

export const WEIGHT_TOKENS = new Set([
  'Thin', 'Hairline', 'ExtraLight', 'Extra Light', 'UltraLight', 'Ultra Light',
  'Light', 'Regular', 'Normal', 'Book',
  'Medium', 'SemiBold', 'Semi Bold', 'DemiBold', 'Demi Bold',
  'Bold', 'ExtraBold', 'Extra Bold', 'UltraBold', 'Ultra Bold',
  'Black', 'Heavy', 'Ultra',
  'Bld', 'Blk', 'Lgt', 'Med', 'Reg', 'Thn', 'Ult', 'Hvy', 'Smb', 'Dmb', 'Ext', 'Bk',
  'Bol', 'Lig', 'Hea', 'Boo', 'Dem', 'Bla', 'Sem', 'Thi', 'Nor',
]);

export const STYLE_TOKENS = new Set(['Italic', 'Oblique', 'It', 'Obl']);

export const WIDTH_TOKENS = new Set([
  'Condensed', 'Narrow', 'Wide', 'Expanded', 'Compressed', 'SemiCondensed',
  'Nar', 'Con', 'Wid', 'Exp', 'Com', 'Cnd',
  'Cond', 'SemiCond', 'Comp',
]);

export const TRAILING_WIDTH_NAMES = [
  'Ultra Condensed', 'UltraCondensed',
  'Extra Condensed', 'ExtraCondensed',
  'Semi Condensed', 'SemiCondensed', 'SemiCond', 'Semi Cond',
  'Condensed', 'Cond',
  'Compressed', 'Comp',
  'Extra Narrow', 'ExtraNarrow',
  'Narrow',
  'Semi Expanded', 'SemiExpanded',
  'Extra Expanded', 'ExtraExpanded',
  'Ultra Expanded', 'UltraExpanded',
  'Expanded',
  'Extra Wide', 'ExtraWide',
  'Wide',
];

/**
 * Variant suffixes treated as type qualifiers (like widths).
 * Used for grouping visual variants under one super-family with tabs.
 * Includes Alfabet-style type names, Bungee visual variants, and generic style variants.
 * Order matters: longer compound names must precede shorter ones.
 */
export const TRAILING_TYPE_NAMES = [
  'Liniowy', 'Kontury', 'Cieniowany', 'Kropki', 'Pisany',
  'Kratki', 'Linie', 'Litery', 'Strzalki',
  'Layers Rotated', 'Layers', 'Inline', 'Outline', 'Shade', 'Color', 'Shadow',
];

export const TYPE_TOKENS = new Set(TRAILING_TYPE_NAMES);

export function splitCamelTokens(s: string): string {
  return s
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();
}

export function computeFamilyDiff(familyName: string, preferredFamily: string): string {
  const diff = familyName.replace(preferredFamily, '').trim();
  if (diff !== familyName) return splitCamelTokens(diff);

  const normFamily = familyName.replace(/\s+/g, '');
  const normPref = preferredFamily.replace(/\s+/g, '');
  if (normFamily.startsWith(normPref)) {
    return splitCamelTokens(normFamily.slice(normPref.length));
  }
  return splitCamelTokens(diff);
}

export function extractTrailingWidth(name: string): { baseName: string; width: string } {
  for (const w of TRAILING_WIDTH_NAMES) {
    if (name.endsWith(` ${w}`)) {
      return { baseName: name.slice(0, -(w.length + 1)).trim(), width: w };
    }
  }
  return { baseName: name, width: '' };
}

export function extractTrailingType(name: string): { baseName: string; typeName: string } {
  for (const t of TRAILING_TYPE_NAMES) {
    if (name.endsWith(` ${t}`)) {
      return { baseName: name.slice(0, -(t.length + 1)).trim(), typeName: t };
    }
  }
  return { baseName: name, typeName: '' };
}

/**
 * Strip both trailing width tokens AND trailing type tokens to get the
 * super-family base name used for grouping.
 */
export function stripTrailingQualifiers(name: string): { baseName: string; qualifier: string } {
  const widthResult = extractTrailingWidth(name);
  if (widthResult.width) return { baseName: widthResult.baseName, qualifier: widthResult.width };

  const typeResult = extractTrailingType(name);
  if (typeResult.typeName) return { baseName: typeResult.baseName, qualifier: typeResult.typeName };

  return { baseName: name, qualifier: '' };
}
