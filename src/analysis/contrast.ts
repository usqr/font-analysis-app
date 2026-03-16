import type { Font } from 'opentype.js';
import type { ContrastResult, StrokeWidthSample } from '../types';
import { splitContours, classifyContours } from '../lib/pathUtils';
import { closestPointOnPath } from './closestPoint';

/**
 * Measures stroke contrast for a glyph by finding the thickest and thinnest
 * stroke widths. Works by sampling points along the outer contour and finding
 * the closest point on the inner contour for each.
 */
export function analyzeContrast(
  font: Font,
  char: string,
  numSamples = 360,
): ContrastResult | null {
  const glyph = font.charToGlyph(char);
  if (!glyph) return null;

  const path = glyph.getPath(0, 0, font.unitsPerEm);
  const contours = splitContours(path);
  const classified = classifyContours(contours);
  if (!classified) return null;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.style.position = 'absolute';
  svg.style.left = '-9999px';
  svg.style.top = '-9999px';

  const outerPath = document.createElementNS(
    'http://www.w3.org/2000/svg',
    'path',
  );
  outerPath.setAttribute('d', classified.outer.svgPathData);
  svg.appendChild(outerPath);

  const innerPath = document.createElementNS(
    'http://www.w3.org/2000/svg',
    'path',
  );
  innerPath.setAttribute('d', classified.inner.svgPathData);
  svg.appendChild(innerPath);

  document.body.appendChild(svg);

  const outerLength = outerPath.getTotalLength();
  const scanPrecision = Math.max(2, Math.floor(outerLength / 100));

  const samples: StrokeWidthSample[] = [];
  let maxSample: StrokeWidthSample | null = null;
  let minSample: StrokeWidthSample | null = null;

  for (let i = 0; i < numSamples; i++) {
    const lengthAlong = (i / numSamples) * outerLength;
    const outerPt = outerPath.getPointAtLength(lengthAlong);
    const closest = closestPointOnPath(
      innerPath,
      { x: outerPt.x, y: outerPt.y },
      scanPrecision,
    );

    const sample: StrokeWidthSample = {
      outerPoint: { x: outerPt.x, y: outerPt.y },
      innerPoint: { x: closest.x, y: closest.y },
      width: closest.distance,
      lengthAlongPath: lengthAlong,
    };
    samples.push(sample);

    if (!maxSample || sample.width > maxSample.width) maxSample = sample;
    if (!minSample || sample.width < minSample.width) minSample = sample;
  }

  document.body.removeChild(svg);

  if (!maxSample || !minSample || minSample.width === 0) return null;

  return {
    glyph: char,
    maxWidth: maxSample.width,
    minWidth: minSample.width,
    contrastRatio: maxSample.width / minSample.width,
    thickestSample: maxSample,
    thinnestSample: minSample,
    allSamples: samples,
  };
}
