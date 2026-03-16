import type { Font } from 'opentype.js';

export interface SampleFont {
  name: string;
  category: 'serif' | 'sans-serif' | 'monospace' | 'handwriting';
  path: string;
}

export interface FontData {
  font: Font;
  fileName: string;
  familyName: string;
  styleName: string;
  unitsPerEm: number;
  ascender: number;
  descender: number;
  glyphCount: number;
}

export interface StrokeWidthSample {
  outerPoint: { x: number; y: number };
  innerPoint: { x: number; y: number };
  width: number;
  lengthAlongPath: number;
}

export interface ContrastResult {
  glyph: string;
  maxWidth: number;
  minWidth: number;
  contrastRatio: number;
  thickestSample: StrokeWidthSample;
  thinnestSample: StrokeWidthSample;
  allSamples: StrokeWidthSample[];
}

export interface XHeightResult {
  xHeight: number;
  capHeight: number;
  ascender: number;
  descender: number;
  unitsPerEm: number;
  xHeightToCapHeight: number;
  xHeightToEm: number;
  capHeightToEm: number;
}

export interface ProportionsResult {
  glyphWidth: number;
  glyphHeight: number;
  widthToHeightRatio: number;
  advanceWidth: number;
}

export interface WeightResult {
  filledPixels: number;
  totalPixels: number;
  fillRatio: number;
  fillPercentage: number;
}

export interface SpacingResult {
  testString: string;
  totalAdvanceWidth: number;
  mAdvanceWidth: number;
  ratio: number;
  charCount: number;
  avgCharWidth: number;
}

export interface FullAnalysis {
  contrastLower: ContrastResult | null;
  contrastUpper: ContrastResult | null;
  xHeight: XHeightResult | null;
  proportions: ProportionsResult | null;
  weight: WeightResult | null;
  spacing: SpacingResult | null;
}

export type AnalysisTab =
  | 'contrast'
  | 'xheight'
  | 'proportions'
  | 'weight'
  | 'spacing'
  | 'glyphs';

// --- Library / Database types ---

export type FontCategory = 'serif' | 'sans-serif' | 'monospace' | 'display' | 'script';
export type FontSource = 'local' | 'google';

export interface FontMetrics {
  contrast: number;
  weight: number;
  width: number;
  xHeight: number;
}

export interface StoredFontMeta {
  id: string;
  filePath: string;
  fileName: string;
  familyName: string;
  preferredFamilyName?: string;
  subfamilyName: string;
  weight: number;
  style: 'normal' | 'italic' | 'oblique';
  format: string;
  fileSize: number;
  glyphCount: number;
  unitsPerEm: number;
  ascender: number;
  descender: number;
  lastModified: string;
  addedAt: string;
  metrics?: FontMetrics;
  category?: FontCategory;
  source?: FontSource;
}

export interface StoredFontData {
  id: string;
  familyName: string;
  subfamilyName: string;
  format: string;
  base64Data: string;
}

export interface FontFamily {
  familyName: string;
  fonts: StoredFontMeta[];
  source?: FontSource;
}

export interface FontDatabaseResponse {
  version: number;
  fonts: StoredFontMeta[];
}

export interface ScanResult {
  added: number;
  total: number;
}
