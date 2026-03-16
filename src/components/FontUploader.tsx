import { useCallback, useState, type DragEvent, type ChangeEvent } from 'react';
import * as opentype from 'opentype.js';
import type { FontData, SampleFont } from '../types';
import { SAMPLE_FONTS } from '../lib/sampleFonts';
import { convertWoff2 } from '../lib/api';

interface Props {
  onFontLoaded: (fontData: FontData) => void;
}

export function FontUploader({ onFontLoaded }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFont = useCallback(
    async (buffer: ArrayBuffer, fileName: string) => {
      setLoading(true);
      setError(null);
      try {
        let parseBuffer = buffer;
        if (fileName.toLowerCase().endsWith('.woff2')) {
          const b64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
          const ttfB64 = await convertWoff2(b64);
          const binary = atob(ttfB64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          parseBuffer = bytes.buffer;
        }

        const font = opentype.parse(parseBuffer);
        const fontData: FontData = {
          font,
          fileName,
          familyName: font.names.fontFamily?.en ?? 'Unknown',
          styleName: font.names.fontSubfamily?.en ?? 'Regular',
          unitsPerEm: font.unitsPerEm,
          ascender: font.ascender,
          descender: font.descender,
          glyphCount: font.glyphs.length,
        };
        onFontLoaded(fontData);
      } catch (e) {
        console.error('Font parse error:', e);
        setError('Failed to parse font file. Make sure it\'s a valid OTF/TTF/WOFF/WOFF2.');
      } finally {
        setLoading(false);
      }
    },
    [onFontLoaded],
  );

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) {
        const buffer = await file.arrayBuffer();
        await loadFont(buffer, file.name);
      }
    },
    [loadFont],
  );

  const handleFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        const buffer = await file.arrayBuffer();
        await loadFont(buffer, file.name);
      }
    },
    [loadFont],
  );

  const handleSampleFont = useCallback(
    async (sample: SampleFont) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(sample.path);
        const buffer = await response.arrayBuffer();
        await loadFont(buffer, `${sample.name}.ttf`);
      } catch {
        setError(`Failed to load sample font: ${sample.name}`);
        setLoading(false);
      }
    },
    [loadFont],
  );

  const categoryColors: Record<string, string> = {
    'sans-serif': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    serif: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    monospace: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    handwriting: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  };

  return (
    <div className="space-y-6">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`relative rounded-xl border-2 border-dashed p-10 text-center transition-all ${
          isDragging
            ? 'border-blue-400 bg-blue-500/5'
            : 'border-neutral-700 hover:border-neutral-500'
        }`}
      >
        {loading ? (
          <div className="flex items-center justify-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-500 border-t-blue-400" />
            <span className="text-neutral-400">Loading font...</span>
          </div>
        ) : (
          <>
            <div className="mb-3 text-4xl text-neutral-500">Aa</div>
            <p className="text-neutral-300">
              Drop a font file here or{' '}
              <label className="cursor-pointer text-blue-400 underline underline-offset-2 hover:text-blue-300">
                browse
                <input
                  type="file"
                  accept=".otf,.ttf,.woff,.woff2"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </p>
            <p className="mt-1 text-xs text-neutral-400">
              Supports OTF, TTF, WOFF, WOFF2
            </p>
          </>
        )}
      </div>

      {error && (
        <p className="rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      <div>
        <h3 className="mb-3 text-sm font-medium text-neutral-400">
          Or try a sample font
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SAMPLE_FONTS.map((sample) => (
            <button
              key={sample.name}
              onClick={() => handleSampleFont(sample)}
              disabled={loading}
              className="group rounded-lg border border-neutral-800 bg-neutral-900 p-3 text-left transition-all hover:border-neutral-600 hover:bg-neutral-800 disabled:opacity-50"
            >
              <span className="block text-sm font-medium text-neutral-200 group-hover:text-white">
                {sample.name}
              </span>
              <span
                className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[10px] ${categoryColors[sample.category]}`}
              >
                {sample.category}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
