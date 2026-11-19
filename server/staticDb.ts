/**
 * Pure helpers for `buildStaticDb.ts`: map each Google Fonts `filePath` to a
 * path that exists at the pinned google/fonts commit.
 */
import type { StoredFont } from './database.js';

export interface ResolveResult {
  fonts: StoredFont[];
  remapped: { from: string; to: string }[];
  dropped: string[];
}

function baseName(p: string): string {
  return p.slice(p.lastIndexOf('/') + 1);
}

function parentDir(p: string): string {
  const parts = p.split('/');
  return parts[parts.length - 2] ?? '';
}

/**
 * Keeps fonts whose path exists in `treePaths`. A font whose file moved (for
 * example from `apache/arimo/` to `ofl/arimo/`) gets the new path if one file
 * with the same name exists, or one in a folder with the same family name.
 * Other fonts are dropped.
 */
export function resolveFontPaths(fonts: StoredFont[], treePaths: Iterable<string>): ResolveResult {
  const tree = new Set(treePaths);
  const byBase = new Map<string, string[]>();
  for (const p of tree) {
    const b = baseName(p);
    const list = byBase.get(b);
    if (list) list.push(p); else byBase.set(b, [p]);
  }

  const out: StoredFont[] = [];
  const remapped: ResolveResult['remapped'] = [];
  const dropped: string[] = [];
  for (const font of fonts) {
    if (tree.has(font.filePath)) { out.push(font); continue; }
    const candidates = byBase.get(baseName(font.filePath)) ?? [];
    const sameDir = candidates.filter((c) => parentDir(c) === parentDir(font.filePath));
    const match = candidates.length === 1 ? candidates[0] : sameDir.length === 1 ? sameDir[0] : null;
    if (!match) { dropped.push(font.filePath); continue; }
    remapped.push({ from: font.filePath, to: match });
    out.push({ ...font, filePath: match });
  }
  return { fonts: out, remapped, dropped };
}

/** Removes data that the browser does not use (glyph SVGs are ~75% of the file). */
export function stripForWeb(font: StoredFont): StoredFont {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to drop the field
  const { glyphSvgs, ...rest } = font;
  return rest;
}
