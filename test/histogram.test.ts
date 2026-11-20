import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapToExtent } from '../src/lib/histogram.ts';

test('snapToExtent moves values near the ends to the ends', () => {
  const [min, max] = [0.1, 0.7];
  const step = (max - min) / 100;
  // The last step of a range input can stop just below the maximum.
  assert.equal(snapToExtent(min + 99.99 * step, min, max, step), max);
  assert.equal(snapToExtent(min + 0.01 * step, min, max, step), min);
  assert.equal(snapToExtent(0.4, min, max, step), 0.4);
});
