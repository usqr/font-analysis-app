import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_FILTERS, activeChips, catKeyOf, clearChip, matches, metricExtents, orderCounts, parseCount, rangeActive, setVf, toggleItem,
  type Extents, type FamilyFacts, type Filters,
} from '../src/lib/libraryFilters.ts';

const fam = (extra: Partial<FamilyFacts> = {}): FamilyFacts => ({
  name: 'Alegreya', starred: false, sources: ['google'], variable: true, cat: 'serif',
  styleCount: 2, axisCount: 1, scripts: new Set(['Cyrillic']), latinOnly: false,
  metrics: { contrast: 0.5, weight: 0.4, width: 1, xHeight: 0.5 },
  ...extra,
});
const f = (extra: Partial<Filters> = {}): Filters => ({ ...DEFAULT_FILTERS, ...extra });
const extents: Extents = { contrast: [0, 1], weight: [0, 1], width: [0, 2], xHeight: [0, 1] };

test('the default filters match every family', () => {
  assert.equal(matches(fam(), f(), extents), true);
  assert.equal(matches(fam({ cat: undefined, metrics: undefined }), f(), extents), true);
});

test('search ignores case and outer spaces', () => {
  assert.equal(matches(fam(), f({ search: ' aleg ' }), extents), true);
  assert.equal(matches(fam(), f({ search: 'roboto' }), extents), false);
});

test('categories match any of the selected keys', () => {
  assert.equal(matches(fam(), f({ cats: ['sans-serif', 'serif'] }), extents), true);
  assert.equal(matches(fam(), f({ cats: ['slab'] }), extents), false);
  assert.equal(matches(fam({ cat: undefined }), f({ cats: ['serif'] }), extents), false);
});

test('font type and axis counts', () => {
  assert.equal(matches(fam(), f({ vf: 'static' }), extents), false);
  assert.equal(matches(fam(), f({ vf: 'variable', axesMin: 2 }), extents), false);
  // The axes filter applies only when the type is "variable".
  assert.equal(matches(fam(), f({ vf: 'all', axesMin: 2 }), extents), true);
});

test('style counts use an open upper bound when the maximum is null', () => {
  assert.equal(matches(fam({ styleCount: 9 }), f({ stylesMin: 3 }), extents), true);
  assert.equal(matches(fam({ styleCount: 9 }), f({ stylesMax: 4 }), extents), false);
});

test('metric ranges apply only when narrower than the data, and skip families without metrics', () => {
  assert.equal(matches(fam(), f({ ranges: { contrast: [0.6, 1] } }), extents), false);
  assert.equal(matches(fam(), f({ ranges: { contrast: [0, 1] } }), extents), true);
  assert.equal(matches(fam({ metrics: undefined }), f({ ranges: { contrast: [0.6, 1] } }), extents), true);
  assert.equal(rangeActive(f({ ranges: { weight: [0, 1] } }), 'weight', extents), false);
});

test('scripts must all be present, and basic-Latin-only families can be excluded', () => {
  assert.equal(matches(fam(), f({ scripts: ['Cyrillic'] }), extents), true);
  assert.equal(matches(fam(), f({ scripts: ['Cyrillic', 'Greek'] }), extents), false);
  assert.equal(matches(fam({ latinOnly: true }), f({ excludeLatinOnly: true }), extents), false);
});

test('a change away from "variable" clears the axes filter', () => {
  const next = setVf(f({ vf: 'variable', axesMin: 3, axesMax: 5 }), 'static');
  assert.deepEqual([next.vf, next.axesMin, next.axesMax], ['static', 1, null]);
  assert.equal(setVf(f({ axesMin: 3 }), 'variable').axesMin, 3);
});

test('each active chip clears its own filter', () => {
  const all = f({
    search: 'a', starred: true, source: 'local', vf: 'variable', cats: ['serif', 'slab'],
    stylesMin: 2, axesMax: 4, ranges: { weight: [0.2, 0.8] }, excludeLatinOnly: true, scripts: ['Greek'],
  });
  const chips = activeChips(all, extents);
  assert.deepEqual(chips.map((c) => c.id), [
    'search', 'starred', 'source', 'vf', 'cat:serif', 'cat:slab', 'styles', 'axes',
    'range:weight', 'latin', 'script:Greek',
  ]);
  assert.deepEqual(chips.filter((c) => c.advanced).map((c) => c.id), ['range:weight', 'latin', 'script:Greek']);
  const cleared = chips.reduce((acc, c) => clearChip(acc, c.id), all);
  assert.deepEqual(cleared, DEFAULT_FILTERS);
});

test('a script name with a colon keeps its full name in the chip id', () => {
  const next = clearChip(f({ scripts: ['A:B', 'C'] }), 'script:A:B');
  assert.deepEqual(next.scripts, ['C']);
});

test('toggleItem adds and removes', () => {
  assert.deepEqual(toggleItem(['a'], 'b'), ['a', 'b']);
  assert.deepEqual(toggleItem(['a', 'b'], 'a'), ['b']);
});

test('metricExtents skips families without metrics', () => {
  const e = metricExtents([undefined, { contrast: 0.2, weight: 0.5, width: 1, xHeight: 0.4 }, { contrast: 0.7, weight: 0.3, width: 0.8, xHeight: 0.6 }]);
  assert.deepEqual(e.contrast, [0.2, 0.7]);
  assert.deepEqual(e.width, [0.8, 1]);
  assert.deepEqual(metricExtents([]), {});
});

test('catKeyOf turns a slab serif into "slab"', () => {
  assert.equal(catKeyOf({ category: 'serif', slab: true, origin: 'analysis' }), 'slab');
  assert.equal(catKeyOf({ category: 'display', slab: false, origin: 'metadata' }), 'display');
  assert.equal(catKeyOf(undefined), undefined);
});

test('parseCount accepts whole numbers of 1 or more only', () => {
  assert.equal(parseCount('3'), 3);
  assert.equal(parseCount('13'), 13);
  for (const bad of ['', ' ', '0', '-2', '1.5', 'abc']) assert.equal(parseCount(bad), undefined, bad);
});

test('orderCounts keeps the edited field and moves the other one', () => {
  assert.deepEqual(orderCounts(3, null, 'min'), [3, null]);
  assert.deepEqual(orderCounts(3, 5, 'min'), [3, 5]);
  assert.deepEqual(orderCounts(8, 5, 'min'), [8, 8]);
  assert.deepEqual(orderCounts(8, 5, 'max'), [5, 5]);
});
