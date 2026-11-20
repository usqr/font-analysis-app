import type { Font } from 'opentype.js';

/** One compared style, with the metrics that the stage and the table show. */
export interface ComparedFont {
  key: string;
  family: string;
  style: string;
  variable: boolean;
  /** `font-variation-settings` for a weight of a variable file. */
  variation?: string;
  /** CSS family name of the registered FontFace. */
  css: string;
  color: string;
  font: Font;
  upm: number;
  xh: number;
  cap: number;
  asc: number;
  desc: number;
  glyphs: number;
}
