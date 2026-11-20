import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Font } from 'opentype.js';
import type { FullAnalysis } from '../src/types/index.ts';
import { extractRawMetadata } from '../src/lib/rawMetadata.ts';
import { summaryStats } from '../src/lib/summaryStats.ts';
import { readAxes } from '../src/lib/fontAxes.ts';

const font = (names: Record<string, string>, tables: Record<string, unknown>) =>
  ({ names: Object.fromEntries(Object.entries(names).map(([k, v]) => [k, { en: v }])), tables }) as unknown as Font;

test('extractRawMetadata formats the table values and skips empty sections', () => {
  const sections = extractRawMetadata(font(
    { fontFamily: 'Inter', license: 'x'.repeat(130) },
    {
      os2: { usWeightClass: 400, usWidthClass: 5, sFamilyClass: 0x0801, fsType: 0x0004, panose: [2, 11] },
      head: { unitsPerEm: 2048, macStyle: 0x03 },
    },
  ));
  assert.deepEqual(sections.map((s) => s.title), ['name', 'OS/2', 'head']);
  const [name, os2, head] = sections;
  assert.equal(name.entries[1].value, `${'x'.repeat(120)}...`);
  assert.deepEqual(os2.entries.map((e) => e.value), ['400', '5 — Medium (Normal)', '8 / 1 — Sans Serif', '0x0004 — Preview & Print', '2 11']);
  assert.deepEqual(head.entries.map((e) => e.value), ['2048', 'Bold, Italic']);
});

test('extractRawMetadata shows fsType 0 as installable', () => {
  const [os2] = extractRawMetadata(font({}, { os2: { fsType: 0 }, post: {} }));
  assert.deepEqual(os2.entries, [{ label: 'fsType', value: '0x0000 — Installable' }]);
});

test('summaryStats gives the values of the active tab only', () => {
  const analysis = {
    contrastLower: null, contrastUpper: null, xHeight: null, weight: null, spacing: null,
    proportions: { glyphWidth: 512.4, glyphHeight: 700, widthToHeightRatio: 0.7319, advanceWidth: 560 },
  } as FullAnalysis;
  assert.deepEqual(summaryStats(analysis, 'proportions').map((s) => s.value), ['512u', '700u', '0.732', '560u']);
  assert.deepEqual(summaryStats(analysis, 'contrast'), []);
  assert.deepEqual(summaryStats(null, 'proportions'), []);
});

test('readAxes reads names from a string or from an English name record', () => {
  const axes = readAxes(font({}, { fvar: { axes: [
    { tag: 'wght', minValue: 100, defaultValue: 400, maxValue: 900, name: { en: 'Weight' } },
    { tag: 'wdth', minValue: 75, defaultValue: 100, maxValue: 125, name: 'Width' },
  ] } }));
  assert.deepEqual(axes.map((a) => a.name), ['Weight', 'Width']);
  assert.deepEqual(readAxes(font({}, {})), []);
});
