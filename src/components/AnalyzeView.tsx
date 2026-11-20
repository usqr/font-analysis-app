import { useState, useCallback, useRef, useMemo, useEffect, type CSSProperties, type RefObject } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import * as opentype from 'opentype.js';
import type { FontData, FullAnalysis, AnalysisTab, StoredFontMeta, FontCategory, VariableAxis } from '../types';
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
import { superFamilyName, familyKey } from '../lib/fontFamilies';
import { extractOTFFeatures } from '../lib/otfFeatures';
import { useFontFace } from '../lib/useFontFace';
import { IS_STATIC } from '../lib/env';
import { CAT_COLOR, CAT_LABELS } from '../lib/libraryFilters';
import { AnalysisSide, type RawMetaSection, type Stat } from './analyze/AnalysisSide';
import { FamilyNav } from './analyze/FamilyNav';
import { LocalFontActions } from './analyze/LocalFontActions';
import { SubTabs, type TabDef } from './analyze/SubTabs';
import { CategoryMenu } from './library/LibraryMenus';
import { Icon } from './ui/Icon';

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

const TABS: TabDef[] = [
  { id: 'contrast', label: 'Contrast' },
  { id: 'xheight', label: 'X-Height' },
  { id: 'proportions', label: 'Proportions' },
  { id: 'weight', label: 'Weight' },
  { id: 'spacing', label: 'Spacing' },
  { id: 'glyphs', label: 'Glyphs' },
];

const LAST_FONT_KEY = 'fa:lastAnalyzedFont';

function readLastFont(): string | null {
  try {
    return localStorage.getItem(LAST_FONT_KEY);
  } catch {
    return null;
  }
}

function writeLastFont(id: string | null) {
  try {
    if (id) localStorage.setItem(LAST_FONT_KEY, id);
    else localStorage.removeItem(LAST_FONT_KEY);
  } catch {
    // Storage can be blocked (private mode). The tab then opens empty, as before.
  }
}

