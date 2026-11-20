import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import * as opentype from 'opentype.js';
import { fetchFontData } from '../lib/api';
import { analyzeXHeight } from '../analysis/xHeight';
import { COMPARE_MAX, entryKey, parseCompareParam, type CompareRef } from '../lib/compareEntries';
import { weightLabel } from '../lib/fontFamilies';
import { CompareStage } from './compare/CompareStage';
import { ComparePanel, type CompareSettings } from './compare/ComparePanel';
import type { ComparedFont } from './compare/types';
import { Icon } from './ui/Icon';

const registered = new Map<string, Promise<void>>();

/** Registers the font file as a CSS font once, so that SVG text can use it. */
function registerFace(css: string, bytes: ArrayBuffer): Promise<void> {
  let p = registered.get(css);
  if (!p) {
    const face = new FontFace(css, bytes);
    p = face.load().then(() => { document.fonts.add(face); });
    registered.set(css, p);
  }
  return p;
}

async function loadCompared(ref: CompareRef, i: number): Promise<ComparedFont> {
  const data = await fetchFontData(ref.fontId);
  const bytes = Uint8Array.from(atob(data.base64Data), (c) => c.charCodeAt(0)).buffer as ArrayBuffer;
  const font = opentype.parse(bytes);
  const css = `__cmp_${ref.fontId}`;
  await registerFace(css, bytes);
  const xh = analyzeXHeight(font);
  const variable = !!(font.tables as { fvar?: unknown }).fvar;
  const italic = /italic|oblique/i.test(data.subfamilyName) ? ' Italic' : '';
  return {
    key: entryKey(ref),
    family: data.familyName,
    style: ref.wght != null ? `${weightLabel(ref.wght)}${italic}` : data.subfamilyName,
    variable,
    variation: ref.wght != null ? `'wght' ${ref.wght}` : undefined,
    css,
    color: `var(--font-${i + 1})`,
    font,
    upm: font.unitsPerEm,
    xh: xh?.xHeight ?? font.unitsPerEm * 0.5,
    cap: xh?.capHeight ?? font.unitsPerEm * 0.7,
    asc: font.ascender,
    desc: font.descender,
    glyphs: font.glyphs.length,
  };
}

/** Width of an element, kept up to date with a ResizeObserver. */
function useWidth(ref: RefObject<HTMLElement | null>, active: boolean): number {
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, active]);
  return w;
}

function EmptyState() {
  return (
    <main className="empty-state">
      <Icon name="compareEmpty" className="empty-ico" strokeWidth={1.2} />
      <h2>No fonts selected for comparison</h2>
      <p>Go to the Library, select 2–{COMPARE_MAX} styles, and click Compare.</p>
      <div className="empty-actions"><Link className="btn btn-primary" to="/">Open Library</Link></div>
    </main>
  );
}

export function CompareView() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const refs = useMemo(() => parseCompareParam(params.get('ids')).slice(0, COMPARE_MAX), [params]);
  const [fonts, setFonts] = useState<ComparedFont[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<CompareSettings>({ text: 'Hamburgefonstiv', size: 120, normalize: false, hidden: new Set() });
  const [panelW, setPanelW] = useState(320);
  const [resizing, setResizing] = useState(false);
  const canvasRef = useRef<HTMLElement>(null);
  const canvasW = useWidth(canvasRef, fonts.length > 0);

  useEffect(() => {
    if (refs.length === 0) { setFonts([]); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all(refs.map(loadCompared))
      .then((list) => { if (!cancelled) setFonts(list); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refs]);

  const visible = fonts.filter((f) => !settings.hidden.has(f.key));
  const empty = refs.length === 0;
  const title = empty ? 'Compare' : `Comparing ${refs.length} ${refs.length === 1 ? 'font' : 'fonts'}`;

  return (
    <div className={`compare-page${resizing ? ' is-resizing' : ''}`} style={{ '--panel-w': `${panelW}px` } as CSSProperties}>
      <div className="page-head">
        <h1 className="page-title">{title}</h1>
        <span className="grow" />
        {error && <p className="page-error" role="alert">{error}</p>}
        {!empty && <button type="button" className="btn btn-sm" onClick={() => navigate('/compare')}>Clear</button>}
      </div>
      {empty && <EmptyState />}
      {!empty && loading && <div className="loading-state"><span className="spinner" aria-hidden="true" />Loading fonts for comparison…</div>}
      {!empty && !loading && fonts.length > 0 && (
        <main className="cmp">
          <section className="canvas" ref={canvasRef} aria-label="Overlay canvas">
            <p className="canvas-cap">
              {visible.map((f) => (
                <span key={f.key} className="lg"><span className="cat-dot" style={{ '--c': f.color } as CSSProperties} aria-hidden="true" />{f.family} {f.style}</span>
              ))}
              <span>
                {visible[0] ? `Labels show ${visible[0].family}. Ticks mark each font.` : 'No fonts visible. Turn on a font in the panel.'}
                {settings.normalize && visible[0] ? ' x-height normalized.' : ''}
              </span>
            </p>
            <CompareStage fonts={visible} text={settings.text || ' '} size={settings.size} normalize={settings.normalize} width={canvasW} />
          </section>
          <ComparePanel fonts={fonts} settings={settings} onChange={setSettings} width={panelW} onWidth={setPanelW} onResizing={setResizing} />
        </main>
      )}
    </div>
  );
}
