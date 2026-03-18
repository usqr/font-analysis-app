import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { StoredFontMeta, FontFamily, FontCategory, FontSource, VariableAxis } from '../types';
import type { ScanEvent, ScanProgressUpdate } from '../lib/api';
import { fetchDatabase, scanFolderStream, pickFolder, deleteFont, refreshFont, updateFontPath, clearDatabase, deduplicateDatabase, computeMetrics, toggleStarFamily, fetchFontPaths, addFontPath, removeFontPath, bulkSetCategory, bulkSetTags, fetchAllTags } from '../lib/api';
import { groupByFamily, variantLabel, groupByWidth, familyKey, type WidthStyleGroup } from '../lib/fontFamilies';
import { useFontFace } from '../lib/useFontFace';
import { HistogramFilter } from './HistogramFilter';
import { getAxisInfo } from '../lib/axisDescriptions';

const CATEGORIES: { id: FontCategory; label: string }[] = [
  { id: 'serif', label: 'Serif' },
  { id: 'sans-serif', label: 'Sans-Serif' },
  { id: 'monospace', label: 'Monospace' },
  { id: 'display', label: 'Display' },
  { id: 'script', label: 'Script' },
];

type ViewMode = 'list' | 'grid';
type CardState = 'collapsed' | 'normal' | 'expanded';

