import { useState, type CSSProperties } from 'react';
import { IS_STATIC } from '../../lib/env';
import {
  CAT_COLOR, CAT_LABELS, CAT_ORDER, METRICS, setVf, toggleItem,
  type Extents, type Filters, type MetricKey, type VfFilter,
} from '../../lib/libraryFilters';
import { HistogramFilter } from '../HistogramFilter';
import { Icon } from '../ui/Icon';
import { Popover } from '../ui/Popover';

export type TagMode = 'metadata' | 'extended';

const VF_OPTIONS: [VfFilter, string][] = [['all', 'All'], ['variable', 'Variable'], ['static', 'Static']];
const SOURCE_OPTIONS: [Filters['source'], string][] = [[null, 'All'], ['local', 'Local'], ['google', 'Google']];

/** `null` for an empty field: no upper limit. */
const parseMax = (v: string) => (v === '' ? null : Math.max(1, Number(v) || 1));
const parseMin = (v: string) => Math.max(1, Number(v) || 1);

function MinMax({ label, min, max, onChange }: { label: string; min: number; max: number | null; onChange: (min: number, max: number | null) => void }) {
  return (
    <div className="minmax">
      <label>Min<input className="num" type="number" min={1} inputMode="numeric" value={min} aria-label={`${label} minimum`} onChange={(e) => onChange(parseMin(e.target.value), max)} /></label>
      <span className="dash" aria-hidden="true">–</span>
      <label>Max<input className="num" type="number" min={1} inputMode="numeric" placeholder="∞" value={max ?? ''} aria-label={`${label} maximum`} onChange={(e) => onChange(min, parseMax(e.target.value))} /></label>
    </div>
  );
}

function Seg<T extends string | null>({ name, label, options, value, onChange }: {
  name: string; label: string; options: [T, string][]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <label key={text}><input type="radio" name={name} checked={value === v} onChange={() => onChange(v)} /><span>{text}</span></label>
      ))}
    </div>
  );
}

