import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type { Font, Glyph } from 'opentype.js';
import type { FontData } from '../types';
import { OTF_FEATURE_NAMES } from '../lib/otfFeatures';

interface GlyphInfo {
  index: number;
  glyph: Glyph;
  name: string;
  unicode: number | null;
  char: string;
}

interface FeatureSubstitution {
  fromGlyphId: number;
  toGlyphIds: number[];
}

function extractFeatureSubstitutions(font: Font): Map<string, FeatureSubstitution[]> {
  const result = new Map<string, FeatureSubstitution[]>();
  const gsub = (font.tables as any).gsub;
  if (!gsub?.features || !gsub?.lookups) return result;

  for (const feat of gsub.features) {
    const tag = feat.tag as string;
    if (!tag) continue;
    const subs: FeatureSubstitution[] = [];
    const lookupIndexes: number[] = feat.feature?.lookupListIndexes ?? [];

    for (const li of lookupIndexes) {
      const lookup = gsub.lookups[li];
      if (!lookup) continue;

      for (const sub of lookup.subtables ?? []) {
        const coveredGlyphs = getCoverageGlyphs(sub.coverage);
        if (!coveredGlyphs.length) continue;

        if (lookup.lookupType === 1) {
          if (sub.substitute) {
            for (let i = 0; i < coveredGlyphs.length; i++) {
              if (sub.substitute[i] != null) {
                subs.push({ fromGlyphId: coveredGlyphs[i], toGlyphIds: [sub.substitute[i]] });
              }
            }
          } else if (sub.deltaGlyphId != null) {
            for (const gid of coveredGlyphs) {
              subs.push({ fromGlyphId: gid, toGlyphIds: [gid + sub.deltaGlyphId] });
            }
          }
        } else if (lookup.lookupType === 3) {
          const altSets: number[][] = sub.alternateSets ?? [];
          for (let i = 0; i < coveredGlyphs.length; i++) {
            if (altSets[i]?.length) {
              subs.push({ fromGlyphId: coveredGlyphs[i], toGlyphIds: altSets[i] });
            }
          }
        } else if (lookup.lookupType === 4) {
          // Ligature - show as a substitution from first glyph
          const ligSets: any[] = sub.ligatureSets ?? [];
          for (let i = 0; i < coveredGlyphs.length; i++) {
            const ligs = ligSets[i];
            if (!Array.isArray(ligs)) continue;
            for (const lig of ligs) {
              if (lig.ligGlyph != null) {
                subs.push({ fromGlyphId: coveredGlyphs[i], toGlyphIds: [lig.ligGlyph] });
              }
            }
          }
        }
      }
    }

    if (subs.length > 0) {
      const existing = result.get(tag) ?? [];
      result.set(tag, existing.concat(subs));
    }
  }

  return result;
}

function getCoverageGlyphs(coverage: any): number[] {
  if (!coverage) return [];
  if (Array.isArray(coverage.glyphs)) return coverage.glyphs;
  if (Array.isArray(coverage.ranges)) {
    const glyphs: number[] = [];
    for (const r of coverage.ranges) {
      for (let g = r.start; g <= r.end; g++) glyphs.push(g);
    }
    return glyphs;
  }
  return [];
}

const GLYPHS_PER_PAGE = 200;

function GlyphCell({ glyph, info, cellSize, font }: {
  glyph: Glyph;
  info: GlyphInfo;
  cellSize: number;
  font: Font;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const drawSize = cellSize - 24;
    canvas.width = drawSize * dpr;
    canvas.height = drawSize * dpr;
    canvas.style.width = `${drawSize}px`;
    canvas.style.height = `${drawSize}px`;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, drawSize, drawSize);

    const bb = glyph.getBoundingBox();
    const gW = bb.x2 - bb.x1;
    const gH = bb.y2 - bb.y1;
    if (gW === 0 && gH === 0) return;

    const padding = 4;
    const availSize = drawSize - padding * 2;
    const scale = Math.min(availSize / Math.max(gW, 1), availSize / Math.max(gH, 1));
    const fontSize = font.unitsPerEm * scale;

    const cx = padding + (availSize - gW * scale) / 2;
    const cy = padding + (availSize - gH * scale) / 2;
    const drawX = cx - bb.x1 * scale;
    const drawY = cy + bb.y2 * scale;

    const path = glyph.getPath(drawX, drawY, fontSize);
    ctx.fillStyle = '#e5e5e5';
    ctx.beginPath();
    for (const cmd of path.commands) {
      if (cmd.type === 'M') ctx.moveTo(cmd.x, cmd.y);
      else if (cmd.type === 'L') ctx.lineTo(cmd.x, cmd.y);
      else if (cmd.type === 'Q') ctx.quadraticCurveTo(cmd.x1, cmd.y1, cmd.x, cmd.y);
      else if (cmd.type === 'C') ctx.bezierCurveTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y);
      else if (cmd.type === 'Z') ctx.closePath();
    }
    ctx.fill();
  }, [glyph, cellSize, font]);

  const label = info.unicode != null
    ? `U+${info.unicode.toString(16).toUpperCase().padStart(4, '0')}`
    : `#${info.index}`;

  return (
    <div
      className="flex flex-col items-center rounded border border-neutral-800 bg-neutral-900 transition-colors hover:border-neutral-600"
      style={{ width: cellSize, height: cellSize + 28 }}
      title={`${info.name}\n${label}${info.char ? ` "${info.char}"` : ''}`}
    >
      <canvas ref={canvasRef} className="mt-1" />
      <div className="w-full truncate px-1 text-center text-[10px] text-neutral-500" title={info.name}>
        {label}
      </div>
      <div className="w-full truncate px-1 text-center text-[9px] text-neutral-600" title={info.name}>
        {info.name.length > 12 ? info.name.slice(0, 11) + '…' : info.name}
      </div>
    </div>
  );
}

