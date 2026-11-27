/**
 * Stroke contrast of a glyph with a counter ("o", "O").
 *
 * 1. Fill the outline on a grid (nonzero rule, so overlaps merge).
 * 2. Find the counter: the largest empty region that does not touch the edge.
 * 3. Cast rays from the counter center. On each ray, the stroke width is the
 *    diameter of the largest circle that fits in the first filled run.
 * 4. Smooth the widths over a small angle window, so that one join or one
 *    spur does not set the result. Thick = max, thin = min.
 *
 * This does not depend on how the font splits the outline into contours,
 * so it works for variable fonts with overlaps, script loops and outline
 * (inline) display faces.
 */
import type { ContrastResult, StrokeWidthSample } from '../types/index.js';
import { rasterizePath, cellCenter, type GlyphRaster, type PathCmd, type Point } from './glyphRaster.js';

const RAYS = 360;
const SMOOTH_HALF_WINDOW = 4;
/** Grid cells per em. 1200 gives about 0.8 units for a 1000-UPM font. */
const CELLS_PER_EM = 1200;
/** A counter smaller than this part of the filled bounding box is noise. */
const MIN_COUNTER_SHARE = 0.01;

/** 1D squared distance transform (Felzenszwalb and Huttenlocher). */
function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/** Squared distance (in cells) from each filled cell to the nearest empty cell. */
export function distanceToEmpty(r: GlyphRaster): Float64Array {
  const { w, h, mask } = r;
  const out = new Float64Array(w * h);
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  for (let i = 0; i < w * h; i++) out[i] = mask[i] ? 1e20 : 0;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = out[y * w + x];
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) out[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = out[y * w + x];
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) out[y * w + x] = d[x];
  }
  return out;
}

/** Labels the empty regions (4-connected). Label 1 is the outside. */
function labelEmpty(r: GlyphRaster): { labels: Int32Array; sizes: number[] } {
  const { w, h, mask } = r;
  const labels = new Int32Array(w * h);
  const sizes = [0];
  const stack: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (mask[start] || labels[start]) continue;
    const id = sizes.length;
    sizes.push(0);
    labels[start] = id;
    stack.push(start);
    while (stack.length > 0) {
      const i = stack.pop()!;
      sizes[id]++;
      const x = i % w;
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w];
      for (const j of nb) {
        if (j < 0 || j >= w * h || mask[j] || labels[j]) continue;
        labels[j] = id;
        stack.push(j);
      }
    }
  }
  return { labels, sizes };
}

/** A gap in the bowl narrower than this part of the em is closed to find the counter. */
const GAP_CLOSE_EM = 0.06;
/** Rays nearer than this (in rays) to a ray through a closed gap are ignored: they hit tapered ends. */
const GAP_MARGIN = 6;

/** Morphological closing with a disk: fills gaps narrower than 2 * radius cells. */
function closeGaps(r: GlyphRaster, radius: number): GlyphRaster {
  const r2 = radius * radius;
  const toFill = distanceToEmpty({ ...r, mask: r.mask.map((m) => 1 - m) });
  const dilated = { ...r, mask: Uint8Array.from(toFill, (d) => (d <= r2 ? 1 : 0)) };
  const toEmpty = distanceToEmpty(dilated);
  return { ...r, mask: Uint8Array.from(toEmpty, (d) => (d > r2 ? 1 : 0)) };
}

/** The largest enclosed empty region of the closed shape, and a center inside it. */
function findCounter(closed: GlyphRaster, labels: Int32Array, sizes: number[]): Point | null {
  let best = 0;
  for (let id = 2; id < sizes.length; id++) if (!best || sizes[id] > sizes[best]) best = id;
  if (!best || sizes[best] < MIN_COUNTER_SHARE * closed.w * closed.h) return null;
  return counterCenter(closed, labels, best);
}

/** The centroid if it is inside the region, else the deepest cell of the region. */
function counterCenter(r: GlyphRaster, labels: Int32Array, id: number): Point {
  let sx = 0, sy = 0, n = 0;
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] !== id) continue;
    sx += i % r.w;
    sy += Math.floor(i / r.w);
    n++;
  }
  const cx = sx / n, cy = sy / n;
  if (labels[Math.floor(cy) * r.w + Math.floor(cx)] === id) return { x: cx + 0.5, y: cy + 0.5 };
  const inside: GlyphRaster = { ...r, mask: Uint8Array.from(labels, (l) => (l === id ? 1 : 0)) };
  const depth = distanceToEmpty(inside);
  let deepest = 0;
  for (let i = 0; i < depth.length; i++) if (depth[i] > depth[deepest]) deepest = i;
  return { x: (deepest % r.w) + 0.5, y: Math.floor(deepest / r.w) + 0.5 };
}

interface RayHit {
  /** Stroke width in cells. */
  width: number;
  /** Cell index of the widest point (center of the fitted circle). */
  at: number;
}

/** What a ray sees: the glyph, its distance map, and the empty regions of the closed shape. */
interface Scene {
  r: GlyphRaster;
  dist: Float64Array;
  labels: Int32Array;
}

/** Cells on a ray from c, in steps of half a cell, until the ray leaves the grid. */
function* rayCells(r: GlyphRaster, c: Point, angle: number): Generator<number> {
  const dx = Math.cos(angle) * 0.5, dy = Math.sin(angle) * 0.5;
  let x = c.x, y = c.y, last = -1;
  for (;;) {
    x += dx;
    y += dy;
    const col = Math.floor(x), row = Math.floor(y);
    if (col < 0 || row < 0 || col >= r.w || row >= r.h) return;
    const i = row * r.w + col;
    if (i !== last) yield i;
    last = i;
  }
}

