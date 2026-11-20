import { useCallback, useState, type CSSProperties, type DragEvent } from 'react';
import * as opentype from 'opentype.js';
import { decompress as woff2Decompress } from 'wawoff2';
import type { FontData, SampleFont } from '../types';
import { SAMPLE_FONTS, sampleFontUrl } from '../lib/sampleFonts';
import { Icon } from './ui/Icon';

const SAMPLE_CATEGORY: Record<SampleFont['category'], { label: string; color: string }> = {
  'sans-serif': { label: 'Sans-serif', color: 'var(--cat-sans)' },
  'serif': { label: 'Serif', color: 'var(--cat-serif)' },
  'monospace': { label: 'Monospace', color: 'var(--cat-mono)' },
  'handwriting': { label: 'Handwriting', color: 'var(--cat-script)' },
};

const sampleFamily = (s: SampleFont) => `__sample_${s.name.replace(/\W/g, '')}`;
const SAMPLE_FACES = SAMPLE_FONTS
  .map((s) => `@font-face{font-family:'${sampleFamily(s)}';src:url('${sampleFontUrl(s)}');font-display:swap}`)
  .join('');

async function parseFont(buffer: ArrayBuffer, fileName: string): Promise<FontData> {
  let data = buffer;
  if (fileName.toLowerCase().endsWith('.woff2')) {
    const out = await woff2Decompress(new Uint8Array(buffer));
    data = out instanceof ArrayBuffer ? out : (out as Uint8Array).buffer as ArrayBuffer;
  }
  const font = opentype.parse(data);
  return {
    font,
    fileName,
    familyName: font.names.fontFamily?.en ?? 'Unknown',
    styleName: font.names.fontSubfamily?.en ?? 'Regular',
    unitsPerEm: font.unitsPerEm,
    ascender: font.ascender,
    descender: font.descender,
    glyphCount: font.glyphs.length,
  };
}

/** The empty state of the Analyze view: a drop zone for a font file and four sample fonts. */
export function FontUploader({ onFontLoaded }: { onFontLoaded: (fontData: FontData) => void }) {
  const [over, setOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (getBuffer: () => Promise<ArrayBuffer>, fileName: string, failure: string) => {
    setLoading(true);
    setError(null);
    try {
      onFontLoaded(await parseFont(await getBuffer(), fileName));
    } catch (e) {
      console.error('Font load error:', e);
      setError(failure);
    } finally {
      setLoading(false);
    }
  }, [onFontLoaded]);

  const loadFile = (file: File | undefined) => {
    if (!file) return;
    load(() => file.arrayBuffer(), file.name, 'Could not read the font file. Make sure that it is a valid OTF, TTF, WOFF or WOFF2 file.');
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    loadFile(e.dataTransfer.files[0]);
  };

  const loadSample = (s: SampleFont) =>
    load(async () => {
      const res = await fetch(sampleFontUrl(s));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.arrayBuffer();
    }, `${s.name}.ttf`, `Could not load the sample font ${s.name}.`);

  return (
    <>
      <style>{SAMPLE_FACES}</style>
      <label
        className={`drop${over ? ' is-over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false); }}
        onDrop={onDrop}
      >
        <Icon name="upload" />
        {loading
          ? <span className="drop-main">Loading font…</span>
          : <span className="drop-main">Drop a font file here or <span className="drop-link">browse</span></span>}
        <span className="drop-hint">Supports OTF, TTF, WOFF, WOFF2</span>
        <input className="sr" type="file" accept=".otf,.ttf,.woff,.woff2" onChange={(e) => loadFile(e.target.files?.[0])} />
      </label>

      {error && <p className="start-error" role="alert">{error}</p>}

      <section className="samples" aria-labelledby="samples-title">
        <h2 className="samples-title" id="samples-title">Or try a sample font</h2>
        <div className="sample-grid">
          {SAMPLE_FONTS.map((s) => {
            const cat = SAMPLE_CATEGORY[s.category];
            return (
              <button key={s.name} type="button" className="sample" disabled={loading} onClick={() => loadSample(s)}>
                <span className="sample-aa" style={{ fontFamily: `'${sampleFamily(s)}', var(--font-ui)` }} aria-hidden="true">Aa</span>
                <span className="sample-name">{s.name}</span>
                <span className="sample-cat"><span className="cat-dot" style={{ '--c': cat.color } as CSSProperties} />{cat.label}</span>
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}
