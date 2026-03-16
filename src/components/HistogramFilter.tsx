import { useRef, useMemo, useCallback, useState, useEffect } from 'react';

interface HistogramFilterProps {
  label: string;
  values: number[];
  filteredValues?: number[];
  range: [number, number];
  onChange: (range: [number, number]) => void;
  onReset: () => void;
}

const NUM_BINS = 50;

function buildBins(values: number[], dataMin: number, dataMax: number): number[] {
  if (values.length === 0) return new Array(NUM_BINS).fill(0);
  if (dataMax === dataMin) return new Array(NUM_BINS).fill(values.length);
  const b = new Array(NUM_BINS).fill(0);
  for (const v of values) {
    const idx = Math.min(NUM_BINS - 1, Math.floor(((v - dataMin) / (dataMax - dataMin)) * NUM_BINS));
    b[idx]++;
  }
  return b;
}

function buildAreaPath(bins: number[], maxBin: number, svgW: number, svgH: number): string {
  if (bins.length === 0) return '';
  const binW = svgW / bins.length;
  let d = `M0,${svgH}`;
  for (let i = 0; i < bins.length; i++) {
    const h = (bins[i] / maxBin) * (svgH - 4);
    d += ` L${i * binW},${svgH - h}`;
  }
  d += ` L${svgW},${svgH - (bins[bins.length - 1] / maxBin) * (svgH - 4)}`;
  d += ` L${svgW},${svgH} Z`;
  return d;
}