export function LibraryView() {
  const navigate = useNavigate();
  const [families, setFamilies] = useState<FontFamily[]>([]);
  const [allFonts, setAllFonts] = useState<StoredFontMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [scanPath, setScanPath] = useState('');
  const [showScanDialog, setShowScanDialog] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingPath, setEditingPath] = useState<{ id: string; path: string } | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [scanProgress, setScanProgress] = useState<{
    current: number;
    total: number;
    added: number;
    failed: number;
  } | null>(null);
  const [scanLog, setScanLog] = useState<ScanProgressUpdate[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);
  const scanLogRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [globalCardState, setGlobalCardState] = useState<CardState | null>(null);
  const [globalCardVersion, setGlobalCardVersion] = useState(0);
  const [dedupMsg, setDedupMsg] = useState<string | null>(null);
  const dedupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<FontCategory | null>(null);
  const [contrastRange, setContrastRange] = useState<[number, number]>([0, 1]);
  const [weightRange, setWeightRange] = useState<[number, number]>([0, 1]);
  const [widthRange, setWidthRange] = useState<[number, number]>([0, 2]);
  const [xHeightRange, setXHeightRange] = useState<[number, number]>([0, 1]);
  const [metricsReady, setMetricsReady] = useState(false);
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const [selectedSource, setSelectedSource] = useState<FontSource | null>(null);
  const [starredSet, setStarredSet] = useState<Set<string>>(new Set());
  const starredRef = useRef(starredSet);
  starredRef.current = starredSet;
  const [savedPaths, setSavedPaths] = useState<string[]>([]);
  const [bulkEditMode, setBulkEditMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [allTags, setAllTags] = useState<string[]>([]);
  const [minStyles, setMinStyles] = useState(1);
  const [maxStyles, setMaxStyles] = useState(999);
  const [excludeBasicLatinOnly, setExcludeBasicLatinOnly] = useState(false);
  const [requiredScripts, setRequiredScripts] = useState<Set<string>>(new Set());
  const [showVariableOnly, setShowVariableOnly] = useState(false);

  const loadDatabase = useCallback(async () => {
    try {
      setLoading(true);
      const db = await fetchDatabase();
      const raw = db.starredFamilies ?? [];
      const migrated = new Set(raw.map((k) => {
        const colon = k.indexOf(':');
        return colon >= 0 && (k.startsWith('local:') || k.startsWith('google:')) ? k.slice(colon + 1) : k;
      }));
      setStarredSet(migrated);
      setAllFonts(db.fonts);
      setFamilies(groupByFamily(db.fonts, migrated));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDatabase();
    fetchFontPaths().then(setSavedPaths).catch(() => {});
    fetchAllTags().then(setAllTags).catch(() => {});
  }, [loadDatabase]);

  useEffect(() => {
    if (metricsReady || allFonts.length === 0) return;
    if (!showAdvancedFilters && selectedCategory === null) return;
    const needsWork = allFonts.some((f) => !f.metrics || !f.category);
    if (!needsWork) { setMetricsReady(true); return; }
    computeMetrics().then(({ updated }) => {
      if (updated > 0) loadDatabase();
      setMetricsReady(true);
    }).catch(() => setMetricsReady(true));
  }, [showAdvancedFilters, selectedCategory, metricsReady, allFonts, loadDatabase]);

  const handleBrowse = useCallback(async () => {
    setBrowsing(true);
    try {
      const folder = await pickFolder();
      if (folder) setScanPath(folder);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBrowsing(false);
    }
  }, []);

  const handleScan = useCallback(async () => {
    if (!scanPath.trim()) return;
    setScanning(true);
    setError(null);
    setScanLog([]);
    setScanProgress(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      let added = 0;
      let failed = 0;

      await scanFolderStream(
        scanPath.trim(),
        (event: ScanEvent) => {
          if (event.type === 'start') {
            setScanProgress({ current: 0, total: event.total, added: 0, failed: 0 });
          } else if (event.type === 'progress') {
            if (event.status === 'ok') added++;
            else failed++;
            setScanProgress({ current: event.current, total: event.total, added, failed });
            setScanLog((prev) => {
              const next = [...prev, event as ScanProgressUpdate];
              if (next.length > 200) return next.slice(-200);
              return next;
            });
          } else if (event.type === 'done') {
            setScanProgress((p) => p ? { ...p, current: p.total } : p);
          }
        },
        controller.signal,
      );

      await loadDatabase();
      setScanPath('');
      setShowScanDialog(false);
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setError(e.message);
      }
    } finally {
      setScanning(false);
      abortRef.current = null;
    }
  }, [scanPath, loadDatabase]);

  const handleCancelScan = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteFont(id);
      setAllFonts((prev) => {
        const next = prev.filter((f) => f.id !== id);
        setFamilies(groupByFamily(next, starredRef.current));
        return next;
      });
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  const handleClearLibrary = useCallback(async () => {
    try {
      await clearDatabase();
      setAllFonts([]);
      setFamilies([]);
      setSelected(new Set());
      setConfirmClear(false);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  const handleDedup = useCallback(async () => {
    try {
      const { removed } = await deduplicateDatabase();
      if (removed > 0) await loadDatabase();
      if (dedupTimerRef.current) clearTimeout(dedupTimerRef.current);
      setDedupMsg(removed > 0 ? `Removed ${removed} duplicate${removed !== 1 ? 's' : ''}` : 'No duplicates found');
      dedupTimerRef.current = setTimeout(() => setDedupMsg(null), 3000);
    } catch (e: any) {
      setError(e.message);
    }
  }, [loadDatabase]);

  const handleRefresh = useCallback(async (id: string) => {
    try {
      const updated = await refreshFont(id);
      setAllFonts((prev) => {
        const next = prev.map((f) => (f.id === id ? updated : f));
        setFamilies(groupByFamily(next, starredRef.current));
        return next;
      });
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  const handleUpdatePath = useCallback(async () => {
    if (!editingPath) return;
    try {
      await updateFontPath(editingPath.id, editingPath.path);
      setEditingPath(null);
      await loadDatabase();
    } catch (e: any) {
      setError(e.message);
    }
  }, [editingPath, loadDatabase]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleToggleStarFamily = useCallback(async (fam: FontFamily) => {
    const key = familyKey(fam.familyName);
    const newSet = new Set(starredRef.current);
    if (newSet.has(key)) newSet.delete(key); else newSet.add(key);
    setStarredSet(newSet);
    setFamilies((prev) => prev.map((f) =>
      f.familyName === fam.familyName ? { ...f, starred: newSet.has(key) } : f,
    ));
    try {
      await toggleStarFamily(key);
    } catch {
      const revert = new Set(starredRef.current);
      if (revert.has(key)) revert.delete(key); else revert.add(key);
      setStarredSet(revert);
      setFamilies((prev) => prev.map((f) =>
        f.familyName === fam.familyName ? { ...f, starred: revert.has(key) } : f,
      ));
    }
  }, []);

  const handleCompare = useCallback(() => {
    if (selected.size < 2) return;
    const ids = Array.from(selected).slice(0, 5);
    navigate(`/compare?ids=${ids.join(',')}`);
  }, [selected, navigate]);

  const handleBulkCategory = useCallback(async (cat: FontCategory) => {
    const familyNames = bulkSelected;
    const fontIds = families
      .filter((f) => familyNames.has(f.familyName))
      .flatMap((f) => f.fonts.map((v) => v.id));
    if (fontIds.length === 0) return;
    try {
      await bulkSetCategory(fontIds, cat);
      setAllFonts((prev) => {
        const idSet = new Set(fontIds);
        const next = prev.map((f) => idSet.has(f.id) ? { ...f, categoryOverride: cat } : f);
        setFamilies(groupByFamily(next, starredRef.current));
        return next;
      });
    } catch (e: any) {
      setError(e.message);
    }
  }, [bulkSelected, families]);

  const handleBulkTags = useCallback(async (tags: string[]) => {
    const familyNames = bulkSelected;
    const fontIds = families
      .filter((f) => familyNames.has(f.familyName))
      .flatMap((f) => f.fonts.map((v) => v.id));
    if (fontIds.length === 0) return;
    try {
      await bulkSetTags(fontIds, tags);
      setAllFonts((prev) => {
        const idSet = new Set(fontIds);
        const next = prev.map((f) => {
          if (!idSet.has(f.id)) return f;
          const existing = new Set(f.tags ?? []);
          for (const t of tags) existing.add(t);
          return { ...f, tags: Array.from(existing) };
        });
        setFamilies(groupByFamily(next, starredRef.current));
        return next;
      });
      fetchAllTags().then(setAllTags).catch(() => {});
    } catch (e: any) {
      setError(e.message);
    }
  }, [bulkSelected, families]);

  const handleFamilyCategoryOverride = useCallback(async (family: FontFamily, cat: FontCategory) => {
    const fontIds = family.fonts.map((f) => f.id);
    try {
      await bulkSetCategory(fontIds, cat);
      setAllFonts((prev) => {
        const idSet = new Set(fontIds);
        const next = prev.map((f) => idSet.has(f.id) ? { ...f, categoryOverride: cat } : f);
        setFamilies(groupByFamily(next, starredRef.current));
        return next;
      });
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  const toggleBulkSelect = useCallback((familyName: string) => {
    setBulkSelected((prev) => {
      const next = new Set(prev);
      if (next.has(familyName)) next.delete(familyName);
      else next.add(familyName);
      return next;
    });
  }, []);

  useEffect(() => {
    scanLogRef.current?.scrollTo({ top: scanLogRef.current.scrollHeight });
  }, [scanLog]);

  const familyMetrics = useMemo(() => {
    const map = new Map<string, { metrics: StoredFontMeta['metrics']; category: StoredFontMeta['category'] }>();
    for (const fam of families) {
      const regular = fam.fonts.find((f) => f.weight >= 380 && f.weight <= 420 && f.style === 'normal')
        ?? fam.fonts.find((f) => f.style === 'normal') ?? fam.fonts[0];
      map.set(fam.familyName, { metrics: regular?.metrics, category: regular?.categoryOverride ?? regular?.category });
    }
    return map;
  }, [families]);

  const availableScripts = useMemo(() => {
    const scripts = new Set<string>();
    for (const fam of families) {
      for (const f of fam.fonts) {
        if (f.scriptSupport) {
          for (const s of f.scriptSupport) scripts.add(s);
        }
      }
    }
    const ordered = ['Latin Extended', 'Cyrillic', 'Greek', 'Arabic', 'Hebrew', 'Devanagari',
      'Bengali', 'Tamil', 'Telugu', 'Thai', 'Georgian', 'Armenian', 'CJK', 'Hangul', 'Japanese Kana', 'Vietnamese'];
    return ordered.filter((s) => scripts.has(s));
  }, [families]);

  const collectMetricValues = useCallback((fams: FontFamily[]) => {
    const contrast: number[] = [];
    const weight: number[] = [];
    const width: number[] = [];
    const xHeight: number[] = [];
    for (const fam of fams) {
      const m = familyMetrics.get(fam.familyName)?.metrics;
      if (!m) continue;
      contrast.push(m.contrast);
      weight.push(m.weight);
      width.push(m.width);
      xHeight.push(m.xHeight);
    }
    return { contrast, weight, width, xHeight };
  }, [familyMetrics]);

  const histogramValues = useMemo(() => collectMetricValues(families), [families, collectMetricValues]);

  const searchAndCatFiltered = useMemo(() => {
    let result = families;
    if (selectedSource) {
      result = result.filter((f) => f.sources?.includes(selectedSource) ?? (f.source ?? 'local') === selectedSource);
    }
    if (showStarredOnly) {
      result = result.filter((f) => f.starred);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((f) => f.familyName.toLowerCase().includes(q));
    }
    if (selectedCategory) {
      result = result.filter((f) => {
        const cat = familyMetrics.get(f.familyName)?.category;
        return cat === selectedCategory;
      });
    }
    return result;
  }, [families, search, selectedCategory, familyMetrics, showStarredOnly, selectedSource]);

  const filteredHistogramValues = useMemo(
    () => collectMetricValues(searchAndCatFiltered),
    [searchAndCatFiltered, collectMetricValues],
  );

  const filteredFamilies = useMemo(() => {
    let result = searchAndCatFiltered;

    if (showAdvancedFilters) {
      result = result.filter((f) => {
        const m = familyMetrics.get(f.familyName)?.metrics;
        if (!m) return true;
        return m.contrast >= contrastRange[0] && m.contrast <= contrastRange[1]
          && m.weight >= weightRange[0] && m.weight <= weightRange[1]
          && m.width >= widthRange[0] && m.width <= widthRange[1]
          && m.xHeight >= xHeightRange[0] && m.xHeight <= xHeightRange[1];
      });

      if (minStyles > 1 || maxStyles < 999) {
        result = result.filter((f) => f.fonts.length >= minStyles && f.fonts.length <= maxStyles);
      }

      if (excludeBasicLatinOnly) {
        result = result.filter((f) => {
          return f.fonts.some((font) => {
            if (!font.scriptSupport) return true;
            return font.scriptSupport.some((s) => s !== 'Basic Latin');
          });
        });
      }

      if (requiredScripts.size > 0) {
        result = result.filter((f) => {
          const familyScripts = new Set<string>();
          for (const font of f.fonts) {
            if (font.scriptSupport) {
              for (const s of font.scriptSupport) familyScripts.add(s);
            }
          }
          for (const req of requiredScripts) {
            if (!familyScripts.has(req)) return false;
          }
          return true;
        });
      }
    }

    if (showVariableOnly) {
      result = result.filter((f) => f.hasVariable);
    }

    return result;
  }, [searchAndCatFiltered, showAdvancedFilters, contrastRange, weightRange, widthRange, xHeightRange, familyMetrics, minStyles, maxStyles, excludeBasicLatinOnly, requiredScripts, showVariableOnly]);

  const rangesInitialized = useRef(false);
  useEffect(() => {
    if (rangesInitialized.current || histogramValues.contrast.length === 0) return;
    rangesInitialized.current = true;
    const range = (a: number[]): [number, number] => {
      const s = [...a].sort((x, y) => x - y);
      return [s[0], s[s.length - 1]];
    };
    setContrastRange(range(histogramValues.contrast));
    setWeightRange(range(histogramValues.weight));
    setWidthRange(range(histogramValues.width));
    setXHeightRange(range(histogramValues.xHeight));
  }, [histogramValues]);

  const toggleCategory = useCallback((cat: FontCategory) => {
    setSelectedCategory((prev) => prev === cat ? null : cat);
  }, []);

  const resetAllFilters = useCallback(() => {
    setSelectedCategory(null);
    setSelectedSource(null);
    setShowStarredOnly(false);
    setSearch('');
    setMinStyles(1);
    setMaxStyles(999);
    setExcludeBasicLatinOnly(false);
    setRequiredScripts(new Set());
    setShowVariableOnly(false);
    if (histogramValues.contrast.length > 0) {
      const sorted = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return [s[0], s[s.length - 1]] as [number, number]; };
      setContrastRange(sorted(histogramValues.contrast));
      setWeightRange(sorted(histogramValues.weight));
      setWidthRange(sorted(histogramValues.width));
      setXHeightRange(sorted(histogramValues.xHeight));
    }
  }, [histogramValues]);

  const handleToggleCollapse = useCallback(() => {
    setGlobalCardState((prev) => {
      const next = prev === 'collapsed' ? 'normal' : 'collapsed';
      return next;
    });
    setGlobalCardVersion((v) => v + 1);
  }, []);


  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-600 border-t-blue-400" />
          <span className="text-neutral-400">Loading library...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-neutral-800 px-4 py-3">
        <input
          type="text"
          placeholder="Search families..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200 placeholder-neutral-500 outline-none focus:border-blue-500"
        />

        {/* View toggle */}
        <div className="flex rounded-md border border-neutral-700" data-testid="view-toggle">
          <button
            onClick={() => setViewMode('list')}
            className={`px-2.5 py-1.5 text-xs transition-colors ${viewMode === 'list' ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-white'}`}
            title="List view"
            data-testid="view-list"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="1" y1="3" x2="13" y2="3" /><line x1="1" y1="7" x2="13" y2="7" /><line x1="1" y1="11" x2="13" y2="11" />
            </svg>
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`px-2.5 py-1.5 text-xs transition-colors ${viewMode === 'grid' ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-white'}`}
            title="Grid view"
            data-testid="view-grid"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="1" y="1" width="5" height="5" rx="1" /><rect x="8" y="1" width="5" height="5" rx="1" />
              <rect x="1" y="8" width="5" height="5" rx="1" /><rect x="8" y="8" width="5" height="5" rx="1" />
            </svg>
          </button>
        </div>

        <button
          onClick={() => setShowScanDialog(true)}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-500"
        >
          Scan Folder
        </button>
        {allFonts.length > 0 && (
          confirmClear ? (
            <span className="flex items-center gap-2">
              <span className="text-xs text-red-400">Delete all fonts?</span>
              <button
                onClick={handleClearLibrary}
                className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-500"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirmClear(false)}
                className="rounded-md px-3 py-1.5 text-xs text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmClear(true)}
              className="rounded-md border border-red-500/30 px-4 py-1.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/10"
            >
              Clear Library
            </button>
          )
        )}
        {allFonts.length > 0 && (
          <span className="flex items-center gap-2">
            <button
              onClick={handleDedup}
              className="rounded-md border border-neutral-600 px-4 py-1.5 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
              data-testid="dedup-btn"
            >
              Deduplicate
            </button>
            {dedupMsg && (
              <span className="text-xs text-emerald-400" data-testid="dedup-msg">{dedupMsg}</span>
            )}
          </span>
        )}
        {viewMode === 'list' && allFonts.length > 0 && (
          <button
            onClick={handleToggleCollapse}
            className="rounded-md border border-neutral-600 px-3 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
            data-testid="toggle-collapse"
          >
            {globalCardState === 'collapsed' ? 'Expand All' : 'Collapse All'}
          </button>
        )}
        {allFonts.length > 0 && (
          <button
            onClick={() => { setBulkEditMode((v) => !v); if (bulkEditMode) setBulkSelected(new Set()); }}
            className={`rounded-md border px-4 py-1.5 text-sm font-medium transition-colors ${
              bulkEditMode
                ? 'border-orange-500 bg-orange-500/10 text-orange-400'
                : 'border-neutral-600 text-neutral-300 hover:bg-neutral-800 hover:text-white'
            }`}
          >
            {bulkEditMode ? 'Exit Bulk Edit' : 'Bulk Edit'}
          </button>
        )}
        {selected.size >= 2 && (
          <button
            onClick={handleCompare}
            className="rounded-md bg-purple-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-purple-500"
          >
            Compare ({selected.size})
          </button>
        )}
        <span className="ml-auto text-xs text-neutral-500">
          {filteredFamilies.length < families.length
            ? <>{filteredFamilies.reduce((s, f) => s + f.fonts.length, 0)} fonts in {filteredFamilies.length} families <span className="text-neutral-600">of {allFonts.length} total</span></>
            : <>{allFonts.length} fonts in {families.length} families</>}
        </span>
      </div>

      {/* Category & histogram filters */}
      {allFonts.length > 0 && (
        <div className="border-b border-neutral-800 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowStarredOnly((v) => !v)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                showStarredOnly
                  ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                  : 'border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-neutral-300'
              }`}
            >
              &#9733; Starred
            </button>
            <span className="mx-1 text-neutral-700">|</span>
            {([['local', 'Local'], ['google', 'Google']] as const).map(([src, label]) => (
              <button
                key={src}
                onClick={() => setSelectedSource((prev) => prev === src ? null : src)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  selectedSource === src
                    ? 'border-green-500 bg-green-500/10 text-green-400'
                    : 'border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-neutral-300'
                }`}
              >
                {label}
              </button>
            ))}
            <span className="mx-1 text-neutral-700">|</span>
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => toggleCategory(cat.id)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  selectedCategory === cat.id
                    ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                    : 'border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-neutral-300'
                }`}
              >
                {cat.label}
              </button>
            ))}
            {(selectedCategory !== null || selectedSource !== null || search.trim() || showStarredOnly || excludeBasicLatinOnly || requiredScripts.size > 0 || minStyles > 1 || maxStyles < 999 || showVariableOnly) && (
              <button
                onClick={resetAllFilters}
                className="ml-1 text-xs text-neutral-500 hover:text-neutral-300"
              >
                Reset all
              </button>
            )}
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-neutral-500">Advanced Filters</span>
              <button
                onClick={() => setShowAdvancedFilters((v) => !v)}
                className={`flex h-5 w-9 items-center rounded-full px-0.5 transition-colors ${showAdvancedFilters ? 'bg-blue-600' : 'bg-neutral-700'}`}
              >
                <span className={`h-4 w-4 rounded-full bg-white transition-transform ${showAdvancedFilters ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>

          {showAdvancedFilters && histogramValues.contrast.length > 0 && (
            <div className="mt-3 flex gap-4">
              <HistogramFilter
                label="Contrast"
                values={histogramValues.contrast}
                filteredValues={filteredHistogramValues.contrast}
                range={contrastRange}
                onChange={setContrastRange}
                onReset={() => {
                  const s = [...histogramValues.contrast].sort((a, b) => a - b);
                  setContrastRange([s[0], s[s.length - 1]]);
                }}
              />
              <HistogramFilter
                label="Weight"
                values={histogramValues.weight}
                filteredValues={filteredHistogramValues.weight}
                range={weightRange}
                onChange={setWeightRange}
                onReset={() => {
                  const s = [...histogramValues.weight].sort((a, b) => a - b);
                  setWeightRange([s[0], s[s.length - 1]]);
                }}
              />
              <HistogramFilter
                label="Width"
                values={histogramValues.width}
                filteredValues={filteredHistogramValues.width}
                range={widthRange}
                onChange={setWidthRange}
                onReset={() => {
                  const s = [...histogramValues.width].sort((a, b) => a - b);
                  setWidthRange([s[0], s[s.length - 1]]);
                }}
              />
              <HistogramFilter
                label="X-Height"
                values={histogramValues.xHeight}
                filteredValues={filteredHistogramValues.xHeight}
                range={xHeightRange}
                onChange={setXHeightRange}
                onReset={() => {
                  const s = [...histogramValues.xHeight].sort((a, b) => a - b);
                  setXHeightRange([s[0], s[s.length - 1]]);
                }}
              />
            </div>
          )}
          {showAdvancedFilters && (
            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-500">Styles:</span>
                <input
                  type="number"
                  min={1}
                  value={minStyles}
                  onChange={(e) => setMinStyles(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-14 rounded border border-neutral-700 bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-300 focus:border-blue-500 focus:outline-none"
                />
                <span className="text-xs text-neutral-600">–</span>
                <input
                  type="number"
                  min={1}
                  value={maxStyles >= 999 ? '' : maxStyles}
                  placeholder="∞"
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    setMaxStyles(isNaN(v) ? 999 : Math.max(1, v));
                  }}
                  className="w-14 rounded border border-neutral-700 bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-300 focus:border-blue-500 focus:outline-none"
                />
                {(minStyles > 1 || maxStyles < 999) && (
                  <button onClick={() => { setMinStyles(1); setMaxStyles(999); }} className="text-xs text-neutral-500 hover:text-neutral-300">✕</button>
                )}
              </div>

              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={excludeBasicLatinOnly}
                  onChange={(e) => setExcludeBasicLatinOnly(e.target.checked)}
                  className="rounded border-neutral-600 bg-neutral-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                />
                <span className="text-xs text-neutral-400">Exclude basic-Latin-only</span>
              </label>

              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={showVariableOnly}
                  onChange={(e) => setShowVariableOnly(e.target.checked)}
                  className="rounded border-neutral-600 bg-neutral-800 text-teal-500 focus:ring-teal-500 focus:ring-offset-0"
                />
                <span className="text-xs text-neutral-400">Variable only</span>
              </label>

              {availableScripts.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-neutral-500">Require:</span>
                  <div className="flex flex-wrap gap-1">
                    {availableScripts.map((script) => (
                      <button
                        key={script}
                        onClick={() => {
                          setRequiredScripts((prev) => {
                            const next = new Set(prev);
                            if (next.has(script)) next.delete(script);
                            else next.add(script);
                            return next;
                          });
                        }}
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                          requiredScripts.has(script)
                            ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                            : 'border-neutral-700 text-neutral-500 hover:border-neutral-500 hover:text-neutral-400'
                        }`}
                      >
                        {script}
                      </button>
                    ))}
                  </div>
                  {requiredScripts.size > 0 && (
                    <button onClick={() => setRequiredScripts(new Set())} className="text-xs text-neutral-500 hover:text-neutral-300">✕</button>
                  )}
                </div>
              )}
            </div>
          )}
          {showAdvancedFilters && histogramValues.contrast.length === 0 && !metricsReady && (
            <div className="mt-3 flex items-center gap-2 text-xs text-neutral-500">
              <div className="h-3 w-3 animate-spin rounded-full border border-neutral-600 border-t-blue-400" />
              Computing font metrics...
            </div>
          )}
        </div>
      )}

      {/* Scan dialog */}
      {showScanDialog && (
        <div className="border-b border-neutral-800 bg-neutral-900/80 px-4 py-3">
          <div className="flex items-center gap-3">
            <label className="text-sm text-neutral-400">Folder path:</label>
            <input
              type="text"
              value={scanPath}
              onChange={(e) => setScanPath(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !scanning && handleScan()}
              placeholder="/path/to/fonts"
              disabled={scanning}
              className="flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-200 placeholder-neutral-500 outline-none focus:border-blue-500 disabled:opacity-50"
              autoFocus
            />
            <button
              onClick={handleBrowse}
              disabled={browsing || scanning}
              className="rounded-md border border-neutral-600 px-3 py-1.5 text-sm text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white disabled:opacity-50"
            >
              {browsing ? 'Opening...' : 'Browse'}
            </button>
            {scanning ? (
              <button
                onClick={handleCancelScan}
                className="rounded-md bg-red-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-500"
              >
                Stop
              </button>
            ) : (
              <button
                onClick={handleScan}
                disabled={!scanPath.trim()}
                className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
              >
                Scan
              </button>
            )}
            <button
              onClick={() => { if (!scanning) { setShowScanDialog(false); setScanPath(''); setScanLog([]); setScanProgress(null); } }}
              disabled={scanning}
              className="rounded-md px-3 py-1.5 text-sm text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white disabled:opacity-50"
            >
              Close
            </button>
          </div>

          {/* Saved font paths */}
          {savedPaths.length > 0 && !scanning && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-neutral-500">Saved:</span>
              {savedPaths.map((p) => (
                <span key={p} className="flex items-center gap-1 rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">
                  <button
                    onClick={() => setScanPath(p)}
                    className="max-w-48 truncate hover:text-white"
                    title={p}
                  >
                    {p.split('/').pop() || p}
                  </button>
                  <button
                    onClick={async () => {
                      const updated = await removeFontPath(p);
                      setSavedPaths(updated);
                    }}
                    className="text-neutral-600 hover:text-red-400"
                    title="Remove saved path"
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
          )}
          {scanPath.trim() && !scanning && !savedPaths.includes(scanPath.trim()) && (
            <div className="mt-1.5">
              <button
                onClick={async () => {
                  const updated = await addFontPath(scanPath.trim());
                  setSavedPaths(updated);
                }}
                className="text-xs text-neutral-500 hover:text-blue-400"
              >
                + Save this path
              </button>
            </div>
          )}

          {scanProgress && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-800">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all duration-150"
                    style={{ width: `${scanProgress.total > 0 ? (scanProgress.current / scanProgress.total) * 100 : 0}%` }}
                  />
                </div>
                <span className="shrink-0 text-xs tabular-nums text-neutral-400">
                  {scanProgress.current} / {scanProgress.total}
                </span>
              </div>

              <div className="flex gap-4 text-xs">
                <span className="text-emerald-400">{scanProgress.added} added</span>
                {scanProgress.failed > 0 && (
                  <span className="text-red-400">{scanProgress.failed} failed</span>
                )}
                {scanning && (
                  <span className="text-neutral-500">
                    {Math.round((scanProgress.current / scanProgress.total) * 100)}%
                  </span>
                )}
              </div>

              <div
                ref={scanLogRef}
                className="max-h-48 overflow-y-auto rounded-md bg-neutral-950 p-2 font-mono text-xs"
              >
                {scanLog.map((entry, i) => (
                  <div key={i} className="flex gap-2 py-px">
                    <span className="shrink-0 tabular-nums text-neutral-600">{entry.current}</span>
                    {entry.status === 'ok' ? (
                      <span className="text-neutral-400">
                        <span className="text-emerald-500">+</span>{' '}
                        {entry.familyName}{' '}
                        <span className="text-neutral-600">{entry.subfamilyName}</span>{' '}
                        <span className="text-neutral-700">{entry.fileName}</span>
                      </span>
                    ) : (
                      <span className="text-red-400/70">
                        <span className="text-red-500">x</span>{' '}
                        {entry.fileName}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}


      {/* Update path dialog */}
      {editingPath && (
        <div className="border-b border-neutral-800 bg-neutral-900/80 px-4 py-3">
          <div className="flex items-center gap-3">
            <label className="text-sm text-neutral-400">New path:</label>
            <input
              type="text"
              value={editingPath.path}
              onChange={(e) => setEditingPath({ ...editingPath, path: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && handleUpdatePath()}
              className="flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-200 placeholder-neutral-500 outline-none focus:border-blue-500"
              autoFocus
            />
            <button
              onClick={handleUpdatePath}
              className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-500"
            >
              Save
            </button>
            <button
              onClick={() => setEditingPath(null)}
              className="rounded-md px-3 py-1.5 text-sm text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="flex items-center justify-between border-b border-red-500/20 bg-red-500/10 px-4 py-2">
          <span className="text-sm text-red-400">{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-xs text-red-400 hover:text-red-300"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Font list / grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredFamilies.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-neutral-500">
            {allFonts.length === 0 ? (
              <>
                <p className="text-lg">No fonts in library</p>
                <p className="text-sm">
                  Click &quot;Scan Folder&quot; to add fonts from your filesystem.
                </p>
              </>
            ) : (
              <p className="text-lg">
                {search.trim()
                  ? <>No families match &quot;{search}&quot;{(selectedCategory || selectedSource || showStarredOnly || showAdvancedFilters) ? ' with the current filters' : ''}</>
                  : 'No families match the current filters'}
              </p>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid w-full gap-4 justify-center" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 320px))' }} data-testid="grid-view">
            {filteredFamilies.map((family) => (
              <GridFamilyCard
                key={family.familyName}
                family={family}
                selected={selected}
                onAnalyze={(id) => navigate(`/analyze/${id}`)}
                onToggleStar={handleToggleStarFamily}
                onToggleSelect={toggleSelect}
                onCategoryOverride={handleFamilyCategoryOverride}
                bulkEditMode={bulkEditMode}
                bulkSelected={bulkSelected.has(family.familyName)}
                onBulkToggle={toggleBulkSelect}
              />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4" data-testid="list-view">
            {filteredFamilies.map((family) => (
              <FamilyCard
                key={family.familyName}
                family={family}
                selected={selected}
                onToggleSelect={toggleSelect}
                onToggleStar={handleToggleStarFamily}
                onAnalyze={(id) => navigate(`/analyze/${id}`)}
                onDelete={handleDelete}
                onRefresh={handleRefresh}
                onEditPath={(id, path) => setEditingPath({ id, path })}
                globalState={globalCardState}
                globalVersion={globalCardVersion}
                onCategoryOverride={handleFamilyCategoryOverride}
                bulkEditMode={bulkEditMode}
                bulkSelected={bulkSelected.has(family.familyName)}
                onBulkToggle={toggleBulkSelect}
              />
            ))}
          </div>
        )}
      </div>

      {/* Floating bulk edit bar */}
      {bulkEditMode && bulkSelected.size > 0 && (
        <BulkEditBar
          count={bulkSelected.size}
          allTags={allTags}
          onSetCategory={handleBulkCategory}
          onAddTags={handleBulkTags}
          onClear={() => setBulkSelected(new Set())}
        />
      )}

      {/* Floating compare tray */}
      {!bulkEditMode && selected.size > 0 && (
        <CompareTray
          selected={selected}
          allFonts={allFonts}
          onRemove={(id) => toggleSelect(id)}
          onClear={() => setSelected(new Set())}
          onCompare={handleCompare}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Floating Bulk Edit Bar                                             */
/* ------------------------------------------------------------------ */

function BulkEditBar({
  count,
  allTags,
  onSetCategory,
  onAddTags,
  onClear,
}: {
  count: number;
  allTags: string[];
  onSetCategory: (cat: FontCategory) => void;
  onAddTags: (tags: string[]) => void;
  onClear: () => void;
}) {
  const [tagInput, setTagInput] = useState('');
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(() => {
    if (!tagInput.trim()) return [];
    const q = tagInput.toLowerCase().trim();
    return allTags.filter((t) => t.toLowerCase().includes(q) && t.toLowerCase() !== q).slice(0, 8);
  }, [tagInput, allTags]);

  const handleAddTags = () => {
    const tags = tagInput.split(',').map((t) => t.trim()).filter(Boolean);
    if (tags.length === 0) return;
    onAddTags(tags);
    setTagInput('');
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-orange-500/30 bg-neutral-900/95 px-4 py-3 shadow-2xl backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center gap-4">
        <span className="shrink-0 text-xs font-medium text-orange-400">
          {count} {count === 1 ? 'family' : 'families'} selected
        </span>

        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-500">Category:</span>
          <select
            onChange={(e) => { if (e.target.value) onSetCategory(e.target.value as FontCategory); e.target.value = ''; }}
            defaultValue=""
            className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200 outline-none focus:border-blue-500"
          >
            <option value="" disabled>Choose...</option>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>

        <div className="relative flex items-center gap-2">
          <span className="text-xs text-neutral-500">Tags:</span>
          <input
            ref={tagInputRef}
            type="text"
            value={tagInput}
            onChange={(e) => { setTagInput(e.target.value); setShowTagSuggestions(true); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddTags(); }}
            onFocus={() => setShowTagSuggestions(true)}
            onBlur={() => setTimeout(() => setShowTagSuggestions(false), 200)}
            placeholder="Add tags (comma-separated)"
            className="w-48 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200 placeholder-neutral-500 outline-none focus:border-blue-500"
          />
          <button
            onClick={handleAddTags}
            disabled={!tagInput.trim()}
            className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-40"
          >
            Add
          </button>
          {showTagSuggestions && suggestions.length > 0 && (
            <div className="absolute bottom-full left-10 mb-1 w-48 rounded-lg border border-neutral-700 bg-neutral-900 py-1 shadow-xl">
              {suggestions.map((tag) => (
                <button
                  key={tag}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setTagInput(tag);
                    setShowTagSuggestions(false);
                  }}
                  className="block w-full px-3 py-1 text-left text-xs text-neutral-300 hover:bg-neutral-800"
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="ml-auto">
          <button
            onClick={onClear}
            className="rounded-md px-3 py-1.5 text-xs text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
          >
            Clear Selection
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Floating Compare Tray                                              */
/* ------------------------------------------------------------------ */

function CompareTray({
  selected,
  allFonts,
  onRemove,
  onClear,
  onCompare,
}: {
  selected: Set<string>;
  allFonts: StoredFontMeta[];
  onRemove: (id: string) => void;
  onClear: () => void;
  onCompare: () => void;
}) {
  const selectedFonts = useMemo(
    () => allFonts.filter((f) => selected.has(f.id)).slice(0, 5),
    [allFonts, selected],
  );

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-700 bg-neutral-900/95 px-4 py-2.5 shadow-2xl backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center gap-3">
        <span className="shrink-0 text-xs font-medium text-neutral-400">
          {selected.size} selected
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
          {selectedFonts.map((f) => (
            <span
              key={f.id}
              className="flex shrink-0 items-center gap-1 rounded-full bg-neutral-800 px-2.5 py-1 text-xs text-neutral-300"
            >
              <span className="max-w-32 truncate">
                {f.preferredFamilyName ?? f.familyName} {f.subfamilyName}
              </span>
              <button
                onClick={() => onRemove(f.id)}
                className="ml-0.5 text-neutral-500 hover:text-neutral-200"
              >
                &times;
              </button>
            </span>
          ))}
          {selected.size > 5 && (
            <span className="shrink-0 text-xs text-neutral-500">
              +{selected.size - 5} more
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={onClear}
            className="rounded-md px-3 py-1.5 text-xs text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
          >
            Clear
          </button>
          <button
            onClick={onCompare}
            disabled={selected.size < 2}
            className="rounded-md bg-purple-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-purple-500 disabled:opacity-40"
          >
            Compare
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Source Badge                                                       */
/* ------------------------------------------------------------------ */

function SourceBadge({ source, sources }: { source?: string; sources?: string[] }) {
  const hasBoth = sources && sources.includes('local') && sources.includes('google');
  if (hasBoth) {
    return (
      <span
        className="inline-flex h-5 items-center justify-center rounded-full bg-purple-500/15 px-1 text-[10px] font-bold text-purple-400"
        title="Local + Google Fonts"
      >
        L+G
      </span>
    );
  }
  if (source === 'google') {
    return (
      <span
        className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-500/15 text-[10px] font-bold text-blue-400"
        title="Google Fonts"
      >
        G
      </span>
    );
  }
  return (
    <span
      className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-neutral-700/50 text-[10px] font-bold text-neutral-500"
      title="Local font"
    >
      L
    </span>
  );
}

function VariableBadge() {
  return (
    <span
      className="inline-flex h-5 items-center justify-center rounded-full bg-teal-500/15 px-1 text-[10px] font-bold text-teal-400"
      title="Variable Font"
    >
      VF
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  List view: FamilyCard                                              */
/* ------------------------------------------------------------------ */

interface FamilyCardProps {
  family: FontFamily;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleStar: (family: FontFamily) => void;
  onAnalyze: (id: string) => void;
  onDelete: (id: string) => void;
  onRefresh: (id: string) => void;
  onEditPath: (id: string, currentPath: string) => void;
  globalState: CardState | null;
  globalVersion: number;
  onCategoryOverride?: (family: FontFamily, cat: FontCategory) => void;
  bulkEditMode?: boolean;
  bulkSelected?: boolean;
  onBulkToggle?: (familyName: string) => void;
}

function FamilyCard({
  family,
  selected,
  onToggleSelect,
  onToggleStar,
  onAnalyze,
  onDelete,
  onRefresh,
  onEditPath,
  globalState,
  globalVersion,
  onCategoryOverride,
  bulkEditMode,
  bulkSelected,
  onBulkToggle,
}: FamilyCardProps) {
  const [cardState, setCardState] = useState<CardState>('normal');
  const [activeWidth, setActiveWidth] = useState<string>('');
  const [showItalic, setShowItalic] = useState(false);
  const [showCatPopover, setShowCatPopover] = useState(false);
  const catPopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (globalState) setCardState(globalState);
  }, [globalState, globalVersion]);

  useEffect(() => {
    if (!showCatPopover) return;
    const handler = (e: MouseEvent) => {
      if (catPopoverRef.current && !catPopoverRef.current.contains(e.target as Node)) {
        setShowCatPopover(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showCatPopover]);

  const widthGroups = useMemo(() => groupByWidth(family.fonts), [family.fonts]);
  const widthKeys = useMemo(() => Array.from(widthGroups.keys()), [widthGroups]);
  const hasMultipleWidths = widthKeys.length > 1;

  useEffect(() => {
    if (!widthGroups.has(activeWidth || 'Default')) {
      setActiveWidth(widthKeys[0] === 'Default' ? '' : widthKeys[0] ?? '');
    }
  }, [widthKeys, widthGroups, activeWidth]);

  const currentWidthKey = activeWidth || 'Default';
  const currentGroup: WidthStyleGroup = widthGroups.get(currentWidthKey) ?? { normal: [], italic: [] };
  const hasItalics = currentGroup.italic.length > 0;
  const hasNormals = currentGroup.normal.length > 0;
  const displayedFonts = showItalic && hasItalics ? currentGroup.italic : currentGroup.normal;

  const effectiveCategory = family.fonts[0]?.categoryOverride ?? family.fonts[0]?.category;
  const CAT_COLORS: Record<string, string> = {
    'serif': 'bg-rose-500/15 text-rose-400 border-rose-500/30',
    'sans-serif': 'bg-sky-500/15 text-sky-400 border-sky-500/30',
    'monospace': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    'display': 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    'script': 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  };

  const toggleCardState = () => {
    setCardState((s) => (s === 'collapsed' ? 'normal' : 'collapsed'));
  };

  return (
    <div className={`rounded-lg border bg-neutral-900 ${bulkSelected ? 'border-orange-500' : 'border-neutral-800'}`} data-testid="family-card">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
        {bulkEditMode && (
          <input
            type="checkbox"
            checked={bulkSelected ?? false}
            onChange={() => onBulkToggle?.(family.familyName)}
            className="mr-2 h-3.5 w-3.5 shrink-0 rounded border-neutral-600 bg-neutral-800 accent-orange-500"
          />
        )}
        <button
          onClick={toggleCardState}
          className="min-w-0 flex-1 text-left"
          data-testid="family-header"
        >
          <h3 className="truncate text-xs font-semibold text-white">
            <span className="mr-2 inline-block text-neutral-600 transition-transform" style={{ transform: cardState === 'collapsed' ? 'rotate(-90deg)' : 'rotate(0)' }}>
              ▾
            </span>
            {family.familyName}
          </h3>
          <p className="ml-5 text-xs text-neutral-500">
            {family.fonts.length} variant{family.fonts.length !== 1 ? 's' : ''}
          </p>
        </button>
        <div className="relative flex items-center gap-1">
          {effectiveCategory && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowCatPopover((v) => !v); }}
              className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${CAT_COLORS[effectiveCategory] ?? 'bg-neutral-700/50 text-neutral-500 border-neutral-700'}`}
              title={`Category: ${effectiveCategory}${family.fonts[0]?.categoryOverride ? ' (override)' : ''}`}
            >
              {effectiveCategory}
            </button>
          )}
          {showCatPopover && (
            <div
              ref={catPopoverRef}
              className="absolute right-0 top-7 z-30 w-36 rounded-lg border border-neutral-700 bg-neutral-900 py-1 shadow-xl"
            >
              <div className="border-b border-neutral-800 px-3 py-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Set Category</span>
              </div>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCategoryOverride?.(family, cat.id);
                    setShowCatPopover(false);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-neutral-800 ${
                    effectiveCategory === cat.id ? 'text-blue-400' : 'text-neutral-300'
                  }`}
                >
                  {effectiveCategory === cat.id && <span className="text-blue-400">&#10003;</span>}
                  <span className={effectiveCategory === cat.id ? '' : 'ml-5'}>{cat.label}</span>
                </button>
              ))}
            </div>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onToggleStar(family); }}
            className="shrink-0 text-sm leading-none transition-colors"
            title={family.starred ? 'Unstar family' : 'Star family'}
          >
            {family.starred
              ? <span className="text-amber-400">&#9733;</span>
              : <span className="text-neutral-700 hover:text-amber-400/60">&#9734;</span>}
          </button>
          <SourceBadge source={family.source} sources={family.sources} />
          {family.hasVariable && <VariableBadge />}
        </div>
        {cardState !== 'collapsed' && (
          <button
            onClick={() => setCardState((s) => (s === 'expanded' ? 'normal' : 'expanded'))}
            className="ml-2 rounded px-2 py-1 text-xs text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
          >
            {cardState === 'expanded' ? 'Hide paths' : 'Show paths'}
          </button>
        )}
      </div>

      {/* Body (hidden when collapsed) */}
      {cardState !== 'collapsed' && (
        <>
          {/* Width tabs / dropdown */}
          {hasMultipleWidths && (
            widthKeys.length > 3 ? (
              <div className="border-t border-neutral-800 px-3 py-2" data-testid="width-tabs">
                <select
                  value={currentWidthKey}
                  onChange={(e) => { setActiveWidth(e.target.value === 'Default' ? '' : e.target.value); setShowItalic(false); }}
                  className="w-full rounded border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs text-neutral-200 outline-none focus:border-blue-500"
                  data-testid="width-select"
                >
                  {widthKeys.map((wk) => (
                    <option key={wk} value={wk}>{wk}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="flex gap-1 border-t border-neutral-800 px-3 py-2" data-testid="width-tabs">
                {widthKeys.map((wk) => (
                  <button
                    key={wk}
                    onClick={() => { setActiveWidth(wk === 'Default' ? '' : wk); setShowItalic(false); }}
                    className={`rounded px-2.5 py-1 text-xs transition-colors ${
                      currentWidthKey === wk
                        ? 'bg-neutral-700 text-white'
                        : 'text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300'
                    }`}
                    data-testid={`width-tab-${wk}`}
                  >
                    {wk}
                  </button>
                ))}
              </div>
            )
          )}

          {/* Style switch */}
          {hasNormals && hasItalics && (
            <div className="flex gap-1 border-t border-neutral-800 px-3 py-2" data-testid="style-switch">
              <button
                onClick={() => setShowItalic(false)}
                className={`rounded px-2.5 py-1 text-xs transition-colors ${
                  !showItalic ? 'bg-blue-600 text-white' : 'text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300'
                }`}
                data-testid="style-regular"
              >
                Regular
              </button>
              <button
                onClick={() => setShowItalic(true)}
                className={`rounded px-2.5 py-1 text-xs transition-colors ${
                  showItalic ? 'bg-blue-600 text-white' : 'text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300'
                }`}
                data-testid="style-italic"
              >
                Italic
              </button>
            </div>
          )}

          {/* Font variant list */}
          <div className="border-t border-neutral-800" data-testid="variant-list">
            {displayedFonts.map((font) => (
              <div
                key={font.id}
                className="group relative flex items-center gap-1.5 border-b border-neutral-800/50 px-3 py-1.5 last:border-b-0"
              >
                <input
                  type="checkbox"
                  checked={selected.has(font.id)}
                  onChange={() => onToggleSelect(font.id)}
                  className="h-3.5 w-3.5 shrink-0 rounded border-neutral-600 bg-neutral-800 accent-blue-500"
                />
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-neutral-300">
                    {variantLabel(font, hasMultipleWidths)}
                  </span>
                  {cardState === 'expanded' && (
                    <p className="truncate text-xs text-neutral-600">
                      {font.filePath}
                    </p>
                  )}
                </div>
                <span className="min-w-10 shrink-0 text-right text-xs tabular-nums text-neutral-600">
                  {font.weight}
                </span>
                <div className="absolute right-2 top-1/2 hidden -translate-y-1/2 gap-1 rounded-md bg-neutral-900/95 px-1 py-0.5 shadow-lg group-hover:flex">
                  <button
                    onClick={() => onAnalyze(font.id)}
                    className="rounded px-2 py-0.5 text-xs text-blue-400 transition-colors hover:bg-blue-500/10"
                    title="Analyze"
                  >
                    Analyze
                  </button>
                  <button
                    onClick={() => onRefresh(font.id)}
                    className="rounded px-2 py-0.5 text-xs text-emerald-400 transition-colors hover:bg-emerald-500/10"
                    title="Refresh from disk"
                  >
                    Refresh
                  </button>
                  <button
                    onClick={() => onEditPath(font.id, font.filePath)}
                    className="rounded px-2 py-0.5 text-xs text-amber-400 transition-colors hover:bg-amber-500/10"
                    title="Update path"
                  >
                    Path
                  </button>
                  <button
                    onClick={() => onDelete(font.id)}
                    className="rounded px-2 py-0.5 text-xs text-red-400 transition-colors hover:bg-red-500/10"
                    title="Remove"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Grid view: GridFamilyCard                                          */
/* ------------------------------------------------------------------ */

function pickPreviewFont(fonts: StoredFontMeta[]): StoredFontMeta {
  const variables = fonts.filter((f) => f.isVariable && f.variableAxes?.length);
  if (variables.length > 0) {
    const best = variables.reduce((a, b) => (b.variableAxes!.length > a.variableAxes!.length ? b : a));
    return best;
  }
  const regular = fonts.find((f) => f.weight >= 380 && f.weight <= 420 && f.style === 'normal');
  return regular ?? fonts.find((f) => f.style === 'normal') ?? fonts[0];
}

const CAT_LABELS: Record<string, string> = {
  'serif': 'Serif',
  'sans-serif': 'Sans',
  'monospace': 'Mono',
  'display': 'Display',
  'script': 'Script',
};

const CAT_COLORS: Record<string, string> = {
  'serif': 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  'sans-serif': 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  'monospace': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  'display': 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  'script': 'bg-amber-500/15 text-amber-400 border-amber-500/30',
};

function AxisInfoPopup({ tag, name, onClose }: { tag: string; name?: string; onClose: () => void }) {
  const info = getAxisInfo(tag, name);
  const popRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);
  return (
    <div ref={popRef} className="absolute bottom-full left-1/2 z-40 mb-2 w-56 -translate-x-1/2 rounded-lg border border-neutral-700 bg-neutral-900 p-3 shadow-xl">
      <h4 className="mb-1 text-xs font-semibold text-neutral-200">{info.name} <span className="font-mono text-neutral-500">({tag})</span></h4>
      <p className="text-[11px] leading-relaxed text-neutral-400">{info.description}</p>
    </div>
  );
}

function VerticalAxisSlider({ axis, value, onChange, side }: {
  axis: VariableAxis;
  value: number;
  onChange: (v: number) => void;
  side: 'left' | 'right';
}) {
  const [showInfo, setShowInfo] = useState(false);
  const info = getAxisInfo(axis.tag, axis.name);
  const step = axis.maxValue - axis.minValue > 10 ? 1 : 0.01;
  const decimals = axis.maxValue - axis.minValue > 10 ? 0 : 2;

  return (
    <div
      className={`relative flex flex-col items-center gap-1 ${side === 'left' ? 'pr-1' : 'pl-1'}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="relative flex items-center gap-0.5">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500">{info.name}</span>
        <button
          onClick={(e) => { e.stopPropagation(); setShowInfo((v) => !v); }}
          className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-neutral-800 text-[8px] font-bold text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300"
          title={`About ${info.name}`}
        >
          i
        </button>
        {showInfo && <AxisInfoPopup tag={axis.tag} name={axis.name} onClose={() => setShowInfo(false)} />}
      </div>
      <span className="text-[9px] tabular-nums text-neutral-600">{axis.maxValue}</span>
      <input
        type="range"
        min={axis.minValue}
        max={axis.maxValue}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="vertical-slider h-24 w-5 accent-teal-500"
        style={{
          writingMode: 'vertical-lr',
          direction: 'rtl',
          appearance: 'slider-vertical' as any,
        }}
      />
      <span className="text-[9px] tabular-nums text-neutral-600">{axis.minValue}</span>
      <span className="mt-0.5 rounded bg-neutral-800 px-1 py-px text-[9px] tabular-nums text-teal-400">{value.toFixed(decimals)}</span>
    </div>
  );
}

interface GridFamilyCardProps {
  family: FontFamily;
  selected: Set<string>;
  onAnalyze: (id: string) => void;
  onToggleStar: (family: FontFamily) => void;
  onToggleSelect: (id: string) => void;
  onCategoryOverride?: (family: FontFamily, cat: FontCategory) => void;
  bulkEditMode?: boolean;
  bulkSelected?: boolean;
  onBulkToggle?: (familyName: string) => void;
}

function GridFamilyCard({ family, selected, onAnalyze, onToggleStar, onToggleSelect, onCategoryOverride, bulkEditMode, bulkSelected, onBulkToggle }: GridFamilyCardProps) {
  const previewFont = useMemo(() => pickPreviewFont(family.fonts), [family.fonts]);
  const { fontFamily, loading, ref } = useFontFace(previewFont.id);
  const [showVariants, setShowVariants] = useState(false);
  const [showCatPopover, setShowCatPopover] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const catPopoverRef = useRef<HTMLDivElement>(null);

  const axes = useMemo(() => previewFont.variableAxes ?? [], [previewFont]);
  const wghtAxis = useMemo(() => axes.find((a) => a.tag === 'wght'), [axes]);
  const wdthAxis = useMemo(() => axes.find((a) => a.tag === 'wdth'), [axes]);
  const italAxis = useMemo(() => axes.find((a) => a.tag === 'ital' || a.tag === 'slnt'), [axes]);
  const otherAxes = useMemo(() => axes.filter((a) => a.tag !== 'wght' && a.tag !== 'wdth' && a.tag !== 'ital' && a.tag !== 'slnt'), [axes]);

  const [axisValues, setAxisValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(axes.map((a) => [a.tag, a.defaultValue]))
  );

  const updateAxis = useCallback((tag: string, val: number) => {
    setAxisValues((prev) => ({ ...prev, [tag]: val }));
  }, []);

  const fontVariationSettings = useMemo(() => {
    if (axes.length === 0) return undefined;
    return Object.entries(axisValues)
      .map(([tag, val]) => `'${tag}' ${val}`)
      .join(', ');
  }, [axes, axisValues]);

  useEffect(() => {
    if (!showVariants) return;
    const onClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setShowVariants(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showVariants]);

  useEffect(() => {
    if (!showCatPopover) return;
    const handler = (e: MouseEvent) => {
      if (catPopoverRef.current && !catPopoverRef.current.contains(e.target as Node)) setShowCatPopover(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showCatPopover]);

  const anySelected = family.fonts.some((f) => selected.has(f.id));
  const effectiveCategory = previewFont.categoryOverride ?? previewFont.category;

  const hasItalicVariant = !italAxis && family.fonts.some((f) => f.style === 'italic');
  const [showItalicVariant, setShowItalicVariant] = useState(false);

  return (
    <div
      ref={ref}
      className={`group relative flex flex-col rounded-lg border bg-neutral-900 transition-colors hover:border-neutral-600 ${bulkSelected ? 'border-orange-500' : 'border-neutral-800'}`}
      data-testid="grid-card"
    >
      {/* Top bar: category, font name, badges */}
      <div className="flex items-center gap-1.5 border-b border-neutral-800 px-3 py-2">
        {bulkEditMode && (
          <input
            type="checkbox"
            checked={bulkSelected ?? false}
            onChange={(e) => { e.stopPropagation(); onBulkToggle?.(family.familyName); }}
            onClick={(e) => e.stopPropagation()}
            className="h-3.5 w-3.5 shrink-0 rounded border-neutral-600 bg-neutral-800 accent-orange-500"
          />
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleStar(family); }}
          className="text-sm leading-none transition-colors"
          title={family.starred ? 'Unstar family' : 'Star family'}
        >
          {family.starred
            ? <span className="text-amber-400">&#9733;</span>
            : <span className="text-neutral-700 opacity-0 transition-opacity hover:text-amber-400/60 group-hover:opacity-100">&#9734;</span>}
        </button>
        {effectiveCategory && (
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setShowCatPopover((v) => !v); }}
              className={`rounded-full border px-1.5 py-px text-[9px] font-bold uppercase leading-tight ${CAT_COLORS[effectiveCategory] ?? 'bg-neutral-700/50 text-neutral-500 border-neutral-700'}`}
              title={`Category: ${effectiveCategory}`}
            >
              {CAT_LABELS[effectiveCategory] ?? effectiveCategory}
            </button>
            {showCatPopover && (
              <div
                ref={catPopoverRef}
                className="absolute left-0 top-full z-30 mt-1 w-36 rounded-lg border border-neutral-700 bg-neutral-900 py-1 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="border-b border-neutral-800 px-3 py-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Set Category</span>
                </div>
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={(e) => { e.stopPropagation(); onCategoryOverride?.(family, cat.id); setShowCatPopover(false); }}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-neutral-800 ${effectiveCategory === cat.id ? 'text-blue-400' : 'text-neutral-300'}`}
                  >
                    {effectiveCategory === cat.id && <span className="text-blue-400">&#10003;</span>}
                    <span className={effectiveCategory === cat.id ? '' : 'ml-5'}>{cat.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <span
          className="min-w-0 flex-1 cursor-pointer truncate text-xs font-medium text-neutral-300"
          onClick={() => bulkEditMode ? onBulkToggle?.(family.familyName) : onAnalyze(previewFont.id)}
          title={family.familyName}
        >
          {family.fonts.length} style{family.fonts.length !== 1 ? 's' : ''}
        </span>

        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (family.fonts.length === 1) onToggleSelect(previewFont.id);
              else setShowVariants((v) => !v);
            }}
            className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold transition-all ${
              anySelected ? 'bg-blue-500 text-white' : 'bg-neutral-700/50 text-neutral-500 opacity-0 hover:bg-blue-500/30 hover:text-blue-300 group-hover:opacity-100'
            }`}
            title="Add to compare"
          >
            {anySelected ? selected.size : '+'}
          </button>
          <SourceBadge source={family.source} sources={family.sources} />
          {family.hasVariable && <VariableBadge />}
        </div>
      </div>

      {showVariants && (
        <div
          ref={popoverRef}
          className="absolute right-1 top-10 z-20 w-48 rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="border-b border-neutral-800 px-3 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Add to compare</span>
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            {family.fonts.map((f) => (
              <label key={f.id} className="flex cursor-pointer items-center gap-2 px-3 py-1 text-xs text-neutral-300 hover:bg-neutral-800">
                <input type="checkbox" checked={selected.has(f.id)} onChange={() => onToggleSelect(f.id)} className="h-3 w-3 rounded border-neutral-600 bg-neutral-800 accent-blue-500" />
                <span className="truncate">{variantLabel(f)}</span>
                <span className="ml-auto shrink-0 tabular-nums text-neutral-600">{f.weight}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Main body: optional sliders + preview */}
      <div
        className="flex flex-1 cursor-pointer items-stretch px-2 py-3"
        onClick={() => bulkEditMode ? onBulkToggle?.(family.familyName) : onAnalyze(previewFont.id)}
      >
        {/* Left: weight slider */}
        {wghtAxis && (
          <VerticalAxisSlider
            axis={wghtAxis}
            value={axisValues[wghtAxis.tag] ?? wghtAxis.defaultValue}
            onChange={(v) => updateAxis(wghtAxis.tag, v)}
            side="left"
          />
        )}

        {/* Center: Aa preview */}
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center">
          <div className="flex h-28 w-full items-center justify-center text-white">
            {loading ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-600 border-t-blue-400" />
            ) : (
              <span
                className="text-6xl transition-opacity"
                style={{
                  fontFamily: fontFamily ? `'${fontFamily}', serif` : 'serif',
                  opacity: fontFamily ? 1 : 0.3,
                  fontVariationSettings: fontFamily ? fontVariationSettings : undefined,
                  fontStyle: showItalicVariant ? 'italic' : undefined,
                }}
                data-testid="grid-card-preview"
              >
                Aa
              </span>
            )}
          </div>
          <h3
            className="mt-1 w-full truncate text-center text-sm font-medium text-white"
            title={family.familyName}
          >
            {family.familyName}
          </h3>
        </div>

        {/* Right: width slider */}
        {wdthAxis && (
          <VerticalAxisSlider
            axis={wdthAxis}
            value={axisValues[wdthAxis.tag] ?? wdthAxis.defaultValue}
            onChange={(v) => updateAxis(wdthAxis.tag, v)}
            side="right"
          />
        )}
      </div>

      {/* Bottom bar: italic/slant toggle + other axes */}
      {(italAxis || hasItalicVariant || otherAxes.length > 0) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-neutral-800 px-3 py-2" onClick={(e) => e.stopPropagation()}>
          {italAxis && (
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-semibold uppercase text-neutral-500">{italAxis.tag === 'ital' ? 'Style' : 'Slant'}</span>
              {italAxis.tag === 'ital' ? (
                <div className="flex rounded border border-neutral-700">
                  <button
                    onClick={() => updateAxis('ital', 0)}
                    className={`px-2 py-0.5 text-[10px] transition-colors ${(axisValues.ital ?? 0) === 0 ? 'bg-neutral-700 text-white' : 'text-neutral-500 hover:text-white'}`}
                  >
                    Upright
                  </button>
                  <button
                    onClick={() => updateAxis('ital', 1)}
                    className={`px-2 py-0.5 text-[10px] transition-colors ${(axisValues.ital ?? 0) === 1 ? 'bg-neutral-700 text-white' : 'text-neutral-500 hover:text-white'}`}
                  >
                    Italic
                  </button>
                </div>
              ) : (
                <input
                  type="range"
                  min={italAxis.minValue}
                  max={italAxis.maxValue}
                  step={0.5}
                  value={axisValues[italAxis.tag] ?? italAxis.defaultValue}
                  onChange={(e) => updateAxis(italAxis.tag, parseFloat(e.target.value))}
                  className="w-16 accent-teal-500"
                />
              )}
            </div>
          )}
          {!italAxis && hasItalicVariant && (
            <div className="flex rounded border border-neutral-700">
              <button
                onClick={() => setShowItalicVariant(false)}
                className={`px-2 py-0.5 text-[10px] transition-colors ${!showItalicVariant ? 'bg-neutral-700 text-white' : 'text-neutral-500 hover:text-white'}`}
              >
                Upright
              </button>
              <button
                onClick={() => setShowItalicVariant(true)}
                className={`px-2 py-0.5 text-[10px] transition-colors ${showItalicVariant ? 'bg-neutral-700 text-white' : 'text-neutral-500 hover:text-white'}`}
              >
                Italic
              </button>
            </div>
          )}
          {otherAxes.map((axis) => {
            const info = getAxisInfo(axis.tag, axis.name);
            return (
              <div key={axis.tag} className="flex items-center gap-1">
                <span className="text-[9px] font-semibold uppercase text-neutral-500" title={info.description}>{info.name}</span>
                <input
                  type="range"
                  min={axis.minValue}
                  max={axis.maxValue}
                  step={axis.maxValue - axis.minValue > 10 ? 1 : 0.01}
                  value={axisValues[axis.tag] ?? axis.defaultValue}
                  onChange={(e) => updateAxis(axis.tag, parseFloat(e.target.value))}
                  className="w-16 accent-teal-500"
                />
                <span className="text-[9px] tabular-nums text-neutral-600">
                  {(axisValues[axis.tag] ?? axis.defaultValue).toFixed(axis.maxValue - axis.minValue > 10 ? 0 : 2)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
