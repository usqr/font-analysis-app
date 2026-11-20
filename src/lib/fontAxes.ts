// Variable axes from the `fvar` table of a parsed font.
import type { Font } from 'opentype.js';
import type { VariableAxis } from '../types';

interface FvarAxis {
  tag: string;
  minValue: number;
  defaultValue: number;
  maxValue: number;
  name?: string | { en?: string };
}

export function readAxes(font: Font): VariableAxis[] {
  const axes = (font.tables.fvar as { axes?: FvarAxis[] } | undefined)?.axes ?? [];
  return axes.map((a) => ({
    tag: a.tag,
    minValue: a.minValue,
    defaultValue: a.defaultValue,
    maxValue: a.maxValue,
    name: typeof a.name === 'object' ? a.name?.en : a.name,
  }));
}
