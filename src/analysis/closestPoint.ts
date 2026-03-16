/**
 * Adapted from Mike Bostock's "Closest Point on Path" algorithm.
 * https://gist.github.com/mbostock/8027637
 *
 * Finds the closest point on an SVG path element to a given target point.
 * Uses a two-phase approach: coarse linear scan → binary-search refinement.
 */
export interface ClosestPointResult {
  x: number;
  y: number;
  distance: number;
  lengthAlongPath: number;
}

export function closestPointOnPath(
  pathNode: SVGPathElement,
  point: { x: number; y: number },
  scanPrecision = 8,
): ClosestPointResult {
  const pathLength = pathNode.getTotalLength();
  let best: DOMPoint | null = null;
  let bestLength = 0;
  let bestDistance = Infinity;

  const distance2 = (p: DOMPoint) => {
    const dx = p.x - point.x;
    const dy = p.y - point.y;
    return dx * dx + dy * dy;
  };

  for (
    let scanLength = 0;
    scanLength <= pathLength;
    scanLength += scanPrecision
  ) {
    const scan = pathNode.getPointAtLength(scanLength);
    const scanDistance = distance2(scan);
    if (scanDistance < bestDistance) {
      best = scan;
      bestLength = scanLength;
      bestDistance = scanDistance;
    }
  }

  let precision = scanPrecision / 2;
  while (precision > 0.5) {
    const beforeLength = bestLength - precision;
    if (beforeLength >= 0) {
      const before = pathNode.getPointAtLength(beforeLength);
      const beforeDistance = distance2(before);
      if (beforeDistance < bestDistance) {
        best = before;
        bestLength = beforeLength;
        bestDistance = beforeDistance;
        continue;
      }
    }

    const afterLength = bestLength + precision;
    if (afterLength <= pathLength) {
      const after = pathNode.getPointAtLength(afterLength);
      const afterDistance = distance2(after);
      if (afterDistance < bestDistance) {
        best = after;
        bestLength = afterLength;
        bestDistance = afterDistance;
        continue;
      }
    }

    precision /= 2;
  }

  return {
    x: best!.x,
    y: best!.y,
    distance: Math.sqrt(bestDistance),
    lengthAlongPath: bestLength,
  };
}
