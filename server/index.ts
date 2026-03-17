import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import * as opentype from 'opentype.js';
import {
  readDatabase, writeDatabase, mergeFonts, deduplicateFonts, clearAllFontData,
  readFontPaths, writeFontPaths,
  applyOverrides, saveOverride, saveOverrides, readOverrides,
  readGoogleFontsDb, findFontById,
} from './database.js';
import { scanFolder, scanFont, walkDir, computeFontMetrics, classifyFont, extractGlyphSvgs, computeFullAnalysis } from './scanner.js';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Open a native OS folder picker and return the selected path
app.post('/api/pick-folder', (_req, res) => {
  const platform = process.platform;

  let cmd: string;
  let args: string[];

  if (platform === 'darwin') {
    cmd = 'osascript';
    args = ['-e', 'POSIX path of (choose folder with prompt "Select font folder")'];
  } else if (platform === 'linux') {
    cmd = 'zenity';
    args = ['--file-selection', '--directory', '--title=Select font folder'];
  } else if (platform === 'win32') {
    cmd = 'powershell';
    args = [
      '-NoProfile', '-Command',
      'Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = "Select font folder"; if ($d.ShowDialog() -eq "OK") { $d.SelectedPath } else { exit 1 }',
    ];
  } else {
    res.status(400).json({ error: `Unsupported platform: ${platform}` });
    return;
  }

  execFile(cmd, args, { timeout: 120_000 }, (err, stdout) => {
    if (err) {
      res.json({ cancelled: true, folderPath: null });
      return;
    }
    const folderPath = stdout.trim();
    if (!folderPath || !fs.existsSync(folderPath)) {
      res.json({ cancelled: true, folderPath: null });
      return;
    }
    res.json({ cancelled: false, folderPath });
  });
});

// Streaming scan — sends NDJSON progress lines
app.get('/api/scan-stream', (req, res) => {
  const folderPath = req.query.folderPath as string;
  const source = (req.query.source as string) === 'google' ? 'google' as const : 'local' as const;
  if (!folderPath) {
    res.status(400).json({ error: 'folderPath query param is required' });
    return;
  }

  const resolved = path.resolve(folderPath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    res.status(400).json({ error: `Not a valid directory: ${folderPath}` });
    return;
  }

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');

  const write = (obj: Record<string, unknown>) => {
    res.write(JSON.stringify(obj) + '\n');
  };

  const files = walkDir(resolved);
  const total = files.length;
  write({ type: 'start', total, folderPath: resolved });

  let added = 0;
  let failed = 0;
  const scannedMetas: import('./database.js').StoredFont[] = [];

  const SAVE_INTERVAL = 100;
  let unsaved = 0;

  const flush = () => {
    if (scannedMetas.length === 0) return;
    const db = readDatabase();
    const { fonts } = mergeFonts(db.fonts, scannedMetas);
    db.fonts = fonts;
    writeDatabase(db);
    unsaved = 0;
  };

  const processNext = async (i: number) => {
    if (i >= total) {
      flush();
      const db = readDatabase();
      const overridesApplied = applyOverrides(db.fonts);
      if (overridesApplied > 0) writeDatabase(db);
      write({ type: 'done', added, failed, total: db.fonts.length });
      res.end();
      return;
    }

    const file = files[i];
    const result = await scanFont(file, source);
    if (result) {
      scannedMetas.push(result.meta);
      added++;
      unsaved++;
      write({
        type: 'progress',
        current: i + 1,
        total,
        fileName: result.meta.fileName,
        familyName: result.meta.familyName,
        subfamilyName: result.meta.subfamilyName,
        status: 'ok',
      });
    } else {
      failed++;
      write({
        type: 'progress',
        current: i + 1,
        total,
        fileName: path.basename(file),
        familyName: null,
        subfamilyName: null,
        status: 'error',
      });
    }

    if (unsaved >= SAVE_INTERVAL) {
      flush();
    }

    setImmediate(() => processNext(i + 1));
  };

  processNext(0);
});

