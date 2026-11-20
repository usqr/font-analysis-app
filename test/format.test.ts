import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pctOf, signedInt } from '../src/lib/format.ts';

test('signedInt rounds and uses a typographic minus', () => {
  assert.equal(signedInt(-212.4), '−212');
  assert.equal(signedInt(-0.4), '0');
  assert.equal(signedInt(731.6), '732');
});

test('pctOf gives the position in the range, and 0% for an empty range', () => {
  assert.equal(pctOf(150, 100, 200), '50%');
  assert.equal(pctOf(5, 5, 5), '0%');
});
