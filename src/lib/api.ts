import type { FontDatabaseResponse, StoredFontMeta, StoredFontData, ScanResult, FontCategory } from '../types';
import { IS_STATIC } from './env';
import * as staticApi from './staticApi';

const BASE = '/api';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/** URL of a font file, for `@font-face` and `document.fonts.load`. */
export function fontFileUrl(id: string): string {
  return IS_STATIC ? staticApi.staticFontFileUrl(id) : `${BASE}/fonts/${id}/file`;
}

export async function fetchDatabase(): Promise<FontDatabaseResponse> {
  if (IS_STATIC) return staticApi.fetchDatabase();
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
  if (IS_STATIC) return staticApi.fetchFontData(id);
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
  if (IS_STATIC) return staticApi.toggleStarFamily(key);
  const res = await fetch(`${BASE}/starred-families`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  });
  return json<{ starred: boolean; starredFamilies: string[] }>(res);
}

export async function fetchFontPaths(): Promise<string[]> {
  if (IS_STATIC) return [];
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
  if (IS_STATIC) return { updated: 0, total: 0 };
  const res = await fetch(`${BASE}/database/compute-metrics`, { method: 'POST' });
  return json<{ updated: number; total: number }>(res);
}

// --- Category & Tags ---

export async function setFontCategory(id: string, category: FontCategory): Promise<void> {
  const res = await fetch(`${BASE}/fonts/${id}/category`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category }),
  });
  await json(res);
}

export async function bulkSetCategory(ids: string[], category: FontCategory): Promise<{ updated: number }> {
  if (IS_STATIC) return staticApi.bulkSetCategory(ids, category);
  const res = await fetch(`${BASE}/fonts/bulk-category`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, category }),
  });
  return json<{ updated: number }>(res);
}

export async function setFontTags(id: string, tags: string[]): Promise<void> {
  const res = await fetch(`${BASE}/fonts/${id}/tags`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tags }),
  });
  await json(res);
}

export async function bulkSetTags(ids: string[], tags: string[]): Promise<{ updated: number }> {
  if (IS_STATIC) return staticApi.bulkSetTags(ids, tags);
  const res = await fetch(`${BASE}/fonts/bulk-tags`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, tags }),
  });
  return json<{ updated: number }>(res);
}

export async function fetchAllTags(): Promise<string[]> {
  if (IS_STATIC) return staticApi.fetchAllTags();
  const res = await fetch(`${BASE}/tags`);
  const data = await json<{ tags: string[] }>(res);
  return data.tags;
}

