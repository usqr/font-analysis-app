import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Font } from 'opentype.js';
import type { AnalysisTab, FontData, FullAnalysis } from '../../types';
import { measureContrast, measureWeight, measureXHeight } from '../../lib/glyphMeasures';
import { analyzeProportions } from '../../analysis/proportions';
import { analyzeSpacing } from '../../analysis/spacing';
import { extractOTFFeatures } from '../../lib/otfFeatures';
import { extractRawMetadata } from '../../lib/rawMetadata';

type Cache = Partial<FullAnalysis>;

/** For each tab: does the cache have its results, and how to compute them. The glyph tab has no analysis. */
const TAB_ANALYSIS: Partial<Record<AnalysisTab, { done: (c: Cache) => boolean; run: (font: Font) => Cache }>> = {
  contrast: {
    done: (c) => c.contrastLower !== undefined,
    run: (f) => ({ contrastLower: measureContrast(f, 'o'), contrastUpper: measureContrast(f, 'O') }),
  },
  xheight: { done: (c) => c.xHeight !== undefined, run: (f) => ({ xHeight: measureXHeight(f) }) },
  proportions: { done: (c) => c.proportions !== undefined, run: (f) => ({ proportions: analyzeProportions(f) }) },
  weight: { done: (c) => c.weight !== undefined, run: (f) => ({ weight: measureWeight(f) }) },
  spacing: { done: (c) => c.spacing !== undefined, run: (f) => ({ spacing: analyzeSpacing(f) }) },
};

const toFull = (c: Cache): FullAnalysis => ({
  contrastLower: c.contrastLower ?? null,
  contrastUpper: c.contrastUpper ?? null,
  xHeight: c.xHeight ?? null,
  proportions: c.proportions ?? null,
  weight: c.weight ?? null,
  spacing: c.spacing ?? null,
});

/** The e2e diagnosis specs read these values. */
function exposeForTests(analysis: FullAnalysis, font: Font) {
  const w = window as unknown as Record<string, unknown>;
  w.__FA_ANALYSIS__ = analysis;
  w.__FA_FONT_DATA__ = {
    unitsPerEm: font.unitsPerEm,
    oBBox: font.charToGlyph('o')?.getBoundingBox(),
    OBBox: font.charToGlyph('O')?.getBoundingBox(),
  };
}

/**
 * The loaded font and its analysis. Each tab computes its analysis the first
 * time that it shows, and the results stay until a different font loads.
 */
export function useFontAnalysis(activeTab: AnalysisTab) {
  const [fontData, setFontData] = useState<FontData | null>(null);
  const [analysis, setAnalysis] = useState<FullAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const cache = useRef<Cache>({});

  useEffect(() => {
    const job = TAB_ANALYSIS[activeTab];
    if (!fontData || !job || job.done(cache.current)) return;
    setAnalyzing(true);
    // The timeout lets the spinner show before the slow computation starts.
    const timer = setTimeout(() => {
      Object.assign(cache.current, job.run(fontData.font));
      const merged = toFull(cache.current);
      exposeForTests(merged, fontData.font);
      setAnalysis(merged);
      setAnalyzing(false);
    }, 0);
    return () => {
      clearTimeout(timer);
      setAnalyzing(false);
    };
  }, [activeTab, fontData]);

  /** Shows `data`. A stored analysis from the library replaces the computation. */
  const load = useCallback((data: FontData, stored?: FullAnalysis) => {
    cache.current = stored ? { ...stored } : {};
    setFontData(data);
    setAnalysis(stored ?? null);
    if (stored) exposeForTests(stored, data.font);
  }, []);

  const reset = useCallback(() => {
    cache.current = {};
    setFontData(null);
    setAnalysis(null);
  }, []);

  const features = useMemo(() => (fontData ? extractOTFFeatures(fontData.font) : []), [fontData]);
  const rawMeta = useMemo(() => (fontData ? extractRawMetadata(fontData.font) : []), [fontData]);

  return { fontData, analysis, analyzing, features, rawMeta, load, reset };
}