// Scan a folder recursively and merge results into database (non-streaming)
app.post('/api/scan', async (req, res) => {
  const { folderPath, source } = req.body;
  if (!folderPath || typeof folderPath !== 'string') {
    res.status(400).json({ error: 'folderPath is required' });
    return;
  }

  try {
    const results = await scanFolder(folderPath, source === 'google' ? 'google' : 'local');
    const db = readDatabase();
    const { fonts } = mergeFonts(db.fonts, results.map((r) => r.meta));
    db.fonts = fonts;
    applyOverrides(db.fonts);
    writeDatabase(db);
    res.json({ added: results.length, total: db.fonts.length });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// Load database (local + Google fonts merged)
app.get('/api/database', (_req, res) => {
  const db = readDatabase();
  const googleFonts = readGoogleFontsDb();
  const merged = {
    ...db,
    fonts: [...db.fonts, ...googleFonts],
  };
  res.json(merged);
});

// Overwrite database
app.post('/api/database', (req, res) => {
  const db = req.body;
  if (!db || !Array.isArray(db.fonts)) {
    res.status(400).json({ error: 'Invalid database format' });
    return;
  }
  writeDatabase(db);
  res.json({ ok: true });
});

// Deduplicate existing database entries
app.post('/api/database/dedup', (_req, res) => {
  const db = readDatabase();
  const { fonts, discardedIds } = deduplicateFonts(db.fonts);
  db.fonts = fonts;
  writeDatabase(db);
  res.json({ removed: discardedIds.length, total: fonts.length });
});

// Retroactively compute metrics and reclassify all fonts
app.post('/api/database/compute-metrics', async (_req, res) => {
  const { decompress } = await import('wawoff2');
  const db = readDatabase();
  let updated = 0;

  for (const font of db.fonts) {
    if (!fs.existsSync(font.filePath)) continue;

    try {
      const rawBuffer = fs.readFileSync(font.filePath);
      const ext = path.extname(font.filePath).toLowerCase();
      let fontBuffer: Buffer;
      if (ext === '.woff2') {
        const decompressed = await decompress(rawBuffer);
        fontBuffer = Buffer.from(decompressed);
      } else {
        fontBuffer = rawBuffer;
      }
      const ab = fontBuffer.buffer.slice(fontBuffer.byteOffset, fontBuffer.byteOffset + fontBuffer.byteLength);
      const parsed = opentype.parse(ab as ArrayBuffer);

      if (!font.metrics) {
        const m = computeFontMetrics(parsed);
        if (m) { font.metrics = m; updated++; }
      }
      const newCat = classifyFont(parsed, font.metrics);
      if (font.category !== newCat) {
        font.category = newCat;
        updated++;
      }
      if (!font.glyphSvgs) {
        const svgs = extractGlyphSvgs(parsed);
        if (svgs) { font.glyphSvgs = svgs; updated++; }
      }
      if (!font.analysis) {
        font.analysis = computeFullAnalysis(parsed);
        updated++;
      }
    } catch {
      // skip fonts that fail to parse
    }
  }

  applyOverrides(db.fonts);
  writeDatabase(db);
  res.json({ updated, total: db.fonts.length });
});

// Get / manage persistent overrides file
app.get('/api/overrides', (_req, res) => {
  const data = readOverrides();
  const count = Object.keys(data.overrides).length;
  res.json({ count, overrides: data.overrides });
});

// Wipe entire database and all stored font data
app.delete('/api/database', (_req, res) => {
  clearAllFontData();
  res.json({ ok: true });
});

// Serve font binary from its original file path
app.get('/api/fonts/:id/file', async (_req, res) => {
  const result = findFontById(_req.params.id);
  if (!result) { res.status(404).json({ error: 'Font not found' }); return; }
  const { font } = result;
  if (!fs.existsSync(font.filePath)) {
    res.status(404).json({ error: 'Font file not found on disk' });
    return;
  }
  const mimeMap: Record<string, string> = {
    otf: 'font/otf', ttf: 'font/ttf', woff: 'font/woff', woff2: 'font/woff2',
  };
  const ext = path.extname(font.filePath).toLowerCase().slice(1);
  res.setHeader('Content-Type', mimeMap[ext] ?? 'application/octet-stream');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  fs.createReadStream(font.filePath).pipe(res);
});

// Get a single font's base64 data (reads from original file on disk)
app.get('/api/fonts/:id/data', async (req, res) => {
  const result = findFontById(req.params.id);
  if (!result) {
    res.status(404).json({ error: 'Font not found' });
    return;
  }
  const { font } = result;
  if (!fs.existsSync(font.filePath)) {
    res.status(404).json({ error: 'Font file not found on disk' });
    return;
  }
  try {
    const rawBuffer = fs.readFileSync(font.filePath);
    const ext = path.extname(font.filePath).toLowerCase();
    let fontBuffer: Buffer;
    if (ext === '.woff2') {
      const { decompress } = await import('wawoff2');
      const decompressed = await decompress(rawBuffer);
      fontBuffer = Buffer.from(decompressed);
    } else {
      fontBuffer = rawBuffer;
    }
    res.json({
      id: font.id,
      familyName: font.preferredFamilyName ?? font.familyName,
      subfamilyName: font.subfamilyName,
      format: font.format,
      base64Data: fontBuffer.toString('base64'),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message ?? 'Failed to read font file' });
  }
});

// Update a font's file path
app.put('/api/fonts/:id/path', (req, res) => {
  const { filePath } = req.body;
  if (!filePath || typeof filePath !== 'string') {
    res.status(400).json({ error: 'filePath is required' });
    return;
  }

  const db = readDatabase();
  const font = db.fonts.find((f) => f.id === req.params.id);
  if (!font) {
    res.status(404).json({ error: 'Font not found' });
    return;
  }

  font.filePath = path.resolve(filePath);
  writeDatabase(db);
  res.json({ ok: true, filePath: font.filePath });
});

// Refresh a font: re-read from disk and update data + metadata
app.put('/api/fonts/:id/refresh', async (req, res) => {
  const db = readDatabase();
  const idx = db.fonts.findIndex((f) => f.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: 'Font not found' });
    return;
  }

  const existing = db.fonts[idx];
  if (!fs.existsSync(existing.filePath)) {
    res.status(400).json({ error: `File not found on disk: ${existing.filePath}` });
    return;
  }

  const result = await scanFont(existing.filePath);
  if (!result) {
    res.status(500).json({ error: 'Failed to re-parse font file' });
    return;
  }

  result.meta.id = existing.id;
  result.meta.addedAt = existing.addedAt;
  db.fonts[idx] = result.meta;
  writeDatabase(db);

  res.json(result.meta);
});

// Toggle starred status on a font family
app.put('/api/starred-families', (req, res) => {
  const { key } = req.body;
  if (!key || typeof key !== 'string') {
    res.status(400).json({ error: 'key is required (source:familyName)' });
    return;
  }
  const db = readDatabase();
  const set = new Set(db.starredFamilies ?? []);
  if (set.has(key)) {
    set.delete(key);
  } else {
    set.add(key);
  }
  db.starredFamilies = Array.from(set);
  writeDatabase(db);
  res.json({ starred: set.has(key), starredFamilies: db.starredFamilies });
});

// Get all starred family keys
app.get('/api/starred-families', (_req, res) => {
  const db = readDatabase();
  res.json({ starredFamilies: db.starredFamilies ?? [] });
});

// Delete a font from the database
app.delete('/api/fonts/:id', (req, res) => {
  const db = readDatabase();
  const idx = db.fonts.findIndex((f) => f.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: 'Font not found' });
    return;
  }

  db.fonts.splice(idx, 1);
  writeDatabase(db);
  res.json({ ok: true });
});