export function GlyphsView({ fontData }: { fontData: FontData }) {
  const [cellSize, setCellSize] = useState(72);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [selectedFeature, setSelectedFeature] = useState<string | null>(null);

  const allGlyphs = useMemo<GlyphInfo[]>(() => {
    try {
      const font = fontData.font;
      if (!font?.glyphs) return [];
      const count = font.glyphs.length ?? 0;
      const infos: GlyphInfo[] = [];
      for (let i = 0; i < count; i++) {
        const g = font.glyphs.get(i);
        if (!g) continue;
        const unicode = (g as any).unicode ?? null;
        const char = unicode != null ? String.fromCodePoint(unicode) : '';
        infos.push({
          index: i,
          glyph: g,
          name: g.name ?? `.glyph${i}`,
          unicode,
          char,
        });
      }
      return infos;
    } catch {
      return [];
    }
  }, [fontData.font]);

  const featureSubs = useMemo(() => {
    try { return extractFeatureSubstitutions(fontData.font); }
    catch { return new Map<string, FeatureSubstitution[]>(); }
  }, [fontData.font]);
  const featureTags = useMemo(() => Array.from(featureSubs.keys()).sort(), [featureSubs]);

  const featureGlyphIds = useMemo<Set<number> | null>(() => {
    if (!selectedFeature) return null;
    const subs = featureSubs.get(selectedFeature);
    if (!subs) return null;
    const ids = new Set<number>();
    for (const s of subs) {
      ids.add(s.fromGlyphId);
      for (const to of s.toGlyphIds) ids.add(to);
    }
    return ids;
  }, [selectedFeature, featureSubs]);

  const filtered = useMemo(() => {
    let items = allGlyphs;

    if (featureGlyphIds) {
      items = items.filter((g) => featureGlyphIds.has(g.index));
    }

    if (!search.trim()) return items;
    const q = search.trim().toLowerCase();

    if (q.startsWith('u+')) {
      const hex = q.slice(2);
      return items.filter((g) => g.unicode != null && g.unicode.toString(16).toLowerCase().startsWith(hex));
    }

    return items.filter((g) =>
      g.name.toLowerCase().includes(q) ||
      g.char.toLowerCase().includes(q) ||
      (g.unicode != null && g.unicode.toString(16).toLowerCase().includes(q))
    );
  }, [allGlyphs, search, featureGlyphIds]);

  useEffect(() => { setPage(0); }, [search, selectedFeature]);

  const totalPages = Math.ceil(filtered.length / GLYPHS_PER_PAGE);
  const pageGlyphs = filtered.slice(page * GLYPHS_PER_PAGE, (page + 1) * GLYPHS_PER_PAGE);

  const handleFeatureClick = useCallback((tag: string) => {
    setSelectedFeature((prev) => prev === tag ? null : tag);
  }, []);

  return (
    <div className="flex h-full flex-col" data-testid="glyphs-view">
      <div className="flex flex-wrap items-center gap-3 border-b border-neutral-800 px-4 py-2">
        <input
          type="text"
          placeholder="Search glyphs (name, char, U+hex)…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-56 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200 placeholder:text-neutral-500 outline-none focus:border-blue-500"
        />
        <label className="flex items-center gap-2 text-xs text-neutral-400">
          Size
          <input
            type="range"
            min={48}
            max={160}
            value={cellSize}
            onChange={(e) => setCellSize(Number(e.target.value))}
            className="h-1 w-24 accent-blue-500"
          />
          <span className="w-8 text-right text-neutral-500">{cellSize}</span>
        </label>
        <span className="text-xs text-neutral-500">
          {filtered.length} / {allGlyphs.length} glyphs
        </span>
      </div>

      {featureTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b border-neutral-800 px-4 py-2">
          <span className="text-xs text-neutral-500 self-center mr-1">OTF Features:</span>
          {featureTags.map((tag) => (
            <button
              key={tag}
              onClick={() => handleFeatureClick(tag)}
              className={`rounded px-1.5 py-0.5 text-xs transition-colors ${
                selectedFeature === tag
                  ? 'bg-blue-600 text-white'
                  : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200'
              }`}
              title={OTF_FEATURE_NAMES[tag] ?? tag}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-wrap gap-2">
          {pageGlyphs.map((info) => (
            <GlyphCell
              key={info.index}
              glyph={info.glyph}
              info={info}
              cellSize={cellSize}
              font={fontData.font}
            />
          ))}
        </div>
        {filtered.length === 0 && (
          <div className="flex h-32 items-center justify-center text-sm text-neutral-500">
            No glyphs match your search
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 border-t border-neutral-800 px-4 py-2">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 transition-colors hover:bg-neutral-800 disabled:opacity-30"
          >
            Prev
          </button>
          <span className="text-xs text-neutral-400">
            Page {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
            className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 transition-colors hover:bg-neutral-800 disabled:opacity-30"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
