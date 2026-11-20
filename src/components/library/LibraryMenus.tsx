import type { CSSProperties } from 'react';
import type { FontCategory } from '../../types';
import { CAT_COLOR, CAT_LABELS } from '../../lib/libraryFilters';
import { entryKey } from '../../lib/compareEntries';
import type { CompareGroup, CompareOption } from '../../lib/familyFaces';
import { Icon } from '../ui/Icon';
import { Popover } from '../ui/Popover';

/** Categories that a user can set. "Slab" comes only from the outline analysis. */
const SETTABLE: FontCategory[] = ['serif', 'sans-serif', 'monospace', 'display', 'script'];

export function CategoryMenu({ anchor, title, current, onPick, onClose }: {
  anchor: HTMLElement;
  title: string;
  current?: FontCategory;
  onPick: (cat: FontCategory) => void;
  onClose: () => void;
}) {
  return (
    <Popover anchor={anchor} onClose={onClose} role="menu" label="Set category">
      <p className="menu-title">{title}</p>
      {SETTABLE.map((c) => (
        <button key={c} type="button" className="menu-item" role="menuitemradio" aria-checked={c === current} onClick={() => onPick(c)}>
          <span className="cat-dot" style={{ '--c': CAT_COLOR[c] } as CSSProperties} />
          {CAT_LABELS[c].long}
          {c === current && <Icon name="check" />}
        </button>
      ))}
    </Popover>
  );
}

export function CompareMenu({ anchor, name, groups, selected, onToggle, onSetAll, onClose }: {
  anchor: HTMLElement;
  name: string;
  groups: CompareGroup[];
  selected: Set<string>;
  onToggle: (option: CompareOption, on: boolean) => void;
  onSetAll: (on: boolean) => void;
  onClose: () => void;
}) {
  return (
    <Popover anchor={anchor} onClose={onClose} role="dialog" label="Add styles to compare">
      <p className="menu-title">{name}</p>
      <p className="menu-sub">Select styles to compare</p>
      {groups.map((g) => (
        <fieldset key={g.legend} className="wset">
          <legend>{g.legend}</legend>
          <div className="wgrid">
            {g.options.map((o) => {
              const key = entryKey(o);
              return (
                <label key={key} className="wchk" title={o.label}>
                  <input type="checkbox" checked={selected.has(key)} onChange={(e) => onToggle(o, e.target.checked)} aria-label={o.label} />
                  <span>{o.weight}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
      <div className="pop-foot">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onSetAll(true)}>Select all</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onSetAll(false)}>Clear</button>
      </div>
    </Popover>
  );
}
