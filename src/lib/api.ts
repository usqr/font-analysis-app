import type { FontDatabaseResponse, StoredFontMeta, StoredFontData, ScanResult } from '../types';

const BASE = '/api';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchDatabase(): Promise<FontDatabaseResponse> {
  const res = await fetch(`${BASE}/database`);
  return json<FontDatabaseResponse>(res);
}

export async function pickFolder(): Promise<string | null> {
  const res = await fetch(`${BASE}/pick-folder`, { method: 'POST' });
  const data = await json<{ cancelled: boolean; folderPath: string | null }>(res);
  return data.cancelled ? null : data.folderPath;
}

export async function scanFolder(folderPath: string): Promise<ScanResult> {
  const res = await fetch(`${BASE}/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folderPath }),
  });
  return json<ScanResult>(res);
}

export interface ScanProgressEvent {
  type: 'start';
  total: number;
  folderPath: string;
}

export interface ScanProgressUpdate {
  type: 'progress';
  current: number;
  total: number;
  fileName: string;
  familyName: string | null;
  subfamilyName: string | null;
  status: 'ok' | 'error';
}

export interface ScanDoneEvent {
  type: 'done';
  added: number;
  failed: number;
  total: number;
}

export type ScanEvent = ScanProgressEvent | ScanProgressUpdate | ScanDoneEvent;

export async function scanFolderStream(
  folderPath: string,
  onEvent: (event: ScanEvent) => void,
  signal?: AbortSignal,
  source: 'local' | 'google' = 'local',
): Promise<void> {
  const res = await fetch(
    `${BASE}/scan-stream?folderPath=${encodeURIComponent(folderPath)}&source=${source}`,
    { signal },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error ?? `Request failed: ${res.status}`);
  }
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop()!;
    for (const line of lines) {
      if (line.trim()) {
        onEvent(JSON.parse(line) as ScanEvent);
      }
    }
  }
  if (buffer.trim()) {
    onEvent(JSON.parse(buffer) as ScanEvent);
  }
}

export async function fetchFontData(id: string): Promise<StoredFontData> {
  const res = await fetch(`${BASE}/fonts/${id}/data`);
  return json<StoredFontData>(res);
}

export async function updateFontPath(id: string, filePath: string): Promise<void> {
  const res = await fetch(`${BASE}/fonts/${id}/path`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath }),
  });
  await json(res);
}

export async function refreshFont(id: string): Promise<StoredFontMeta> {
  const res = await fetch(`${BASE}/fonts/${id}/refresh`, {
    method: 'PUT',
  });
  return json<StoredFontMeta>(res);
}

export async function deleteFont(id: string): Promise<void> {
  const res = await fetch(`${BASE}/fonts/${id}`, {
    method: 'DELETE',
  });
  await json(res);
}

export async function toggleStarFamily(key: string): Promise<{ starred: boolean; starredFamilies: string[] }> {
  const res = await fetch(`${BASE}/starred-families`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  });
  return json<{ starred: boolean; starredFamilies: string[] }>(res);
}

export async function fetchFontPaths(): Promise<string[]> {
  const res = await fetch(`${BASE}/font-paths`);
  const data = await json<{ paths: string[] }>(res);
  return data.paths;
}

export async function addFontPath(path: string): Promise<string[]> {
  const res = await fetch(`${BASE}/font-paths`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  const data = await json<{ paths: string[] }>(res);
  return data.paths;
}

export async function removeFontPath(path: string): Promise<string[]> {
  const res = await fetch(`${BASE}/font-paths`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  const data = await json<{ paths: string[] }>(res);
  return data.paths;
}

export async function convertWoff2(base64Data: string): Promise<string> {
  const res = await fetch(`${BASE}/convert-woff2`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64Data }),
  });
  const data = await json<{ base64Data: string }>(res);
  return data.base64Data;
}

export async function deduplicateDatabase(): Promise<{ removed: number; total: number }> {
  const res = await fetch(`${BASE}/database/dedup`, { method: 'POST' });
  return json<{ removed: number; total: number }>(res);
}

export async function clearDatabase(): Promise<void> {
  const res = await fetch(`${BASE}/database`, {
    method: 'DELETE',
  });
  await json(res);
}

export async function computeMetrics(): Promise<{ updated: number; total: number }> {
  const res = await fetch(`${BASE}/database/compute-metrics`, { method: 'POST' });
  return json<{ updated: number; total: number }>(res);
}

// --- Google Fonts ---

export interface GoogleFontMeta {
  family: string;
  category: string;
  variants: string[];
  subsets: string[];
}

export async function listGoogleFonts(): Promise<{ fonts: GoogleFontMeta[]; total: number }> {
  const res = await fetch(`${BASE}/google-fonts/list`);
  return json<{ fonts: GoogleFontMeta[]; total: number }>(res);
}

export interface GoogleDownloadEvent {
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
  families: string[] | null,
  onEvent: (event: GoogleDownloadEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${BASE}/google-fonts/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetFolder, families }),
    signal,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error ?? `Request failed: ${res.status}`);
  }
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop()!;
    for (const line of lines) {
      if (line.trim()) onEvent(JSON.parse(line));
    }
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer));
}
