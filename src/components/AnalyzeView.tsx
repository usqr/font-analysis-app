import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as opentype from 'opentype.js';
import type { FontData, FullAnalysis, AnalysisTab } from '../types';
import { FontUploader } from './FontUploader';
import { ContrastView } from './ContrastView';
import { XHeightView } from './XHeightView';
import { ProportionsView } from './ProportionsView';
import { WeightView } from './WeightView';
import { SpacingView } from './SpacingView';
import { GlyphsView } from './GlyphsView';
import { analyzeContrast } from '../analysis/contrast';
import { analyzeXHeight } from '../analysis/xHeight';
import { analyzeProportions } from '../analysis/proportions';
import { analyzeWeight } from '../analysis/weight';
import { analyzeSpacing } from '../analysis/spacing';
import { exportAnalysisJSON, exportCanvasAsAvif } from '../lib/exportUtils';
import { fetchFontData, fetchDatabase, toggleStarFamily, bulkSetCategory } from '../lib/api';
import { groupByWidth, widthQualifier, weightLabel, superFamilyName, familyKey } from '../lib/fontFamilies';
import { extractOTFFeatures, OTF_FEATURE_NAMES } from '../lib/otfFeatures';
import type { StoredFontMeta, FontCategory } from '../types';

const WIDTH_CLASS_NAMES: Record<number, string> = {
  1: 'Ultra-Condensed', 2: 'Extra-Condensed', 3: 'Condensed',
  4: 'Semi-Condensed', 5: 'Medium (Normal)',
  6: 'Semi-Expanded', 7: 'Expanded',
  8: 'Extra-Expanded', 9: 'Ultra-Expanded',
};

const FAMILY_CLASS_NAMES: Record<number, string> = {
  0: 'No Classification', 1: 'Oldstyle Serifs', 2: 'Transitional Serifs',
  3: 'Modern Serifs', 4: 'Clarendon Serifs', 5: 'Slab Serifs',
  6: 'Reserved', 7: 'Freeform Serifs', 8: 'Sans Serif',
  9: 'Ornamentals', 10: 'Scripts', 11: 'Reserved',
  12: 'Symbolic', 13: 'Reserved', 14: 'Reserved',
};

const MAC_STYLE_FLAGS: [number, string][] = [
  [0x01, 'Bold'], [0x02, 'Italic'], [0x04, 'Underline'],
  [0x08, 'Outline'], [0x10, 'Shadow'], [0x20, 'Condensed'], [0x40, 'Extended'],
];

interface RawMetaSection {
  title: string;
  entries: { label: string; value: string }[];
}

