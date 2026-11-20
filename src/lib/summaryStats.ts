// The "Results" values of each Analyze tab.
import type { AnalysisTab, ContrastResult, FullAnalysis } from '../types';

export interface Stat { label: string; value: string }

function contrastStats(c: ContrastResult | null, glyph: string): Stat[] {
  if (!c) return [];
  return [
    { label: `"${glyph}" contrast`, value: `${c.contrastRatio.toFixed(2)}:1` },
    { label: `"${glyph}" thickest`, value: `${c.maxWidth.toFixed(1)}u` },
    { label: `"${glyph}" thinnest`, value: `${c.minWidth.toFixed(1)}u` },
  ];
}

const STATS: Record<AnalysisTab, (a: FullAnalysis) => Stat[]> = {
  contrast: (a) => [...contrastStats(a.contrastLower, 'o'), ...contrastStats(a.contrastUpper, 'O')],
  xheight: ({ xHeight: x }) => (!x ? [] : [
    { label: 'x-height', value: `${x.xHeight}u` },
    { label: 'Cap height', value: `${x.capHeight}u` },
    { label: 'Ascender', value: `${x.ascender}u` },
    { label: 'Descender', value: `${x.descender}u` },
    { label: 'x / cap', value: x.xHeightToCapHeight.toFixed(3) },
    { label: 'x / em', value: x.xHeightToEm.toFixed(3) },
  ]),
  proportions: ({ proportions: p }) => (!p ? [] : [
    { label: 'Width', value: `${p.glyphWidth.toFixed(0)}u` },
    { label: 'Height', value: `${p.glyphHeight.toFixed(0)}u` },
    { label: 'W:H ratio', value: p.widthToHeightRatio.toFixed(3) },
    { label: 'Advance', value: `${p.advanceWidth}u` },
  ]),
  weight: ({ weight: w }) => (!w ? [] : [
    { label: 'Fill ratio', value: `${w.fillPercentage.toFixed(1)}%` },
    { label: 'Filled px', value: w.filledPixels.toLocaleString() },
    { label: 'Total px', value: w.totalPixels.toLocaleString() },
  ]),
  spacing: ({ spacing: s }) => (!s ? [] : [
    { label: 'String width', value: `${s.totalAdvanceWidth.toFixed(0)}u` },
    { label: 'M width', value: `${s.mAdvanceWidth.toFixed(0)}u` },
    { label: 'String / M', value: s.ratio.toFixed(2) },
    { label: 'Avg char', value: `${s.avgCharWidth.toFixed(0)}u` },
    { label: 'Characters', value: String(s.charCount) },
  ]),
  glyphs: () => [],
};

export function summaryStats(analysis: FullAnalysis | null, tab: AnalysisTab): Stat[] {
  return analysis ? STATS[tab](analysis) : [];
}
