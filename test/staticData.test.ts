import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_PREFS, addTags, allTags, applyPrefs, fontFileUrl, parsePrefs, setCategories, toggleStar,
} from '../src/lib/staticData.ts';
import type { StoredFontMeta } from '../src/types/index.ts';

const meta = (id: string, extra: Partial<StoredFontMeta> = {}) => ({ id, ...extra }) as StoredFontMeta;

test('fontFileUrl encodes brackets and uses jsDelivr for small files', () => {
  const url = fontFileUrl({ filePath: 'ofl/a/A[wght].ttf', fileSize: 1000 }, 'abc');
  assert.equal(url, 'https://cdn.jsdelivr.net/gh/google/fonts@abc/ofl/a/A%5Bwght%5D.ttf');
});

test('fontFileUrl uses raw.githubusercontent.com above 20 MB', () => {
  const url = fontFileUrl({ filePath: 'ofl/b/B.ttf', fileSize: 21 * 1024 * 1024 }, 'abc');
  assert.equal(url, 'https://raw.githubusercontent.com/google/fonts/abc/ofl/b/B.ttf');
});

test('parsePrefs returns empty prefs for missing or bad input', () => {
  assert.deepEqual(parsePrefs(null), EMPTY_PREFS);
  assert.deepEqual(parsePrefs('{not json'), EMPTY_PREFS);
  assert.deepEqual(parsePrefs('{"starred":"x"}'), EMPTY_PREFS);
});

test('toggleStar adds and removes a key', () => {
  const on = toggleStar(EMPTY_PREFS, 'roboto');
  assert.deepEqual(on.starred, ['roboto']);
  assert.deepEqual(toggleStar(on, 'roboto').starred, []);
});

test('applyPrefs sets category overrides and tags without changing the input', () => {
  const fonts = [meta('a', { category: 'serif' }), meta('b')];
  const prefs = setCategories(EMPTY_PREFS, ['a'], 'display');
  const out = applyPrefs(fonts, prefs);
  assert.equal(out[0].categoryOverride, 'display');
  assert.equal(fonts[0].categoryOverride, undefined);
  assert.equal(out[1], fonts[1]);
});

test('addTags merges with the built-in tags and drops empty tags', () => {
  const fonts = [meta('a', { tags: ['old'] })];
  const prefs = addTags(EMPTY_PREFS, fonts, ['a'], ['new', '']);
  assert.deepEqual(prefs.tags.a, ['old', 'new']);
  assert.deepEqual(allTags(applyPrefs(fonts, prefs)), ['new', 'old']);
});
