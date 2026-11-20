import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fontScales, spreadLabels } from '../src/lib/compareLayout.ts';
import { binValues, histogramPath } from '../src/lib/histogram.ts';

test('fontScales gives pixels for each unit, and can match x-heights', () => {
  const list = [{ upm: 1000, xHeight: 500 }, { upm: 2000, xHeight: 800 }];
  assert.deepEqual(fontScales(list, 100, false), [0.1, 0.05]);
  const [a, b] = fontScales(list, 100, true);
  assert.equal(a * 500, 50);
  assert.ok(Math.abs(b * 800 - 50) < 1e-9);
  assert.deepEqual(fontScales([], 100, true), []);
});

test('spreadLabels keeps a minimum gap and sorts from top to bottom', () => {
  const out = spreadLabels([{ name: 'base', y: 100 }, { name: 'x', y: 40 }, { name: 'cap', y: 35 }], 14);
  assert.deepEqual(out.map((l) => [l.name, l.ly]), [['cap', 35], ['x', 49], ['base', 100]]);
});

test('binValues puts the maximum in the last bin', () => {
  assert.deepEqual(binValues([0, 0.5, 1, 1], 0, 1, 4), [1, 0, 1, 2]);
  assert.deepEqual(binValues([3, 3], 3, 3, 2), [2, 0]);
});

test('histogramPath closes the area on the base line', () => {
  assert.equal(histogramPath([0, 2], 10, 10), 'M0,10L0.0,10.0L10.0,2.0L10,10Z');
  assert.equal(histogramPath([], 10, 10), '');
});
