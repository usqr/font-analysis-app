import { useState } from 'react';
import type { StoredFontMeta } from '../../types';
import { deleteFont, refreshFont, updateFontPath } from '../../lib/api';

/**
 * Disk actions for one library font: read it again, change its path, remove
 * it. Only the local build has them.
 */
export function LocalFontActions({ font, onChanged, onRemoved }: {
  font: StoredFontMeta;
  onChanged: () => void;
  onRemoved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const editPath = () => {
    const path = prompt('New file path', font.filePath);
    if (path && path !== font.filePath) run(async () => { await updateFontPath(font.id, path); onChanged(); });
  };
  const remove = () => {
    if (confirm(`Remove ${font.fileName} from the library?`)) run(async () => { await deleteFont(font.id); onRemoved(); });
  };

  return (
    <>
      <button type="button" className="btn" disabled={busy} onClick={() => run(async () => { await refreshFont(font.id); onChanged(); })} title="Read the file from the disk again">Refresh</button>
      <button type="button" className="btn" disabled={busy} onClick={editPath} title={font.filePath}>Edit path</button>
      <button type="button" className="btn btn-danger" disabled={busy} onClick={remove}>Remove</button>
      {error && <span className="action-error" role="alert">{error}</span>}
    </>
  );
}
