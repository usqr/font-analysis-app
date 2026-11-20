import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FontCategory, FontFamily, StoredFontMeta } from '../../types';
import { bulkSetCategory, fetchDatabase, toggleStarFamily } from '../../lib/api';
import { familyKey, groupByFamily } from '../../lib/fontFamilies';

/** Older databases kept `local:` or `google:` in front of a starred family key. */
function migrateStarKeys(raw: string[]): Set<string> {
  return new Set(raw.map((k) => (k.startsWith('local:') || k.startsWith('google:') ? k.slice(k.indexOf(':') + 1) : k)));
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * The font database for the library. The star set is separate from the
 * families, so that a star change does not make new family objects.
 */
export function useLibraryData() {
  const [fonts, setFonts] = useState<StoredFontMeta[]>([]);
  const [starred, setStarred] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const families = useMemo(() => groupByFamily(fonts), [fonts]);

  const reload = useCallback(async () => {
    try {
      const db = await fetchDatabase();
      setStarred(migrateStarKeys(db.starredFamilies ?? []));
      setFonts(db.fonts);
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const toggleStar = useCallback(async (fam: FontFamily) => {
    const key = familyKey(fam.familyName);
    const flip = (s: Set<string>) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    };
    setStarred(flip);
    try {
      await toggleStarFamily(key);
    } catch (e) {
      setStarred(flip);
      setError(message(e));
    }
  }, []);

  /** Sets a category override on every font of `fams`. Returns false on failure. */
  const setCategory = useCallback(async (fams: FontFamily[], cat: FontCategory) => {
    const ids = new Set(fams.flatMap((f) => f.fonts.map((v) => v.id)));
    if (ids.size === 0) return false;
    try {
      await bulkSetCategory(Array.from(ids), cat);
      setFonts((prev) => prev.map((f) => (ids.has(f.id) ? { ...f, categoryOverride: cat } : f)));
      return true;
    } catch (e) {
      setError(message(e));
      return false;
    }
  }, []);

  const isStarred = useCallback((name: string) => starred.has(familyKey(name)), [starred]);

  return { fonts, families, starred, isStarred, loading, error, setError, reload, toggleStar, setCategory };
}
