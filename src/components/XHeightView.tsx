import { useEffect, useRef } from 'react';
import type { FontData, XHeightResult } from '../types';
import { drawGlyph } from '../lib/pathUtils';
import { useCanvasResize } from '../lib/useCanvasResize';

interface Props {
  fontData: FontData;
  result: XHeightResult | null;
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
}

const COLORS = {
  baseline: '#ef4444',
  xHeight: '#3b82f6',
  capHeight: '#22c55e',
  ascender: '#a855f7',
  descender: '#f59e0b',
  glyph: '#e5e5e5',
  guide: '#333',
  label: '#999',
};

export function XHeightView({ fontData, result, canvasRef: externalRef }: Props) {
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
      ctx.fillText('X-height analysis unavailable', w / 2, h / 2);
      return;
    }

    const { font } = fontData;
    const totalHeight = font.ascender - font.descender;
    const padding = 60;
    const drawAreaH = h - padding * 2;
    const scale = drawAreaH / totalHeight;

    const baselineY = padding + font.ascender * scale;
    const leftMargin = 100;
    const glyphAreaW = w - leftMargin - padding;

    const drawGuide = (y: number, color: string, label: string, value: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(leftMargin - 5, y);
      ctx.lineTo(w - padding, y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = color;
      ctx.font = '11px system-ui';
      ctx.textAlign = 'right';
      ctx.fillText(label, leftMargin - 12, y + 4);

      ctx.font = '10px system-ui';
      ctx.textAlign = 'left';
      ctx.fillText(value, w - padding + 8, y + 4);
    };

    const ascenderY = baselineY - font.ascender * scale;
    const descenderY = baselineY - font.descender * scale;

    const xGlyph = font.charToGlyph('x');
    const tGlyph = font.charToGlyph('T');

    if (xGlyph && tGlyph) {
      const fontSize = font.unitsPerEm * scale;
      const xDrawX = leftMargin + glyphAreaW * 0.25;
      const tDrawX = leftMargin + glyphAreaW * 0.6;

      drawGlyph(ctx, xGlyph, xDrawX, baselineY, fontSize);
      drawGlyph(ctx, tGlyph, tDrawX, baselineY, fontSize);

      ctx.fillStyle = '#999';
      ctx.font = '12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('x', xDrawX + (xGlyph.advanceWidth ?? 0) * scale / 2, baselineY + 20);
      ctx.fillText('T', tDrawX + (tGlyph.advanceWidth ?? 0) * scale / 2, baselineY + 20);
    }

    const xHeightY = baselineY - result.xHeight * scale;
    const capHeightY = baselineY - result.capHeight * scale;

    drawGuide(ascenderY, COLORS.ascender, 'Ascender', `${font.ascender}u`);
    drawGuide(capHeightY, COLORS.capHeight, 'Cap height', `${result.capHeight}u`);
    drawGuide(xHeightY, COLORS.xHeight, 'x-height', `${result.xHeight}u`);
    drawGuide(baselineY, COLORS.baseline, 'Baseline', '0');
    drawGuide(descenderY, COLORS.descender, 'Descender', `${font.descender}u`);

    const statsX = leftMargin;
    const statsY = h - 40;
    ctx.font = '11px system-ui';
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.label;
    ctx.fillText(
      `x/cap: ${result.xHeightToCapHeight.toFixed(3)}   x/em: ${result.xHeightToEm.toFixed(3)}   cap/em: ${result.capHeightToEm.toFixed(3)}   UPM: ${result.unitsPerEm}`,
      statsX,
      statsY,
    );
  }, [fontData, result, ref, resizeCount]);

  return (
    <canvas
      ref={ref}
      className="h-full w-full rounded-lg"
      style={{ minHeight: 400 }}
    />
  );
}
