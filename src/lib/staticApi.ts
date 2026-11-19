// Browser side of the static (GitHub Pages) build: loads the pre-built
// Google Fonts list, gets font files from a CDN, and keeps the viewer's
// stars, categories and tags in localStorage.
import type { FontCategory, FontDatabaseResponse, StoredFontData, StoredFontMeta } from '../types';
import {
  type StaticDb, type StaticPrefs,
  addTags, allTags, applyPrefs, fontFileUrl, parsePrefs, setCategories, toggleStar,
} from './staticData';

const PREFS_KEY = 'font-analysis:static-prefs:v1';

let dbPromise: Promise<StaticDb> | null = null;
const fontsById = new Map<string, StoredFontMeta>();
let dbRef = 'main';

function loadDb(): Promise<StaticDb> {
  dbPromise ??= fetch(`${import.meta.env.BASE_URL}google-fonts.json`)
    .then((res) => {
      if (!res.ok) throw new Error(`Could not load the font list: ${res.status}`);
      return res.json() as Promise<StaticDb>;
    })
    .then((db) => {
      dbRef = db.ref;
      for (const f of db.fonts) fontsById.set(f.id, f);
      return db;
    })
    .catch((e) => {
      dbPromise = null;
      throw e;
    });
  return dbPromise;
}

function readPrefs(): StaticPrefs {
  try {
    return parsePrefs(localStorage.getItem(PREFS_KEY));
  } catch {
    return parsePrefs(null);
  }
}

function writePrefs(prefs: StaticPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Storage blocked (private mode, quota): edits last until reload only.
  }
}

/** URL of a font file. Only valid after `fetchDatabase` resolved. */
export function staticFontFileUrl(id: string): string {
  const font = fontsById.get(id);
  return font ? fontFileUrl(font, dbRef) : '';
}

export async function fetchDatabase(): Promise<FontDatabaseResponse> {
  const db = await loadDb();
  const prefs = readPrefs();
  return { version: db.version, fonts: applyPrefs(db.fonts, prefs), starredFamilies: prefs.starred };
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export async function fetchFontData(id: string): Promise<StoredFontData> {
  await loadDb();
  const font = fontsById.get(id);
  if (!font) throw new Error('Font not found');
  const res = await fetch(fontFileUrl(font, dbRef));
  if (!res.ok) throw new Error(`Could not download the font file: ${res.status}`);
  return {
    id,
    familyName: font.preferredFamilyName ?? font.familyName,
    subfamilyName: font.subfamilyName,
    format: font.format,
    base64Data: toBase64(await res.arrayBuffer()),
  };
}

export async function toggleStarFamily(key: string): Promise<{ starred: boolean; starredFamilies: string[] }> {
  const next = toggleStar(readPrefs(), key);
  writePrefs(next);
  return { starred: next.starred.includes(key), starredFamilies: next.starred };
}

export async function bulkSetCategory(ids: string[], category: FontCategory): Promise<{ updated: number }> {
  writePrefs(setCategories(readPrefs(), ids, category));
  return { updated: ids.length };
}

export async function bulkSetTags(ids: string[], tags: string[]): Promise<{ updated: number }> {
  const db = await loadDb();
  writePrefs(addTags(readPrefs(), db.fonts, ids, tags));
  return { updated: ids.length };
}

export async function fetchAllTags(): Promise<string[]> {
  const db = await loadDb();
  return allTags(applyPrefs(db.fonts, readPrefs()));
}
