import { useEffect, useRef } from 'react';
import type { FontData, ContrastResult, XHeightResult } from '../types';
import { drawGlyph } from '../lib/pathUtils';
import { useCanvasResize } from '../lib/useCanvasResize';
import { analyzeXHeight } from '../analysis/xHeight';

// Palette of the Analyze mock (design/library-redesign/analyze.html).
const C = {
  bg: '#111215',
  guide: '#31343b',
  base: '#6c7079',
  label: '#9b9fa8',
  text: '#e6e7ea',
  thick: '#8ea2f0',
  thin: '#c99486',
};
const GLYPH_LOOK = { fill: 'rgba(230, 231, 234, 0.07)', stroke: C.label };
const UI_FONT = 'Geist, system-ui, sans-serif';
const MONO_FONT = '"Geist Mono", ui-monospace, monospace';

interface Props {
  fontData: FontData;
  contrastLower: ContrastResult | null;
  contrastUpper: ContrastResult | null;
  xHeight?: XHeightResult | null;
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
}

export function ContrastView({
  fontData,
  contrastLower,
  contrastUpper,
  xHeight: precomputedXHeight,
  canvasRef: externalRef,
}: Props) {
  const internalRef = useRef<HTMLCanvasElement>(null);
  const ref = externalRef ?? internalRef;
  const resizeCount = useCanvasResize(ref);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    const results = [
      { result: contrastLower, label: 'o' },
      { result: contrastUpper, label: 'O' },
    ].filter((r) => r.result !== null) as {
      result: ContrastResult;
      label: string;
    }[];

    if (results.length === 0) {
      ctx.fillStyle = C.label;
      ctx.font = '14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Contrast analysis unavailable', W / 2, H / 2);
      return;
    }

    const { font } = fontData;
    const xhResult = precomputedXHeight ?? analyzeXHeight(font);
    const totalHeight = font.ascender - font.descender;
    const padding = 60;
    const leftMargin = 100;
    const drawAreaH = H - padding * 2;
    const scale = drawAreaH / totalHeight;
    const baselineY = padding + font.ascender * scale;
    const glyphAreaW = W - leftMargin - padding;

    const drawGuide = (y: number, label: string, value: string, base = false) => {
      ctx.strokeStyle = base ? C.base : C.guide;
      ctx.lineWidth = 1;
      ctx.setLineDash(base ? [] : [4, 4]);
      ctx.beginPath();
      ctx.moveTo(leftMargin - 5, y);
      ctx.lineTo(W - padding, y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = C.label;
      ctx.font = `12px ${UI_FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText(label, leftMargin - 12, y + 4);

      ctx.font = `12px ${MONO_FONT}`;
      ctx.textAlign = 'left';
      ctx.fillText(value, W - padding + 8, y + 4);
    };

    // Draw glyphs on the shared baseline
    const fontSize = font.unitsPerEm * scale;

    for (let i = 0; i < results.length; i++) {
      const { label } = results[i];
      const glyph = font.charToGlyph(label);
      if (!glyph) continue;

      const glyphX = leftMargin + glyphAreaW * (i === 0 ? 0.25 : 0.6);
      drawGlyph(ctx, glyph, glyphX, baselineY, fontSize, GLYPH_LOOK);

      ctx.fillStyle = C.label;
      ctx.font = `12px ${UI_FONT}`;
      ctx.textAlign = 'center';
      const advW = (glyph.advanceWidth ?? 0) * scale;
      ctx.fillText(label, glyphX + advW / 2, baselineY + 20);
    }

    // Draw reference lines
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;

    const ascenderY = baselineY - font.ascender * scale;
    const descenderY = baselineY - font.descender * scale;

    drawGuide(ascenderY, 'Ascender', `${font.ascender}u`);
    if (xhResult) {
      const capHeightY = baselineY - xhResult.capHeight * scale;
      const xHeightY = baselineY - xhResult.xHeight * scale;
      drawGuide(capHeightY, 'Cap height', `${xhResult.capHeight}u`);
      drawGuide(xHeightY, 'x-height', `${xhResult.xHeight}u`);
    }
    drawGuide(baselineY, 'Baseline', '0', true);
    drawGuide(descenderY, 'Descender', `${font.descender}u`);

    // Draw contrast measurement overlays
    for (let i = 0; i < results.length; i++) {
      const { result, label } = results[i];
      const glyph = font.charToGlyph(label);
      if (!glyph) continue;

      const glyphX = leftMargin + glyphAreaW * (i === 0 ? 0.25 : 0.6);

      // Thickest stroke: solid accent line
      const t = result.thickestSample;
      const tx1 = t.outerPoint.x * scale + glyphX;
      const ty1 = t.outerPoint.y * scale + baselineY;
      const tx2 = t.innerPoint.x * scale + glyphX;
      const ty2 = t.innerPoint.y * scale + baselineY;

      ctx.strokeStyle = C.thick;
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(tx1, ty1);
      ctx.lineTo(tx2, ty2);
      ctx.stroke();

      ctx.fillStyle = C.thick;
      ctx.beginPath();
      ctx.arc(tx1, ty1, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(tx2, ty2, 5, 0, Math.PI * 2);
      ctx.fill();

      // Thinnest stroke: dashed warm line
      const s = result.thinnestSample;
      const sx1 = s.outerPoint.x * scale + glyphX;
      const sy1 = s.outerPoint.y * scale + baselineY;
      const sx2 = s.innerPoint.x * scale + glyphX;
      const sy2 = s.innerPoint.y * scale + baselineY;

      ctx.strokeStyle = C.thin;
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 2]);
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = C.thin;
      ctx.beginPath();
      ctx.arc(sx1, sy1, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(sx2, sy2, 5, 0, Math.PI * 2);
      ctx.fill();

      // Per-glyph label
      const advW = (glyph.advanceWidth ?? 0) * scale;
      const cx = glyphX + advW / 2;
      ctx.fillStyle = C.text;
      ctx.font = `500 13px ${UI_FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(`"${label}" — ${result.contrastRatio.toFixed(2)}:1`, cx, padding - 15);

      ctx.font = `500 12px ${MONO_FONT}`;
      ctx.fillStyle = C.thick;
      ctx.textAlign = 'left';
      ctx.fillText(`${result.maxWidth.toFixed(1)}u`, (tx1 + tx2) / 2 + 10, (ty1 + ty2) / 2 - 6);
      ctx.fillStyle = C.thin;
      ctx.fillText(`${result.minWidth.toFixed(1)}u`, (sx1 + sx2) / 2 + 10, (sy1 + sy2) / 2 - 6);
    }

    // Legend
    const ly = H - 28;
    ctx.font = `12px ${UI_FONT}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = C.thick;
    ctx.fillRect(leftMargin, ly - 5, 20, 2);
    ctx.fillStyle = C.label;
    ctx.fillText('Thickest stroke (solid)', leftMargin + 28, ly);
    ctx.fillStyle = C.thin;
    for (let x = 0; x < 20; x += 5) ctx.fillRect(leftMargin + 200 + x, ly - 5, 3, 2);
    ctx.fillStyle = C.label;
    ctx.fillText('Thinnest stroke (dashed)', leftMargin + 228, ly);
  }, [fontData, contrastLower, contrastUpper, precomputedXHeight, ref, resizeCount]);

  return (
    <canvas
      ref={ref}
      className="h-full w-full rounded-lg"
      style={{ minHeight: 400 }}
    />
  );
}
