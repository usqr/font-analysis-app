import { COMPARE_MAX, type CompareEntry } from '../../lib/compareEntries';
import { Icon } from '../ui/Icon';

export function BulkBar({ count, onSelectAll, onCategory, onDone }: {
  count: number;
  onSelectAll: () => void;
  onCategory: (anchor: HTMLElement) => void;
  onDone: () => void;
}) {
  return (
    <div className="bar" role="region" aria-label="Bulk edit">
      <span className="bar-label"><b>{count}</b> selected</span>
      <button type="button" className="btn btn-sm" onClick={onSelectAll}>Select all</button>
      <button type="button" className="btn btn-sm" aria-haspopup="menu" disabled={count === 0} onClick={(e) => onCategory(e.currentTarget)}>Set category…</button>
      <span className="grow" />
      <button type="button" className="btn btn-primary btn-sm" onClick={onDone}>Done</button>
    </div>
  );
}

export function CompareTray({ entries, onRemove, onClear, onCompare }: {
  entries: CompareEntry[];
  onRemove: (key: string) => void;
  onClear: () => void;
  onCompare: () => void;
}) {
  const n = entries.length;
  const tooMany = n > COMPARE_MAX;
  return (
    <div className="bar" role="region" aria-label="Compare tray">
      <span className="bar-label"><b>{n}</b> to compare{tooMany ? ` · max ${COMPARE_MAX}` : ''}</span>
      <div className="tray-chips">
        {entries.map((e) => (
          <span key={e.key} className="tchip">
            {e.label}
            <button type="button" className="icon-btn" aria-label={`Remove ${e.label} from compare`} onClick={() => onRemove(e.key)}>
              <Icon name="x" />
            </button>
          </span>
        ))}
      </div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onClear}>Clear</button>
      <button
        type="button" className="btn btn-primary btn-sm" onClick={onCompare} disabled={n < 2 || tooMany}
        title={n < 2 ? 'Select at least 2 styles' : tooMany ? `Select at most ${COMPARE_MAX} styles` : undefined}
      >
        Compare {n}
      </button>
    </div>
  );
}
