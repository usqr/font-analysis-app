import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { StoredFontMeta, FontFamily, FontCategory } from '../types';
import type { ScanEvent, ScanProgressUpdate } from '../lib/api';
import { fetchDatabase, scanFolderStream, pickFolder, deleteFont, refreshFont, updateFontPath, clearDatabase, deduplicateDatabase, computeMetrics, downloadGoogleFonts as downloadGFonts } from '../lib/api';
import type { GoogleDownloadEvent } from '../lib/api';
import { groupByFamily, variantLabel, groupByWidth, type WidthStyleGroup } from '../lib/fontFamilies';
import { useFontFace } from '../lib/useFontFace';
import { HistogramFilter } from './HistogramFilter';

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
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [globalCardState, setGlobalCardState] = useState<CardState | null>(null);
  const [globalCardVersion, setGlobalCardVersion] = useState(0);
  const [dedupMsg, setDedupMsg] = useState<string | null>(null);
  const dedupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<FontCategory | null>(null);
  const [showGoogleFonts, setShowGoogleFonts] = useState(false);
  const [gfFolder, setGfFolder] = useState('');
  const [gfDownloading, setGfDownloading] = useState(false);
  const [gfProgress, setGfProgress] = useState<{ current: number; total: number; downloaded: number; failed: number } | null>(null);
  const [gfLastFamily, setGfLastFamily] = useState('');
  const gfAbortRef = useRef<AbortController | null>(null);
  const [contrastRange, setContrastRange] = useState<[number, number]>([0, 1]);
  const [weightRange, setWeightRange] = useState<[number, number]>([0, 1]);
  const [widthRange, setWidthRange] = useState<[number, number]>([0, 2]);
  const [xHeightRange, setXHeightRange] = useState<[number, number]>([0, 1]);
  const [metricsReady, setMetricsReady] = useState(false);

  const loadDatabase = useCallback(async () => {
    try {
      setLoading(true);
      const db = await fetchDatabase();
      setAllFonts(db.fonts);
      setFamilies(groupByFamily(db.fonts));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDatabase();
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
        setFamilies(groupByFamily(next));
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
        setFamilies(groupByFamily(next));
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

  const handleCompare = useCallback(() => {
    if (selected.size < 2) return;
    const ids = Array.from(selected).slice(0, 5);
    navigate(`/compare?ids=${ids.join(',')}`);
  }, [selected, navigate]);

  useEffect(() => {
    scanLogRef.current?.scrollTo({ top: scanLogRef.current.scrollHeight });
  }, [scanLog]);

  const familyMetrics = useMemo(() => {
    const map = new Map<string, { metrics: StoredFontMeta['metrics']; category: StoredFontMeta['category'] }>();
    for (const fam of families) {
      const regular = fam.fonts.find((f) => f.weight >= 380 && f.weight <= 420 && f.style === 'normal')
        ?? fam.fonts.find((f) => f.style === 'normal') ?? fam.fonts[0];
      map.set(fam.familyName, { metrics: regular?.metrics, category: regular?.category });
    }
    return map;
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
  }, [families, search, selectedCategory, familyMetrics]);

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
    }

    return result;
  }, [searchAndCatFiltered, showAdvancedFilters, contrastRange, weightRange, widthRange, xHeightRange, familyMetrics]);

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
    setSearch('');
    if (histogramValues.contrast.length > 0) {
      const sorted = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return [s[0], s[s.length - 1]] as [number, number]; };
      setContrastRange(sorted(histogramValues.contrast));
      setWeightRange(sorted(histogramValues.weight));
      setWidthRange(sorted(histogramValues.width));
      setXHeightRange(sorted(histogramValues.xHeight));
    }
  }, [histogramValues]);

  const handleCollapseAll = useCallback(() => {
    setGlobalCardState('collapsed');
    setGlobalCardVersion((v) => v + 1);
  }, []);

  const handleExpandAll = useCallback(() => {
    setGlobalCardState('normal');
    setGlobalCardVersion((v) => v + 1);
  }, []);

  const handleGoogleFontsBrowse = useCallback(async () => {
    setBrowsing(true);
    try {
      const folder = await pickFolder();
      if (folder) setGfFolder(folder);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBrowsing(false);
    }
  }, []);

  const handleGoogleFontsDownload = useCallback(async () => {
    if (!gfFolder.trim()) return;
    setGfDownloading(true);
    setGfProgress(null);
    setGfLastFamily('');
    const controller = new AbortController();
    gfAbortRef.current = controller;

    try {
      await downloadGFonts(gfFolder.trim(), null, (event: GoogleDownloadEvent) => {
        if (event.type === 'start') {
          setGfProgress({ current: 0, total: event.total ?? 0, downloaded: 0, failed: 0 });
        } else if (event.type === 'progress') {
          setGfProgress((prev) => ({
            current: event.current ?? (prev?.current ?? 0),
            total: event.total ?? (prev?.total ?? 0),
            downloaded: (prev?.downloaded ?? 0) + (event.status === 'ok' ? 1 : 0),
            failed: (prev?.failed ?? 0) + (event.status === 'error' ? 1 : 0),
          }));
          if (event.family) setGfLastFamily(event.family);
        } else if (event.type === 'done') {
          setGfProgress((prev) => prev ? { ...prev, current: prev.total, downloaded: event.downloaded ?? prev.downloaded, failed: event.failed ?? prev.failed } : prev);
        }
      }, controller.signal);
    } catch (e: any) {
      if (e.name !== 'AbortError') setError(e.message);
    } finally {
      setGfDownloading(false);
      gfAbortRef.current = null;
    }
  }, [gfFolder]);

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
        <button
          onClick={() => setShowGoogleFonts((v) => !v)}
          className={`rounded-md border px-4 py-1.5 text-sm font-medium transition-colors ${
            showGoogleFonts
              ? 'border-blue-500 bg-blue-500/10 text-blue-400'
              : 'border-neutral-600 text-neutral-300 hover:bg-neutral-800 hover:text-white'
          }`}
        >
          Google Fonts
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
          <>
            <button
              onClick={handleCollapseAll}
              className="rounded-md border border-neutral-600 px-3 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
              data-testid="collapse-all"
            >
              Collapse All
            </button>
            <button
              onClick={handleExpandAll}
              className="rounded-md border border-neutral-600 px-3 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
              data-testid="expand-all"
            >
              Expand All
            </button>
          </>
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
          {allFonts.length} fonts in {families.length} families
        </span>
      </div>

      {/* Category & histogram filters */}
      {allFonts.length > 0 && (
        <div className="border-b border-neutral-800 px-4 py-2.5">
          <div className="flex items-center gap-2">
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
            {(selectedCategory !== null || search.trim()) && (
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

      {/* Google Fonts download panel */}
      {showGoogleFonts && (
        <div className="border-b border-neutral-800 bg-neutral-900/80 px-4 py-3">
          <div className="flex items-center gap-3">
            <label className="text-sm text-neutral-400">Download to:</label>
            <input
              type="text"
              value={gfFolder}
              onChange={(e) => setGfFolder(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !gfDownloading && gfFolder.trim() && handleGoogleFontsDownload()}
              placeholder="/path/to/google-fonts"
              disabled={gfDownloading}
              className="flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-200 placeholder-neutral-500 outline-none focus:border-blue-500 disabled:opacity-50"
              autoFocus
            />
            <button
              onClick={handleGoogleFontsBrowse}
              disabled={browsing || gfDownloading}
              className="rounded-md border border-neutral-600 px-3 py-1.5 text-sm text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white disabled:opacity-50"
            >
              {browsing ? 'Opening...' : 'Browse'}
            </button>
            {gfDownloading ? (
              <button
                onClick={() => gfAbortRef.current?.abort()}
                className="rounded-md bg-red-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-500"
              >
                Stop
              </button>
            ) : (
              <button
                onClick={handleGoogleFontsDownload}
                disabled={!gfFolder.trim()}
                className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
              >
                Download All
              </button>
            )}
            <button
              onClick={() => { if (!gfDownloading) { setShowGoogleFonts(false); setGfProgress(null); } }}
              disabled={gfDownloading}
              className="rounded-md px-3 py-1.5 text-sm text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white disabled:opacity-50"
            >
              Close
            </button>
          </div>

          {gfProgress && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-800">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all duration-150"
                    style={{ width: `${gfProgress.total > 0 ? (gfProgress.current / gfProgress.total) * 100 : 0}%` }}
                  />
                </div>
                <span className="shrink-0 text-xs tabular-nums text-neutral-400">
                  {gfProgress.current} / {gfProgress.total}
                </span>
              </div>
              <div className="flex gap-4 text-xs">
                <span className="text-emerald-400">{gfProgress.downloaded} downloaded</span>
                {gfProgress.failed > 0 && <span className="text-red-400">{gfProgress.failed} failed</span>}
                {gfLastFamily && <span className="text-neutral-500">{gfLastFamily}</span>}
                {gfDownloading && gfProgress.total > 0 && (
                  <span className="text-neutral-500">
                    {Math.round((gfProgress.current / gfProgress.total) * 100)}%
                  </span>
                )}
              </div>
              {!gfDownloading && gfProgress.current >= gfProgress.total && (
                <p className="text-xs text-emerald-400">
                  Download complete. Use &quot;Scan Folder&quot; to import downloaded fonts into the library.
                </p>
              )}
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
              <p className="text-lg">No families match &quot;{search}&quot;</p>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6" data-testid="grid-view">
            {filteredFamilies.map((family) => (
              <GridFamilyCard
                key={family.familyName}
                family={family}
                onAnalyze={(id) => navigate(`/analyze/${id}`)}
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
                onAnalyze={(id) => navigate(`/analyze/${id}`)}
                onDelete={handleDelete}
                onRefresh={handleRefresh}
                onEditPath={(id, path) => setEditingPath({ id, path })}
                globalState={globalCardState}
                globalVersion={globalCardVersion}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Source Badge                                                       */
/* ------------------------------------------------------------------ */

function SourceBadge({ source }: { source?: string }) {
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

/* ------------------------------------------------------------------ */
/*  List view: FamilyCard                                              */
/* ------------------------------------------------------------------ */

interface FamilyCardProps {
  family: FontFamily;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onAnalyze: (id: string) => void;
  onDelete: (id: string) => void;
  onRefresh: (id: string) => void;
  onEditPath: (id: string, currentPath: string) => void;
  globalState: CardState | null;
  globalVersion: number;
}

function FamilyCard({
  family,
  selected,
  onToggleSelect,
  onAnalyze,
  onDelete,
  onRefresh,
  onEditPath,
  globalState,
  globalVersion,
}: FamilyCardProps) {
  const [cardState, setCardState] = useState<CardState>('normal');
  const [activeWidth, setActiveWidth] = useState<string>('');
  const [showItalic, setShowItalic] = useState(false);

  useEffect(() => {
    if (globalState) setCardState(globalState);
  }, [globalState, globalVersion]);

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

  const toggleCardState = () => {
    setCardState((s) => (s === 'collapsed' ? 'normal' : 'collapsed'));
  };

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900" data-testid="family-card">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
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
        <SourceBadge source={family.fonts[0]?.source} />
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
                className="group flex items-center gap-1.5 border-b border-neutral-800/50 px-3 py-1.5 last:border-b-0"
              >
                <input
                  type="checkbox"
                  checked={selected.has(font.id)}
                  onChange={() => onToggleSelect(font.id)}
                  className="h-3.5 w-3.5 shrink-0 rounded border-neutral-600 bg-neutral-800 accent-blue-500"
                />
                <div className="min-w-0 flex-1">
                  <span className="text-xs text-neutral-300">
                    {variantLabel(font, hasMultipleWidths)}
                  </span>
                  {cardState === 'expanded' && (
                    <p className="truncate text-xs text-neutral-600">
                      {font.filePath}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-xs text-neutral-600">
                  {font.weight}
                </span>
                <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
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
  const regular = fonts.find((f) => f.weight >= 380 && f.weight <= 420 && f.style === 'normal');
  return regular ?? fonts.find((f) => f.style === 'normal') ?? fonts[0];
}

interface GridFamilyCardProps {
  family: FontFamily;
  onAnalyze: (id: string) => void;
}

function GridFamilyCard({ family, onAnalyze }: GridFamilyCardProps) {
  const previewFont = useMemo(() => pickPreviewFont(family.fonts), [family.fonts]);
  const { fontFamily, loading, ref } = useFontFace(previewFont.id);

  return (
    <div
      ref={ref}
      className="relative flex cursor-pointer flex-col items-center rounded-lg border border-neutral-800 bg-neutral-900 p-4 transition-colors hover:border-neutral-600"
      onClick={() => onAnalyze(previewFont.id)}
      data-testid="grid-card"
    >
      <div className="absolute right-2 top-2">
        <SourceBadge source={previewFont.source} />
      </div>
      <div className="flex h-24 w-full items-center justify-center">
        {loading ? (
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-600 border-t-blue-400" />
        ) : (
          <span
            className="text-5xl text-white transition-opacity"
            style={{
              fontFamily: fontFamily ? `'${fontFamily}', serif` : 'serif',
              opacity: fontFamily ? 1 : 0.3,
            }}
            data-testid="grid-card-preview"
          >
            Aa
          </span>
        )}
      </div>
      <h3 className="mt-2 w-full truncate text-center text-sm font-medium text-white">
        {family.familyName}
      </h3>
      <p className="text-xs text-neutral-500">
        {family.fonts.length} Style{family.fonts.length !== 1 ? 's' : ''}
      </p>
    </div>
  );
}
