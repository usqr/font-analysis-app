import fs from 'node:fs';
import path from 'node:path';

export type FontCategory = 'serif' | 'sans-serif' | 'monospace' | 'display' | 'script';
export type FontSource = 'local' | 'google';

export interface FontMetrics {
  contrast: number;
  weight: number;
  width: number;
  xHeight: number;
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
  source?: FontSource;
}

export interface FontDatabase {
  version: number;
  fonts: StoredFont[];
}

const DEFAULT_DB: FontDatabase = { version: 1, fonts: [] };

let dbPath = path.resolve(process.cwd(), 'fonts-db.json');

export function setDbPath(p: string) {
  dbPath = path.resolve(p);
}

export function getDbPath() {
  return dbPath;
}

function dataDir(): string {
  const dir = path.join(path.dirname(dbPath), 'fonts-data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
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

export function writeFontData(id: string, base64Data: string): void {
  const file = path.join(dataDir(), `${id}.b64`);
  fs.writeFileSync(file, base64Data, 'utf-8');
}

export function readFontData(id: string): string | null {
  const file = path.join(dataDir(), `${id}.b64`);
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, 'utf-8');
}

export function deleteFontData(id: string): void {
  const file = path.join(dataDir(), `${id}.b64`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

export function clearAllFontData(): void {
  const dir = path.join(path.dirname(dbPath), 'fonts-data');
  if (fs.existsSync(dir)) {
    for (const file of fs.readdirSync(dir)) {
      fs.unlinkSync(path.join(dir, file));
    }
  }
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