// --- Category override & tags ---

app.put('/api/fonts/:id/category', (req, res) => {
  const { category } = req.body;
  const validCats = ['serif', 'sans-serif', 'monospace', 'display', 'script'];
  if (!category || !validCats.includes(category)) {
    res.status(400).json({ error: 'Valid category is required' });
    return;
  }
  const db = readDatabase();
  const font = db.fonts.find((f) => f.id === req.params.id);
  if (!font) { res.status(404).json({ error: 'Font not found' }); return; }
  font.categoryOverride = category;
  writeDatabase(db);
  saveOverride(font);
  res.json({ ok: true });
});

app.put('/api/fonts/bulk-category', (req, res) => {
  const { ids, category } = req.body;
  const validCats = ['serif', 'sans-serif', 'monospace', 'display', 'script'];
  if (!Array.isArray(ids) || !category || !validCats.includes(category)) {
    res.status(400).json({ error: 'ids (array) and valid category are required' });
    return;
  }
  const db = readDatabase();
  const idSet = new Set(ids as string[]);
  const changed: import('./database.js').StoredFont[] = [];
  let updated = 0;
  for (const font of db.fonts) {
    if (idSet.has(font.id)) {
      font.categoryOverride = category;
      changed.push(font);
      updated++;
      idSet.delete(font.id);
    }
  }
  writeDatabase(db);
  if (idSet.size > 0) {
    const googleFonts = readGoogleFontsDb();
    for (const gf of googleFonts) {
      if (idSet.has(gf.id)) {
        gf.categoryOverride = category;
        changed.push(gf);
        updated++;
      }
    }
  }
  if (changed.length > 0) saveOverrides(changed);
  res.json({ updated });
});