function extractRawMetadata(font: import('opentype.js').Font): RawMetaSection[] {
  const sections: RawMetaSection[] = [];
  const tables = font.tables as any;

  const nameEntries: { label: string; value: string }[] = [];
  const names = font.names as any;
  if (names.fontFamily?.en) nameEntries.push({ label: 'fontFamily', value: names.fontFamily.en });
  if (names.fontSubfamily?.en) nameEntries.push({ label: 'fontSubfamily', value: names.fontSubfamily.en });
  if (names.preferredFamily?.en) nameEntries.push({ label: 'preferredFamily', value: names.preferredFamily.en });
  if (names.preferredSubfamily?.en) nameEntries.push({ label: 'preferredSubfamily', value: names.preferredSubfamily.en });
  const typographicFamily = names.typographicFamily?.en;
  if (typographicFamily) nameEntries.push({ label: 'typographicFamily', value: typographicFamily });
  if (names.designer?.en) nameEntries.push({ label: 'Designer', value: names.designer.en });
  if (names.manufacturer?.en) nameEntries.push({ label: 'Manufacturer', value: names.manufacturer.en });
  if (names.version?.en) nameEntries.push({ label: 'Version', value: names.version.en });
  if (names.license?.en) nameEntries.push({ label: 'License', value: names.license.en.slice(0, 120) + (names.license.en.length > 120 ? '...' : '') });
  if (nameEntries.length > 0) sections.push({ title: 'name', entries: nameEntries });

  const os2 = tables.os2;
  if (os2) {
    const os2Entries: { label: string; value: string }[] = [];
    if (os2.usWeightClass != null) os2Entries.push({ label: 'usWeightClass', value: String(os2.usWeightClass) });
    if (os2.usWidthClass != null) os2Entries.push({ label: 'usWidthClass', value: `${os2.usWidthClass} — ${WIDTH_CLASS_NAMES[os2.usWidthClass] ?? 'Unknown'}` });
    if (os2.sFamilyClass != null) {
      const cls = (os2.sFamilyClass >> 8) & 0xFF;
      const sub = os2.sFamilyClass & 0xFF;
      os2Entries.push({ label: 'sFamilyClass', value: `${cls} / ${sub} — ${FAMILY_CLASS_NAMES[cls] ?? 'Unknown'}` });
    }
    if (os2.fsType != null) {
      const flags: string[] = [];
      if (os2.fsType === 0) flags.push('Installable');
      if (os2.fsType & 0x0002) flags.push('Restricted');
      if (os2.fsType & 0x0004) flags.push('Preview & Print');
      if (os2.fsType & 0x0008) flags.push('Editable');
      if (os2.fsType & 0x0100) flags.push('No Subsetting');
      if (os2.fsType & 0x0200) flags.push('Bitmap Only');
      os2Entries.push({ label: 'fsType', value: `0x${os2.fsType.toString(16).padStart(4, '0')} — ${flags.join(', ') || 'None'}` });
    }
    if (os2.panose) {
      const p = os2.panose;
      os2Entries.push({ label: 'panose', value: Array.isArray(p) ? p.join(' ') : String(p) });
    }
    if (os2.sTypoAscender != null) os2Entries.push({ label: 'sTypoAscender', value: String(os2.sTypoAscender) });
    if (os2.sTypoDescender != null) os2Entries.push({ label: 'sTypoDescender', value: String(os2.sTypoDescender) });
    if (os2.sTypoLineGap != null) os2Entries.push({ label: 'sTypoLineGap', value: String(os2.sTypoLineGap) });
    if (os2.sxHeight != null) os2Entries.push({ label: 'sxHeight', value: String(os2.sxHeight) });
    if (os2.sCapHeight != null) os2Entries.push({ label: 'sCapHeight', value: String(os2.sCapHeight) });
    if (os2Entries.length > 0) sections.push({ title: 'OS/2', entries: os2Entries });
  }

  const head = tables.head;
  if (head) {
    const headEntries: { label: string; value: string }[] = [];
    if (head.unitsPerEm != null) headEntries.push({ label: 'unitsPerEm', value: String(head.unitsPerEm) });
    if (head.created != null) headEntries.push({ label: 'created', value: new Date(head.created * 1000).toISOString().split('T')[0] });
    if (head.modified != null) headEntries.push({ label: 'modified', value: new Date(head.modified * 1000).toISOString().split('T')[0] });
    if (head.macStyle != null) {
      const flags = MAC_STYLE_FLAGS.filter(([bit]) => head.macStyle & bit).map(([, n]) => n);
      headEntries.push({ label: 'macStyle', value: flags.length > 0 ? flags.join(', ') : 'Regular' });
    }
    if (head.lowestRecPPEM != null) headEntries.push({ label: 'lowestRecPPEM', value: String(head.lowestRecPPEM) });
    if (headEntries.length > 0) sections.push({ title: 'head', entries: headEntries });
  }

  const post = tables.post;
  if (post) {
    const postEntries: { label: string; value: string }[] = [];
    if (post.italicAngle != null) postEntries.push({ label: 'italicAngle', value: String(post.italicAngle) });
    if (post.isFixedPitch != null) postEntries.push({ label: 'isFixedPitch', value: post.isFixedPitch ? 'Yes' : 'No' });
    if (post.underlinePosition != null) postEntries.push({ label: 'underlinePosition', value: String(post.underlinePosition) });
    if (post.underlineThickness != null) postEntries.push({ label: 'underlineThickness', value: String(post.underlineThickness) });
    if (postEntries.length > 0) sections.push({ title: 'post', entries: postEntries });
  }

  return sections;
}

const CATEGORIES: { id: FontCategory; label: string }[] = [
  { id: 'serif', label: 'Serif' },
  { id: 'sans-serif', label: 'Sans-Serif' },
  { id: 'monospace', label: 'Monospace' },
  { id: 'display', label: 'Display' },
  { id: 'script', label: 'Script' },
];

const CAT_COLORS: Record<string, string> = {
  'serif': 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  'sans-serif': 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  'monospace': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  'display': 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  'script': 'bg-amber-500/15 text-amber-400 border-amber-500/30',
};

