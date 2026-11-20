// Raw table values of a font, for the "Raw metadata" section of the Analyze view.
import type { Font } from 'opentype.js';

export interface RawMetaEntry { label: string; value: string }
export interface RawMetaSection { title: string; entries: RawMetaEntry[] }

interface Os2Table {
  usWeightClass?: number; usWidthClass?: number; sFamilyClass?: number; fsType?: number;
  panose?: number[] | string; sTypoAscender?: number; sTypoDescender?: number; sTypoLineGap?: number;
  sxHeight?: number; sCapHeight?: number;
}
interface HeadTable { unitsPerEm?: number; created?: number; modified?: number; macStyle?: number; lowestRecPPEM?: number }
interface PostTable { italicAngle?: number; isFixedPitch?: number; underlinePosition?: number; underlineThickness?: number }

const WIDTH_CLASS_NAMES: Record<number, string> = {
  1: 'Ultra-Condensed', 2: 'Extra-Condensed', 3: 'Condensed',
  4: 'Semi-Condensed', 5: 'Medium (Normal)',
  6: 'Semi-Expanded', 7: 'Expanded',
  8: 'Extra-Expanded', 9: 'Ultra-Expanded',
};

const FAMILY_CLASS_NAMES: Record<number, string> = {
  0: 'No Classification', 1: 'Oldstyle Serifs', 2: 'Transitional Serifs',
  3: 'Modern Serifs', 4: 'Clarendon Serifs', 5: 'Slab Serifs',
  6: 'Reserved', 7: 'Freeform Serifs', 8: 'Sans Serif',
  9: 'Ornamentals', 10: 'Scripts', 11: 'Reserved',
  12: 'Symbolic', 13: 'Reserved', 14: 'Reserved',
};

const MAC_STYLE_FLAGS: [number, string][] = [
  [0x01, 'Bold'], [0x02, 'Italic'], [0x04, 'Underline'],
  [0x08, 'Outline'], [0x10, 'Shadow'], [0x20, 'Condensed'], [0x40, 'Extended'],
];

const FS_TYPE_FLAGS: [number, string][] = [
  [0x0002, 'Restricted'], [0x0004, 'Preview & Print'], [0x0008, 'Editable'],
  [0x0100, 'No Subsetting'], [0x0200, 'Bitmap Only'],
];

/** `name` table keys, with their labels. */
const NAME_KEYS: [string, string][] = [
  ['fontFamily', 'fontFamily'], ['fontSubfamily', 'fontSubfamily'],
  ['preferredFamily', 'preferredFamily'], ['preferredSubfamily', 'preferredSubfamily'],
  ['typographicFamily', 'typographicFamily'], ['designer', 'Designer'],
  ['manufacturer', 'Manufacturer'], ['version', 'Version'], ['license', 'License'],
];
const LICENSE_MAX = 120;

/** One entry for each key that the table has, with the value as text. */
function plainEntries<T extends object>(table: T, keys: (keyof T & string)[]): RawMetaEntry[] {
  return keys.filter((k) => table[k] != null).map((k) => ({ label: k, value: String(table[k]) }));
}

function nameEntries(font: Font): RawMetaEntry[] {
  return NAME_KEYS.flatMap(([key, label]) => {
    const v = font.names[key]?.en;
    if (!v) return [];
    return [{ label, value: key === 'license' && v.length > LICENSE_MAX ? `${v.slice(0, LICENSE_MAX)}...` : v }];
  });
}

function fsTypeText(fsType: number): string {
  const flags = fsType === 0 ? ['Installable'] : FS_TYPE_FLAGS.filter(([bit]) => fsType & bit).map(([, n]) => n);
  return `0x${fsType.toString(16).padStart(4, '0')} — ${flags.join(', ') || 'None'}`;
}

function familyClassText(value: number): string {
  const cls = (value >> 8) & 0xFF;
  return `${cls} / ${value & 0xFF} — ${FAMILY_CLASS_NAMES[cls] ?? 'Unknown'}`;
}

function os2Entries(os2: Os2Table): RawMetaEntry[] {
  const out = plainEntries(os2, ['usWeightClass']);
  if (os2.usWidthClass != null) out.push({ label: 'usWidthClass', value: `${os2.usWidthClass} — ${WIDTH_CLASS_NAMES[os2.usWidthClass] ?? 'Unknown'}` });
  if (os2.sFamilyClass != null) out.push({ label: 'sFamilyClass', value: familyClassText(os2.sFamilyClass) });
  if (os2.fsType != null) out.push({ label: 'fsType', value: fsTypeText(os2.fsType) });
  if (os2.panose) out.push({ label: 'panose', value: Array.isArray(os2.panose) ? os2.panose.join(' ') : String(os2.panose) });
  return [...out, ...plainEntries(os2, ['sTypoAscender', 'sTypoDescender', 'sTypoLineGap', 'sxHeight', 'sCapHeight'])];
}

const isoDate = (seconds: number) => new Date(seconds * 1000).toISOString().split('T')[0];

function headEntries(head: HeadTable): RawMetaEntry[] {
  const out = plainEntries(head, ['unitsPerEm']);
  if (head.created != null) out.push({ label: 'created', value: isoDate(head.created) });
  if (head.modified != null) out.push({ label: 'modified', value: isoDate(head.modified) });
  if (head.macStyle != null) {
    const style = head.macStyle;
    const flags = MAC_STYLE_FLAGS.filter(([bit]) => style & bit).map(([, n]) => n);
    out.push({ label: 'macStyle', value: flags.length > 0 ? flags.join(', ') : 'Regular' });
  }
  return [...out, ...plainEntries(head, ['lowestRecPPEM'])];
}

function postEntries(post: PostTable): RawMetaEntry[] {
  const out = plainEntries(post, ['italicAngle']);
  if (post.isFixedPitch != null) out.push({ label: 'isFixedPitch', value: post.isFixedPitch ? 'Yes' : 'No' });
  return [...out, ...plainEntries(post, ['underlinePosition', 'underlineThickness'])];
}

/** The `name`, `OS/2`, `head` and `post` values of `font`. A section without values is not in the list. */
export function extractRawMetadata(font: Font): RawMetaSection[] {
  const { os2, head, post } = font.tables as { os2?: Os2Table; head?: HeadTable; post?: PostTable };
  const sections: RawMetaSection[] = [
    { title: 'name', entries: nameEntries(font) },
    { title: 'OS/2', entries: os2 ? os2Entries(os2) : [] },
    { title: 'head', entries: head ? headEntries(head) : [] },
    { title: 'post', entries: post ? postEntries(post) : [] },
  ];
  return sections.filter((s) => s.entries.length > 0);
}
