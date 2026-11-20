import { useId, useMemo, type CSSProperties } from 'react';
import { binValues, histogramPath } from '../lib/histogram';
import type { Range } from '../lib/libraryFilters';

const W = 240;
const H = 44;
const BINS = 64;

/**
 * Histogram of one metric over the library, with a two-thumb range input.
 * The part of the histogram inside the range is darker.
 */
export function HistogramFilter({ label, values, extent, range, onChange }: {
  label: string;
  values: number[];
  extent: Range;
  range: Range;
  onChange: (range: Range) => void;
}) {
  // React ids contain characters that a CSS `url(#…)` reference does not accept.
  const clipId = `hist${useId().replace(/[^\w-]/g, '')}`;
  const [min, max] = extent;
  const d = useMemo(() => histogramPath(binValues(values, min, max, BINS), W, H), [values, min, max]);
  const span = max - min || 1;
  const a = (range[0] - min) / span;
  const b = (range[1] - min) / span;
  const step = span / 100;

  const set = (which: 0 | 1, v: number) => {
    const next: Range = which === 0 ? [Math.min(v, range[1]), range[1]] : [range[0], Math.max(v, range[0])];
    onChange(next);
  };

  return (
    <div className="hist">
      <div className="hist-head">
        <span className="hist-label">{label}</span>
        <output className="hist-val mono">{range[0].toFixed(2)} – {range[1].toFixed(2)}</output>
      </div>
      <svg className="hist-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <clipPath id={clipId}><rect y="0" height={H} x={a * W} width={Math.max(0, (b - a) * W)} /></clipPath>
        </defs>
        <path className="hist-bg" d={d} />
        <path className="hist-fg" d={d} clipPath={`url(#${clipId})`} />
      </svg>
      <div className="range2" style={{ '--lo': a * 100, '--hi': b * 100 } as CSSProperties}>
        <div className="range2-track"><div className="range2-fill" /></div>
        <input
          type="range" min={min} max={max} step={step} value={range[0]}
          onChange={(e) => set(0, Number(e.target.value))}
          style={{ zIndex: a > 0.5 ? 3 : 1 }}
          aria-label={`${label} minimum`}
        />
        <input
          type="range" min={min} max={max} step={step} value={range[1]}
          onChange={(e) => set(1, Number(e.target.value))}
          aria-label={`${label} maximum`}
        />
      </div>
      <div className="hist-scale mono" aria-hidden="true"><span>{min.toFixed(2)}</span><span>{max.toFixed(2)}</span></div>
    </div>
  );
}
