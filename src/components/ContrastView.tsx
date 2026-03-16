import { useEffect, useRef } from 'react';
import type { FontData, ContrastResult } from '../types';
import { drawGlyph } from '../lib/pathUtils';
import { useCanvasResize } from '../lib/useCanvasResize';

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

    const pad = 40;
    const gap = results.length > 1 ? 40 : 0;
    const areaW = (W - pad * 2 - gap) / results.length;
    const areaH = H - pad * 2 - 60;

    // Phase 1: Draw all glyphs first
    for (let i = 0; i < results.length; i++) {
      const { label } = results[i];
      const glyph = fontData.font.charToGlyph(label);
      if (!glyph) continue;

      const bb = glyph.getBoundingBox();
      const gW = bb.x2 - bb.x1;
      const gH = bb.y2 - bb.y1;
      if (gW === 0 || gH === 0) continue;

      const scale = Math.min(areaW / gW, areaH / gH) * 0.7;
      const cx = pad + i * (areaW + gap) + areaW / 2;
      const cy = pad + areaH / 2 + 10;
      const fontSize = fontData.font.unitsPerEm * scale;
      const drawX = cx - (bb.x1 + gW / 2) * scale;
      const drawY = cy + (bb.y1 + gH / 2) * scale;

      drawGlyph(ctx, glyph, drawX, drawY, fontSize);
    }

    // Phase 2: Reset state fully, then draw all measurement lines and labels
    ctx.save();
    ctx.restore();
    ctx.beginPath();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    for (let i = 0; i < results.length; i++) {
      const { result, label } = results[i];
      const glyph = fontData.font.charToGlyph(label);
      if (!glyph) continue;

      const bb = glyph.getBoundingBox();
      const gW = bb.x2 - bb.x1;
      const gH = bb.y2 - bb.y1;
      if (gW === 0 || gH === 0) continue;

      const scale = Math.min(areaW / gW, areaH / gH) * 0.7;
      const cx = pad + i * (areaW + gap) + areaW / 2;
      const cy = pad + areaH / 2 + 10;
      const drawX = cx - (bb.x1 + gW / 2) * scale;
      const drawY = cy + (bb.y1 + gH / 2) * scale;

      // Thickest stroke (red)
      const t = result.thickestSample;
      const tx1 = t.outerPoint.x * scale + drawX;
      const ty1 = t.outerPoint.y * scale + drawY;
      const tx2 = t.innerPoint.x * scale + drawX;
      const ty2 = t.innerPoint.y * scale + drawY;

      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(tx1, ty1);
      ctx.lineTo(tx2, ty2);
      ctx.stroke();

      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(tx1, ty1, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(tx2, ty2, 6, 0, Math.PI * 2);
      ctx.fill();

      // Thinnest stroke (blue)
      const s = result.thinnestSample;
      const sx1 = s.outerPoint.x * scale + drawX;
      const sy1 = s.outerPoint.y * scale + drawY;
      const sx2 = s.innerPoint.x * scale + drawX;
      const sy2 = s.innerPoint.y * scale + drawY;

      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.stroke();

      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.arc(sx1, sy1, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(sx2, sy2, 6, 0, Math.PI * 2);
      ctx.fill();

      // Labels
      ctx.fillStyle = '#ccc';
      ctx.font = 'bold 13px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(`"${label}" — ${result.contrastRatio.toFixed(2)}:1`, cx, pad - 8);

      ctx.font = 'bold 10px system-ui';
      ctx.fillStyle = '#ef4444';
      ctx.textAlign = 'left';
      ctx.fillText(`Thick: ${result.maxWidth.toFixed(1)}u`, (tx1 + tx2) / 2 + 12, (ty1 + ty2) / 2 - 8);
      ctx.fillStyle = '#3b82f6';
      ctx.fillText(`Thin: ${result.minWidth.toFixed(1)}u`, (sx1 + sx2) / 2 + 12, (sy1 + sy2) / 2 - 8);
    }

    // Legend
    const ly = H - 28;
    ctx.font = '11px system-ui';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(pad, ly - 4, 14, 4);
    ctx.fillText('Thickest stroke', pad + 20, ly);
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(pad + 150, ly - 4, 14, 4);
    ctx.fillText('Thinnest stroke', pad + 170, ly);
  }, [fontData, contrastLower, contrastUpper, ref, resizeCount]);

  return (
    <canvas
      ref={ref}
      className="h-full w-full rounded-lg"
      style={{ minHeight: 400 }}
    />
  );
}
