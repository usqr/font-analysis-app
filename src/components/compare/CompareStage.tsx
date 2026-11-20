import { fontScales, spreadLabels } from '../../lib/compareLayout';
import type { ComparedFont } from './types';

const GUT = 120;      // left gutter for the guide labels
const PAD = 28;       // vertical padding inside the stage
const LABEL_GAP = 14;
const GUIDES = ['asc', 'cap', 'xh', 'desc'] as const;
const GUIDE_NAMES: [(typeof GUIDES)[number] | 'base', string][] = [['asc', 'Ascender'], ['cap', 'Cap height'], ['xh', 'x-height'], ['base', 'Baseline'], ['desc', 'Descender']];

/** Overlay of the sample text in each visible font, with the metric lines of each font. */
export function CompareStage({ fonts, text, size, normalize, width }: {
  fonts: ComparedFont[];
  text: string;
  size: number;
  normalize: boolean;
  /** Width of the canvas area, in pixels. */
  width: number;
}) {
  const desc = `“${text}” at ${size}px in ${fonts.map((f) => f.family).join(', ') || 'no fonts'}`;
  if (!fonts.length) return <svg className="stage" width={1} height={1} role="img" aria-label={desc} />;

  const ks = fontScales(fonts.map((f) => ({ upm: f.upm, xHeight: f.xh })), size, normalize);
  const top = Math.max(...fonts.map((f, i) => f.asc * ks[i]));
  const bottom = Math.max(...fonts.map((f, i) => -f.desc * ks[i]));
  const base = Math.round(PAD + top);
  const H = Math.ceil(base + bottom + PAD);
  // opentype.js measures the default instance. A heavier weight is wider, so keep a margin.
  const textW = Math.max(...fonts.map((f, i) => f.font.getAdvanceWidth(text, f.upm * ks[i]) * 1.15));
  const W = Math.ceil(Math.max(width - 40, GUT + 16 + textW + 24));
  const ref = fonts[0];
  const labels = spreadLabels(GUIDE_NAMES.map(([key, name]) => ({ name, y: key === 'base' ? base : base - ref[key] * ks[0] })), LABEL_GAP);

  return (
    <svg className="stage" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={desc}>
      {fonts.map((f, i) => GUIDES.map((key) => {
        const y = Math.round(base - f[key] * ks[i]) + 0.5;
        return (
          <g key={`${f.key}-${key}`} style={{ stroke: f.color }}>
            <line x1={GUT} x2={W} y1={y} y2={y} strokeOpacity={0.55} strokeDasharray="4 4" />
            <line x1={GUT - 12} x2={GUT - 2} y1={y} y2={y} strokeWidth={2} />
          </g>
        );
      }))}
      <line x1={GUT - 12} x2={W} y1={base + 0.5} y2={base + 0.5} style={{ stroke: 'var(--text-muted)' }} strokeOpacity={0.7} />
      {labels.map((l) => <text key={l.name} className="g-label" x={0} y={l.ly} dominantBaseline="middle">{l.name}</text>)}
      {fonts.map((f, i) => (
        <text
          key={f.key} x={GUT + 16} y={base} fillOpacity={0.72}
          style={{ fill: f.color, fontFamily: `'${f.css}'`, fontSize: `${(f.upm * ks[i]).toFixed(2)}px`, fontVariationSettings: f.variation }}
        >
          {text}
        </text>
      ))}
    </svg>
  );
}
