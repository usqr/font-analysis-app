/**
 * Build script: scans all fonts from the cloned google-fonts/ repo
 * and writes google-fonts-db.json with full metadata, metrics, and SVG vectors.
 *
 * Usage: npx tsx server/buildGoogleFontsDb.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { walkDir, scanFont } from './scanner.js';
import { deduplicateFonts } from './database.js';
import type { StoredFont } from './database.js';

const REPO_DIR = path.resolve(process.cwd(), 'google-fonts');
const OUTPUT_FILE = path.resolve(process.cwd(), 'google-fonts-db.json');
const FONT_DIRS = ['ofl', 'apache', 'ufl'];

async function main() {
  if (!fs.existsSync(REPO_DIR)) {
    console.error(`Google Fonts repo not found at ${REPO_DIR}`);
    console.error('Run: git clone --depth=1 https://github.com/google/fonts.git google-fonts/');
    process.exit(1);
  }

  console.log('Collecting font files...');
  const allFiles: string[] = [];
  for (const sub of FONT_DIRS) {
    const dir = path.join(REPO_DIR, sub);
    if (fs.existsSync(dir)) {
      allFiles.push(...walkDir(dir));
    }
  }
  console.log(`Found ${allFiles.length} font files`);

  const fonts: StoredFont[] = [];
  let failed = 0;
  const startTime = Date.now();

  for (let i = 0; i < allFiles.length; i++) {
    const file = allFiles[i];
    const result = await scanFont(file, 'google');
    if (result) {
      const relativePath = path.relative(REPO_DIR, file);
      result.meta.filePath = relativePath;
      fonts.push(result.meta);
    } else {
      failed++;
    }

    if ((i + 1) % 100 === 0 || i === allFiles.length - 1) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`  ${i + 1}/${allFiles.length} scanned (${fonts.length} ok, ${failed} failed) [${elapsed}s]`);
    }
  }

  console.log('Deduplicating...');
  const { fonts: dedupedFonts, discardedIds } = deduplicateFonts(fonts);
  if (discardedIds.length > 0) {
    console.log(`  Removed ${discardedIds.length} duplicates`);
  }

  const db = {
    version: 1,
    builtAt: new Date().toISOString(),
    fonts: dedupedFonts,
  };

  console.log(`Writing ${OUTPUT_FILE}...`);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(db));
  const sizeMB = (fs.statSync(OUTPUT_FILE).size / (1024 * 1024)).toFixed(1);
  console.log(`Done: ${dedupedFonts.length} fonts, ${sizeMB} MB`);
}

main().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