export function HistogramFilter({ label, values, filteredValues, range, onChange, onReset }: HistogramFilterProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<'min' | 'max' | 'range' | null>(null);
  const dragStartRef = useRef<{ x: number; startRange: [number, number] }>({ x: 0, startRange: [0, 1] });
  const didDragRef = useRef(false);

  const { bins, dataMin, dataMax } = useMemo(() => {
    if (values.length === 0) return { bins: [] as number[], dataMin: 0, dataMax: 1 };
    const sorted = [...values].sort((a, b) => a - b);
    const dMin = sorted[0];
    const dMax = sorted[sorted.length - 1];
    if (dMax === dMin) return { bins: Array(NUM_BINS).fill(values.length) as number[], dataMin: dMin, dataMax: dMax + 0.01 };
    return { bins: buildBins(values, dMin, dMax), dataMin: dMin, dataMax: dMax };
  }, [values]);

  const filteredBins = useMemo(() => {
    if (!filteredValues || filteredValues.length === 0) return null;
    return buildBins(filteredValues, dataMin, dataMax);
  }, [filteredValues, dataMin, dataMax]);

  const maxBin = useMemo(() => Math.max(1, ...bins), [bins]);

  const rangeToFrac = useCallback((val: number) => {
    if (dataMax === dataMin) return 0;
    return (val - dataMin) / (dataMax - dataMin);
  }, [dataMin, dataMax]);

  const fracToVal = useCallback((frac: number) => {
    return dataMin + frac * (dataMax - dataMin);
  }, [dataMin, dataMax]);

  const minFrac = rangeToFrac(range[0]);
  const maxFrac = rangeToFrac(range[1]);
  const isFiltered = range[0] > dataMin || range[1] < dataMax;

  const getXFromEvent = useCallback((e: MouseEvent | React.MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return 0;
    const rect = svg.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  }, []);

  const handlePointerDown = useCallback((e: React.MouseEvent, type: 'min' | 'max' | 'range') => {
    e.preventDefault();
    e.stopPropagation();
    didDragRef.current = false;
    setDragging(type);
    dragStartRef.current = { x: e.clientX, startRange: [...range] as [number, number] };
  }, [range]);

  useEffect(() => {
    if (!dragging) return;

    const handleMove = (e: MouseEvent) => {
      didDragRef.current = true;
      const frac = getXFromEvent(e);
      const val = fracToVal(frac);

      if (dragging === 'min') {
        onChange([Math.min(val, range[1] - (dataMax - dataMin) * 0.01), range[1]]);
      } else if (dragging === 'max') {
        onChange([range[0], Math.max(val, range[0] + (dataMax - dataMin) * 0.01)]);
      } else if (dragging === 'range') {
        const svg = svgRef.current;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const dx = (e.clientX - dragStartRef.current.x) / rect.width * (dataMax - dataMin);
        let newMin = dragStartRef.current.startRange[0] + dx;
        let newMax = dragStartRef.current.startRange[1] + dx;
        if (newMin < dataMin) { newMax += dataMin - newMin; newMin = dataMin; }
        if (newMax > dataMax) { newMin -= newMax - dataMax; newMax = dataMax; }
        onChange([Math.max(dataMin, newMin), Math.min(dataMax, newMax)]);
      }
    };

    const handleUp = () => setDragging(null);

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragging, range, onChange, getXFromEvent, fracToVal, dataMin, dataMax]);

  const handleChartClick = useCallback((e: React.MouseEvent) => {
    if (didDragRef.current) return;
    const frac = getXFromEvent(e);
    const binIdx = Math.min(NUM_BINS - 1, Math.floor(frac * NUM_BINS));
    const binMinVal = fracToVal(binIdx / NUM_BINS);
    const binMaxVal = fracToVal((binIdx + 1) / NUM_BINS);

    if (e.shiftKey && isFiltered) {
      onChange([Math.min(range[0], binMinVal), Math.max(range[1], binMaxVal)]);
    } else {
      const epsilon = (dataMax - dataMin) * 0.001;
      const sameRange = Math.abs(range[0] - binMinVal) < epsilon && Math.abs(range[1] - binMaxVal) < epsilon;
      if (sameRange) {
        onReset();
      } else {
        onChange([binMinVal, binMaxVal]);
      }
    }
  }, [getXFromEvent, fracToVal, isFiltered, range, onChange, onReset, dataMax, dataMin]);

  const svgW = 200;
  const svgH = 48;

  const hasFiltered = filteredBins != null;
  const areaPath = useMemo(() => buildAreaPath(bins, maxBin, svgW, svgH), [bins, maxBin]);
  const filteredAreaPath = useMemo(
    () => filteredBins ? buildAreaPath(filteredBins, maxBin, svgW, svgH) : '',
    [filteredBins, maxBin],
  );

  if (values.length === 0) return null;

  return (
    <div className="flex-1 min-w-[180px]">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-400">{label}</span>
        {isFiltered && (
          <button
            onClick={onReset}
            className="text-xs text-neutral-500 hover:text-neutral-300"
            title="Reset filter"
          >
            ↺
          </button>
        )}
      </div>

      <div className="relative select-none">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${svgW} ${svgH}`}
          className="w-full cursor-pointer rounded bg-neutral-900"
          preserveAspectRatio="none"
          style={{ height: 48 }}
          onClick={handleChartClick}
        >
          <path d={areaPath} fill={hasFiltered ? '#2a2a2a' : '#404040'} />
          {hasFiltered && <path d={filteredAreaPath} fill="#525252" />}

          {isFiltered && (
            <rect
              x={minFrac * svgW}
              y={0}
              width={(maxFrac - minFrac) * svgW}
              height={svgH}
              fill="rgba(59, 130, 246, 0.15)"
              className="cursor-grab"
              onMouseDown={(e) => handlePointerDown(e, 'range')}
            />
          )}

          <rect
            x={minFrac * svgW - 3}
            y={0}
            width={6}
            height={svgH}
            fill="transparent"
            className="cursor-ew-resize"
            onMouseDown={(e) => handlePointerDown(e, 'min')}
          />
          <line
            x1={minFrac * svgW}
            y1={0}
            x2={minFrac * svgW}
            y2={svgH}
            stroke={isFiltered ? '#3b82f6' : 'transparent'}
            strokeWidth={1.5}
            className="pointer-events-none"
          />

          <rect
            x={maxFrac * svgW - 3}
            y={0}
            width={6}
            height={svgH}
            fill="transparent"
            className="cursor-ew-resize"
            onMouseDown={(e) => handlePointerDown(e, 'max')}
          />
          <line
            x1={maxFrac * svgW}
            y1={0}
            x2={maxFrac * svgW}
            y2={svgH}
            stroke={isFiltered ? '#3b82f6' : 'transparent'}
            strokeWidth={1.5}
            className="pointer-events-none"
          />
        </svg>
      </div>

      <div className="mt-1 flex items-center justify-between text-xs tabular-nums text-neutral-500">
        <span>{range[0].toFixed(2)}</span>
        <span>–</span>
        <span>{range[1].toFixed(2)}</span>
      </div>
    </div>
  );
}
