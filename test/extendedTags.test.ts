import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifySerifs, extendedTagsFor, measureSerifs, resolveCategory, scanRuns, pathToPolygons } from '../src/lib/extendedTags.ts';
import type { StoredFontMeta } from '../src/types/index.ts';

// Synthetic "H" outlines in SVG coordinates (y down, baseline at 0, cap line at -1000).
// Stems are 100 wide; the crossbar is at y -450..-550.
const stems = (foot: string, cap: string) =>
  `M0 0${foot}L0-1000${cap}L100-1000L100-550L400-550L400-1000L500-1000L500 0L400 0L400-450L100-450L100 0Z`;

const SANS_H = { d: stems('', ''), advWidth: 500 };
// Hairline serifs: 20 units thick, 100 units out on the left of the left stem.
const SERIF_H = {
  d: 'M-100 0L200 0L200-20L100-20L100-450L400-450L400-20L300-20L300 0L600 0L600-20L500-20L500-980L600-980L600-1000L300-1000L300-980L400-980L400-550L100-550L100-980L200-980L200-1000L-100-1000L-100-980L0-980L0-20L-100-20Z',
  advWidth: 600,
};
// Slab serifs: 80 units thick, no bracket.
const SLAB_H = { d: SERIF_H.d.replace(/-20(?=[LZ])/g, '-80').replace(/-980/g, '-920'), advWidth: 600 };

const font = (extra: Partial<StoredFontMeta>) => ({ id: 'x', familyName: 'X', ...extra }) as StoredFontMeta;

test('scanRuns returns the filled spans of a closed outline', () => {
  const runs = scanRuns(pathToPolygons(SANS_H.d), -300);
  assert.deepEqual(runs, [[0, 100], [400, 500]]);
});

test('scanRuns merges overlapping contours (nonzero winding)', () => {
  const twoSquares = 'M0 0L0-100L100-100L100 0ZM50 0L50-100L150-100L150 0Z';
  assert.deepEqual(scanRuns(pathToPolygons(twoSquares), -50), [[0, 150]]);
});

test('a plain H is sans', () => {
  assert.equal(classifySerifs(SANS_H), 'sans');
});

test('thin serifs are serif, not slab', () => {
  const m = measureSerifs(SERIF_H)!;
  assert.ok(m.foot > 2.5, `foot ${m.foot}`);
  assert.equal(classifySerifs(SERIF_H), 'serif');
});

test('thick unbracketed serifs are slab', () => {
  assert.equal(classifySerifs(SLAB_H), 'slab');
});

test('a missing outline gives no result', () => {
  assert.equal(classifySerifs(undefined), null);
  assert.equal(classifySerifs({ d: 'M0 0L10 0Z', advWidth: 10 }), null);
});

test('extended tags correct a serif font that the metadata calls sans', () => {
  assert.deepEqual(extendedTagsFor({ category: 'sans-serif', glyphSvgs: { H: SLAB_H } }), { category: 'serif', slab: true });
});

test('extended tags keep display, script and monospace from the metadata', () => {
  for (const category of ['display', 'script', 'monospace'] as const) {
    assert.deepEqual(extendedTagsFor({ category, glyphSvgs: { H: SERIF_H } }), { category, slab: false });
  }
});

test('resolveCategory: the override wins, metadata mode ignores the outline', () => {
  const f = font({ category: 'sans-serif', glyphSvgs: { H: SERIF_H } });
  assert.deepEqual(resolveCategory(f, [f], false), { category: 'sans-serif', slab: false, origin: 'metadata' });
  assert.deepEqual(resolveCategory(f, [f], true), { category: 'serif', slab: false, origin: 'analysis' });
  const o = { ...f, categoryOverride: 'display' as const };
  assert.equal(resolveCategory(o, [o], true).origin, 'override');
});

test('resolveCategory uses precomputed tags when outlines are stripped', () => {
  const f = font({ category: 'sans-serif', extendedTags: { category: 'serif', slab: true } });
  assert.deepEqual(resolveCategory(f, [f], true), { category: 'serif', slab: true, origin: 'analysis' });
});

test('resolveCategory takes the outline from another font of the family', () => {
  const a = font({ id: 'a', category: 'sans-serif' });
  const b = font({ id: 'b', category: 'sans-serif', glyphSvgs: { H: SERIF_H } });
  assert.equal(resolveCategory(a, [a, b], true).category, 'serif');
});
