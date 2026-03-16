import { useEffect, useRef } from 'react';
import type { FontData, SpacingResult } from '../types';
import { drawGlyph, drawTextPath } from '../lib/pathUtils';
import { useCanvasResize } from '../lib/useCanvasResize';

interface Props {
  fontData: FontData;
  result: SpacingResult | null;
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
}

export function SpacingView({ fontData, result, canvasRef: externalRef }: Props) {
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
      ctx.fillText('Spacing analysis unavailable', w / 2, h / 2);
      return;
    }

    const { font } = fontData;
    const padding = 40;
    const testString = result.testString;

    const availableW = w - padding * 2;
    const fontSize = Math.min(48, (availableW / result.totalAdvanceWidth) * font.unitsPerEm * 0.9);
    const scale = fontSize / font.unitsPerEm;

    const stringWidth = result.totalAdvanceWidth * scale;
    const startX = (w - stringWidth) / 2;
    const baselineY = h * 0.4;

    drawTextPath(ctx, font, testString, startX, baselineY, fontSize);

    let cursorX = startX;
    for (const char of testString) {
      const charGlyph = font.charToGlyph(char);
      if (!charGlyph) continue;
      const charAdvance = (charGlyph.advanceWidth ?? 0) * scale;

      ctx.strokeStyle = '#444';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(cursorX, baselineY - 40);
      ctx.lineTo(cursorX, baselineY + 10);
      ctx.stroke();
      ctx.setLineDash([]);

      cursorX += charAdvance;
    }

    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(cursorX, baselineY - 40);
    ctx.lineTo(cursorX, baselineY + 10);
    ctx.stroke();
    ctx.setLineDash([]);

    const bracketY = baselineY + 30;
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(startX, bracketY);
    ctx.lineTo(startX + stringWidth, bracketY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(startX, bracketY - 5);
    ctx.lineTo(startX, bracketY + 5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(startX + stringWidth, bracketY - 5);
    ctx.lineTo(startX + stringWidth, bracketY + 5);
    ctx.stroke();

    ctx.fillStyle = '#3b82f6';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(
      `Total: ${result.totalAdvanceWidth.toFixed(0)}u`,
      w / 2,
      bracketY + 18,
    );

    const mWidth = result.mAdvanceWidth * scale;
    const mY = h * 0.7;

    const mGlyph = font.charToGlyph('M');
    if (mGlyph) {
      const mDrawX = w / 2 - mWidth / 2;
      drawGlyph(ctx, mGlyph, mDrawX, mY, fontSize);

      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 1.5;
      const mBracketY = mY + 15;
      ctx.beginPath();
      ctx.moveTo(mDrawX, mBracketY);
      ctx.lineTo(mDrawX + mWidth, mBracketY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(mDrawX, mBracketY - 5);
      ctx.lineTo(mDrawX, mBracketY + 5);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(mDrawX + mWidth, mBracketY - 5);
      ctx.lineTo(mDrawX + mWidth, mBracketY + 5);
      ctx.stroke();

      ctx.fillStyle = '#22c55e';
      ctx.font = '11px system-ui';
      ctx.fillText(`M width: ${result.mAdvanceWidth.toFixed(0)}u`, w / 2, mBracketY + 18);
    }

    ctx.fillStyle = '#e5e5e5';
    ctx.font = 'bold 14px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(
      `String / M ratio: ${result.ratio.toFixed(2)}`,
      w / 2,
      h - 40,
    );

    ctx.fillStyle = '#aaa';
    ctx.font = '11px system-ui';
    ctx.fillText(
      `Avg char width: ${result.avgCharWidth.toFixed(0)}u  ·  ${result.charCount} characters`,
      w / 2,
      h - 20,
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
