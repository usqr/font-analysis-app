import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import type { FontCategory, FontFamily } from '../types';
import { computeMetrics } from '../lib/api';
import { IS_STATIC } from '../lib/env';
import { useToast } from '../lib/useToast';
import {
  CAT_COLOR, CAT_LABELS, DEFAULT_FILTERS, activeChips, clearChip, matches,
  type ActiveChip, type Filters,
} from '../lib/libraryFilters';
import { compareParam, entryKey, setEntry, toggleEntry, type CompareEntry } from '../lib/compareEntries';
import type { CompareGroup, CompareOption } from '../lib/familyFaces';
import { FamilyTile, type TileMenu } from './library/FamilyTile';
import { FilterSidebar, type TagMode } from './library/FilterSidebar';
import { CategoryMenu, CompareMenu } from './library/LibraryMenus';
import { BulkBar, CompareTray } from './library/Dock';
import { LocalTools } from './library/LocalTools';
import { useLibraryData } from './library/useLibraryData';
import { useFamilyFacts } from './library/useFamilyFacts';
import { Icon } from './ui/Icon';
import { Toast } from './ui/Toast';

type ViewMode = 'list' | 'grid';
type MenuState =
  | { kind: 'cat'; anchor: HTMLElement; family: FontFamily }
  | { kind: 'cmp'; anchor: HTMLElement; family: FontFamily; name: string; groups: CompareGroup[] }
  | { kind: 'bulk'; anchor: HTMLElement };

const TAG_MODE_KEY = 'fa:tagMode';

function readTagMode(): TagMode {
  try {
    return localStorage.getItem(TAG_MODE_KEY) === 'metadata' ? 'metadata' : 'extended';
  } catch {
    return 'extended';
  }
}

