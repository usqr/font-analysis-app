import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareGroups, compareLabel, familyFaces, stylePool, styleName, variationSettings, weightStops,
} from '../src/lib/familyFaces.ts';
import { compareParam, entryKey, parseCompareParam, setEntry, toggleEntry } from '../src/lib/compareEntries.ts';
import type { StoredFontMeta, VariableAxis } from '../src/types/index.ts';

const axis = (tag: string, minValue: number, maxValue: number, defaultValue = minValue): VariableAxis =>
  ({ tag, minValue, maxValue, defaultValue });
const font = (id: string, extra: Partial<StoredFontMeta> = {}) =>
  ({ id, familyName: 'Fam', weight: 400, style: 'normal', ...extra }) as StoredFontMeta;

const vfUpright = font('up', { isVariable: true, variableAxes: [axis('wght', 100, 900, 400), axis('opsz', 9, 144, 14)] });
const vfItalic = font('it', { style: 'italic', isVariable: true, variableAxes: [axis('wght', 100, 900, 400)] });

test('a variable family uses its upright file and a separate italic file', () => {
  const faces = familyFaces([vfItalic, vfUpright]);
  assert.equal(faces.variable, true);
  assert.equal(faces.upright.id, 'up');
  assert.equal(faces.italicVf?.id, 'it');
  assert.deepEqual(faces.otherAxes.map((a) => a.tag), ['opsz']);
  assert.equal(faces.canItalic, true);
  assert.equal(faces.oblique, false);
});

test('a slnt axis makes an oblique, and wght and slnt are not "other" axes', () => {
  const rec = font('rec', { isVariable: true, variableAxes: [axis('wght', 300, 1000), axis('slnt', -15, 0, 0), axis('MONO', 0, 1)] });
  const faces = familyFaces([rec]);
  assert.equal(faces.slantAxis?.tag, 'slnt');
  assert.equal(faces.oblique, true);
  assert.equal(faces.canItalic, true);
  assert.deepEqual(faces.otherAxes.map((a) => a.tag), ['MONO']);
});

test('a static family uses its regular file', () => {
  const faces = familyFaces([font('b', { weight: 700 }), font('r'), font('i', { style: 'italic' })]);
  assert.equal(faces.variable, false);
  assert.equal(faces.upright.id, 'r');
  assert.equal(faces.canItalic, true);
  assert.deepEqual(faces.axes, []);
});

test('stylePool falls back to the other slant', () => {
  const group = { normal: [font('n')], italic: [] };
  assert.deepEqual(stylePool(group, true).map((f) => f.id), ['n']);
  assert.deepEqual(stylePool(undefined, false), []);
});

test('weightStops gives the hundreds inside the range', () => {
  assert.deepEqual(weightStops(axis('wght', 250, 640)), [300, 400, 500, 600]);
  assert.deepEqual(weightStops(axis('wght', 410, 450, 420)), [420]);
});

test('variationSettings sets the slant axis only without a separate italic file', () => {
  const rec = familyFaces([font('rec', { isVariable: true, variableAxes: [axis('wght', 300, 1000, 400), axis('slnt', -15, 0, 0)] })]);
  assert.equal(variationSettings(rec, { wght: 700 }, true), "'wght' 700, 'slnt' -15");
  assert.equal(variationSettings(rec, {}, false), "'wght' 400, 'slnt' 0");
  const ital = familyFaces([font('x', { isVariable: true, variableAxes: [axis('ital', 0, 1, 0)] })]);
  assert.equal(variationSettings(ital, {}, true), "'ital' 1");
  const sep = familyFaces([vfUpright, vfItalic]);
  assert.equal(variationSettings(sep, { opsz: 72 }, true), "'wght' 400, 'opsz' 72");
});

test('compareLabel names the weight and the slant', () => {
  assert.equal(compareLabel('Fraunces', null, false, false), 'Fraunces');
  assert.equal(compareLabel('Fraunces', 700, false, false), 'Fraunces Bold');
  assert.equal(compareLabel('Fraunces', 400, true, false), 'Fraunces Italic');
  assert.equal(compareLabel('Recursive', 300, true, true), 'Recursive Light Oblique');
});

test('compareGroups lists weights of the variable files', () => {
  const groups = compareGroups(familyFaces([vfUpright, vfItalic]), 'Fam', 'Default');
  assert.deepEqual(groups.map((g) => g.legend), ['Upright', 'Italic']);
  assert.equal(groups[0].options.length, 9);
  assert.deepEqual(groups[1].options[0], { fontId: 'it', wght: 100, weight: 100, label: 'Fam Thin Italic' });
});

test('compareGroups lists the static files of the selected width', () => {
  const fonts = [
    font('r'), font('b', { weight: 700 }),
    font('c', { familyName: 'Fam Condensed', preferredFamilyName: 'Fam Condensed' }),
  ];
  const faces = familyFaces(fonts);
  const groups = compareGroups(faces, 'Fam', 'Default');
  assert.deepEqual(groups.map((g) => g.legend), ['Weights']);
  assert.deepEqual(groups[0].options.map((o) => o.fontId), ['r', 'b']);
});

test('styleName adds a width that is not the default', () => {
  assert.equal(styleName('Saira', 'Default'), 'Saira');
  assert.equal(styleName('Saira', 'Condensed'), 'Saira Condensed');
});

test('the compare parameter keeps weights of variable files', () => {
  assert.equal(entryKey({ fontId: 'a' }), 'a');
  assert.equal(compareParam([{ fontId: 'a' }, { fontId: 'b', wght: 700 }]), 'a,b@700');
  assert.deepEqual(parseCompareParam('a, b@700,,a,c@x,d@'), [{ fontId: 'a' }, { fontId: 'b', wght: 700 }, { fontId: 'c' }, { fontId: 'd' }]);
  assert.deepEqual(parseCompareParam(null), []);
});

test('setEntry and toggleEntry keep one entry for each key', () => {
  const e = { key: 'a@700', fontId: 'a', wght: 700, family: 'A', label: 'A Bold' };
  const one = toggleEntry([], e);
  assert.deepEqual(one, [e]);
  assert.equal(setEntry(one, e, true), one);
  assert.deepEqual(toggleEntry(one, e), []);
});
