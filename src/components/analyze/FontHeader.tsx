import { useState, type CSSProperties, type ReactNode } from 'react';
import type { FontCategory, FontData, StoredFontMeta } from '../../types';
import { bulkSetCategory, toggleStarFamily } from '../../lib/api';
import { superFamilyName } from '../../lib/fontFamilies';
import { CAT_COLOR, CAT_LABELS } from '../../lib/libraryFilters';
import { CategoryMenu } from '../library/LibraryMenus';
import { Icon } from '../ui/Icon';
import { FamilyNav } from './FamilyNav';
import type { LibraryFont } from './useLibraryFont';

const categoryOf = (meta: StoredFontMeta) => meta.categoryOverride ?? meta.category ?? null;
const initial = (lib: LibraryFont) => ({ lib, starred: lib.starred, category: categoryOf(lib.meta) });

/** The star and the category of a library family. Each new load of the font resets them. */
function FamilyControls({ lib }: { lib: LibraryFont }) {
  const [state, setState] = useState(() => initial(lib));
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  if (state.lib !== lib) setState(initial(lib));
  const { starred, category } = state;

  const toggleStar = async () => {
    setState((s) => ({ ...s, starred: !s.starred }));
    try {
      await toggleStarFamily(lib.starKey);
    } catch {
      setState((s) => ({ ...s, starred: !s.starred }));
    }
  };
  const pickCategory = async (cat: FontCategory) => {
    setAnchor(null);
    const ids = lib.members.map((f) => f.id);
    if (ids.length === 0) return;
    setState((s) => ({ ...s, category: cat }));
    try {
      await bulkSetCategory(ids, cat);
    } catch {
      setState((s) => ({ ...s, category: categoryOf(lib.meta) }));
    }
  };

  return (
    <>
      <button type="button" className={`icon-btn star${starred ? ' is-on' : ''}`} aria-pressed={starred} aria-label={`Star ${superFamilyName(lib.meta)}`} onClick={toggleStar}>
        <Icon name="star" />
      </button>
      {category && (
        <button
          type="button" className="btn cat-pill" aria-haspopup="menu" aria-expanded={!!anchor}
          aria-label={`Set category, now ${CAT_LABELS[category].long}`} data-testid="analyze-category-badge"
          onClick={(e) => setAnchor(e.currentTarget)}
        >
          <span className="cat-dot" style={{ '--c': CAT_COLOR[category] } as CSSProperties} />
          {CAT_LABELS[category].long}
          <Icon name="chev" />
        </button>
      )}
      {anchor && (
        <CategoryMenu anchor={anchor} title="Set category · whole family" current={category ?? undefined} onPick={pickCategory} onClose={() => setAnchor(null)} />
      )}
    </>
  );
}

const Sep = () => <span className="sep" aria-hidden="true">·</span>;

/** Name, family controls and actions of the loaded font. `children` are the action buttons. */
export function FontHeader({ fontData, lib, onReset, onOpen, children }: {
  fontData: FontData;
  lib: LibraryFont | null;
  onReset: () => void;
  onOpen: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <header className="font-head">
      <button type="button" className="btn btn-ghost" onClick={onReset}>
        <Icon name="back" />
        Change font
      </button>
      <div className="font-id">
        <div className="font-title">
          <h1 className="font-name" id="font-name" tabIndex={-1}>{fontData.familyName}</h1>
          {lib && <FamilyControls lib={lib} />}
        </div>
        <p className="font-meta">
          {fontData.styleName}<Sep />
          <span className="mono">{fontData.glyphCount}</span> glyphs<Sep />
          <span className="mono">{fontData.unitsPerEm}</span> UPM
          {lib && <><Sep />{lib.meta.source === 'google' ? 'Google Fonts' : 'Local'}</>}
        </p>
      </div>
      {lib && <FamilyNav members={lib.members} current={lib.meta} onOpen={onOpen} />}
      <div className="head-actions">{children}</div>
    </header>
  );
}
