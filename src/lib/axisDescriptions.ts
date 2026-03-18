export interface AxisDescription {
  name: string;
  description: string;
}

export const AXIS_DESCRIPTIONS: Record<string, AxisDescription> = {
  wght: {
    name: 'Weight',
    description:
      'Controls the thickness of the strokes. Ranges from thin/hairline (100) to ultra-black (1000). Standard values: 100=Thin, 300=Light, 400=Regular, 700=Bold, 900=Black.',
  },
  wdth: {
    name: 'Width',
    description:
      'Controls the horizontal expansion or compression. 100 is normal width. Values below 100 condense, above 100 expand. Typical range: 75 (condensed) to 125 (expanded).',
  },
  ital: {
    name: 'Italic',
    description:
      'Switches between upright (0) and italic (1) designs. Unlike slant, italic often involves different glyph shapes, not just skewing.',
  },
  slnt: {
    name: 'Slant',
    description:
      'Controls the angle of the text. 0 is upright, negative values slant to the right (typical italic direction). Range often -12 to 0 degrees.',
  },
  opsz: {
    name: 'Optical Size',
    description:
      'Adjusts design details for the intended display size. Smaller values optimize for small text (more open shapes, thicker strokes), larger values for headings.',
  },
  GRAD: {
    name: 'Grade',
    description:
      'Adjusts stroke weight without changing the overall width of glyphs. Useful for dark/light mode adaptation without layout shifts.',
  },
  FILL: {
    name: 'Fill',
    description:
      'Transitions between outlined (0) and filled (1) glyph styles. Common in icon fonts like Material Symbols.',
  },
  CRSV: {
    name: 'Cursive',
    description:
      'Controls whether the font uses cursive letter forms. 0 = non-cursive, 1 = cursive. Found in fonts like Recursive.',
  },
  MONO: {
    name: 'Monospace',
    description:
      'Controls the monospace behavior. 0 = proportional, 1 = monospaced. Allows a single font file to serve both proportional and monospaced text.',
  },
  CASL: {
    name: 'Casual',
    description:
      'Controls how "casual" or "formal" the letterforms appear. 0 = formal, 1 = casual. Influences stroke curvature and terminals.',
  },
  SOFT: {
    name: 'Softness',
    description:
      'Controls the roundness or sharpness of corners and terminals. Higher values produce softer, more rounded forms.',
  },
  WONK: {
    name: 'Wonky',
    description:
      'Enables or disables "wonky" features — intentionally irregular letterforms for a more playful or hand-drawn feel.',
  },
  XTRA: {
    name: 'X Transparent',
    description:
      'Fine-tunes horizontal transparent (counter) widths without affecting overall advance width. Used for precise typographic adjustments.',
  },
  YTRA: {
    name: 'Y Transparent',
    description:
      'Fine-tunes vertical transparent (counter) heights. Adjusts the internal white space of letters vertically.',
  },
  XOPQ: {
    name: 'X Opaque',
    description:
      'Controls the thickness of vertical strokes (horizontal black). Adjusts stroke weight on the x-axis independently.',
  },
  YOPQ: {
    name: 'Y Opaque',
    description:
      'Controls the thickness of horizontal strokes (vertical black). Adjusts stroke weight on the y-axis independently.',
  },
  YTLC: {
    name: 'Y Transparent LC',
    description:
      'Controls the x-height (lowercase counter height). Allows fine-tuning of lowercase letter proportions.',
  },
  YTUC: {
    name: 'Y Transparent UC',
    description:
      'Controls the cap height. Allows fine-tuning of uppercase letter proportions independently from the x-height.',
  },
  YTAS: {
    name: 'Y Transparent Ascender',
    description:
      'Controls the ascender height. Adjusts how far lowercase letters like b, d, h extend above the x-height.',
  },
  YTDE: {
    name: 'Y Transparent Descender',
    description:
      'Controls the descender depth. Adjusts how far lowercase letters like g, p, y extend below the baseline.',
  },
  YTFI: {
    name: 'Y Transparent Figure Height',
    description:
      'Controls the height of figures (numbers). Useful for switching between lining and oldstyle figure heights.',
  },
};

export function getAxisInfo(tag: string, fvarName?: string): AxisDescription {
  const known = AXIS_DESCRIPTIONS[tag];
  if (known) return known;
  return {
    name: fvarName ?? tag,
    description: `Custom axis "${fvarName ?? tag}". Adjust to explore how this axis affects the font's appearance.`,
  };
}
