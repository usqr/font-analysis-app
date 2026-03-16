import { useEffect, useRef } from 'react';
import type { FontData, WeightResult } from '../types';
import { drawGlyph } from '../lib/pathUtils';
import { useCanvasResize } from '../lib/useCanvasResize';

interface Props {
  fontData: FontData;
  result: WeightResult | null;
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
}

export function WeightView({ fontData, result, canvasRef: externalRef }: Props) {
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
      ctx.fillText('Weight analysis unavailable', w / 2, h / 2);
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
    const scale = (availableSize / maxDim) * 0.65;

    const centerX = w / 2;
    const centerY = h / 2 - 20;

    const fontSize = fontData.font.unitsPerEm * scale;
    const drawX = centerX - (bb.x1 + glyphW / 2) * scale;
    const drawY = centerY + (bb.y1 + glyphH / 2) * scale;

    drawGlyph(ctx, glyph, drawX, drawY, fontSize);

    const barWidth = 200;
    const barHeight = 20;
    const barX = centerX - barWidth / 2;
    const barY = h - 80;

    ctx.fillStyle = '#1a1a1a';
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(barX, barY, barWidth, barHeight, 4);
    ctx.fill();
    ctx.stroke();

    const fillWidth = barWidth * result.fillRatio;
    const gradient = ctx.createLinearGradient(barX, barY, barX + barWidth, barY);
    gradient.addColorStop(0, '#3b82f6');
    gradient.addColorStop(1, '#8b5cf6');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(barX, barY, fillWidth, barHeight, 4);
    ctx.fill();

    ctx.fillStyle = '#e5e5e5';
    ctx.font = 'bold 18px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(
      `${result.fillPercentage.toFixed(1)}%`,
      centerX,
      barY - 15,
    );

    ctx.fillStyle = '#aaa';
    ctx.font = '11px system-ui';
    ctx.fillText('Fill density of "o" bounding box', centerX, barY + barHeight + 20);

    let weightClass: string;
    if (result.fillPercentage < 20) weightClass = 'Thin / Hairline';
    else if (result.fillPercentage < 28) weightClass = 'Light';
    else if (result.fillPercentage < 35) weightClass = 'Regular';
    else if (result.fillPercentage < 42) weightClass = 'Medium / Semi-bold';
    else if (result.fillPercentage < 50) weightClass = 'Bold';
    else weightClass = 'Black / Heavy';

    ctx.fillStyle = '#aaa';
    ctx.font = '12px system-ui';
    ctx.fillText(weightClass, centerX, barY + barHeight + 38);
  }, [fontData, result, ref, resizeCount]);

  return (
    <canvas
      ref={ref}
      className="h-full w-full rounded-lg"
      style={{ minHeight: 400 }}
    />
  );
}
