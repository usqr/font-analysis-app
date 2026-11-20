import type { StoredFontMeta } from '../../types';
import { groupByWidth, weightLabel, widthQualifier } from '../../lib/fontFamilies';

/** Width, weight and slant selects that open another font of the same family. */
export function FamilyNav({ members, current, onOpen }: { members: StoredFontMeta[]; current: StoredFontMeta; onOpen: (id: string) => void }) {
  if (members.length <= 1) return null;
  const groups = groupByWidth(members);
  const widthKeys = Array.from(groups.keys());
  const width = widthQualifier(current) || 'Default';
  const group = groups.get(width) ?? { normal: [], italic: [] };
  const italic = current.style !== 'normal';
  const weights = italic ? group.italic : group.normal;
  const sameWeight = (list: StoredFontMeta[]) => (list.find((f) => f.weight === current.weight) ?? list[0])?.id;
  const open = (id: string | undefined) => { if (id) onOpen(id); };

  return (
    <div className="family-nav" data-testid="family-nav">
      {widthKeys.length > 1 && (
        <select
          className="select" aria-label="Width" value={width} data-testid="family-width-select"
          onChange={(e) => {
            const g = groups.get(e.target.value);
            if (g) open(sameWeight(italic && g.italic.length ? g.italic : g.normal));
          }}
        >
          {widthKeys.map((k) => <option key={k} value={k}>{k === 'Default' ? 'Normal width' : k}</option>)}
        </select>
      )}
      <select className="select" aria-label="Weight" value={current.id} data-testid="family-weight-select" onChange={(e) => open(e.target.value)}>
        {weights.map((f) => <option key={f.id} value={f.id}>{weightLabel(f.weight)}</option>)}
      </select>
      {group.normal.length > 0 && group.italic.length > 0 && (
        <div className="seg" role="group" aria-label="Slant" data-testid="family-style-toggle">
          <button type="button" aria-pressed={!italic} onClick={() => open(sameWeight(group.normal))}>Upright</button>
          <button type="button" aria-pressed={italic} onClick={() => open(sameWeight(group.italic))}>Italic</button>
        </div>
      )}
    </div>
  );
}
