import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';

export interface GoogleFontMeta {
  family: string;
  category: string;
  variants: string[];
  subsets: string[];
}

interface GoogleMetadataEntry {
  family: string;
  category?: string;
  fonts?: Record<string, any>;
  subsets?: string[];
}

let cachedFontList: GoogleFontMeta[] | null = null;
let cacheTime = 0;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

export async function listGoogleFonts(): Promise<GoogleFontMeta[]> {
  if (cachedFontList && Date.now() - cacheTime < CACHE_DURATION) {
    return cachedFontList;
  }

  const res = await fetch('https://fonts.google.com/metadata/fonts');
  if (!res.ok) throw new Error(`Google Fonts metadata fetch failed: ${res.status}`);

  let text = await res.text();
  // Strip XSSI guard prefix
  if (text.startsWith(")]}'")) {
    text = text.slice(text.indexOf('\n') + 1);
  }

  const data = JSON.parse(text);
  const entries: GoogleMetadataEntry[] = data.familyMetadataList ?? [];

  cachedFontList = entries.map((e) => ({
    family: e.family,
    category: mapCategory(e.category),
    variants: e.fonts ? Object.keys(e.fonts) : [],
    subsets: e.subsets ?? [],
  }));

  cacheTime = Date.now();
  return cachedFontList;
}

function mapCategory(cat?: string): string {
  if (!cat) return 'display';
  const lower = cat.toLowerCase();
  if (lower.includes('serif') && !lower.includes('sans')) return 'serif';
  if (lower.includes('sans')) return 'sans-serif';
  if (lower.includes('mono')) return 'monospace';
  if (lower.includes('hand') || lower.includes('script')) return 'script';
  return 'display';
}

export interface DownloadProgress {
  type: 'start' | 'progress' | 'done' | 'error';
  total?: number;
  current?: number;
  family?: string;
  status?: 'ok' | 'error';
  error?: string;
  downloaded?: number;
  failed?: number;
}

export async function downloadGoogleFonts(
  targetFolder: string,
  families: string[],
  onProgress: (p: DownloadProgress) => void,
): Promise<void> {
  const resolved = path.resolve(targetFolder);
  if (!fs.existsSync(resolved)) {
    fs.mkdirSync(resolved, { recursive: true });
  }

  onProgress({ type: 'start', total: families.length });

  let downloaded = 0;
  let failed = 0;

  for (let i = 0; i < families.length; i++) {
    const family = families[i];
    try {
      const encoded = encodeURIComponent(family);
      const url = `https://fonts.google.com/download?family=${encoded}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const buffer = Buffer.from(await res.arrayBuffer());
      const zip = new AdmZip(buffer);
      const familyDir = path.join(resolved, family.replace(/\s+/g, '_'));
      if (!fs.existsSync(familyDir)) fs.mkdirSync(familyDir, { recursive: true });

      for (const entry of zip.getEntries()) {
        if (entry.isDirectory) continue;
        const ext = path.extname(entry.entryName).toLowerCase();
        if (!['.ttf', '.otf'].includes(ext)) continue;
        const fileName = path.basename(entry.entryName);
        fs.writeFileSync(path.join(familyDir, fileName), entry.getData());
      }

      downloaded++;
      onProgress({ type: 'progress', current: i + 1, total: families.length, family, status: 'ok' });
    } catch (e: any) {
      failed++;
      onProgress({ type: 'progress', current: i + 1, total: families.length, family, status: 'error', error: e.message });
    }
  }

  onProgress({ type: 'done', downloaded, failed, total: families.length });
}
