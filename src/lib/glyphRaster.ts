/**
 * Fills a glyph outline on a pixel grid with the nonzero winding rule.
 * Overlapping contours (common in variable fonts) merge into one shape,
 * so measurements do not depend on how the outline is split into contours.
 * Pure TypeScript: it runs on the server and in the browser.
 */

export interface PathCmd {
  type: string;
  x?: number;
  y?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface GlyphRaster {
  /** Grid width and height in cells. */
  w: number;
  h: number;
  /** Size of one cell in font units. */
  cell: number;
  /** Font-unit position of the corner of cell (0, 0). */
  x0: number;
  y0: number;
  /** 1 = filled, 0 = empty. Row-major. */
  mask: Uint8Array;
}

interface Edge {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

const CURVE_STEPS = 16;
const DEFAULT_PAD = 2;

function quad(a: number, c: number, b: number, t: number): number {
  const u = 1 - t;
  return u * u * a + 2 * u * t * c + t * t * b;
}

function cubic(a: number, c1: number, c2: number, b: number, t: number): number {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * c1 + 3 * u * t * t * c2 + t * t * t * b;
}

function curvePoints(prev: Point, c: PathCmd): Point[] {
  const out: Point[] = [];
  for (let i = 1; i <= CURVE_STEPS; i++) {
    const t = i / CURVE_STEPS;
    if (c.type === 'Q') {
      out.push({ x: quad(prev.x, c.x1!, c.x!, t), y: quad(prev.y, c.y1!, c.y!, t) });
    } else {
      out.push({ x: cubic(prev.x, c.x1!, c.x2!, c.x!, t), y: cubic(prev.y, c.y1!, c.y2!, c.y!, t) });
    }
  }
  return out;
}

/** Converts path commands to closed polygons (one for each contour). */
export function flattenPath(commands: PathCmd[]): Point[][] {
  const polys: Point[][] = [];
  let cur: Point[] = [];
  const close = () => {
    if (cur.length >= 3) polys.push(cur);
    cur = [];
  };
  for (const c of commands) {
    if (c.type === 'M') {
      close();
      cur.push({ x: c.x!, y: c.y! });
    } else if (c.type === 'L') {
      cur.push({ x: c.x!, y: c.y! });
    } else if ((c.type === 'Q' || c.type === 'C') && cur.length > 0) {
      cur.push(...curvePoints(cur[cur.length - 1], c));
    } else if (c.type === 'Z') {
      close();
    }
  }
  close();
  return polys;
}

function toEdges(polys: Point[][]): Edge[] {
  const edges: Edge[] = [];
  for (const p of polys) {
    for (let i = 0; i < p.length; i++) {
      const a = p[i];
      const b = p[(i + 1) % p.length];
      if (a.y !== b.y) edges.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y });
    }
  }
  return edges;
}

function bounds(polys: Point[][]) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const p of polys) {
    for (const q of p) {
      if (q.x < x1) x1 = q.x;
      if (q.y < y1) y1 = q.y;
      if (q.x > x2) x2 = q.x;
      if (q.y > y2) y2 = q.y;
    }
  }
  return { x1, y1, x2, y2 };
}

/** Crossings of one scanline: x position and winding direction. */
function crossings(edges: Edge[], y: number): { x: number; dir: number }[] {
  const out: { x: number; dir: number }[] = [];
  for (const e of edges) {
    const down = e.ay < e.by;
    const lo = down ? e.ay : e.by;
    const hi = down ? e.by : e.ay;
    if (y < lo || y >= hi) continue;
    const t = (y - e.ay) / (e.by - e.ay);
    out.push({ x: e.ax + t * (e.bx - e.ax), dir: down ? 1 : -1 });
  }
  return out.sort((a, b) => a.x - b.x);
}

function fillRow(r: GlyphRaster, row: number, edges: Edge[]) {
  const y = r.y0 + (row + 0.5) * r.cell;
  const xs = crossings(edges, y);
  let winding = 0;
  for (let i = 0; i < xs.length - 1; i++) {
    winding += xs[i].dir;
    if (winding === 0) continue;
    const from = Math.max(0, Math.ceil((xs[i].x - r.x0) / r.cell - 0.5));
    const to = Math.min(r.w - 1, Math.floor((xs[i + 1].x - r.x0) / r.cell - 0.5));
    for (let col = from; col <= to; col++) r.mask[row * r.w + col] = 1;
  }
}

/**
 * Fills the outline. `cell` is the grid size in font units. The grid has an
 * empty border of `pad` cells, so the outside region always touches the edge.
 */
export function rasterizePath(commands: PathCmd[], cell: number, pad = DEFAULT_PAD): GlyphRaster | null {
  const polys = flattenPath(commands);
  if (polys.length === 0) return null;
  const b = bounds(polys);
  if (!(b.x2 > b.x1 && b.y2 > b.y1)) return null;
  const x0 = b.x1 - pad * cell;
  const y0 = b.y1 - pad * cell;
  const w = Math.ceil((b.x2 - b.x1) / cell) + 2 * pad + 1;
  const h = Math.ceil((b.y2 - b.y1) / cell) + 2 * pad + 1;
  const raster: GlyphRaster = { w, h, cell, x0, y0, mask: new Uint8Array(w * h) };
  const edges = toEdges(polys);
  for (let row = 0; row < h; row++) fillRow(raster, row, edges);
  return raster;
}

export function filledCellCount(r: GlyphRaster): number {
  let n = 0;
  for (let i = 0; i < r.mask.length; i++) n += r.mask[i];
  return n;
}

/** Filled area in square font units. */
export function filledArea(r: GlyphRaster): number {
  return filledCellCount(r) * r.cell * r.cell;
}

export function cellCenter(r: GlyphRaster, col: number, row: number): Point {
  return { x: r.x0 + (col + 0.5) * r.cell, y: r.y0 + (row + 0.5) * r.cell };
}
