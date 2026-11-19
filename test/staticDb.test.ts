import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveFontPaths, stripForWeb } from '../server/staticDb.ts';
import type { StoredFont } from '../server/database.ts';

const font = (filePath: string, extra: Partial<StoredFont> = {}) => ({ id: filePath, filePath, ...extra }) as StoredFont;

test('keeps fonts whose path exists', () => {
  const r = resolveFontPaths([font('ofl/a/A.ttf')], ['ofl/a/A.ttf']);
  assert.deepEqual(r.fonts.map((f) => f.filePath), ['ofl/a/A.ttf']);
  assert.equal(r.remapped.length, 0);
  assert.equal(r.dropped.length, 0);
});

test('remaps a file that moved to another license folder', () => {
  const r = resolveFontPaths([font('apache/arimo/Arimo[wght].ttf')], ['ofl/arimo/Arimo[wght].ttf']);
  assert.equal(r.fonts[0].filePath, 'ofl/arimo/Arimo[wght].ttf');
  assert.deepEqual(r.remapped, [{ from: 'apache/arimo/Arimo[wght].ttf', to: 'ofl/arimo/Arimo[wght].ttf' }]);
});

test('uses the family folder when the file name is not unique', () => {
  const r = resolveFontPaths([font('apache/x/Regular.ttf')], ['ofl/x/Regular.ttf', 'ofl/y/Regular.ttf']);
  assert.equal(r.fonts[0].filePath, 'ofl/x/Regular.ttf');
});

test('drops fonts with no match', () => {
  const r = resolveFontPaths([font('ofl/grenze/Grenze-Bold.ttf')], ['ofl/grenze/Grenze[wght].ttf']);
  assert.equal(r.fonts.length, 0);
  assert.deepEqual(r.dropped, ['ofl/grenze/Grenze-Bold.ttf']);
});

test('stripForWeb removes glyph SVGs and keeps the rest', () => {
  const out = stripForWeb(font('ofl/a/A.ttf', { glyphSvgs: { A: { d: 'M0 0', advWidth: 1 } }, weight: 400 }));
  assert.equal('glyphSvgs' in out, false);
  assert.equal(out.weight, 400);
});

test('stripForWeb keeps the extended tags that need the stripped outlines', () => {
  const H = { d: 'M0 0L0-1000L100-1000L100-550L400-550L400-1000L500-1000L500 0L400 0L400-450L100-450L100 0Z', advWidth: 500 };
  const out = stripForWeb(font('ofl/a/A.ttf', { category: 'serif', glyphSvgs: { H } }));
  assert.equal(out.glyphSvgs, undefined);
  assert.deepEqual(out.extendedTags, { category: 'sans-serif', slab: false });
});
