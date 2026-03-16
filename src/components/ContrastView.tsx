import { useEffect, useRef } from 'react';
import type { FontData, ContrastResult } from '../types';
import { drawGlyph } from '../lib/pathUtils';
import { useCanvasResize } from '../lib/useCanvasResize';
import { analyzeXHeight } from '../analysis/xHeight';

const GUIDE_COLORS = {
  baseline: '#ef4444',
  xHeight: '#3b82f6',
  capHeight: '#22c55e',
  ascender: '#a855f7',
  descender: '#f59e0b',
};

interface Props {
  fontData: FontData;
  contrastLower: ContrastResult | null;
  contrastUpper: ContrastResult | null;
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
}

export function ContrastView({
  fontData,
  contrastLower,
  contrastUpper,
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

    ctx.fillStyle = '#141414';
    ctx.fillRect(0, 0, W, H);

    const results = [
      { result: contrastLower, label: 'o' },
      { result: contrastUpper, label: 'O' },
    ].filter((r) => r.result !== null) as {
      result: ContrastResult;
      label: string;
    }[];

    if (results.length === 0) {
      ctx.fillStyle = '#666';
      ctx.font = '14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Contrast analysis unavailable', W / 2, H / 2);
      return;
    }

    const { font } = fontData;
    const xhResult = analyzeXHeight(font);
    const totalHeight = font.ascender - font.descender;
    const padding = 60;
    const leftMargin = 100;
    const drawAreaH = H - padding * 2;
    const scale = drawAreaH / totalHeight;
    const baselineY = padding + font.ascender * scale;
    const glyphAreaW = W - leftMargin - padding;

    const drawGuide = (y: number, color: string, label: string, value: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(leftMargin - 5, y);
      ctx.lineTo(W - padding, y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = color;
      ctx.font = '11px system-ui';
      ctx.textAlign = 'right';
      ctx.fillText(label, leftMargin - 12, y + 4);

      ctx.font = '10px system-ui';
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
      drawGlyph(ctx, glyph, glyphX, baselineY, fontSize);

      ctx.fillStyle = '#999';
      ctx.font = '12px system-ui';
      ctx.textAlign = 'center';
      const advW = (glyph.advanceWidth ?? 0) * scale;
      ctx.fillText(label, glyphX + advW / 2, baselineY + 20);
    }

    // Draw reference lines
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;

    const ascenderY = baselineY - font.ascender * scale;
    const descenderY = baselineY - font.descender * scale;

    drawGuide(ascenderY, GUIDE_COLORS.ascender, 'Ascender', `${font.ascender}u`);
    if (xhResult) {
      const capHeightY = baselineY - xhResult.capHeight * scale;
      const xHeightY = baselineY - xhResult.xHeight * scale;
      drawGuide(capHeightY, GUIDE_COLORS.capHeight, 'Cap height', `${xhResult.capHeight}u`);
      drawGuide(xHeightY, GUIDE_COLORS.xHeight, 'x-height', `${xhResult.xHeight}u`);
    }
    drawGuide(baselineY, GUIDE_COLORS.baseline, 'Baseline', '0');
    drawGuide(descenderY, GUIDE_COLORS.descender, 'Descender', `${font.descender}u`);

    // Draw contrast measurement overlays
    for (let i = 0; i < results.length; i++) {
      const { result, label } = results[i];
      const glyph = font.charToGlyph(label);
      if (!glyph) continue;

      const glyphX = leftMargin + glyphAreaW * (i === 0 ? 0.25 : 0.6);

      // Thickest stroke (red)
      const t = result.thickestSample;
      const tx1 = t.outerPoint.x * scale + glyphX;
      const ty1 = t.outerPoint.y * scale + baselineY;
      const tx2 = t.innerPoint.x * scale + glyphX;
      const ty2 = t.innerPoint.y * scale + baselineY;

      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(tx1, ty1);
      ctx.lineTo(tx2, ty2);
      ctx.stroke();

      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(tx1, ty1, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(tx2, ty2, 5, 0, Math.PI * 2);
      ctx.fill();

      // Thinnest stroke (blue)
      const s = result.thinnestSample;
      const sx1 = s.outerPoint.x * scale + glyphX;
      const sy1 = s.outerPoint.y * scale + baselineY;
      const sx2 = s.innerPoint.x * scale + glyphX;
      const sy2 = s.innerPoint.y * scale + baselineY;

      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.stroke();

      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.arc(sx1, sy1, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(sx2, sy2, 5, 0, Math.PI * 2);
      ctx.fill();

      // Per-glyph label
      const advW = (glyph.advanceWidth ?? 0) * scale;
      const cx = glyphX + advW / 2;
      ctx.fillStyle = '#ccc';
      ctx.font = 'bold 12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(`"${label}" — ${result.contrastRatio.toFixed(2)}:1`, cx, padding - 15);

      ctx.font = 'bold 10px system-ui';
      ctx.fillStyle = '#ef4444';
      ctx.textAlign = 'left';
      ctx.fillText(`Thick: ${result.maxWidth.toFixed(1)}u`, (tx1 + tx2) / 2 + 10, (ty1 + ty2) / 2 - 6);
      ctx.fillStyle = '#3b82f6';
      ctx.fillText(`Thin: ${result.minWidth.toFixed(1)}u`, (sx1 + sx2) / 2 + 10, (sy1 + sy2) / 2 - 6);
    }

    // Legend
    const ly = H - 28;
    ctx.font = '11px system-ui';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(leftMargin, ly - 4, 14, 4);
    ctx.fillText('Thickest stroke', leftMargin + 20, ly);
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(leftMargin + 150, ly - 4, 14, 4);
    ctx.fillText('Thinnest stroke', leftMargin + 170, ly);
  }, [fontData, contrastLower, contrastUpper, ref, resizeCount]);

  return (
    <canvas
      ref={ref}
      className="h-full w-full rounded-lg"
      style={{ minHeight: 400 }}
    />
  );
}