app.put('/api/fonts/:id/tags', (req, res) => {
  const { tags } = req.body;
  if (!Array.isArray(tags)) {
    res.status(400).json({ error: 'tags (array of strings) is required' });
    return;
  }
  const db = readDatabase();
  const font = db.fonts.find((f) => f.id === req.params.id);
  if (!font) { res.status(404).json({ error: 'Font not found' }); return; }
  font.tags = tags.filter((t: unknown) => typeof t === 'string' && t.length > 0);
  writeDatabase(db);
  saveOverride(font);
  res.json({ ok: true, tags: font.tags });
});

app.put('/api/fonts/bulk-tags', (req, res) => {
  const { ids, tags } = req.body;
  if (!Array.isArray(ids) || !Array.isArray(tags)) {
    res.status(400).json({ error: 'ids (array) and tags (array) are required' });
    return;
  }
  const cleanTags = tags.filter((t: unknown) => typeof t === 'string' && t.length > 0);
  const db = readDatabase();
  const idSet = new Set(ids as string[]);
  const changed: typeof db.fonts = [];
  let updated = 0;
  for (const font of db.fonts) {
    if (idSet.has(font.id)) {
      const existing = new Set(font.tags ?? []);
      for (const t of cleanTags) existing.add(t);
      font.tags = Array.from(existing);
      changed.push(font);
      updated++;
    }
  }
  writeDatabase(db);
  if (changed.length > 0) saveOverrides(changed);
  res.json({ updated });
});

app.get('/api/tags', (_req, res) => {
  const db = readDatabase();
  const googleFonts = readGoogleFontsDb();
  const tagSet = new Set<string>();
  for (const font of [...db.fonts, ...googleFonts]) {
    if (font.tags) for (const t of font.tags) tagSet.add(t);
  }
  res.json({ tags: Array.from(tagSet).sort() });
});

// --- Saved font folder paths ---

app.get('/api/font-paths', (_req, res) => {
  res.json({ paths: readFontPaths() });
});

app.post('/api/font-paths', (req, res) => {
  const { path: newPath } = req.body;
  if (!newPath || typeof newPath !== 'string') {
    res.status(400).json({ error: 'path is required' });
    return;
  }
  const resolved = path.resolve(newPath);
  const paths = readFontPaths();
  if (!paths.includes(resolved)) {
    paths.push(resolved);
    writeFontPaths(paths);
  }
  res.json({ paths });
});

app.delete('/api/font-paths', (req, res) => {
  const { path: removePath } = req.body;
  if (!removePath || typeof removePath !== 'string') {
    res.status(400).json({ error: 'path is required' });
    return;
  }
  const paths = readFontPaths().filter((p) => p !== removePath);
  writeFontPaths(paths);
  res.json({ paths });
});

app.listen(PORT, () => {
  console.log(`Font API server running on http://localhost:${PORT}`);
});
