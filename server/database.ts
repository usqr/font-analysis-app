import fs from 'node:fs';
import path from 'node:path';
import type { ExtendedTags, FullAnalysis } from '../src/types/index.js';

export type FontCategory = 'serif' | 'sans-serif' | 'monospace' | 'display' | 'script';
export type FontSource = 'local' | 'google';
export type { FullAnalysis };

export interface FontMetrics {
  contrast: number;
  weight: number;
  width: number;
  xHeight: number;
}

export interface GlyphSvg {
  d: string;
  advWidth: number;
}

export interface StoredFont {
  id: string;
  filePath: string;
  fileName: string;
  familyName: string;
  preferredFamilyName?: string;
  subfamilyName: string;
  weight: number;
  style: 'normal' | 'italic' | 'oblique';
  format: string;
  fileSize: number;
  glyphCount: number;
  unitsPerEm: number;
  ascender: number;
  descender: number;
  lastModified: string;
  addedAt: string;
  metrics?: FontMetrics;
  category?: FontCategory;
  categoryOverride?: FontCategory;
  tags?: string[];
  source?: FontSource;
  glyphSvgs?: Record<string, GlyphSvg>;
  analysis?: FullAnalysis;
  scriptSupport?: string[];
  isVariable?: boolean;
  variableAxes?: { tag: string; minValue: number; defaultValue: number; maxValue: number; name?: string }[];
  extendedTags?: ExtendedTags;
}

export interface FontDatabase {
  version: number;
  fonts: StoredFont[];
  starredFamilies?: string[];
}

const DEFAULT_DB: FontDatabase = { version: 1, fonts: [] };

let dbPath = path.resolve(process.cwd(), 'fonts-db.json');

export function setDbPath(p: string) {
  dbPath = path.resolve(p);
}

export function getDbPath() {
  return dbPath;
}

export function readDatabase(): FontDatabase {
  if (!fs.existsSync(dbPath)) return { ...DEFAULT_DB, fonts: [] };
  try {
    const raw = fs.readFileSync(dbPath, 'utf-8');
    return JSON.parse(raw) as FontDatabase;
  } catch {
    return { ...DEFAULT_DB, fonts: [] };
  }
}

export function writeDatabase(db: FontDatabase): void {
  const tmp = dbPath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf-8');
  fs.renameSync(tmp, dbPath);
}

export function clearAllFontData(): void {
  writeDatabase({ ...DEFAULT_DB, fonts: [] });
}

function formatPriority(format: string): number {
  switch (format) {
    case 'otf': return 4;
    case 'ttf': return 3;
    case 'woff': return 2;
    case 'woff2': return 1;
    default: return 0;
  }
}

function variantKey(f: StoredFont): string {
  const src = f.source ?? 'local';
  return `${src}\0${f.preferredFamilyName ?? f.familyName}\0${f.subfamilyName}`;
}

export interface MergeResult {
  fonts: StoredFont[];
  discardedIds: string[];
}

export function deduplicateFonts(fonts: StoredFont[]): MergeResult {
  const byVariant = new Map<string, StoredFont[]>();
  for (const font of fonts) {
    const key = variantKey(font);
    if (!byVariant.has(key)) byVariant.set(key, []);
    byVariant.get(key)!.push(font);
  }

  const kept: StoredFont[] = [];
  const discardedIds: string[] = [];
  for (const group of byVariant.values()) {
    group.sort((a, b) => formatPriority(b.format) - formatPriority(a.format));
    kept.push(group[0]);
    for (let i = 1; i < group.length; i++) {
      discardedIds.push(group[i].id);
    }
  }

  return { fonts: kept, discardedIds };
}

export function mergeFonts(existing: StoredFont[], incoming: StoredFont[]): MergeResult {
  const byPath = new Map(existing.map((f) => [f.filePath, f]));
  for (const font of incoming) {
    const prev = byPath.get(font.filePath);
    if (prev) {
      if (prev.categoryOverride && !font.categoryOverride) font.categoryOverride = prev.categoryOverride;
      if (prev.tags && prev.tags.length > 0 && (!font.tags || font.tags.length === 0)) font.tags = prev.tags;
    }
    byPath.set(font.filePath, font);
  }

  const allFonts = Array.from(byPath.values());
  const byVariant = new Map<string, StoredFont[]>();
  for (const font of allFonts) {
    const key = variantKey(font);
    if (!byVariant.has(key)) byVariant.set(key, []);
    byVariant.get(key)!.push(font);
  }

  const kept: StoredFont[] = [];
  const discardedIds: string[] = [];
  for (const group of byVariant.values()) {
    group.sort((a, b) => formatPriority(b.format) - formatPriority(a.format));
    kept.push(group[0]);
    for (let i = 1; i < group.length; i++) {
      discardedIds.push(group[i].id);
    }
  }

  return { fonts: kept, discardedIds };
}

// --- Persistent font overrides (survives rescans and library clears) ---

