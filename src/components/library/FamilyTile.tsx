import { memo, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import type { FontFamily, VariableAxis } from '../../types';
import type { ResolvedCategory } from '../../lib/extendedTags';
import { uniqueSortedWeights } from '../../lib/fontFamilies';
import { useFontFace } from '../../lib/useFontFace';
import { getAxisInfo } from '../../lib/axisDescriptions';
import { CAT_COLOR, CAT_LABELS, catKeyOf, type CatKey } from '../../lib/libraryFilters';
import {
  compareGroups, familyFaces, styleName, stylePool, variationSettings,
  type CompareGroup, type FamilyFaces,
} from '../../lib/familyFaces';
import { Icon } from '../ui/Icon';

export type TileMenu = 'cat' | 'cmp';

export interface FamilyTileProps {
  family: FontFamily;
  resolved?: ResolvedCategory;
  starred: boolean;
  bulk: boolean;
  selected: boolean;
  /** The menu that is open from this tile, if any. */
  menu?: TileMenu;
  cmpCount: number;
  onOpen: (fontId: string) => void;
  onToggleStar: (family: FontFamily) => void;
  onToggleSelect: (familyName: string) => void;
  onCategoryMenu: (anchor: HTMLElement, family: FontFamily) => void;
  /** `name` is the family name with the selected width. */
  onCompare: (anchor: HTMLElement, family: FontFamily, name: string, groups: CompareGroup[]) => void;
}

const SOURCE_LABEL = { local: 'Local', google: 'Google', both: 'Local + Google' };

const pct = (v: number, min: number, max: number) => `${((v - min) / (max - min || 1)) * 100}%`;
const axisStep = (a: VariableAxis) => (a.maxValue - a.minValue > 10 ? 1 : 0.01);
const fmtAxis = (a: VariableAxis, v: number) => (axisStep(a) < 1 ? v.toFixed(2) : String(Math.round(v)));
const axisName = (a: VariableAxis) => `${getAxisInfo(a.tag, a.name).name} · ${a.tag}`;

function nearest(list: number[], v: number): number {
  return list.reduce((best, x) => (Math.abs(x - v) < Math.abs(best - v) ? x : best), list[0] ?? v);
}

function sourceKind(family: FontFamily): keyof typeof SOURCE_LABEL {
  const s = family.sources ?? [family.source ?? 'local'];
  if (s.includes('local') && s.includes('google')) return 'both';
  return s.includes('google') ? 'google' : 'local';
}

function Ctl({ head, children }: { head: ReactNode; children?: ReactNode }) {
  return <div className="ctl"><div className="ctl-head">{head}</div>{children}</div>;
}

function Slider({ min, max, step, value, label, valueText, onChange }: {
  min: number; max: number; step: number; value: number; label: string; valueText?: string;
  onChange: (v: number) => void;
}) {
  return (
    <input
      className="slider" type="range" min={min} max={max} step={step} value={value}
      style={{ '--p': pct(value, min, max) } as CSSProperties}
      aria-label={label} aria-valuetext={valueText}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

interface TileControls {
  faces: FamilyFaces;
  name: string;
  axisValues: Record<string, number>;
  setAxis: (tag: string, v: number) => void;
}

function VariableWeight({ faces, name, axisValues, setAxis }: TileControls) {
  const a = faces.wghtAxis;
  if (!a) return <Ctl head={<><span className="ctl-label">Weight</span><span className="ctl-val">400 · fixed</span></>} />;
  const v = axisValues.wght ?? a.defaultValue;
  return (
    <Ctl head={<><span className="ctl-label">Weight</span><output className="ctl-val">{Math.round(v)}</output></>}>
      <Slider min={a.minValue} max={a.maxValue} step={1} value={v} label={`Weight of ${name}`} onChange={(x) => setAxis('wght', x)} />
    </Ctl>
  );
}

function VariableAxisRow({ faces, name, axisValues, setAxis, axisTag, setAxisTag }: TileControls & {
  axisTag: string; setAxisTag: (t: string) => void;
}) {
  const others = faces.otherAxes;
  const a = others.find((x) => x.tag === axisTag) ?? others[0];
  if (!a) return null;
  const v = axisValues[a.tag] ?? a.defaultValue;
  const slider = (
    <Slider min={a.minValue} max={a.maxValue} step={axisStep(a)} value={v} label={`${axisName(a)} axis of ${name}`} onChange={(x) => setAxis(a.tag, x)} />
  );
  const out = <output className="ctl-val">{fmtAxis(a, v)}</output>;
  if (others.length === 1) return <Ctl head={<><span className="ctl-label" title={axisName(a)}>{axisName(a)}</span>{out}</>}>{slider}</Ctl>;
  return (
    <Ctl head={<><span className="ctl-label">Axis</span>{out}</>}>
      <select className="select full axis-sel" value={a.tag} onChange={(e) => setAxisTag(e.target.value)} aria-label={`Axis of ${name}`}>
        {others.map((x) => <option key={x.tag} value={x.tag}>{axisName(x)}</option>)}
      </select>
      {slider}
    </Ctl>
  );
}

function StaticWeight({ name, weights, weight, setWeight }: { name: string; weights: number[]; weight: number; setWeight: (w: number) => void }) {
  if (weights.length <= 1) {
    return <Ctl head={<><span className="ctl-label">Weight</span><span className="ctl-val">{weights[0] ?? weight} only</span></>} />;
  }
  const i = Math.max(0, weights.indexOf(weight));
  return (
    <Ctl head={<><span className="ctl-label">Weight</span><output className="ctl-val">{weight}</output></>}>
      <Slider min={0} max={weights.length - 1} step={1} value={i} label={`Weight of ${name}`} valueText={String(weight)} onChange={(x) => setWeight(weights[x])} />
      <div className="ticks" aria-hidden="true">{weights.map((w) => <span key={w} />)}</div>
    </Ctl>
  );
}

function StaticWidth({ name, widthKeys, widthKey, setWidthKey }: { name: string; widthKeys: string[]; widthKey: string; setWidthKey: (k: string) => void }) {
  if (widthKeys.length <= 1) return <Ctl head={<><span className="ctl-label">Width</span><span className="ctl-val">normal</span></>} />;
  return (
    <Ctl head={<span className="ctl-label">Width</span>}>
      <select className="select full" value={widthKey} onChange={(e) => setWidthKey(e.target.value)} aria-label={`Width of ${name}`}>
        {widthKeys.map((k) => <option key={k} value={k}>{k === 'Default' ? 'normal' : k}</option>)}
      </select>
    </Ctl>
  );
}

function TileMeta({ family, faces, cat, fromAnalysis }: { family: FontFamily; faces: FamilyFaces; cat?: CatKey; fromAnalysis: boolean }) {
  const n = faces.variable ? faces.axes.length : family.fonts.length;
  const count = faces.variable ? `${n} ${n === 1 ? 'axis' : 'axes'}` : `${n} ${n === 1 ? 'style' : 'styles'}`;
  return (
    <span className="tile-meta">
      <span className="cat-dot" style={{ '--c': cat ? CAT_COLOR[cat] : undefined } as CSSProperties} />
      <span>
        {cat ? CAT_LABELS[cat].short : 'Untagged'}
        {fromAnalysis && <><span className="ast" aria-hidden="true">*</span><span className="sr"> (from outline analysis)</span></>}
      </span>
      <span className="sep" aria-hidden="true">·</span>
      <span>{count}</span>
      {faces.variable && <><span className="sep" aria-hidden="true">·</span><span>VF</span></>}
    </span>
  );
}

function FamilyTileImpl(props: FamilyTileProps) {
  const { family, resolved, starred, bulk, selected, menu, cmpCount, onOpen, onToggleStar, onToggleSelect, onCategoryMenu, onCompare } = props;
  const faces = useMemo(() => familyFaces(family.fonts), [family.fonts]);
  const [italic, setItalic] = useState(false);
  const [widthPick, setWidthPick] = useState(faces.widthKeys[0] ?? 'Default');
  const [weightPick, setWeightPick] = useState(faces.upright.weight);
  const [axisValues, setAxisValues] = useState<Record<string, number>>(() => Object.fromEntries(faces.axes.map((a) => [a.tag, a.defaultValue])));
  const [axisTag, setAxisTag] = useState(faces.otherAxes[0]?.tag ?? '');
  const setAxis = (tag: string, v: number) => setAxisValues((prev) => ({ ...prev, [tag]: v }));

  const widthKey = faces.widthKeys.includes(widthPick) ? widthPick : (faces.widthKeys[0] ?? 'Default');
  const pool = stylePool(faces.groups.get(widthKey), italic);
  const weights = uniqueSortedWeights(pool);
  const weight = nearest(weights, weightPick);
  const current = faces.variable
    ? (italic && faces.italicVf ? faces.italicVf : faces.upright)
    : (pool.find((f) => f.weight === weight) ?? faces.upright);
  const { fontFamily, ref } = useFontFace(current.id);

  const name = family.familyName;
  const shownName = styleName(name, faces.variable ? 'Default' : widthKey);
  const groups = useMemo(() => compareGroups(faces, shownName, widthKey), [faces, shownName, widthKey]);
  const multi = groups.reduce((n, g) => n + g.options.length, 0) > 1;
  const cat = catKeyOf(resolved);
  const catLabel = cat ? CAT_LABELS[cat].short : 'Untagged';
  const fromAnalysis = resolved?.origin === 'analysis';
  const controls: TileControls = { faces, name, axisValues, setAxis };

  const specimenStyle: CSSProperties = {
    fontFamily: fontFamily ? `'${fontFamily}', var(--font-ui)` : undefined,
    fontVariationSettings: faces.variable && fontFamily ? variationSettings(faces, axisValues, italic) : undefined,
  };

  return (
    <article
      ref={ref}
      className={`tile${selected ? ' is-selected' : ''}${menu ? ' is-active' : ''}`}
      data-testid="grid-card"
    >
      <div className="tile-top">
        <button
          type="button"
          className={`icon-btn star${starred ? ' is-on' : ''}`}
          aria-pressed={starred}
          aria-label={`Star ${name}`}
          onClick={() => onToggleStar(family)}
        >
          <Icon name="star" />
        </button>
        {bulk && (
          <input className="bulk-check" type="checkbox" checked={selected} onChange={() => onToggleSelect(name)} aria-label={`Select ${name}`} />
        )}
        <span className="grow" />
        {cmpCount > 0 && <span className="cmp-flag" title="In compare"><Icon name="compare" /><span>{cmpCount}</span></span>}
        <span className="src">{SOURCE_LABEL[sourceKind(family)]}</span>
      </div>
      <button type="button" className="tile-open" onClick={() => (bulk ? onToggleSelect(name) : onOpen(current.id))}>
        <span className={`specimen${fontFamily ? '' : ' is-loading'}`} aria-hidden="true" style={specimenStyle} data-testid="grid-card-preview">Aa</span>
        <span className="tile-text">
          <span className="tile-name od-truncate">{name}</span>
          <TileMeta family={family} faces={faces} cat={cat} fromAnalysis={fromAnalysis} />
        </span>
      </button>
      <div className="tile-panel">
        {faces.variable
          ? <VariableWeight {...controls} />
          : <StaticWeight name={name} weights={weights} weight={weight} setWeight={setWeightPick} />}
        {faces.variable
          ? <VariableAxisRow {...controls} axisTag={axisTag} setAxisTag={setAxisTag} />
          : <StaticWidth name={name} widthKeys={faces.widthKeys} widthKey={widthKey} setWidthKey={setWidthPick} />}
        <button
          type="button"
          className="mini-btn cat-btn"
          aria-haspopup="menu"
          aria-expanded={menu === 'cat'}
          aria-label={`Set category of ${name}, now ${catLabel}`}
          onClick={(e) => onCategoryMenu(e.currentTarget, family)}
        >
          <span className="cat-dot" style={{ '--c': cat ? CAT_COLOR[cat] : undefined } as CSSProperties} />
          <span>{catLabel}{fromAnalysis ? '*' : ''}</span>
          <Icon name="chev" />
        </button>
        <div className="ctl-actions">
          {faces.canItalic && (
            <button type="button" className="mini-btn ital-btn" aria-pressed={italic} onClick={() => setItalic((v) => !v)}>
              {faces.oblique ? 'Oblique' : 'Italic'}
            </button>
          )}
          <button
            type="button"
            className={`mini-btn cmp-btn${cmpCount && multi ? ' has-count' : ''}`}
            aria-haspopup={multi ? 'dialog' : undefined}
            aria-expanded={multi ? menu === 'cmp' : undefined}
            aria-pressed={multi ? undefined : cmpCount > 0}
            aria-label={`Add ${shownName} to compare`}
            title="Compare"
            onClick={(e) => onCompare(e.currentTarget, family, shownName, groups)}
          >
            <Icon name="compare" />
            <span className="cmp-label">Compare</span>
            <span className="cmp-n">{cmpCount || ''}</span>
          </button>
        </div>
      </div>
    </article>
  );
}

export const FamilyTile = memo(FamilyTileImpl);
