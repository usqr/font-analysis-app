import type { Font, Glyph, Path, PathCommand } from 'opentype.js';

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

export interface Contour {
  commands: PathCommand[];
  svgPathData: string;
}

/**
 * Splits an opentype.js path into individual closed contours.
 * An "o" glyph typically has 2 contours: outer + inner.
 */
export function splitContours(path: Path): Contour[] {
  const contours: Contour[] = [];
  let current: PathCommand[] = [];

  for (const cmd of path.commands) {
    current.push(cmd);
    if (cmd.type === 'Z') {
      contours.push({
        commands: [...current],
        svgPathData: commandsToSvg(current),
      });
      current = [];
    }
  }

  if (current.length > 0) {
    contours.push({
      commands: current,
      svgPathData: commandsToSvg(current),
    });
  }

  return contours;
}

function commandsToSvg(commands: PathCommand[]): string {
  return commands
    .map((cmd) => {
      switch (cmd.type) {
        case 'M':
          return `M${cmd.x} ${cmd.y}`;
        case 'L':
          return `L${cmd.x} ${cmd.y}`;
        case 'Q':
          return `Q${cmd.x1} ${cmd.y1} ${cmd.x} ${cmd.y}`;
        case 'C':
          return `C${cmd.x1} ${cmd.y1} ${cmd.x2} ${cmd.y2} ${cmd.x} ${cmd.y}`;
        case 'Z':
          return 'Z';
      }
    })
    .join(' ');
}

/**
 * Identifies which contour is outer (larger area) vs inner (smaller area).
 * Uses the shoelace formula for signed area.
 */
export function classifyContours(contours: Contour[]): {
  outer: Contour;
  inner: Contour;
} | null {
  if (contours.length < 2) return null;

  const withAreas = contours.map((c) => ({
    contour: c,
    area: Math.abs(computeContourArea(c)),
  }));

  withAreas.sort((a, b) => b.area - a.area);

  return {
    outer: withAreas[0].contour,
    inner: withAreas[1].contour,
  };
}

function computeContourArea(contour: Contour): number {
  const points = sampleContourPoints(contour, 200);
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return area / 2;
}

function sampleContourPoints(
  contour: Contour,
  numSamples: number,
): { x: number; y: number }[] {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const pathEl = document.createElementNS(
    'http://www.w3.org/2000/svg',
    'path',
  );
  pathEl.setAttribute('d', contour.svgPathData);
  svg.appendChild(pathEl);
  document.body.appendChild(svg);

  const totalLength = pathEl.getTotalLength();
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < numSamples; i++) {
    const pt = pathEl.getPointAtLength((i / numSamples) * totalLength);
    points.push({ x: pt.x, y: pt.y });
  }

  document.body.removeChild(svg);
  return points;
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