const TABS: { id: AnalysisTab; label: string; shortLabel: string }[] = [
  { id: 'contrast', label: 'Contrast', shortLabel: 'Contrast' },
  { id: 'xheight', label: 'X-Height', shortLabel: 'X-Ht' },
  { id: 'proportions', label: 'Proportions', shortLabel: 'Props' },
  { id: 'weight', label: 'Weight', shortLabel: 'Weight' },
  { id: 'spacing', label: 'Spacing', shortLabel: 'Space' },
  { id: 'glyphs', label: 'Glyphs', shortLabel: 'Glyph' },
];

export function AnalyzeView() {
  const { fontId } = useParams<{ fontId: string }>();
  const navigate = useNavigate();
  const [fontData, setFontData] = useState<FontData | null>(null);
  const [analysis, setAnalysis] = useState<FullAnalysis | null>(null);
  const [activeTab, setActiveTab] = useState<AnalysisTab>('contrast');
  const [analyzing, setAnalyzing] = useState(false);
  const [loading, setLoading] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [familyMembers, setFamilyMembers] = useState<StoredFontMeta[]>([]);
  const [currentMeta, setCurrentMeta] = useState<StoredFontMeta | null>(null);
  const [otfFeatures, setOtfFeatures] = useState<string[]>([]);
  const [rawMeta, setRawMeta] = useState<RawMetaSection[]>([]);
  const [showRawMeta, setShowRawMeta] = useState(false);
  const [familyStarred, setFamilyStarred] = useState(false);
  const [familyStarKey, setFamilyStarKey] = useState('');
  const [showCatPopover, setShowCatPopover] = useState(false);
  const [effectiveCategory, setEffectiveCategory] = useState<FontCategory | null>(null);
  const catPopoverRef = useRef<HTMLDivElement>(null);

  const analysisCache = useRef<Partial<FullAnalysis>>({});
  const fontDataRef = useRef<FontData | null>(null);

  const computeTabAnalysis = useCallback((tab: AnalysisTab, data: FontData): Partial<FullAnalysis> => {
    switch (tab) {
      case 'contrast':
        return {
          contrastLower: analyzeContrast(data.font, 'o', 120),
          contrastUpper: analyzeContrast(data.font, 'O', 120),
        };
      case 'xheight':
        return { xHeight: analyzeXHeight(data.font) };
      case 'proportions':
        return { proportions: analyzeProportions(data.font) };
      case 'weight':
        return { weight: analyzeWeight(data.font) };
      case 'spacing':
        return { spacing: analyzeSpacing(data.font) };
      default:
        return {};
    }
  }, []);

  const ensureTabAnalysis = useCallback((tab: AnalysisTab, data: FontData) => {
    const cache = analysisCache.current;
    const needed = tab === 'contrast'
      ? cache.contrastLower === undefined
      : tab === 'xheight' ? cache.xHeight === undefined
      : tab === 'proportions' ? cache.proportions === undefined
      : tab === 'weight' ? cache.weight === undefined
      : tab === 'spacing' ? cache.spacing === undefined
      : false;

    if (!needed) return;

    setAnalyzing(true);
    setTimeout(() => {
      const partial = computeTabAnalysis(tab, data);
      Object.assign(cache, partial);
      const merged: FullAnalysis = {
        contrastLower: cache.contrastLower ?? null,
        contrastUpper: cache.contrastUpper ?? null,
        xHeight: cache.xHeight ?? null,
        proportions: cache.proportions ?? null,
        weight: cache.weight ?? null,
        spacing: cache.spacing ?? null,
      };
      (window as any).__FA_ANALYSIS__ = merged;
      (window as any).__FA_FONT_DATA__ = {
        unitsPerEm: data.font.unitsPerEm,
        oBBox: data.font.charToGlyph('o')?.getBoundingBox(),
        OBBox: data.font.charToGlyph('O')?.getBoundingBox(),
      };
      setAnalysis(merged);
      setAnalyzing(false);
    }, 0);
  }, [computeTabAnalysis]);

  const runAnalysis = useCallback((data: FontData) => {
    analysisCache.current = {};
    fontDataRef.current = data;
    setFontData(data);
    setOtfFeatures(extractOTFFeatures(data.font));
    setRawMeta(extractRawMetadata(data.font));
    ensureTabAnalysis('contrast', data);
  }, [ensureTabAnalysis]);

  useEffect(() => {
    if (!fontId) return;
    let cancelled = false;
    setLoading(true);

    fetchFontData(fontId)
      .then((data) => {
        if (cancelled) return;
        const binary = Uint8Array.from(atob(data.base64Data), (c) => c.charCodeAt(0));
        const font = opentype.parse(binary.buffer as ArrayBuffer);
        const fd: FontData = {
          font,
          fileName: `${data.familyName}-${data.subfamilyName}.${data.format}`,
          familyName: data.familyName,
          styleName: data.subfamilyName,
          unitsPerEm: font.unitsPerEm,
          ascender: font.ascender,
          descender: font.descender,
          glyphCount: font.glyphs.length,
        };
        runAnalysis(fd);
      })
      .catch((e) => {
        console.error('Failed to load font from library:', e);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [fontId, runAnalysis]);

  useEffect(() => {
    if (!fontId) { setFamilyMembers([]); setCurrentMeta(null); return; }
    let cancelled = false;
    fetchDatabase().then((db) => {
      if (cancelled) return;
      const current = db.fonts.find((f) => f.id === fontId);
      if (!current) return;
      setCurrentMeta(current);
      setEffectiveCategory(current.categoryOverride ?? current.category ?? null);
      const baseKey = superFamilyName(current);
      const currentSource = current.source ?? 'local';
      const members = db.fonts.filter((f) => superFamilyName(f) === baseKey && (f.source ?? 'local') === currentSource);
      setFamilyMembers(members);
      const fKey = familyKey(currentSource, baseKey);
      setFamilyStarKey(fKey);
      setFamilyStarred((db.starredFamilies ?? []).includes(fKey));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [fontId]);

  useEffect(() => {
    const data = fontDataRef.current;
    if (data && activeTab !== 'glyphs') {
      ensureTabAnalysis(activeTab, data);
    }
  }, [activeTab, ensureTabAnalysis]);

  const familyNav = useMemo(() => {
    if (familyMembers.length <= 1 || !currentMeta) return null;
    const widthGroups = groupByWidth(familyMembers);
    const widthKeys = Array.from(widthGroups.keys());
    const currentWidth = widthQualifier(currentMeta) || 'Default';
    const currentGroup = widthGroups.get(currentWidth) ?? { normal: [], italic: [] };
    const isItalic = currentMeta.style === 'italic' || currentMeta.style === 'oblique';
    const hasItalics = currentGroup.italic.length > 0;
    const hasNormals = currentGroup.normal.length > 0;
    const weightList = isItalic ? currentGroup.italic : currentGroup.normal;
    return { widthGroups, widthKeys, currentWidth, currentGroup, isItalic, hasItalics, hasNormals, weightList };
  }, [familyMembers, currentMeta]);

  const handleFamilyNav = useCallback((newId: string) => {
    navigate(`/analyze/${newId}`);
  }, [navigate]);

  const handleFontLoaded = useCallback(
    (data: FontData) => {
      runAnalysis(data);
    },
    [runAnalysis],
  );

  const handleReset = useCallback(() => {
    setFontData(null);
    setAnalysis(null);
    setActiveTab('contrast');
    if (fontId) navigate('/analyze');
  }, [fontId, navigate]);

  const handleExportJSON = useCallback(() => {
    if (fontData && analysis) {
      exportAnalysisJSON(fontData, analysis);
    }
  }, [fontData, analysis]);

  const handleExportImage = useCallback(async () => {
    const canvas = canvasRef.current;
    if (canvas && fontData) {
      await exportCanvasAsAvif(canvas, fontData.familyName, activeTab);
    }
  }, [fontData, activeTab]);

  const handleCategoryOverride = useCallback(async (cat: FontCategory) => {
    const ids = familyMembers.map((f) => f.id);
    if (ids.length === 0) return;
    setEffectiveCategory(cat);
    setShowCatPopover(false);
    try {
      await bulkSetCategory(ids, cat);
    } catch {
      setEffectiveCategory(currentMeta?.categoryOverride ?? currentMeta?.category ?? null);
    }
  }, [familyMembers, currentMeta]);

  useEffect(() => {
    if (!showCatPopover) return;
    const handleClick = (e: MouseEvent) => {
      if (catPopoverRef.current && !catPopoverRef.current.contains(e.target as Node)) {
        setShowCatPopover(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showCatPopover]);

  const summaryStats = useMemo<{ label: string; value: string }[]>(() => {
    if (!analysis) return [];
    switch (activeTab) {
      case 'contrast': {
        const items: { label: string; value: string }[] = [];
        if (analysis.contrastLower) {
          items.push(
            { label: '"o" contrast', value: `${analysis.contrastLower.contrastRatio.toFixed(2)}:1` },
            { label: '"o" thickest', value: `${analysis.contrastLower.maxWidth.toFixed(1)}u` },
            { label: '"o" thinnest', value: `${analysis.contrastLower.minWidth.toFixed(1)}u` },
          );
        }
        if (analysis.contrastUpper) {
          items.push(
            { label: '"O" contrast', value: `${analysis.contrastUpper.contrastRatio.toFixed(2)}:1` },
            { label: '"O" thickest', value: `${analysis.contrastUpper.maxWidth.toFixed(1)}u` },
            { label: '"O" thinnest', value: `${analysis.contrastUpper.minWidth.toFixed(1)}u` },
          );
        }
        return items;
      }
      case 'xheight':
        if (!analysis.xHeight) return [];
        return [
          { label: 'x-height', value: `${analysis.xHeight.xHeight}u` },
          { label: 'Cap height', value: `${analysis.xHeight.capHeight}u` },
          { label: 'Ascender', value: `${analysis.xHeight.ascender}u` },
          { label: 'Descender', value: `${analysis.xHeight.descender}u` },
          { label: 'x / cap', value: analysis.xHeight.xHeightToCapHeight.toFixed(3) },
          { label: 'x / em', value: analysis.xHeight.xHeightToEm.toFixed(3) },
        ];
      case 'proportions':
        if (!analysis.proportions) return [];
        return [
          { label: 'Width', value: `${analysis.proportions.glyphWidth.toFixed(0)}u` },
          { label: 'Height', value: `${analysis.proportions.glyphHeight.toFixed(0)}u` },
          { label: 'W:H ratio', value: analysis.proportions.widthToHeightRatio.toFixed(3) },
          { label: 'Advance', value: `${analysis.proportions.advanceWidth}u` },
        ];
      case 'weight':
        if (!analysis.weight) return [];
        return [
          { label: 'Fill ratio', value: `${analysis.weight.fillPercentage.toFixed(1)}%` },
          { label: 'Filled px', value: analysis.weight.filledPixels.toLocaleString() },
          { label: 'Total px', value: analysis.weight.totalPixels.toLocaleString() },
        ];
      case 'spacing':
        if (!analysis.spacing) return [];
        return [
          { label: 'String width', value: `${analysis.spacing.totalAdvanceWidth.toFixed(0)}u` },
          { label: 'M width', value: `${analysis.spacing.mAdvanceWidth.toFixed(0)}u` },
          { label: 'String / M', value: analysis.spacing.ratio.toFixed(2) },
          { label: 'Avg char', value: `${analysis.spacing.avgCharWidth.toFixed(0)}u` },
          { label: 'Characters', value: String(analysis.spacing.charCount) },
        ];
      default:
        return [];
    }
  }, [analysis, activeTab]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-600 border-t-blue-400" />
          <span className="text-neutral-400">Loading font from library...</span>
        </div>
      </div>
    );
  }

  if (!fontData) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="w-full max-w-2xl">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Analyze a Font
            </h1>
            <p className="mt-2 text-neutral-400">
              Upload a font file or select one from the library
            </p>
          </div>
          <FontUploader onFontLoaded={handleFontLoaded} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-neutral-800 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={handleReset}
              className="rounded-md px-3 py-1.5 text-xs text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
            >
              &larr; Change font
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold text-white">
                  {fontData.familyName}
                </h1>
                {currentMeta && (
                  <>
                    <button
                      onClick={async () => {
                        setFamilyStarred((v) => !v);
                        try { await toggleStarFamily(familyStarKey); } catch {
                          setFamilyStarred((v) => !v);
                        }
                      }}
                      className="text-lg leading-none transition-colors"
                      title={familyStarred ? 'Unstar family' : 'Star family'}
                    >
                      {familyStarred
                        ? <span className="text-amber-400">&#9733;</span>
                        : <span className="text-neutral-600 hover:text-amber-400/60">&#9734;</span>}
                    </button>
                    <span
                      className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                        currentMeta.source === 'google'
                          ? 'bg-blue-500/15 text-blue-400'
                          : 'bg-neutral-700/50 text-neutral-500'
                      }`}
                      title={currentMeta.source === 'google' ? 'Google Fonts' : 'Local font'}
                    >
                      {currentMeta.source === 'google' ? 'G' : 'L'}
                    </span>
                    {effectiveCategory && (
                      <div className="relative">
                        <button
                          onClick={() => setShowCatPopover((v) => !v)}
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${CAT_COLORS[effectiveCategory] ?? 'bg-neutral-700/30 text-neutral-400 border-neutral-600'}`}
                          title={`Category: ${effectiveCategory}`}
                          data-testid="analyze-category-badge"
                        >
                          {effectiveCategory}
                        </button>
                        {showCatPopover && (
                          <div ref={catPopoverRef} className="absolute left-0 top-full z-50 mt-1 rounded-lg border border-neutral-700 bg-neutral-900 py-1 shadow-xl">
                            <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Set Category</div>
                            {CATEGORIES.map((cat) => (
                              <button
                                key={cat.id}
                                onClick={() => handleCategoryOverride(cat.id)}
                                className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-neutral-800 ${
                                  effectiveCategory === cat.id ? 'text-white' : 'text-neutral-400'
                                }`}
                              >
                                <span className={`inline-block h-2 w-2 rounded-full ${CAT_COLORS[cat.id]?.split(' ')[0] ?? ''}`} />
                                {cat.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
              <p className="text-xs text-neutral-400">
                {fontData.styleName} &middot; {fontData.glyphCount} glyphs &middot;{' '}
                {fontData.unitsPerEm} UPM
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleExportJSON}
              disabled={!analysis}
              className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:bg-neutral-800 disabled:opacity-40"
            >
              Export JSON
            </button>
            <button
              onClick={handleExportImage}
              disabled={!analysis}
              className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:bg-neutral-800 disabled:opacity-40"
            >
              Export Image
            </button>
          </div>
        </div>
        {familyNav && (
          <div className="mt-2 flex items-center gap-3" data-testid="family-nav">
            {familyNav.widthKeys.length > 1 && (
              <select
                value={familyNav.currentWidth}
                onChange={(e) => {
                  const wk = e.target.value;
                  const grp = familyNav.widthGroups.get(wk);
                  if (!grp) return;
                  const list = familyNav.isItalic && grp.italic.length > 0 ? grp.italic : grp.normal;
                  const match = list.find((f) => f.weight === currentMeta!.weight) ?? list[0];
                  if (match) handleFamilyNav(match.id);
                }}
                className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200 outline-none focus:border-blue-500"
                data-testid="family-width-select"
              >
                {familyNav.widthKeys.map((wk) => (
                  <option key={wk} value={wk}>{wk}</option>
                ))}
              </select>
            )}
            <select
              value={fontId}
              onChange={(e) => handleFamilyNav(e.target.value)}
              className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200 outline-none focus:border-blue-500"
              data-testid="family-weight-select"
            >
              {familyNav.weightList.map((f) => (
                <option key={f.id} value={f.id}>{weightLabel(f.weight)}</option>
              ))}
            </select>
            {familyNav.hasNormals && familyNav.hasItalics && (
              <div className="flex rounded border border-neutral-700" data-testid="family-style-toggle">
                <button
                  onClick={() => {
                    const normals = familyNav.currentGroup.normal;
                    const match = normals.find((f) => f.weight === currentMeta!.weight) ?? normals[0];
                    if (match) handleFamilyNav(match.id);
                  }}
                  className={`px-2.5 py-1 text-xs transition-colors ${
                    !familyNav.isItalic ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  Upright
                </button>
                <button
                  onClick={() => {
                    const italics = familyNav.currentGroup.italic;
                    const match = italics.find((f) => f.weight === currentMeta!.weight) ?? italics[0];
                    if (match) handleFamilyNav(match.id);
                  }}
                  className={`px-2.5 py-1 text-xs transition-colors ${
                    familyNav.isItalic ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  Italic
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      <nav className="flex border-b border-neutral-800" data-testid="analysis-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'border-b-2 border-blue-500 text-white'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
            data-testid={`tab-${tab.id}`}
          >
            <span className="hidden sm:inline">{tab.label}</span>
            <span className="sm:hidden">{tab.shortLabel}</span>
          </button>
        ))}
      </nav>

      <div className="flex flex-1 overflow-hidden">
        <div className={`flex-1 ${activeTab === 'glyphs' ? '' : 'p-4'}`}>
          {analyzing ? (
            <div className="flex h-full items-center justify-center">
              <div className="flex items-center gap-3">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-600 border-t-blue-400" />
                <span className="text-neutral-400">Analyzing font...</span>
              </div>
            </div>
          ) : (
            <div className="h-full">
              {activeTab === 'contrast' && (
                <ContrastView
                  fontData={fontData}
                  contrastLower={analysis?.contrastLower ?? null}
                  contrastUpper={analysis?.contrastUpper ?? null}
                  canvasRef={canvasRef}
                />
              )}
              {activeTab === 'xheight' && (
                <XHeightView
                  fontData={fontData}
                  result={analysis?.xHeight ?? null}
                  canvasRef={canvasRef}
                />
              )}
              {activeTab === 'proportions' && (
                <ProportionsView
                  fontData={fontData}
                  result={analysis?.proportions ?? null}
                  canvasRef={canvasRef}
                />
              )}
              {activeTab === 'weight' && (
                <WeightView
                  fontData={fontData}
                  result={analysis?.weight ?? null}
                  canvasRef={canvasRef}
                />
              )}
              {activeTab === 'spacing' && (
                <SpacingView
                  fontData={fontData}
                  result={analysis?.spacing ?? null}
                  canvasRef={canvasRef}
                />
              )}
              {activeTab === 'glyphs' && (
                <GlyphsView fontData={fontData} fontId={fontId!} />
              )}
            </div>
          )}
        </div>

        <aside className={`w-56 overflow-y-auto border-l border-neutral-800 p-4 ${activeTab === 'glyphs' ? 'hidden' : ''}`}>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Results
          </h2>
          {summaryStats.length > 0 ? (
            <dl className="space-y-3">
              {summaryStats.map((stat) => (
                <div key={stat.label}>
                  <dt className="text-xs text-neutral-400">{stat.label}</dt>
                  <dd className="text-sm font-medium text-neutral-200">
                    {stat.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-xs text-neutral-500">No data available</p>
          )}

          <div className="mt-6 border-t border-neutral-800 pt-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
              Font Info
            </h3>
            <dl className="space-y-2">
              <div>
                <dt className="text-xs text-neutral-400">Family</dt>
                <dd className="text-sm text-neutral-300">{fontData.familyName}</dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-400">Style</dt>
                <dd className="text-sm text-neutral-300">{fontData.styleName}</dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-400">UPM</dt>
                <dd className="text-sm text-neutral-300">{fontData.unitsPerEm}</dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-400">Ascender</dt>
                <dd className="text-sm text-neutral-300">{fontData.ascender}</dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-400">Descender</dt>
                <dd className="text-sm text-neutral-300">{fontData.descender}</dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-400">Glyphs</dt>
                <dd className="text-sm text-neutral-300">{fontData.glyphCount}</dd>
              </div>
            </dl>
          </div>

          {otfFeatures.length > 0 && (
            <div className="mt-6 border-t border-neutral-800 pt-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                OpenType Features
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {otfFeatures.map((tag) => (
                  <span
                    key={tag}
                    className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-300"
                    title={OTF_FEATURE_NAMES[tag] ?? tag}
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-xs text-neutral-600">
                {otfFeatures.length} feature{otfFeatures.length !== 1 ? 's' : ''}
              </p>
            </div>
          )}

          {rawMeta.length > 0 && (
            <div className="mt-6 border-t border-neutral-800 pt-4">
              <button
                onClick={() => setShowRawMeta((v) => !v)}
                className="mb-2 flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wider text-neutral-400 hover:text-neutral-300"
              >
                <span>Raw Metadata</span>
                <span className="text-neutral-600">{showRawMeta ? '▾' : '▸'}</span>
              </button>
              {showRawMeta && rawMeta.map((section) => (
                <div key={section.title} className="mb-3">
                  <h4 className="mb-1.5 text-xs font-medium text-neutral-500">{section.title}</h4>
                  <dl className="space-y-1">
                    {section.entries.map((entry) => (
                      <div key={entry.label} className="flex gap-2">
                        <dt className="shrink-0 text-xs text-neutral-600">{entry.label}</dt>
                        <dd className="min-w-0 break-all text-xs text-neutral-400">{entry.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
