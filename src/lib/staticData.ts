// Pure helpers for the static (GitHub Pages) build. No DOM or network access
// here, so these run under `node --test` as well as in the browser.
import type { FontCategory, StoredFontMeta } from '../types';

/** Shape of `google-fonts.json` written by `scripts/buildStaticDb.ts`. */
export interface StaticDb {
  version: number;
  builtAt: string;
  /** google/fonts commit that every `filePath` resolves against. */
  ref: string;
  fonts: StoredFontMeta[];
}

/** Per-viewer edits, kept in localStorage in the static build. */
export interface StaticPrefs {
  starred: string[];
  categories: Record<string, FontCategory>;
  tags: Record<string, string[]>;
}

export const EMPTY_PREFS: StaticPrefs = { starred: [], categories: {}, tags: {} };

// jsDelivr refuses GitHub files larger than 20 MB; raw.githubusercontent.com
// serves those (also with `Access-Control-Allow-Origin: *`).
const JSDELIVR_MAX_BYTES = 20 * 1024 * 1024;

export function fontFileUrl(font: Pick<StoredFontMeta, 'filePath' | 'fileSize'>, ref: string): string {
  const encoded = font.filePath.split('/').map(encodeURIComponent).join('/');
  if (font.fileSize > JSDELIVR_MAX_BYTES) {
    return `https://raw.githubusercontent.com/google/fonts/${ref}/${encoded}`;
  }
  return `https://cdn.jsdelivr.net/gh/google/fonts@${ref}/${encoded}`;
}

export function parsePrefs(raw: string | null): StaticPrefs {
  if (!raw) return { ...EMPTY_PREFS };
  try {
    const p = JSON.parse(raw) as Partial<StaticPrefs>;
    return {
      starred: Array.isArray(p.starred) ? p.starred : [],
      categories: p.categories && typeof p.categories === 'object' ? p.categories : {},
      tags: p.tags && typeof p.tags === 'object' ? p.tags : {},
    };
  } catch {
    return { ...EMPTY_PREFS };
  }
}

/** Returns copies of `fonts` with the viewer's category and tag edits applied. */
export function applyPrefs(fonts: StoredFontMeta[], prefs: StaticPrefs): StoredFontMeta[] {
  return fonts.map((f) => {
    const cat = prefs.categories[f.id];
    const tags = prefs.tags[f.id];
    if (!cat && !tags) return f;
    return { ...f, ...(cat && { categoryOverride: cat }), ...(tags && { tags }) };
  });
}

export function toggleStar(prefs: StaticPrefs, key: string): StaticPrefs {
  const set = new Set(prefs.starred);
  if (set.has(key)) set.delete(key); else set.add(key);
  return { ...prefs, starred: Array.from(set) };
}

export function setCategories(prefs: StaticPrefs, ids: string[], category: FontCategory): StaticPrefs {
  const categories = { ...prefs.categories };
  for (const id of ids) categories[id] = category;
  return { ...prefs, categories };
}

/** Adds `tags` to each font (same merge rule as `PUT /api/fonts/bulk-tags`). */
export function addTags(prefs: StaticPrefs, fonts: StoredFontMeta[], ids: string[], tags: string[]): StaticPrefs {
  const clean = tags.filter((t) => t.length > 0);
  const byId = new Map(fonts.map((f) => [f.id, f]));
  const next = { ...prefs.tags };
  for (const id of ids) {
    const merged = new Set(next[id] ?? byId.get(id)?.tags ?? []);
    for (const t of clean) merged.add(t);
    next[id] = Array.from(merged);
  }
  return { ...prefs, tags: next };
}

export function allTags(fonts: StoredFontMeta[]): string[] {
  const set = new Set<string>();
  for (const f of fonts) for (const t of f.tags ?? []) set.add(t);
  return Array.from(set).sort();
}