/**
 * Walks a ray out of the counter. A filled run counts as a stroke only if the
 * empty regions on its two sides differ: a tail inside the counter has the
 * counter on both sides. Returns 'gap' if the ray leaves through a closed gap.
 */
function castRay(s: Scene, c: Point, angle: number): RayHit | 'gap' | null {
  const { r, dist, labels } = s;
  let before = labels[Math.floor(c.y) * r.w + Math.floor(c.x)];
  let run: RayHit | null = null;
  let sawFill = false;
  for (const i of rayCells(r, c, angle)) {
    if (r.mask[i]) {
      sawFill = true;
      if (!run) run = { width: 0, at: i };
      if (dist[i] > dist[run.at]) run.at = i;
      continue;
    }
    const label = labels[i];
    if (!label) continue; // filled only in the closed shape
    if (run && label !== before) return finishRun(dist, run);
    if (!run && label !== before) return sawFill ? null : 'gap';
    before = label;
    run = null;
  }
  return null;
}

/** A run of n filled cells has its center sqrt(d) = (n + 1) / 2 cells from empty. */
function finishRun(dist: Float64Array, run: RayHit): RayHit {
  return { width: 2 * Math.sqrt(dist[run.at]) - 1, at: run.at };
}

/**
 * Median of each window of hits (the hits are in angle order, around a loop).
 * Returns the index of the hit that holds the median, so the drawn line
 * and the reported width are the same sample.
 */
function medianHits(hits: AngledHit[], half: number): number[] {
  const n = hits.length;
  return hits.map((_, i) => {
    const win: number[] = [];
    for (let k = -half; k <= half; k++) win.push((i + k + n) % n);
    win.sort((a, b) => hits[a].width - hits[b].width);
    return win[half];
  });
}

/** The nearest empty cell to a filled cell; it gives the ends of the width line. */
function nearestEmpty(r: GlyphRaster, i: number, radius: number): Point {
  const cx = i % r.w, cy = Math.floor(i / r.w);
  const reach = Math.ceil(radius) + 1;
  let best = { x: cx, y: cy }, bestD = Infinity;
  for (let y = Math.max(0, cy - reach); y <= Math.min(r.h - 1, cy + reach); y++) {
    for (let x = Math.max(0, cx - reach); x <= Math.min(r.w - 1, cx + reach); x++) {
      if (r.mask[y * r.w + x]) continue;
      const d = (x - cx) ** 2 + (y - cy) ** 2;
      if (d < bestD) { bestD = d; best = { x, y }; }
    }
  }
  return best;
}

function toSample(r: GlyphRaster, hit: RayHit, angle: number): StrokeWidthSample {
  const col = hit.at % r.w, row = Math.floor(hit.at / r.w);
  const half = hit.width / 2;
  const edge = nearestEmpty(r, hit.at, half + 1);
  const len = Math.hypot(edge.x - col, edge.y - row) || 1;
  const ux = (edge.x - col) / len, uy = (edge.y - row) / len;
  const center = cellCenter(r, col, row);
  const reach = half * r.cell;
  return {
    outerPoint: { x: center.x + ux * reach, y: center.y + uy * reach },
    innerPoint: { x: center.x - ux * reach, y: center.y - uy * reach },
    width: hit.width * r.cell,
    lengthAlongPath: angle,
  };
}

type AngledHit = RayHit & { angle: number };

/** Hits of all rays, without the rays near a gap in the bowl. */
function castRays(s: Scene, center: Point): AngledHit[] {
  const raw = Array.from({ length: RAYS }, (_, k) => castRay(s, center, (k / RAYS) * 2 * Math.PI));
  const nearGap = (k: number) => {
    for (let d = -GAP_MARGIN; d <= GAP_MARGIN; d++) if (raw[(k + d + RAYS) % RAYS] === 'gap') return true;
    return false;
  };
  const hits: AngledHit[] = [];
  raw.forEach((hit, k) => {
    if (!hit || hit === 'gap' || hit.width <= 0 || nearGap(k)) return;
    hits.push({ ...hit, angle: (k / RAYS) * 2 * Math.PI });
  });
  return hits;
}

/** Measures contrast on glyph path commands (font units, any y direction). */
export function measureStrokeContrast(
  commands: PathCmd[],
  char: string,
  unitsPerEm: number,
): ContrastResult | null {
  const gapRadius = (GAP_CLOSE_EM * CELLS_PER_EM) / 2;
  const r = rasterizePath(commands, unitsPerEm / CELLS_PER_EM, Math.ceil(gapRadius) + 2);
  if (!r) return null;
  const closed = closeGaps(r, gapRadius);
  const { labels, sizes } = labelEmpty(closed);
  const center = findCounter(closed, labels, sizes);
  if (!center) return null;
  const hits = castRays({ r, dist: distanceToEmpty(r), labels }, center);
  if (hits.length < RAYS / 3) return null;
  return summarize(r, char, hits);
}

function summarize(r: GlyphRaster, char: string, hits: AngledHit[]): ContrastResult | null {
  const medians = medianHits(hits, SMOOTH_HALF_WINDOW).map((k) => hits[k]);
  let thick = medians[0], thin = medians[0];
  for (const h of medians) {
    if (h.width > thick.width) thick = h;
    if (h.width < thin.width) thin = h;
  }
  if (thin.width <= 0) return null;
  const thickestSample = toSample(r, thick, thick.angle);
  const thinnestSample = toSample(r, thin, thin.angle);
  return {
    glyph: char,
    maxWidth: thickestSample.width,
    minWidth: thinnestSample.width,
    contrastRatio: thickestSample.width / thinnestSample.width,
    thickestSample,
    thinnestSample,
    allSamples: [],
  };
}
