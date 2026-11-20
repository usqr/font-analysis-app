import { useEffect, useState } from 'react';
import * as opentype from 'opentype.js';
import type { FontData, FullAnalysis, StoredFontData, StoredFontMeta } from '../../types';
import { fetchDatabase, fetchFontData } from '../../lib/api';
import { familyKey, superFamilyName } from '../../lib/fontFamilies';
import { readLastFont, writeLastFont } from '../../lib/lastFont';

/** What the Analyze view knows about a library font and its family. */
export interface LibraryFont {
  meta: StoredFontMeta;
  members: StoredFontMeta[];
  starKey: string;
  starred: boolean;
}

function toFontData(data: StoredFontData): FontData {
  const binary = Uint8Array.from(atob(data.base64Data), (c) => c.charCodeAt(0));
  const font = opentype.parse(binary.buffer as ArrayBuffer);
  return {
    font,
    fileName: `${data.familyName}-${data.subfamilyName}.${data.format}`,
    familyName: data.familyName,
    styleName: data.subfamilyName,
    unitsPerEm: font.unitsPerEm,
    ascender: font.ascender,
    descender: font.descender,
    glyphCount: font.glyphs.length,
  };
}

function toLibraryFont(meta: StoredFontMeta, fonts: StoredFontMeta[], starredFamilies: string[]): LibraryFont {
  const base = superFamilyName(meta);
  const starKey = familyKey(base);
  return { meta, members: fonts.filter((f) => superFamilyName(f) === base), starKey, starred: starredFamilies.includes(starKey) };
}

/**
 * Loads the library font `fontId` and gives it to `onFont`, with its stored
 * analysis when the library has one. A change of `reloadTick` loads it again.
 */
export function useLibraryFont(
  fontId: string | undefined,
  reloadTick: number,
  onFont: (data: FontData, stored?: FullAnalysis) => void,
) {
  const [loading, setLoading] = useState(false);
  const [lib, setLib] = useState<LibraryFont | null>(null);

  useEffect(() => {
    if (!fontId) { setLib(null); return; }
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchFontData(fontId), fetchDatabase()])
      .then(([data, db]) => {
        if (cancelled) return;
        const meta = db.fonts.find((f) => f.id === fontId);
        setLib(meta ? toLibraryFont(meta, db.fonts, db.starredFamilies ?? []) : null);
        onFont(toFontData(data), meta?.analysis);
      })
      .catch((e) => {
        console.error('Failed to load font from library:', e);
        // A stale id (font deleted or DB rebuilt) must not open again next time.
        if (readLastFont() === fontId) writeLastFont(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [fontId, reloadTick, onFont]);

  return { loading, lib };
}