export function AnalyzeView() {
  const { fontId } = useParams<{ fontId: string }>();
  const navigate = useNavigate();

  // Remember the last font, so that the Analyze tab opens it again.
  useEffect(() => {
    if (fontId) { writeLastFont(fontId); return; }
    const last = readLastFont();
    if (last) navigate(`/analyze/${last}`, { replace: true });
  }, [fontId, navigate]);
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
  const [familyStarred, setFamilyStarred] = useState(false);
  const [familyStarKey, setFamilyStarKey] = useState('');
  const [effectiveCategory, setEffectiveCategory] = useState<FontCategory | null>(null);
  const [catAnchor, setCatAnchor] = useState<HTMLElement | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [variableAxes, setVariableAxes] = useState<VariableAxis[]>([]);
  const [axisValues, setAxisValues] = useState<Record<string, number>>({});
  const { fontFamily: previewFontFamily } = useFontFace(fontId ?? null);

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
    if (!fontId) { setFamilyMembers([]); setCurrentMeta(null); return; }
    let cancelled = false;
    setLoading(true);

    Promise.all([fetchFontData(fontId), fetchDatabase()])
      .then(([data, db]) => {
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

        const fvarTable = (font.tables as any).fvar;
        const axes: VariableAxis[] = fvarTable?.axes?.map((a: any) => ({
          tag: a.tag as string,
          minValue: a.minValue as number,
          defaultValue: a.defaultValue as number,
          maxValue: a.maxValue as number,
          name: typeof a.name === 'object' ? (a.name?.en as string | undefined) : (a.name as string | undefined),
        })) ?? [];
        setVariableAxes(axes);
        setAxisValues(Object.fromEntries(axes.map((a) => [a.tag, a.defaultValue])));

        const current = db.fonts.find((f) => f.id === fontId);
        if (current) {
          setCurrentMeta(current);
          setEffectiveCategory(current.categoryOverride ?? current.category ?? null);
          const baseKey = superFamilyName(current);
          const members = db.fonts.filter((f) => superFamilyName(f) === baseKey);
          setFamilyMembers(members);
          const fKey = familyKey(baseKey);
          setFamilyStarKey(fKey);
          setFamilyStarred((db.starredFamilies ?? []).includes(fKey));
        }

        if (current?.analysis) {
          fontDataRef.current = fd;
          setFontData(fd);
          setOtfFeatures(extractOTFFeatures(fd.font));
          setRawMeta(extractRawMetadata(fd.font));
          const a = current.analysis;
          analysisCache.current = { ...a };
          setAnalysis(a);
          (window as any).__FA_ANALYSIS__ = a;
          (window as any).__FA_FONT_DATA__ = {
            unitsPerEm: fd.font.unitsPerEm,
            oBBox: fd.font.charToGlyph('o')?.getBoundingBox(),
            OBBox: fd.font.charToGlyph('O')?.getBoundingBox(),
          };
        } else {
          runAnalysis(fd);
        }
      })
      .catch((e) => {
        console.error('Failed to load font from library:', e);
        // A stale id (font deleted or DB rebuilt) must not open again next time.
        if (readLastFont() === fontId) writeLastFont(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [fontId, runAnalysis, reloadTick]);

  useEffect(() => {
    const data = fontDataRef.current;
    if (data && activeTab !== 'glyphs') {
      ensureTabAnalysis(activeTab, data);
    }
  }, [activeTab, ensureTabAnalysis]);

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
    writeLastFont(null);
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

  const summaryStats = useMemo<Stat[]>(() => {
    if (!analysis) return [];
    switch (activeTab) {
      case 'contrast': {
        const items: Stat[] = [];
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

  const handleCategoryOverride = useCallback(async (cat: FontCategory) => {
    setCatAnchor(null);
    const ids = familyMembers.map((f) => f.id);
    if (ids.length === 0) return;
    setEffectiveCategory(cat);
    try {
      await bulkSetCategory(ids, cat);
    } catch {
      setEffectiveCategory(currentMeta?.categoryOverride ?? currentMeta?.category ?? null);
    }
  }, [familyMembers, currentMeta]);

  const toggleStar = useCallback(async () => {
    setFamilyStarred((v) => !v);
    try {
      await toggleStarFamily(familyStarKey);
    } catch {
      setFamilyStarred((v) => !v);
    }
  }, [familyStarKey]);

  // An uploaded font has no library id, and the glyph view needs one.
  const tabs = useMemo(() => (fontId ? TABS : TABS.filter((t) => t.id !== 'glyphs')), [fontId]);

  if (loading) {
    return <div className="loading-state"><span className="spinner" aria-hidden="true" />Loading font from the library…</div>;
  }

  if (!fontData) {
    return (
      <div className="analyze-page">
        <section className="start" aria-labelledby="start-title">
          <div className="start-head">
            <h1 className="start-title" id="start-title">Analyze a Font</h1>
            <p className="start-sub">Upload a font file, select a sample, or open a font in the <Link to="/">library</Link>.</p>
          </div>
          <FontUploader onFontLoaded={handleFontLoaded} />
        </section>
      </div>
    );
  }

  const glyphs = activeTab === 'glyphs';
  return (
    <div className="analyze-page">
      <section className="loaded" aria-labelledby="font-name">
        <header className="font-head">
          <button type="button" className="btn btn-ghost" onClick={handleReset}>
            <Icon name="back" />
            Change font
          </button>
          <div className="font-id">
            <div className="font-title">
              <h1 className="font-name" id="font-name" tabIndex={-1}>{fontData.familyName}</h1>
              {currentMeta && (
                <button type="button" className={`icon-btn star${familyStarred ? ' is-on' : ''}`} aria-pressed={familyStarred} aria-label={`Star ${superFamilyName(currentMeta)}`} onClick={toggleStar}>
                  <Icon name="star" />
                </button>
              )}
              {currentMeta && effectiveCategory && (
                <button
                  type="button" className="btn cat-pill" aria-haspopup="menu" aria-expanded={!!catAnchor}
                  aria-label={`Set category, now ${CAT_LABELS[effectiveCategory].long}`} data-testid="analyze-category-badge"
                  onClick={(e) => setCatAnchor(e.currentTarget)}
                >
                  <span className="cat-dot" style={{ '--c': CAT_COLOR[effectiveCategory] } as CSSProperties} />
                  {CAT_LABELS[effectiveCategory].long}
                  <Icon name="chev" />
                </button>
              )}
            </div>
            <p className="font-meta">
              {fontData.styleName}<span className="sep" aria-hidden="true">·</span>
              <span className="mono">{fontData.glyphCount}</span> glyphs<span className="sep" aria-hidden="true">·</span>
              <span className="mono">{fontData.unitsPerEm}</span> UPM
              {currentMeta && <><span className="sep" aria-hidden="true">·</span>{currentMeta.source === 'google' ? 'Google Fonts' : 'Local'}</>}
            </p>
          </div>
          {currentMeta && <FamilyNav members={familyMembers} current={currentMeta} onOpen={handleFamilyNav} />}
          <div className="head-actions">
            <button type="button" className="btn" onClick={handleExportJSON} disabled={!analysis}>Export JSON</button>
            <button type="button" className="btn" onClick={handleExportImage} disabled={!analysis || glyphs}>Export Image</button>
            {!IS_STATIC && currentMeta && (
              <LocalFontActions font={currentMeta} onChanged={() => setReloadTick((n) => n + 1)} onRemoved={() => { writeLastFont(null); navigate('/'); }} />
            )}
          </div>
        </header>

        <SubTabs tabs={tabs} active={activeTab} onSelect={setActiveTab} />

        <div className={`analysis${glyphs ? ' no-side' : ''}`}>
          <div className={`stage${glyphs ? ' is-flush' : ''}`}>
            <div className="panel" role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>
              <div className="canvas">
                {analyzing
                  ? <div className="loading-state"><span className="spinner" aria-hidden="true" />Analyzing font…</div>
                  : <AnalysisPanel tab={activeTab} fontData={fontData} fontId={fontId} analysis={analysis} canvasRef={canvasRef} />}
              </div>
            </div>
          </div>
          {!glyphs && (
            <AnalysisSide
              stats={summaryStats} fontData={fontData} filePath={IS_STATIC ? undefined : currentMeta?.filePath}
              axes={variableAxes} axisValues={axisValues} setAxisValues={setAxisValues} previewFamily={previewFontFamily}
              features={otfFeatures} rawMeta={rawMeta}
            />
          )}
        </div>
      </section>
      {catAnchor && (
        <CategoryMenu anchor={catAnchor} title="Set category · whole family" current={effectiveCategory ?? undefined} onPick={handleCategoryOverride} onClose={() => setCatAnchor(null)} />
      )}
    </div>
  );
}

function AnalysisPanel({ tab, fontData, fontId, analysis, canvasRef }: {
  tab: AnalysisTab;
  fontData: FontData;
  fontId?: string;
  analysis: FullAnalysis | null;
  canvasRef: RefObject<HTMLCanvasElement | null>;
}) {
  switch (tab) {
    case 'contrast':
      return <ContrastView fontData={fontData} contrastLower={analysis?.contrastLower ?? null} contrastUpper={analysis?.contrastUpper ?? null} xHeight={analysis?.xHeight} canvasRef={canvasRef} />;
    case 'xheight':
      return <XHeightView fontData={fontData} result={analysis?.xHeight ?? null} canvasRef={canvasRef} />;
    case 'proportions':
      return <ProportionsView fontData={fontData} result={analysis?.proportions ?? null} canvasRef={canvasRef} />;
    case 'weight':
      return <WeightView fontData={fontData} result={analysis?.weight ?? null} canvasRef={canvasRef} />;
    case 'spacing':
      return <SpacingView fontData={fontData} result={analysis?.spacing ?? null} canvasRef={canvasRef} />;
    case 'glyphs':
      return fontId ? <GlyphsView fontData={fontData} fontId={fontId} /> : null;
  }
}
