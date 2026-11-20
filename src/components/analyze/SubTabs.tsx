import { useRef, type KeyboardEvent } from 'react';
import type { AnalysisTab } from '../../types';

export interface TabDef { id: AnalysisTab; label: string }

const STEP: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };

/** Tab bar with a roving tab stop: the arrow keys, Home and End select a tab. */
export function SubTabs({ tabs, active, onSelect }: { tabs: TabDef[]; active: AnalysisTab; onSelect: (t: AnalysisTab) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const onKey = (e: KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === active);
    let n: number | null = null;
    if (e.key in STEP) n = (i + STEP[e.key] + tabs.length) % tabs.length;
    if (e.key === 'Home') n = 0;
    if (e.key === 'End') n = tabs.length - 1;
    if (n === null) return;
    e.preventDefault();
    onSelect(tabs[n].id);
    ref.current?.querySelectorAll<HTMLElement>('[role="tab"]')[n]?.focus();
  };
  return (
    <div className="subtabs" role="tablist" aria-label="Analysis" ref={ref} onKeyDown={onKey} data-testid="analysis-tabs">
      {tabs.map((t) => (
        <button
          key={t.id} type="button" className="subtab" role="tab" id={`tab-${t.id}`} aria-controls={`panel-${t.id}`}
          aria-selected={t.id === active} tabIndex={t.id === active ? 0 : -1} onClick={() => onSelect(t.id)}
          data-testid={`tab-${t.id}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
