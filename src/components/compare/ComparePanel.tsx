import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { Icon } from '../ui/Icon';
import type { ComparedFont } from './types';

const PANEL = { min: 260, max: 520, step: 16, initial: 320 };

const MINUS = '−';
const fmt = (n: number) => (n < 0 ? `${MINUS}${Math.abs(n)}` : String(Math.round(n)));
const ROWS: [keyof ComparedFont, string][] = [['upm', 'UPM'], ['xh', 'x-height'], ['cap', 'Cap height'], ['asc', 'Ascender'], ['desc', 'Descender'], ['glyphs', 'Glyphs']];
const KEYS: Record<string, number> = { ArrowLeft: PANEL.step, ArrowRight: -PANEL.step };

const Dot = ({ color }: { color: string }) => <span className="cat-dot" style={{ '--c': color } as CSSProperties} aria-hidden="true" />;

export interface CompareSettings {
  text: string;
  size: number;
  normalize: boolean;
  hidden: Set<string>;
}

function MetricsTable({ fonts, hidden }: { fonts: ComparedFont[]; hidden: Set<string> }) {
  const off = (f: ComparedFont) => (hidden.has(f.key) ? 'is-off' : undefined);
  return (
    <table className="mtable">
      <colgroup><col className="c-metric" />{fonts.map((f) => <col key={f.key} />)}</colgroup>
      <thead>
        <tr>
          <th scope="col">Metric</th>
          {fonts.map((f) => (
            <th key={f.key} scope="col" className={off(f)} title={`${f.family} ${f.style}`}>
              <span className="h-font"><Dot color={f.color} /><span>{f.family}</span></span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {ROWS.map(([key, name]) => (
          <tr key={key}>
            <th scope="row">{name}</th>
            {fonts.map((f) => <td key={f.key} className={off(f)}>{fmt(f[key] as number)}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Settings panel at the right of the canvas. It can collapse to a rail, and its edge resizes it. */
export function ComparePanel({ fonts, settings, onChange, width, onWidth, onResizing }: {
  fonts: ComparedFont[];
  settings: CompareSettings;
  onChange: (s: CompareSettings) => void;
  width: number;
  onWidth: (w: number) => void;
  onResizing: (on: boolean) => void;
}) {
  const [open, setOpen] = useState(true);
  const [drag, setDrag] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const set = (patch: Partial<CompareSettings>) => onChange({ ...settings, ...patch });
  const clamp = (w: number) => Math.round(Math.min(PANEL.max, Math.max(PANEL.min, w)));

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag(true);
    onResizing(true);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId) || !panelRef.current) return;
    onWidth(clamp(panelRef.current.getBoundingClientRect().right - e.clientX));
  };
  const onEnd = () => { setDrag(false); onResizing(false); };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Home') onWidth(PANEL.min);
    else if (e.key === 'End') onWidth(PANEL.max);
    else if (e.key in KEYS) onWidth(clamp(width + KEYS[e.key]));
    else return;
    e.preventDefault();
  };
  const toggleFont = (key: string) => {
    const hidden = new Set(settings.hidden);
    if (hidden.has(key)) hidden.delete(key); else hidden.add(key);
    set({ hidden });
  };

  return (
    <aside ref={panelRef} className={`panel${open ? '' : ' is-collapsed'}`} aria-label="Compare settings">
      {open && (
        <div
          className={`handle${drag ? ' is-drag' : ''}`} role="separator" tabIndex={0} aria-orientation="vertical"
          aria-label="Resize settings panel" aria-valuemin={PANEL.min} aria-valuemax={PANEL.max} aria-valuenow={width}
          onPointerDown={onDown} onPointerMove={onMove} onLostPointerCapture={onEnd} onKeyDown={onKey}
        />
      )}
      <div className="panel-head">
        <h2 className="panel-title">Settings</h2>
        <button type="button" className="icon-btn" aria-expanded={open} aria-controls="cmp-panel-body" aria-label="Settings panel" onClick={() => setOpen(!open)}>
          <Icon name="collapse" className="collapse-ico" />
        </button>
      </div>
      <div className="panel-body" id="cmp-panel-body" hidden={!open}>
        <section className="sec">
          <label className="sec-title" htmlFor="cmp-sample">Sample text</label>
          <input className="text-in" id="cmp-sample" type="text" value={settings.text} autoComplete="off" spellCheck={false} onChange={(e) => set({ text: e.target.value })} />
        </section>
        <section className="sec">
          <div className="sec-head">
            <label className="sec-title" htmlFor="cmp-size">Size</label>
            <output className="ctl-val" htmlFor="cmp-size">{settings.size} px</output>
          </div>
          <input
            className="slider" id="cmp-size" type="range" min={24} max={240} step={1} value={settings.size}
            style={{ '--p': `${((settings.size - 24) / 216) * 100}%` } as CSSProperties}
            onChange={(e) => set({ size: Number(e.target.value) })}
          />
        </section>
        <section className="sec">
          <label className="switch">Normalize x-height <input type="checkbox" role="switch" checked={settings.normalize} onChange={(e) => set({ normalize: e.target.checked })} /></label>
          <p className="hint">Scales each font to the x-height of the first visible font.</p>
        </section>
        <section className="sec" aria-labelledby="cmp-fonts">
          <h3 className="sec-title" id="cmp-fonts">Fonts</h3>
          <ul className="font-list">
            {fonts.map((f) => (
              <li key={f.key}>
                <label className="check">
                  <input type="checkbox" checked={!settings.hidden.has(f.key)} onChange={() => toggleFont(f.key)} />
                  <Dot color={f.color} />
                  <span className="fam">{f.family}</span>
                  <span className="sty">{f.style}{f.variable ? ' · Variable' : ''}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
        <section className="sec" aria-labelledby="cmp-metrics">
          <h3 className="sec-title" id="cmp-metrics">Metrics <span className="light">(font units)</span></h3>
          <MetricsTable fonts={fonts} hidden={settings.hidden} />
        </section>
      </div>
    </aside>
  );
}
