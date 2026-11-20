import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScanEvent, ScanProgressUpdate } from '../../lib/api';
import {
  addFontPath, clearDatabase, deduplicateDatabase, fetchFontPaths, pickFolder, removeFontPath, scanFolderStream,
} from '../../lib/api';

interface Progress { current: number; total: number; added: number; failed: number }

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function ScanPanel({ onDone, onClose, onError }: { onDone: () => Promise<void>; onClose: () => void; onError: (m: string) => void }) {
  const [path, setPath] = useState('');
  const [saved, setSaved] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [log, setLog] = useState<ScanProgressUpdate[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLOListElement>(null);

  useEffect(() => { fetchFontPaths().then(setSaved).catch(() => {}); }, []);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [log]);

  const onEvent = useCallback((event: ScanEvent) => {
    if (event.type === 'start') setProgress({ current: 0, total: event.total, added: 0, failed: 0 });
    if (event.type === 'done') setProgress((p) => (p ? { ...p, current: p.total } : p));
    if (event.type !== 'progress') return;
    const ok = event.status === 'ok';
    setProgress((p) => ({
      current: event.current, total: event.total,
      added: (p?.added ?? 0) + (ok ? 1 : 0), failed: (p?.failed ?? 0) + (ok ? 0 : 1),
    }));
    setLog((prev) => [...prev, event as ScanProgressUpdate].slice(-200));
  }, []);

  const scan = async () => {
    if (!path.trim() || scanning) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setScanning(true);
    setLog([]);
    setProgress(null);
    try {
      await scanFolderStream(path.trim(), onEvent, controller.signal);
      await onDone();
      onClose();
    } catch (e) {
      if ((e as Error).name !== 'AbortError') onError(message(e));
    } finally {
      setScanning(false);
      abortRef.current = null;
    }
  };

  const browse = async () => {
    setBrowsing(true);
    try {
      const folder = await pickFolder();
      if (folder) setPath(folder);
    } catch (e) {
      onError(message(e));
    } finally {
      setBrowsing(false);
    }
  };

  const pct = progress && progress.total > 0 ? (progress.current / progress.total) * 100 : 0;
  return (
    <div className="tool-panel" role="region" aria-label="Scan folder">
      <div className="tool-row">
        <input
          className="text-in" type="text" value={path} placeholder="/path/to/fonts" disabled={scanning} autoFocus
          aria-label="Folder path" onChange={(e) => setPath(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && scan()}
        />
        <button type="button" className="btn btn-sm" onClick={browse} disabled={browsing || scanning}>{browsing ? 'Opening…' : 'Browse'}</button>
        {scanning
          ? <button type="button" className="btn btn-sm btn-danger" onClick={() => abortRef.current?.abort()}>Stop</button>
          : <button type="button" className="btn btn-sm btn-primary" onClick={scan} disabled={!path.trim()}>Scan</button>}
        <button type="button" className="btn btn-sm btn-ghost" onClick={onClose} disabled={scanning}>Close</button>
      </div>
      {!scanning && (saved.length > 0 || (path.trim() && !saved.includes(path.trim()))) && (
        <div className="tool-row">
          {saved.length > 0 && <span className="tool-msg">Saved:</span>}
          {saved.map((p) => (
            <span key={p} className="tchip">
              <button type="button" className="path-btn" title={p} onClick={() => setPath(p)}>{p.split('/').pop() || p}</button>
              <button type="button" className="icon-btn" aria-label={`Remove saved path ${p}`} onClick={async () => setSaved(await removeFontPath(p))}>×</button>
            </span>
          ))}
          {path.trim() && !saved.includes(path.trim()) && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={async () => setSaved(await addFontPath(path.trim()))}>Save this path</button>
          )}
        </div>
      )}
      {progress && (
        <>
          <div className="tool-row">
            <div className="progress" style={{ flex: 1 }}><div style={{ width: `${pct}%` }} /></div>
            <span className="tool-msg mono">{progress.current} / {progress.total} · {progress.added} added{progress.failed > 0 ? ` · ${progress.failed} failed` : ''}</span>
          </div>
          <ol className="scan-log" ref={logRef}>
            {log.map((e, i) => (
              <li key={i} className={e.status === 'ok' ? undefined : 'bad'}>
                {e.current} {e.status === 'ok' ? `+ ${e.familyName} ${e.subfamilyName} ${e.fileName}` : `× ${e.fileName}`}
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

/**
 * Folder scan, deduplication and library reset. Only the local build has
 * them: the static build has no server and no disk.
 */
export function LocalTools({ hasFonts, onChanged, onError }: {
  hasFonts: boolean;
  onChanged: () => Promise<void>;
  onError: (m: string) => void;
}) {
  const [scanOpen, setScanOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 3000);
    return () => clearTimeout(t);
  }, [note]);

  const dedup = async () => {
    try {
      const { removed } = await deduplicateDatabase();
      if (removed > 0) await onChanged();
      setNote(removed > 0 ? `Removed ${removed} duplicate${removed === 1 ? '' : 's'}` : 'No duplicates found');
    } catch (e) {
      onError(message(e));
    }
  };

  const clear = async () => {
    try {
      await clearDatabase();
      setConfirmClear(false);
      await onChanged();
    } catch (e) {
      onError(message(e));
    }
  };

  return (
    <>
      <button type="button" className="btn" aria-expanded={scanOpen} onClick={() => setScanOpen((v) => !v)}>Scan Folder</button>
      {hasFonts && <button type="button" className="btn" onClick={dedup} data-testid="dedup-btn">Deduplicate</button>}
      {note && <span className="tool-msg" data-testid="dedup-msg">{note}</span>}
      {hasFonts && (confirmClear
        ? <>
            <span className="tool-msg">Delete all fonts?</span>
            <button type="button" className="btn btn-sm btn-danger" onClick={clear}>Confirm</button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmClear(false)}>Cancel</button>
          </>
        : <button type="button" className="btn btn-danger" onClick={() => setConfirmClear(true)}>Clear Library</button>)}
      {scanOpen && <ScanPanel onDone={onChanged} onClose={() => setScanOpen(false)} onError={onError} />}
    </>
  );
}
