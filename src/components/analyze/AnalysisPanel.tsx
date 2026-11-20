import type { ReactNode, RefObject } from 'react';
import type { AnalysisTab, FontData, FullAnalysis } from '../../types';
import { ContrastView } from '../ContrastView';
import { XHeightView } from '../XHeightView';
import { ProportionsView } from '../ProportionsView';
import { WeightView } from '../WeightView';
import { SpacingView } from '../SpacingView';
import { GlyphsView } from '../GlyphsView';

interface PanelProps {
  tab: AnalysisTab;
  fontData: FontData;
  fontId?: string;
  analysis: FullAnalysis | null;
  canvasRef: RefObject<HTMLCanvasElement | null>;
}

/** The view of one Analyze tab. */
function AnalysisPanel({ tab, fontData, fontId, analysis, canvasRef }: PanelProps) {
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

/** The tab panel, with `side` next to it. The glyph tab has no side panel. */
export function AnalysisArea({ analyzing, side, ...panel }: PanelProps & { analyzing: boolean; side: ReactNode }) {
  const glyphs = panel.tab === 'glyphs';
  return (
    <div className={`analysis${glyphs ? ' no-side' : ''}`}>
      <div className={`stage${glyphs ? ' is-flush' : ''}`}>
        <div className="panel" role="tabpanel" id={`panel-${panel.tab}`} aria-labelledby={`tab-${panel.tab}`}>
          <div className="canvas">
            {analyzing
              ? <div className="loading-state"><span className="spinner" aria-hidden="true" />Analyzing font…</div>
              : <AnalysisPanel {...panel} />}
          </div>
        </div>
      </div>
      {!glyphs && side}
    </div>
  );
}