function writeTagMode(mode: TagMode) {
  try {
    localStorage.setItem(TAG_MODE_KEY, mode);
  } catch {
    // Storage can be blocked (private mode). The choice then lasts for this page only.
  }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const toEntry = (o: CompareOption, family: string, label = o.label): CompareEntry =>
  ({ key: entryKey(o), fontId: o.fontId, wght: o.wght, family, label });

function ActiveBar({ chips, onClear, onReset }: { chips: ActiveChip[]; onClear: (id: string) => void; onReset: () => void }) {
  return (
    <div className="active-bar">
      <span className="active-label">Active</span>
      {chips.map((c) => (
        <button key={c.id} type="button" className="fchip" aria-label={`Remove filter ${c.label}`} onClick={() => onClear(c.id)}>
          {c.cat && <span className="cat-dot" style={{ '--c': CAT_COLOR[c.cat] } as CSSProperties} />}
          {c.label}
          <Icon name="x" />
        </button>
      ))}
      <button type="button" className="btn btn-ghost btn-sm" onClick={onReset}>Reset all</button>
    </div>
  );
}

function CountLabel({ families, total, filtered }: { families: FontFamily[]; total: number; filtered: boolean }) {
  const fonts = families.reduce((s, f) => s + f.fonts.length, 0);
  return (
    <p className="count" aria-live="polite">
      <b>{fonts.toLocaleString('en-US')}</b> fonts in <b>{families.length.toLocaleString('en-US')}</b> families
      {filtered && <> of {total.toLocaleString('en-US')} total</>}
    </p>
  );
}

/** Starts the server-side metric computation once, when a filter needs metrics. */
function useMetricsOnDemand(data: ReturnType<typeof useLibraryData>, needed: boolean) {
  const [ready, setReady] = useState(IS_STATIC);
  const { fonts, reload } = data;
  useEffect(() => {
    if (ready || !needed || fonts.length === 0) return;
    if (!fonts.some((f) => !f.metrics || !f.category)) { setReady(true); return; }
    computeMetrics()
      .then(({ updated }) => (updated > 0 ? reload() : undefined))
      .catch(() => {})
      .finally(() => setReady(true));
  }, [ready, needed, fonts, reload]);
  return ready;
}

export function LibraryView() {
  const navigate = useNavigate();
  const data = useLibraryData();
  const toast = useToast();
  const [tagMode, setTagModeState] = useState<TagMode>(readTagMode);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [sidebarOpen, setSidebarOpen] = useState(() => !matchMedia('(max-width: 900px)').matches);
  const [advOpen, setAdvOpen] = useState(false);
  const [view, setView] = useState<ViewMode>('grid');
  const [bulk, setBulk] = useState(false);
  const [bulkSel, setBulkSel] = useState<Set<string>>(new Set());
  const [compare, setCompare] = useState<CompareEntry[]>([]);
  const [menu, setMenu] = useState<MenuState | null>(null);

  const { families, isStarred } = data;
  const { resolved, facts, extents, values, scripts } = useFamilyFacts(families, tagMode === 'extended', isStarred);
  const metricsReady = useMetricsOnDemand(data, advOpen || filters.cats.length > 0);

  const visible = useMemo(
    () => families.filter((f) => matches(facts.get(f.familyName)!, filters, extents)),
    [families, facts, filters, extents],
  );
  const chips = useMemo(() => activeChips(filters, extents), [filters, extents]);
  const cmpKeys = useMemo(() => new Set(compare.map((e) => e.key)), [compare]);
  const cmpCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of compare) m.set(e.family, (m.get(e.family) ?? 0) + 1);
    return m;
  }, [compare]);

  const update = useCallback((fn: (f: Filters) => Filters) => setFilters(fn), []);
  const resetFilters = useCallback(() => setFilters(DEFAULT_FILTERS), []);
  const setTagMode = useCallback((mode: TagMode) => {
    setTagModeState(mode);
    writeTagMode(mode);
    if (mode === 'metadata') setFilters((f) => ({ ...f, cats: f.cats.filter((c) => c !== 'slab') }));
  }, []);

  const openFont = useCallback((id: string) => navigate(`/analyze/${id}`), [navigate]);
  const toggleSelect = useCallback((name: string) => setBulkSel((prev) => {
    const next = new Set(prev);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  }), []);
  const openCategoryMenu = useCallback((anchor: HTMLElement, family: FontFamily) => setMenu({ kind: 'cat', anchor, family }), []);
  const handleCompare = useCallback((anchor: HTMLElement, family: FontFamily, name: string, groups: CompareGroup[]) => {
    const options = groups.flatMap((g) => g.options);
    if (options.length === 1) setCompare((prev) => toggleEntry(prev, toEntry(options[0], family.familyName, name)));
    else setMenu({ kind: 'cmp', anchor, family, name, groups });
  }, []);

  const toggleBulk = () => {
    if (bulk) setBulkSel(new Set());
    setBulk(!bulk);
  };

  const pickCategory = async (cat: FontCategory) => {
    if (!menu || menu.kind === 'cmp') return;
    const fams = menu.kind === 'bulk' ? families.filter((f) => bulkSel.has(f.familyName)) : [menu.family];
    setMenu(null);
    if (await data.setCategory(fams, cat)) {
      toast.show(`Category set to ${CAT_LABELS[cat].long} for ${plural(fams.length, 'family', 'families')}`);
    }
  };

  const renderMenu = () => {
    if (!menu) return null;
    const close = () => setMenu(null);
    if (menu.kind === 'cmp') {
      const set = (o: CompareOption, on: boolean) => setCompare((prev) => setEntry(prev, toEntry(o, menu.family.familyName), on));
      const all = menu.groups.flatMap((g) => g.options);
      return (
        <CompareMenu
          anchor={menu.anchor} name={menu.name} groups={menu.groups} selected={cmpKeys} onClose={close}
          onToggle={set} onSetAll={(on) => all.forEach((o) => set(o, on))}
        />
      );
    }
    const title = menu.kind === 'bulk' ? `Set category · ${plural(bulkSel.size, 'family', 'families')}` : 'Set category';
    const current = menu.kind === 'cat' ? resolved.get(menu.family.familyName)?.category : undefined;
    return <CategoryMenu anchor={menu.anchor} title={title} current={current} onPick={pickCategory} onClose={close} />;
  };

  const tileMenu = (name: string): TileMenu | undefined =>
    (menu && menu.kind !== 'bulk' && menu.family.familyName === name ? menu.kind : undefined);

  if (data.loading) {
    return <div className="loading-state"><span className="spinner" aria-hidden="true" />Loading library…</div>;
  }

  return (
    <div className={`lib-page${bulk ? ' is-bulk' : ''}`}>
      <div className="toolbar">
        <button type="button" className="btn is-toggle" aria-expanded={sidebarOpen} aria-controls="lib-filters" onClick={() => setSidebarOpen((v) => !v)}>
          <Icon name="filters" />
          Filters {chips.length > 0 && <span className="badge">{chips.length}</span>}
        </button>
        <label className="search">
          <Icon name="search" />
          <span className="sr">Search families</span>
          <input type="search" placeholder="Search families…" autoComplete="off" value={filters.search} onChange={(e) => update((f) => ({ ...f, search: e.target.value }))} />
        </label>
        <div className="seg" role="group" aria-label="View">
          <button type="button" aria-pressed={view === 'list'} aria-label="List view" data-testid="view-list" onClick={() => setView('list')}><Icon name="list" /></button>
          <button type="button" aria-pressed={view === 'grid'} aria-label="Grid view" data-testid="view-grid" onClick={() => setView('grid')}><Icon name="grid" /></button>
        </div>
        <button type="button" className="btn" aria-pressed={bulk} onClick={toggleBulk}>Bulk Edit</button>
        {!IS_STATIC && <LocalTools hasFonts={data.fonts.length > 0} onChanged={data.reload} onError={data.setError} />}
        <CountLabel families={visible} total={data.fonts.length} filtered={visible.length < families.length} />
      </div>

      {data.error && (
        <div className="error-banner" role="alert">
          {data.error}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => data.setError(null)}>Dismiss</button>
        </div>
      )}

      <div className={`workspace${sidebarOpen ? '' : ' no-sidebar'}`}>
        <FilterSidebar
          hidden={!sidebarOpen}
          filters={filters} update={update} onReset={resetFilters} tagMode={tagMode} onTagMode={setTagMode}
          extents={extents} values={values} scripts={scripts} advOpen={advOpen} onAdvOpen={setAdvOpen}
          advCount={chips.filter((c) => c.advanced).length} metricsPending={!metricsReady}
        />
        <main className="lib-content">
          {chips.length > 0 && <ActiveBar chips={chips} onClear={(id) => update((f) => clearChip(f, id))} onReset={resetFilters} />}
          <div className="grid-scroll">
            <div className={`tile-grid${view === 'list' ? ' is-list' : ''}`} aria-label="Font families" data-testid="grid-view">
              {visible.length === 0 && (
                <div className="empty" style={{ gridColumn: '1 / -1' }}>
                  {data.fonts.length === 0
                    ? <p>No fonts in the library.{IS_STATIC ? '' : ' Use “Scan Folder” to add fonts from a folder.'}</p>
                    : <><p>No families match these filters.</p><button type="button" className="btn" onClick={resetFilters}>Reset all filters</button></>}
                </div>
              )}
              {visible.map((fam) => (
                <FamilyTile
                  key={fam.familyName}
                  family={fam}
                  resolved={resolved.get(fam.familyName)}
                  starred={isStarred(fam.familyName)}
                  bulk={bulk}
                  selected={bulkSel.has(fam.familyName)}
                  menu={tileMenu(fam.familyName)}
                  cmpCount={cmpCounts.get(fam.familyName) ?? 0}
                  onOpen={openFont}
                  onToggleStar={data.toggleStar}
                  onToggleSelect={toggleSelect}
                  onCategoryMenu={openCategoryMenu}
                  onCompare={handleCompare}
                />
              ))}
            </div>
          </div>
          <div className="dock">
            {bulk && (
              <BulkBar
                count={bulkSel.size}
                onSelectAll={() => setBulkSel(new Set(visible.map((f) => f.familyName)))}
                onCategory={(anchor) => setMenu({ kind: 'bulk', anchor })}
                onDone={toggleBulk}
              />
            )}
            {compare.length > 0 && (
              <CompareTray
                entries={compare}
                onRemove={(key) => setCompare((prev) => prev.filter((e) => e.key !== key))}
                onClear={() => setCompare([])}
                onCompare={() => navigate(`/compare?ids=${compareParam(compare)}`)}
              />
            )}
          </div>
        </main>
      </div>
      {renderMenu()}
      <Toast message={toast.message} visible={toast.visible} />
    </div>
  );
}
