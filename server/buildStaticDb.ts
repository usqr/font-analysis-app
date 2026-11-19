/**
 * Build script for the static (GitHub Pages) build. Reads google-fonts-db.json,
 * removes glyph SVGs, maps file paths to the google/fonts commit checked out in
 * the repo folder, and writes <out>/google-fonts.json.
 *
 * The repo folder can be a blobless clone (no file contents are read):
 *   git clone --depth=1 --filter=blob:none --no-checkout https://github.com/google/fonts.git google-fonts
 *
 * Usage: npx tsx server/buildStaticDb.ts [outDir=dist] [repoDir=google-fonts]
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { StoredFont } from './database.js';
import { resolveFontPaths, stripForWeb } from './staticDb.js';

function git(repoDir: string, args: string[]): string {
  return execFileSync('git', ['-C', repoDir, ...args], { encoding: 'utf-8', maxBuffer: 256 * 1024 * 1024 });
}

function main() {
  const outDir = path.resolve(process.argv[2] ?? 'dist');
  const repoDir = path.resolve(process.argv[3] ?? 'google-fonts');
  if (!fs.existsSync(repoDir)) {
    console.error(`Google Fonts repo not found at ${repoDir}`);
    process.exit(1);
  }

  const ref = git(repoDir, ['rev-parse', 'HEAD']).trim();
  const tree = git(repoDir, ['ls-tree', '-r', '--name-only', 'HEAD']).split('\n').filter(Boolean);
  const src = JSON.parse(fs.readFileSync('google-fonts-db.json', 'utf-8')) as { version: number; fonts: StoredFont[] };

  const { fonts, remapped, dropped } = resolveFontPaths(src.fonts.map(stripForWeb), tree);
  for (const r of remapped) console.log(`moved:   ${r.from} -> ${r.to}`);
  for (const d of dropped) console.warn(`dropped: ${d} (not in google/fonts@${ref.slice(0, 7)})`);

  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'google-fonts.json');
  const db = { version: src.version, builtAt: new Date().toISOString(), ref, fonts };
  fs.writeFileSync(outFile, JSON.stringify(db));
  const mb = (fs.statSync(outFile).size / 1024 / 1024).toFixed(1);
  console.log(`Wrote ${fonts.length} fonts (${remapped.length} moved, ${dropped.length} dropped) to ${outFile} (${mb} MB), ref ${ref}`);
}

main();
