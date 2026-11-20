// Geometry of the Compare stage: font scales and guide labels.

export interface ScaleInput {
  upm: number;
  xHeight: number;
}

/**
 * Pixels for each font unit. With `normalize`, every font gets the x-height
 * of the first font in `list`.
 */
export function fontScales(list: ScaleInput[], size: number, normalize: boolean): number[] {
  const ref = list[0];
  return list.map((f) => {
    const k = size / f.upm;
    if (!normalize || !ref || f.xHeight <= 0) return k;
    return k * ((ref.xHeight / ref.upm) / (f.xHeight / f.upm));
  });
}

export interface GuideLabel {
  name: string;
  y: number;
  /** Label position after the spread. */
  ly: number;
}

/** Moves labels down so that no two labels are closer than `gap`. */
export function spreadLabels(items: { name: string; y: number }[], gap: number): GuideLabel[] {
  const out = [...items].sort((a, b) => a.y - b.y).map((it) => ({ ...it, ly: it.y }));
  for (let i = 1; i < out.length; i++) out[i].ly = Math.max(out[i].y, out[i - 1].ly + gap);
  return out;
}
