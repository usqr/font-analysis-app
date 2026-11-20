// Styles selected for the Compare view, and their form in the `ids` URL parameter.

/** One style: a font file, plus a weight if the file is variable. */
export interface CompareRef {
  fontId: string;
  wght?: number;
}

export interface CompareEntry extends CompareRef {
  key: string;
  family: string;
  label: string;
}

export const COMPARE_MAX = 5;

/** `id` for a static file, `id@700` for a weight of a variable file. */
export function entryKey(ref: CompareRef): string {
  return ref.wght == null ? ref.fontId : `${ref.fontId}@${ref.wght}`;
}

export function compareParam(refs: CompareRef[]): string {
  return refs.map(entryKey).join(',');
}

/** Parses `ids=a,b@700`. Bad weights are dropped, and so are duplicates. */
export function parseCompareParam(param: string | null): CompareRef[] {
  const seen = new Set<string>();
  const out: CompareRef[] = [];
  for (const part of (param ?? '').split(',')) {
    const [fontId, w] = part.trim().split('@');
    if (!fontId) continue;
    const wght = w === undefined ? undefined : Number(w);
    const ref: CompareRef = wght !== undefined && Number.isFinite(wght) ? { fontId, wght } : { fontId };
    const key = entryKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }
  return out;
}

/** Adds `entry` when `on` is true, else removes it. Returns `list` when nothing changes. */
export function setEntry(list: CompareEntry[], entry: CompareEntry, on: boolean): CompareEntry[] {
  const has = list.some((e) => e.key === entry.key);
  if (has === on) return list;
  return on ? [...list, entry] : list.filter((e) => e.key !== entry.key);
}

/** Adds `entry`, or removes it when the list has it. */
export function toggleEntry(list: CompareEntry[], entry: CompareEntry): CompareEntry[] {
  return setEntry(list, entry, !list.some((e) => e.key === entry.key));
}