interface FontOverrideEntry {
  categoryOverride?: FontCategory;
  tags?: string[];
}

interface FontOverridesFile {
  version: number;
  overrides: Record<string, FontOverrideEntry>;
}

function overridesFilePath(): string {
  return path.resolve(path.dirname(dbPath), 'font-overrides.json');
}

export function overrideKey(font: { familyName: string; subfamilyName: string }): string {
  return `${font.familyName}\0${font.subfamilyName}`;
}

export function readOverrides(): FontOverridesFile {
  const file = overridesFilePath();
  if (!fs.existsSync(file)) return { version: 1, overrides: {} };
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as FontOverridesFile;
  } catch {
    return { version: 1, overrides: {} };
  }
}

export function writeOverrides(data: FontOverridesFile): void {
  const file = overridesFilePath();
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, file);
}

export function saveOverride(font: StoredFont): void {
  const data = readOverrides();
  const key = overrideKey(font);
  const entry: FontOverrideEntry = {};
  if (font.categoryOverride) entry.categoryOverride = font.categoryOverride;
  if (font.tags && font.tags.length > 0) entry.tags = font.tags;

  if (Object.keys(entry).length > 0) {
    data.overrides[key] = { ...(data.overrides[key] ?? {}), ...entry };
  }
  writeOverrides(data);
}

export function saveOverrides(fonts: StoredFont[]): void {
  const data = readOverrides();
  for (const font of fonts) {
    const key = overrideKey(font);
    const entry: FontOverrideEntry = {};
    if (font.categoryOverride) entry.categoryOverride = font.categoryOverride;
    if (font.tags && font.tags.length > 0) entry.tags = font.tags;

    if (Object.keys(entry).length > 0) {
      data.overrides[key] = { ...(data.overrides[key] ?? {}), ...entry };
    }
  }
  writeOverrides(data);
}

export function applyOverrides(fonts: StoredFont[]): number {
  const data = readOverrides();
  if (Object.keys(data.overrides).length === 0) return 0;

  let applied = 0;
  for (const font of fonts) {
    const key = overrideKey(font);
    const entry = data.overrides[key];
    if (!entry) continue;

    let changed = false;
    if (entry.categoryOverride && !font.categoryOverride) {
      font.categoryOverride = entry.categoryOverride;
      changed = true;
    }
    if (entry.tags && entry.tags.length > 0 && (!font.tags || font.tags.length === 0)) {
      font.tags = entry.tags;
      changed = true;
    }
    if (changed) applied++;
  }
  return applied;
}

// --- Font folder paths (non-committed local config) ---

function fontPathsFile(): string {
  return path.resolve(path.dirname(dbPath), 'font-paths.json');
}

export function readFontPaths(): string[] {
  const file = fontPathsFile();
  if (!fs.existsSync(file)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return Array.isArray(raw.paths) ? raw.paths : [];
  } catch {
    return [];
  }
}

export function writeFontPaths(paths: string[]): void {
  const file = fontPathsFile();
  fs.writeFileSync(file, JSON.stringify({ paths }, null, 2), 'utf-8');
}

// --- Google Fonts starter DB (committed, read-only at runtime) ---

export interface GoogleFontsDatabase {
  version: number;
  builtAt: string;
  fonts: StoredFont[];
}

const GOOGLE_FONTS_DB_FILE = 'google-fonts-db.json';
const GOOGLE_FONTS_REPO_DIR = 'google-fonts';

let _googleFontsCache: StoredFont[] | null = null;
let _googleFontsCacheTime = 0;
const CACHE_TTL = 60_000;

export function readGoogleFontsDb(): StoredFont[] {
  const now = Date.now();
  if (_googleFontsCache && now - _googleFontsCacheTime < CACHE_TTL) {
    return _googleFontsCache;
  }

  const dbFile = path.resolve(process.cwd(), GOOGLE_FONTS_DB_FILE);
  if (!fs.existsSync(dbFile)) return [];

  try {
    const raw = JSON.parse(fs.readFileSync(dbFile, 'utf-8')) as GoogleFontsDatabase;
    const repoDir = path.resolve(process.cwd(), GOOGLE_FONTS_REPO_DIR);
    const repoExists = fs.existsSync(repoDir);

    const fonts = raw.fonts.map((f) => ({
      ...f,
      filePath: repoExists ? path.resolve(repoDir, f.filePath) : f.filePath,
    }));

    applyOverrides(fonts);
    _googleFontsCache = fonts;
    _googleFontsCacheTime = now;
    return fonts;
  } catch {
    return [];
  }
}

export function findFontById(id: string): { font: StoredFont; isGoogle: boolean } | null {
  const db = readDatabase();
  const local = db.fonts.find((f) => f.id === id);
  if (local) return { font: local, isGoogle: false };

  const googleFonts = readGoogleFontsDb();
  const gf = googleFonts.find((f) => f.id === id);
  if (gf) return { font: gf, isGoogle: true };

  return null;
}