function AdvancedFilters({ filters, update, extents, values, scripts, metricsPending }: {
  filters: Filters;
  update: (fn: (f: Filters) => Filters) => void;
  extents: Extents;
  values: Record<MetricKey, number[]>;
  scripts: string[];
  metricsPending: boolean;
}) {
  return (
    <div className="adv-body">
      {metricsPending && <p className="adv-note"><span className="spinner" aria-hidden="true" />Computing font metrics…</p>}
      {METRICS.map(({ key, label }) => {
        const ext = extents[key];
        if (!ext) return null;
        return (
          <HistogramFilter
            key={key} label={label} values={values[key]} extent={ext} range={filters.ranges[key] ?? ext}
            onChange={(r) => update((f) => ({ ...f, ranges: { ...f.ranges, [key]: r } }))}
          />
        );
      })}
      <label className="check">
        <input type="checkbox" checked={filters.excludeLatinOnly} onChange={(e) => update((f) => ({ ...f, excludeLatinOnly: e.target.checked }))} />
        Exclude basic-Latin-only
      </label>
      {scripts.length > 0 && (
        <section className="fgroup" aria-labelledby="g-req">
          <h3 className="group-title" id="g-req">Require scripts</h3>
          <div className="chips">
            {scripts.map((s) => (
              <label key={s} className="chip chip-sm">
                <input type="checkbox" checked={filters.scripts.includes(s)} onChange={() => update((f) => ({ ...f, scripts: toggleItem(f.scripts, s) }))} />
                <span>{s}</span>
              </label>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export function FilterSidebar({ hidden, filters, update, onReset, tagMode, onTagMode, extents, values, scripts, advOpen, onAdvOpen, advCount, metricsPending }: {
  hidden: boolean;
  filters: Filters;
  update: (fn: (f: Filters) => Filters) => void;
  onReset: () => void;
  tagMode: TagMode;
  onTagMode: (m: TagMode) => void;
  extents: Extents;
  values: Record<MetricKey, number[]>;
  scripts: string[];
  advOpen: boolean;
  onAdvOpen: (open: boolean) => void;
  advCount: number;
  metricsPending: boolean;
}) {
  const [infoAnchor, setInfoAnchor] = useState<HTMLElement | null>(null);
  const cats = CAT_ORDER.filter((c) => c !== 'slab' || tagMode === 'extended');

  return (
    <aside className="sidebar" id="lib-filters" aria-label="Filters" hidden={hidden}>
      <div className="side-head">
        <h2 className="side-title">Filters</h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onReset}>Reset all</button>
      </div>

      <section className="fgroup" aria-labelledby="g-show">
        <h3 className="group-title" id="g-show">Show</h3>
        <div className="row-gap">
          <button type="button" className="btn btn-sm star-toggle" aria-pressed={filters.starred} onClick={() => update((f) => ({ ...f, starred: !f.starred }))}>
            <Icon name="star" />Starred
          </button>
          <Seg name="vf" label="Font type" options={VF_OPTIONS} value={filters.vf} onChange={(v) => update((f) => setVf(f, v))} />
        </div>
        {!IS_STATIC && <Seg name="source" label="Source" options={SOURCE_OPTIONS} value={filters.source} onChange={(v) => update((f) => ({ ...f, source: v }))} />}
      </section>

      <section className="fgroup" aria-labelledby="g-cat">
        <h3 className="group-title" id="g-cat">Category</h3>
        <div className="chips">
          {cats.map((c) => (
            <label key={c} className="chip">
              <input type="checkbox" checked={filters.cats.includes(c)} onChange={() => update((f) => ({ ...f, cats: toggleItem(f.cats, c) }))} />
              <span><span className="cat-dot" style={{ '--c': CAT_COLOR[c] } as CSSProperties} />{CAT_LABELS[c].long}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="fgroup" aria-labelledby="g-styles">
        <h3 className="group-title" id="g-styles">Styles in family</h3>
        <MinMax label="Styles" min={filters.stylesMin} max={filters.stylesMax} onChange={(min, max) => update((f) => ({ ...f, stylesMin: min, stylesMax: max }))} />
      </section>

      {filters.vf === 'variable' && (
        <section className="fgroup" aria-labelledby="g-axes">
          <h3 className="group-title" id="g-axes">Variable axes</h3>
          <MinMax label="Axes" min={filters.axesMin} max={filters.axesMax} onChange={(min, max) => update((f) => ({ ...f, axesMin: min, axesMax: max }))} />
        </section>
      )}

      <section className="fgroup" aria-labelledby="g-tags">
        <h3 className="group-title" id="g-tags">
          Tags source
          <button type="button" className="icon-btn info-btn" aria-label="About tag sources" aria-haspopup="dialog" onClick={(e) => setInfoAnchor(e.currentTarget)}>
            <Icon name="info" />
          </button>
        </h3>
        <Seg name="tags" label="Tags source" options={[['metadata', 'File meta'], ['extended', 'Extended']]} value={tagMode} onChange={onTagMode} />
      </section>

      <details className="adv" open={advOpen} onToggle={(e) => onAdvOpen(e.currentTarget.open)}>
        <summary>
          Advanced filters {advCount > 0 && <span className="badge">{advCount}</span>}
          <Icon name="chev" className="chev" />
        </summary>
        {advOpen && <AdvancedFilters filters={filters} update={update} extents={extents} values={values} scripts={scripts} metricsPending={metricsPending} />}
      </details>

      {infoAnchor && (
        <Popover anchor={infoAnchor} onClose={() => setInfoAnchor(null)} role="dialog" label="About tag sources" className="pop-info">
          <b>File meta</b> uses the category from the font file’s own metadata.<br />
          <b>Extended</b> adds tags from an analysis of the “H” glyph outline. It corrects serif fonts that the file labels as sans, and it adds “slab”. An asterisk (*) marks a category from that analysis. Your own category edits always win.
        </Popover>
      )}
    </aside>
  );
}
