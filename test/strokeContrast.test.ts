import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rasterizePath, filledArea, type PathCmd } from '../src/lib/glyphRaster.ts';
import { measureStrokeContrast } from '../src/lib/strokeContrast.ts';

const UPM = 1000;

/** A closed polygon as path commands. */
function poly(points: [number, number][]): PathCmd[] {
  const [first, ...rest] = points;
  return [
    { type: 'M', x: first[0], y: first[1] },
    ...rest.map(([x, y]) => ({ type: 'L', x, y })),
    { type: 'Z' },
  ];
}

/** An ellipse arc from a0 to a1 (degrees). `reverse` gives the opposite winding. */
function arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, reverse = false): [number, number][] {
  const pts: [number, number][] = [];
  const steps = 180;
  for (let i = 0; i <= steps; i++) {
    const t = ((a0 + ((a1 - a0) * i) / steps) * Math.PI) / 180;
    pts.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
  }
  return reverse ? pts.reverse() : pts;
}

/** A filled ring: outer ellipse, and an inner ellipse with the opposite winding. */
function ring(outer: [number, number], inner: [number, number], cx = 500, cy = 500): PathCmd[] {
  return [
    ...poly(arc(cx, cy, outer[0], outer[1], 0, 359)),
    ...poly(arc(cx, cy, inner[0], inner[1], 0, 359, true)),
  ];
}

/** Part of a ring (a0..a1 degrees) as one closed contour. */
function ringPiece(outer: number, inner: number, a0: number, a1: number): PathCmd[] {
  return poly([...arc(500, 500, outer, outer, a0, a1), ...arc(500, 500, inner, inner, a0, a1, true)]);
}

const near = (actual: number, expected: number, tolerance: number) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

test('a ring of even width has a contrast of about 1', () => {
  const r = measureStrokeContrast(ring([400, 400], [300, 300]), 'o', UPM)!;
  near(r.maxWidth, 100, 3);
  near(r.minWidth, 100, 3);
  near(r.contrastRatio, 1, 0.05);
});

test('thick sides and thin top give the ratio of the two widths', () => {
  // Sides: 400 - 250 = 150. Top and bottom: 400 - 350 = 50.
  const r = measureStrokeContrast(ring([400, 400], [250, 350]), 'o', UPM)!;
  near(r.maxWidth, 150, 4);
  near(r.minWidth, 50, 3);
  near(r.contrastRatio, 3, 0.25);
});

test('overlapping contours (variable fonts) give the same result as one ring', () => {
  // Two half rings that overlap by 20 degrees at each end, the same winding.
  const pieces = [...ringPiece(400, 300, -10, 190), ...ringPiece(400, 300, 170, 370)];
  const r = measureStrokeContrast(pieces, 'o', UPM)!;
  near(r.contrastRatio, 1, 0.05);
  near(r.minWidth, 100, 3);
});

test('a tapered tail inside the counter does not count as the thin stroke', () => {
  const tail = poly([[500, 280], [500, 320], [300, 500]]); // a thin wedge from the inner edge
  const r = measureStrokeContrast([...ring([400, 400], [300, 300]), ...tail], 'O', UPM)!;
  near(r.minWidth, 100, 3);
});

test('an outline (inline) letter measures the drawn line, not the hollow band', () => {
  // Two thin concentric rings: lines 12 units wide, 30 units apart.
  const outline = [...ring([400, 400], [388, 388]), ...ring([358, 358], [346, 346])];
  const r = measureStrokeContrast(outline, 'O', UPM)!;
  near(r.minWidth, 12, 2.5);
  near(r.contrastRatio, 1, 0.25);
});

test('a bowl with a small gap is still measured, without the tapered ends at the gap', () => {
  // Open ring with a gap of 6 degrees (31 to 42 units) at the top.
  const open = poly([...arc(500, 500, 400, 400, -87, 267), ...arc(500, 500, 300, 300, -87, 267, true)]);
  const r = measureStrokeContrast(open, 'o', UPM)!;
  assert.ok(r, 'the open bowl is measured');
  near(r.minWidth, 100, 3);
});

test('a glyph without a counter returns null', () => {
  assert.equal(measureStrokeContrast(poly([[0, 0], [100, 0], [100, 700], [0, 700]]), 'l', UPM), null);
});

test('rasterizePath counts overlapping areas once (nonzero winding)', () => {
  const twoSquares = [...poly([[0, 0], [100, 0], [100, 100], [0, 100]]), ...poly([[50, 0], [150, 0], [150, 100], [50, 100]])];
  const r = rasterizePath(twoSquares, 1)!;
  near(filledArea(r), 150 * 100, 300);
});
