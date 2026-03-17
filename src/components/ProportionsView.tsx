import { useEffect, useRef } from 'react';
import type { FontData, ProportionsResult } from '../types';
import { drawGlyph } from '../lib/pathUtils';
import { useCanvasResize } from '../lib/useCanvasResize';

interface Props {
  fontData: FontData;
  result: ProportionsResult | null;
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
}

export function ProportionsView({ fontData, result, canvasRef: externalRef }: Props) {
  const internalRef = useRef<HTMLCanvasElement>(null);
  const ref = externalRef ?? internalRef;
  const resizeCount = useCanvasResize(ref);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#141414';
    ctx.fillRect(0, 0, w, h);

    if (!result) {
      ctx.fillStyle = '#666';
      ctx.font = '14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Proportions analysis unavailable', w / 2, h / 2);
      return;
    }

    const glyph = fontData.font.charToGlyph('o');
    if (!glyph) return;

    const bb = glyph.getBoundingBox();
    const glyphW = bb.x2 - bb.x1;
    const glyphH = bb.y2 - bb.y1;
    const maxDim = Math.max(glyphW, glyphH);
    const padding = 80;
    const availableSize = Math.min(w, h) - padding * 2;
    const scale = availableSize / maxDim * 0.7;

    const centerX = w / 2;
    const centerY = h / 2;

    const fontSize = fontData.font.unitsPerEm * scale;
    const drawX = centerX - (bb.x1 + glyphW / 2) * scale;
    const drawY = centerY + (bb.y1 + glyphH / 2) * scale;

    drawGlyph(ctx, glyph, drawX, drawY, fontSize);

    const rectX = centerX - (glyphW / 2) * scale;
    const rectY = centerY - (glyphH / 2) * scale;
    const rectW = glyphW * scale;
    const rectH = glyphH * scale;

    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(rectX, rectY, rectW, rectH);
    ctx.setLineDash([]);

    const circleR = Math.min(rectW, rectH) / 2;
    ctx.beginPath();
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.arc(centerX, centerY, circleR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#3b82f6';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(`${result.glyphWidth.toFixed(0)}u`, centerX, rectY - 8);

    ctx.save();
    ctx.translate(rectX - 12, centerY);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`${result.glyphHeight.toFixed(0)}u`, 0, 0);
    ctx.restore();

    const ratio = result.widthToHeightRatio;
    let description: string;
    if (ratio < 0.9) description = 'Condensed';
    else if (ratio > 1.1) description = 'Extended';
    else if (ratio < 0.97) description = 'Slightly narrow';
    else if (ratio > 1.03) description = 'Slightly wide';
    else description = 'Circular';

    ctx.fillStyle = '#e5e5e5';
    ctx.font = 'bold 16px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(`Ratio: ${ratio.toFixed(3)}`, centerX, h - 50);

    ctx.fillStyle = '#aaa';
    ctx.font = '12px system-ui';
    ctx.fillText(description, centerX, h - 30);
  }, [fontData, result, ref, resizeCount]);

  return (
    <canvas
      ref={ref}
      className="h-full w-full rounded-lg"
      style={{ minHeight: 400 }}
    />
  );
}
