import type { Font, Glyph, PathCommand } from 'opentype.js';

const GLYPH_FILL = '#ffffff';
const GLYPH_ALPHA = 0.65;

function tracePath(ctx: CanvasRenderingContext2D, commands: PathCommand[]) {
  ctx.beginPath();
  for (const cmd of commands) {
    if (cmd.type === 'M') ctx.moveTo(cmd.x, cmd.y);
    else if (cmd.type === 'L') ctx.lineTo(cmd.x, cmd.y);
    else if (cmd.type === 'Q') ctx.quadraticCurveTo(cmd.x1, cmd.y1, cmd.x, cmd.y);
    else if (cmd.type === 'C') ctx.bezierCurveTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y);
    else if (cmd.type === 'Z') ctx.closePath();
  }
}

/** Optional look of a glyph: a light fill plus an outline, as in the Analyze mock. */
export interface GlyphOutline {
  fill: string;
  stroke: string;
}

export function drawGlyph(
  ctx: CanvasRenderingContext2D,
  glyph: Glyph,
  x: number,
  y: number,
  fontSize: number,
  outline?: GlyphOutline,
) {
  const path = glyph.getPath(x, y, fontSize);
  ctx.save();
  tracePath(ctx, path.commands);
  if (outline) {
    ctx.fillStyle = outline.fill;
    ctx.fill('evenodd');
    ctx.strokeStyle = outline.stroke;
    ctx.lineWidth = 1.25;
    ctx.stroke();
  } else {
    ctx.globalAlpha = GLYPH_ALPHA;
    ctx.fillStyle = GLYPH_FILL;
    ctx.fill();
  }
  ctx.restore();
}

export function drawTextPath(
  ctx: CanvasRenderingContext2D,
  font: Font,
  text: string,
  x: number,
  y: number,
  fontSize: number,
) {
  const path = font.getPath(text, x, y, fontSize);
  ctx.save();
  ctx.globalAlpha = GLYPH_ALPHA;
  ctx.fillStyle = GLYPH_FILL;
  tracePath(ctx, path.commands);
  ctx.fill();
  ctx.restore();
}

export function getGlyphBounds(glyph: Glyph): {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
  width: number;
  height: number;
} {
  const bb = glyph.getBoundingBox();
  return {
    xMin: bb.x1,
    yMin: bb.y1,
    xMax: bb.x2,
    yMax: bb.y2,
    width: bb.x2 - bb.x1,
    height: bb.y2 - bb.y1,
  };
}
