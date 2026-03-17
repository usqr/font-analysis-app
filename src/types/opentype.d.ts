declare module 'opentype.js' {
  export interface Font {
    names: {
      fontFamily?: { en: string };
      fontSubfamily?: { en: string };
      [key: string]: { en: string } | undefined;
    };
    unitsPerEm: number;
    ascender: number;
    descender: number;
    glyphs: { length: number; get(index: number): Glyph };
    charToGlyph(char: string): Glyph;
    getPath(text: string, x: number, y: number, fontSize: number, options?: object): Path;
    getAdvanceWidth(text: string, fontSize: number, options?: object): number;
    stringToGlyphs(str: string): Glyph[];
    tables: Record<string, any>;
  }

  export interface Glyph {
    name: string;
    unicode: number;
    index: number;
    advanceWidth: number | undefined;
    xMin: number;
    yMin: number;
    xMax: number;
    yMax: number;
    path: Path;
    getPath(x: number, y: number, fontSize: number, options?: object, font?: Font): Path;
    getBoundingBox(): BoundingBox;
    draw(ctx: CanvasRenderingContext2D, x: number, y: number, fontSize: number, options?: object, font?: Font): void;
  }

  export interface BoundingBox {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }

  export interface Path {
    commands: PathCommand[];
    fill: string | null;
    stroke: string | null;
    strokeWidth: number;
    draw(ctx: CanvasRenderingContext2D): void;
    getBoundingBox(): BoundingBox;
    toPathData(decimalPlaces?: number): string;
    toSVG(options?: object): string;
  }

  export type PathCommand =
    | { type: 'M'; x: number; y: number }
    | { type: 'L'; x: number; y: number }
    | { type: 'Q'; x: number; y: number; x1: number; y1: number }
    | { type: 'C'; x: number; y: number; x1: number; y1: number; x2: number; y2: number }
    | { type: 'Z' };

  export function parse(buffer: ArrayBuffer, options?: object): Font;
  export function load(url: string, callback?: (err: Error | null, font?: Font) => void): Promise<Font>;
}
