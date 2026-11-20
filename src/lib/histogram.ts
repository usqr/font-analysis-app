// Area path of a value histogram, for the advanced filters of the library.

/** Counts `values` in `bins` equal bins between `min` and `max`. */
export function binValues(values: number[], min: number, max: number, bins: number): number[] {
  const out = new Array<number>(bins).fill(0);
  const span = max - min;
  for (const v of values) {
    const i = span > 0 ? Math.floor(((v - min) / span) * bins) : 0;
    out[Math.min(bins - 1, Math.max(0, i))]++;
  }
  return out;
}

/** SVG path of the bins as a closed area, `w` × `h` user units. */
export function histogramPath(counts: number[], w: number, h: number): string {
  if (!counts.length) return '';
  const top = Math.max(1, ...counts);
  const step = counts.length > 1 ? w / (counts.length - 1) : w;
  const pts = counts.map((c, i) => `L${(i * step).toFixed(1)},${(h - (c / top) * (h - 2)).toFixed(1)}`).join('');
  return `M0,${h}${pts}L${w},${h}Z`;
}
