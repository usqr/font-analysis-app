import { useState, useRef, useMemo, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import type { AnalysisTab } from '../types';
import { FontUploader } from './FontUploader';
import { exportAnalysisJSON, exportCanvasAsAvif } from '../lib/exportUtils';
import { useFontFace } from '../lib/useFontFace';
import { IS_STATIC } from '../lib/env';
import { readAxes } from '../lib/fontAxes';
import { readLastFont, writeLastFont } from '../lib/lastFont';
import { summaryStats } from '../lib/summaryStats';
import { AnalysisArea } from './analyze/AnalysisPanel';
import { AnalysisSide } from './analyze/AnalysisSide';
import { FontHeader } from './analyze/FontHeader';
import { LocalFontActions } from './analyze/LocalFontActions';
import { SubTabs, type TabDef } from './analyze/SubTabs';
import { useFontAnalysis } from './analyze/useFontAnalysis';
import { useLibraryFont } from './analyze/useLibraryFont';

const TABS: TabDef[] = [
  { id: 'contrast', label: 'Contrast' },
  { id: 'xheight', label: 'X-Height' },
  { id: 'proportions', label: 'Proportions' },
  { id: 'weight', label: 'Weight' },
  { id: 'spacing', label: 'Spacing' },
  { id: 'glyphs', label: 'Glyphs' },
];

function StartState({ onFontLoaded }: { onFontLoaded: Parameters<typeof FontUploader>[0]['onFontLoaded'] }) {
  return (
    <div className="analyze-page">
      <section className="start" aria-labelledby="start-title">
        <div className="start-head">
          <h1 className="start-title" id="start-title">Analyze a Font</h1>
          <p className="start-sub">Upload a font file, select a sample, or open a font in the <Link to="/">library</Link>.</p>
        </div>
        <FontUploader onFontLoaded={onFontLoaded} />
      </section>
    </div>
  );
}

/** Opens the last analyzed font when the route has no font, and remembers the current one. */
function useLastFont(fontId: string | undefined) {
  const navigate = useNavigate();
  useEffect(() => {
    if (fontId) { writeLastFont(fontId); return; }
    const last = readLastFont();
    if (last) navigate(`/analyze/${last}`, { replace: true });
  }, [fontId, navigate]);
}

export function AnalyzeView() {
  const { fontId } = useParams<{ fontId: string }>();
  const navigate = useNavigate();
  useLastFont(fontId);
  const [activeTab, setActiveTab] = useState<AnalysisTab>('contrast');
  const [reloadTick, setReloadTick] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { fontData, analysis, analyzing, features, rawMeta, load, reset } = useFontAnalysis(activeTab);
  const { loading, lib } = useLibraryFont(fontId, reloadTick, load);
  const { fontFamily: previewFamily } = useFontFace(fontId ?? null);

  // An uploaded font has no library id: no glyph view and no axis preview.
  const tabs = useMemo(() => (fontId ? TABS : TABS.filter((t) => t.id !== 'glyphs')), [fontId]);
  const axes = useMemo(() => (fontId && fontData ? readAxes(fontData.font) : []), [fontId, fontData]);
  const stats = useMemo(() => summaryStats(analysis, activeTab), [analysis, activeTab]);

  const handleReset = () => {
    reset();
    setActiveTab('contrast');
    writeLastFont(null);
    if (fontId) navigate('/analyze');
  };
  const exportImage = async () => {
    if (canvasRef.current && fontData) await exportCanvasAsAvif(canvasRef.current, fontData.familyName, activeTab);
  };

  if (loading) {
    return <div className="loading-state"><span className="spinner" aria-hidden="true" />Loading font from the library…</div>;
  }
  if (!fontData) return <StartState onFontLoaded={load} />;

  return (
    <div className="analyze-page">
      <section className="loaded" aria-labelledby="font-name">
        <FontHeader fontData={fontData} lib={lib} onReset={handleReset} onOpen={(id) => navigate(`/analyze/${id}`)}>
          <button type="button" className="btn" onClick={() => analysis && exportAnalysisJSON(fontData, analysis)} disabled={!analysis}>Export JSON</button>
          <button type="button" className="btn" onClick={exportImage} disabled={!analysis || activeTab === 'glyphs'}>Export Image</button>
          {!IS_STATIC && lib && (
            <LocalFontActions font={lib.meta} onChanged={() => setReloadTick((n) => n + 1)} onRemoved={() => { writeLastFont(null); navigate('/'); }} />
          )}
        </FontHeader>
        <SubTabs tabs={tabs} active={activeTab} onSelect={setActiveTab} />
        <AnalysisArea
          tab={activeTab} fontData={fontData} fontId={fontId} analysis={analysis} canvasRef={canvasRef} analyzing={analyzing}
          side={(
            <AnalysisSide
              stats={stats} fontData={fontData} filePath={IS_STATIC ? undefined : lib?.meta.filePath}
              axes={axes} previewFamily={previewFamily} features={features} rawMeta={rawMeta}
            />
          )}
        />
      </section>
    </div>
  );
}
