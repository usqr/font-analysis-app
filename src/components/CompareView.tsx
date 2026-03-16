import { useState, useEffect, useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as opentype from 'opentype.js';
import type { Font } from 'opentype.js';
import { fetchFontData } from '../lib/api';
import { analyzeXHeight } from '../analysis/xHeight';
import { useCanvasResize } from '../lib/useCanvasResize';

const COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7'];
const SIDEBAR_DEFAULT = 288;
const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 500;

interface LoadedFont {
  id: string;
  familyName: string;
  subfamilyName: string;
  font: Font;
  xHeight: number;
  capHeight: number;
  visible: boolean;
}

export function CompareView() {
  const [searchParams] = useSearchParams();
  const [fonts, setFonts] = useState<LoadedFont[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('Aa');
  const [fontSize, setFontSize] = useState(200);
  const [normalize, setNormalize] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);
  const draggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(SIDEBAR_DEFAULT);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const resizeCount = useCanvasResize(canvasWrapRef);

  const onDragStart = useCallback((e: ReactPointerEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    dragStartXRef.current = e.clientX;
    dragStartWidthRef.current = sidebarWidth;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [sidebarWidth]);

  const onDragMove = useCallback((e: ReactPointerEvent) => {
    if (!draggingRef.current) return;
    const delta = dragStartXRef.current - e.clientX;
    setSidebarWidth(Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, dragStartWidthRef.current + delta)));
  }, []);

  const onDragEnd = useCallback(() => {
    draggingRef.current = false;
  }, []);

  useEffect(() => {
    const ids = searchParams.get('ids')?.split(',').filter(Boolean) ?? [];
    if (ids.length === 0) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all(
      ids.slice(0, 5).map(async (id) => {
        const data = await fetchFontData(id);
        const binary = Uint8Array.from(atob(data.base64Data), (c) => c.charCodeAt(0));
        const font = opentype.parse(binary.buffer as ArrayBuffer);
        const xh = analyzeXHeight(font);
        return {
          id,
          familyName: data.familyName,
          subfamilyName: data.subfamilyName,
          font,
          xHeight: xh?.xHeight ?? font.unitsPerEm * 0.5,
          capHeight: xh?.capHeight ?? font.unitsPerEm * 0.7,
          visible: true,
        } satisfies LoadedFont;
      }),
    )
      .then((loaded) => {
        if (!cancelled) setFonts(loaded);
      })
      .catch((e: any) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [searchParams]);

  const toggleVisibility = useCallback((id: string) => {
    setFonts((prev) =>
      prev.map((f) => (f.id === id ? { ...f, visible: !f.visible } : f)),
    );
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = canvasWrapRef.current;
    if (!canvas || !wrap || fonts.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = wrap.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const visibleFonts = fonts.filter((f) => f.visible);
    if (visibleFonts.length === 0) return;

    const baseline = rect.height * 0.65;
    const referenceXHeight = visibleFonts[0].xHeight;
    const padding = 24;

    let maxTextWidth = 0;
    for (const lf of visibleFonts) {
      const baseScale = normalize
        ? (fontSize / lf.font.unitsPerEm) * (referenceXHeight / lf.xHeight)
        : fontSize / lf.font.unitsPerEm;
      const path = lf.font.getPath(text, 0, 0, lf.font.unitsPerEm);
      let xMin = Infinity, xMax = -Infinity;
      for (const cmd of path.commands) {
        if ('x' in cmd) {
          if (cmd.x < xMin) xMin = cmd.x;
          if (cmd.x > xMax) xMax = cmd.x;
        }
      }
      if (xMax > xMin) {
        maxTextWidth = Math.max(maxTextWidth, (xMax - xMin) * baseScale);
      }
    }

    const availableWidth = rect.width - padding * 2;
    const fitScale = maxTextWidth > availableWidth && maxTextWidth > 0
      ? availableWidth / maxTextWidth
      : 1;

    const centeredX = maxTextWidth > 0
      ? (rect.width - maxTextWidth * fitScale) / 2
      : padding;

    visibleFonts.forEach((lf, i) => {
      const color = COLORS[i % COLORS.length];
      const baseScale = normalize
        ? (fontSize / lf.font.unitsPerEm) * (referenceXHeight / lf.xHeight)
        : fontSize / lf.font.unitsPerEm;
      const scale = baseScale * fitScale;

      ctx.save();
      ctx.translate(centeredX, baseline);
      ctx.scale(scale, scale);

      const path = lf.font.getPath(text, 0, 0, lf.font.unitsPerEm);
      ctx.beginPath();
      for (const cmd of path.commands) {
        if (cmd.type === 'M') ctx.moveTo(cmd.x, cmd.y);
        else if (cmd.type === 'L') ctx.lineTo(cmd.x, cmd.y);
        else if (cmd.type === 'Q') ctx.quadraticCurveTo(cmd.x1, cmd.y1, cmd.x, cmd.y);
        else if (cmd.type === 'C') ctx.bezierCurveTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y);
        else if (cmd.type === 'Z') ctx.closePath();
      }
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = color;
      ctx.fill();

      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1 / scale;
      ctx.stroke();

      ctx.restore();
    });

    ctx.save();
    ctx.strokeStyle = '#525252';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, baseline);
    ctx.lineTo(rect.width, baseline);
    ctx.stroke();
    ctx.restore();
  }, [fonts, text, fontSize, normalize, resizeCount]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-600 border-t-blue-400" />
          <span className="text-neutral-400">Loading fonts for comparison...</span>
        </div>
      </div>
    );
  }

  if (fonts.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-neutral-500">
        <p className="text-lg">No fonts selected for comparison</p>
        <p className="text-sm">
          Go to the Library, select 2-5 fonts, and click &quot;Compare&quot;.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* Canvas area */}
      <div className="min-h-[300px] min-w-0 flex-1 overflow-hidden p-4">
        {error && (
          <div className="mb-3 rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-400">
            {error}
          </div>
        )}
        <div ref={canvasWrapRef} className="h-full w-full">
          <canvas ref={canvasRef} className="rounded-lg bg-neutral-900" />
        </div>
      </div>

      {/* Drag handle + Controls sidebar */}
      <div className="flex shrink-0 flex-col border-t border-neutral-800 lg:flex-row lg:border-t-0">
        {/* Drag handle (large screens only) */}
        {!sidebarCollapsed && (
          <div
            className="hidden w-1 cursor-col-resize items-center justify-center bg-neutral-800 transition-colors hover:bg-blue-600 lg:flex"
            onPointerDown={onDragStart}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            onPointerCancel={onDragEnd}
          />
        )}

        <aside
          className={`overflow-y-auto border-neutral-800 lg:border-l ${sidebarCollapsed ? 'w-full lg:w-10' : 'w-full'}`}
          style={!sidebarCollapsed ? { width: `${sidebarWidth}px` } : undefined}
        >
          <div
            className={sidebarCollapsed ? 'flex items-start justify-center pt-2 lg:h-full' : 'p-4'}
          >
            {/* Collapse toggle */}
            <button
              onClick={() => setSidebarCollapsed(v => !v)}
              className="mb-2 flex h-6 w-6 items-center justify-center rounded text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-neutral-200"
              title={sidebarCollapsed ? 'Show panel' : 'Hide panel'}
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className={`h-3.5 w-3.5 transition-transform ${sidebarCollapsed ? 'rotate-180' : ''}`}>
                <path d="M10.354 3.354a.5.5 0 0 0-.708-.708l-5 5a.5.5 0 0 0 0 .708l5 5a.5.5 0 0 0 .708-.708L5.707 8l4.647-4.646z"/>
              </svg>
            </button>

            {!sidebarCollapsed && (
              <>
                <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  Compare Controls
                </h2>

                {/* Text input */}
                <div className="mb-4">
                  <label className="mb-1 block text-xs text-neutral-400">
                    Sample text
                  </label>
                  <input
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200 outline-none focus:border-blue-500"
                  />
                </div>

                {/* Font size slider */}
                <div className="mb-4">
                  <label className="mb-1 flex items-center justify-between text-xs text-neutral-400">
                    <span>Size</span>
                    <span>{fontSize}px</span>
                  </label>
                  <input
                    type="range"
                    min={50}
                    max={500}
                    value={fontSize}
                    onChange={(e) => setFontSize(Number(e.target.value))}
                    className="w-full accent-blue-500"
                  />
                </div>

                {/* Normalize toggle */}
                <button
                  onClick={() => setNormalize((v) => !v)}
                  className="mb-6 flex w-full cursor-pointer items-center gap-2"
                >
                  <span className={`flex h-5 w-9 items-center rounded-full px-0.5 transition-colors ${normalize ? 'bg-blue-600' : 'bg-neutral-700'}`}>
                    <span className={`h-4 w-4 rounded-full bg-white transition-transform ${normalize ? 'translate-x-4' : 'translate-x-0'}`} />
                  </span>
                  <span className="text-sm text-neutral-300">Normalize x-height</span>
                </button>

                {/* Font legend */}
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  Fonts
                </h3>
                <div className="space-y-2">
                  {fonts.map((lf, i) => (
                    <label
                      key={lf.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-neutral-800"
                    >
                      <input
                        type="checkbox"
                        checked={lf.visible}
                        onChange={() => toggleVisibility(lf.id)}
                        className="h-3.5 w-3.5 rounded border-neutral-600 bg-neutral-800 accent-blue-500"
                      />
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: COLORS[i % COLORS.length] }}
                      />
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-neutral-200">
                          {lf.familyName}
                        </span>
                        <span className="block truncate text-xs text-neutral-500">
                          {lf.subfamilyName}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>

                {/* Metrics comparison */}
                <div className="mt-6 border-t border-neutral-800 pt-4">
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                    Metrics
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-neutral-800">
                          <th className="pb-2 pr-2 text-left text-neutral-500">Metric</th>
                          {fonts.map((lf, i) => (
                            <th
                              key={lf.id}
                              className="pb-2 pr-2 text-right"
                              style={{ color: COLORS[i % COLORS.length] }}
                            >
                              {lf.familyName.slice(0, 8)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="text-neutral-300">
                        <tr className="border-b border-neutral-800/50">
                          <td className="py-1.5 pr-2 text-neutral-500">UPM</td>
                          {fonts.map((lf) => (
                            <td key={lf.id} className="py-1.5 pr-2 text-right">
                              {lf.font.unitsPerEm}
                            </td>
                          ))}
                        </tr>
                        <tr className="border-b border-neutral-800/50">
                          <td className="py-1.5 pr-2 text-neutral-500">x-height</td>
                          {fonts.map((lf) => (
                            <td key={lf.id} className="py-1.5 pr-2 text-right">
                              {lf.xHeight}
                            </td>
                          ))}
                        </tr>
                        <tr className="border-b border-neutral-800/50">
                          <td className="py-1.5 pr-2 text-neutral-500">Cap height</td>
                          {fonts.map((lf) => (
                            <td key={lf.id} className="py-1.5 pr-2 text-right">
                              {lf.capHeight}
                            </td>
                          ))}
                        </tr>
                        <tr className="border-b border-neutral-800/50">
                          <td className="py-1.5 pr-2 text-neutral-500">Ascender</td>
                          {fonts.map((lf) => (
                            <td key={lf.id} className="py-1.5 pr-2 text-right">
                              {lf.font.ascender}
                            </td>
                          ))}
                        </tr>
                        <tr className="border-b border-neutral-800/50">
                          <td className="py-1.5 pr-2 text-neutral-500">Descender</td>
                          {fonts.map((lf) => (
                            <td key={lf.id} className="py-1.5 pr-2 text-right">
                              {lf.font.descender}
                            </td>
                          ))}
                        </tr>
                        <tr>
                          <td className="py-1.5 pr-2 text-neutral-500">Glyphs</td>
                          {fonts.map((lf) => (
                            <td key={lf.id} className="py-1.5 pr-2 text-right">
                              {lf.font.glyphs.length}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
