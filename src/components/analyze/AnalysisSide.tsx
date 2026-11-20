import type { CSSProperties, Dispatch, ReactNode, SetStateAction } from 'react';
import type { FontData, VariableAxis } from '../../types';
import { getAxisInfo } from '../../lib/axisDescriptions';
import { pctOf, signedInt } from '../../lib/format';
import { OTF_FEATURE_NAMES } from '../../lib/otfFeatures';

export interface Stat { label: string; value: string }
export interface RawMetaSection { title: string; entries: { label: string; value: string }[] }

function Section({ id, title, count, children }: { id: string; title: string; count?: string; children: ReactNode }) {
  return (
    <section className="side-sec" aria-labelledby={id}>
      <div className="sec-head">
        <h2 className="sec-title" id={id}>{title}</h2>
        {count && <span className="sec-count">{count}</span>}
      </div>
      {children}
    </section>
  );
}

function AxisControls({ axes, values, setValues, previewFamily }: {
  axes: VariableAxis[];
  values: Record<string, number>;
  setValues: Dispatch<SetStateAction<Record<string, number>>>;
  previewFamily: string | null;
}) {
  const settings = Object.entries(values).map(([t, v]) => `'${t}' ${v}`).join(', ');
  return (
    <>
      {axes.map((a) => {
        const info = getAxisInfo(a.tag, a.name);
        const fine = a.maxValue - a.minValue <= 10;
        const v = values[a.tag] ?? a.defaultValue;
        return (
          <div key={a.tag} className="axis-ctl">
            <div className="axis-head">
              <span title={info.description}><b>{info.name}</b> · <span className="mono">{a.tag}</span></span>
              <output>{v.toFixed(fine ? 2 : 0)}</output>
            </div>
            <input
              className="slider" type="range" min={a.minValue} max={a.maxValue} step={fine ? 0.01 : 1} value={v}
              style={{ '--p': pctOf(v, a.minValue, a.maxValue) } as CSSProperties}
              aria-label={`${info.name} (${a.tag})`}
              onChange={(e) => setValues((prev) => ({ ...prev, [a.tag]: Number(e.target.value) }))}
            />
          </div>
        );
      })}
      <button type="button" className="btn btn-ghost btn-sm axis-reset" onClick={() => setValues(Object.fromEntries(axes.map((a) => [a.tag, a.defaultValue])))}>
        Reset axes
      </button>
      {previewFamily && (
        <p className="axis-preview" style={{ fontFamily: `'${previewFamily}', var(--font-ui)`, fontVariationSettings: settings }}>
          The quick brown fox jumps over the lazy dog
        </p>
      )}
    </>
  );
}

export function AnalysisSide({ stats, fontData, filePath, axes, axisValues, setAxisValues, previewFamily, features, rawMeta }: {
  stats: Stat[];
  fontData: FontData;
  filePath?: string;
  axes: VariableAxis[];
  axisValues: Record<string, number>;
  setAxisValues: Dispatch<SetStateAction<Record<string, number>>>;
  previewFamily: string | null;
  features: string[];
  rawMeta: RawMetaSection[];
}) {
  const info: [string, string, boolean][] = [
    ['Family', fontData.familyName, false],
    ['Style', fontData.styleName, false],
    ['UPM', String(fontData.unitsPerEm), true],
    ['Ascender', signedInt(fontData.ascender), true],
    ['Descender', signedInt(fontData.descender), true],
    ['Glyphs', String(fontData.glyphCount), true],
  ];
  if (filePath) info.push(['File', filePath, false]);

  return (
    <aside className="side" aria-label="Analysis details">
      <Section id="h-results" title="Results">
        {stats.length
          ? <dl className="kv">{stats.map((s) => <Kv key={s.label} label={s.label} value={s.value} num />)}</dl>
          : <p className="sec-empty">No data available</p>}
      </Section>
      <Section id="h-info" title="Font info">
        <dl className="kv">{info.map(([l, v, num]) => <Kv key={l} label={l} value={v} num={num} />)}</dl>
      </Section>
      {axes.length > 0 && (
        <Section id="h-axes" title="Variable axes" count={`${axes.length} ${axes.length === 1 ? 'axis' : 'axes'}`}>
          <AxisControls axes={axes} values={axisValues} setValues={setAxisValues} previewFamily={previewFamily} />
        </Section>
      )}
      {features.length > 0 && (
        <Section id="h-feat" title="OpenType features" count={`${features.length} ${features.length === 1 ? 'feature' : 'features'}`}>
          <ul className="feats">{features.map((t) => <li key={t} title={OTF_FEATURE_NAMES[t] ?? t}>{t}</li>)}</ul>
        </Section>
      )}
      {rawMeta.length > 0 && (
        <section className="side-sec">
          <details className="details">
            <summary className="sec-title">Raw metadata</summary>
            {rawMeta.map((sec) => (
              <div key={sec.title}>
                <h3 className="raw-title">{sec.title}</h3>
                <dl className="kv kv-raw">{sec.entries.map((e) => <Kv key={e.label} label={e.label} value={e.value} />)}</dl>
              </div>
            ))}
          </details>
        </section>
      )}
    </aside>
  );
}

function Kv({ label, value, num }: { label: string; value: string; num?: boolean }) {
  return <><dt>{label}</dt><dd className={num ? 'num-v' : undefined}>{value}</dd></>;
}
