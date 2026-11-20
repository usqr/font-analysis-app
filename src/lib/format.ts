// Number formats that more than one view uses.

const MINUS = '−';

/** `n` rounded to a whole number, with a typographic minus sign. */
export function signedInt(n: number): string {
  const r = Math.round(n);
  return r < 0 ? `${MINUS}${-r}` : String(r);
}

/** The position of `v` between `min` and `max`, as a CSS percentage. */
export function pctOf(v: number, min: number, max: number): string {
  return `${((v - min) / (max - min || 1)) * 100}%`;
}
