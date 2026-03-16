import type { Font } from 'opentype.js';
import type { SpacingResult } from '../types';

const TEST_STRING = 'Hamburgerfonsz';

export function analyzeSpacing(font: Font): SpacingResult | null {
  const mGlyph = font.charToGlyph('M');
  if (!mGlyph) return null;

  const fontSize = font.unitsPerEm;
  const totalAdvanceWidth = font.getAdvanceWidth(TEST_STRING, fontSize);
  const mAdvanceWidth = mGlyph.advanceWidth ?? 0;

  if (mAdvanceWidth === 0) return null;

  const charCount = TEST_STRING.length;

  return {
    testString: TEST_STRING,
    totalAdvanceWidth,
    mAdvanceWidth,
    ratio: totalAdvanceWidth / mAdvanceWidth,
    charCount,
    avgCharWidth: totalAdvanceWidth / charCount,
  };
}
