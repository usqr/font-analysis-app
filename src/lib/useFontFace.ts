import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchFontData } from './api';

const fontCache = new Map<string, string>();
const loadingSet = new Set<string>();

function cssFamilyName(id: string): string {
  return `__preview_${id}`;
}

async function loadFont(fontId: string): Promise<string> {
  const cssName = cssFamilyName(fontId);
  if (fontCache.has(fontId)) return cssName;
  if (loadingSet.has(fontId)) {
    return new Promise((resolve) => {
      const check = () => {
        if (fontCache.has(fontId)) { resolve(cssName); return; }
        requestAnimationFrame(check);
      };
      check();
    });
  }

  loadingSet.add(fontId);
  try {
    const data = await fetchFontData(fontId);
    const mimeMap: Record<string, string> = {
      otf: 'font/opentype',
      ttf: 'font/truetype',
      woff: 'font/woff',
      woff2: 'font/woff2',
    };
    const mime = mimeMap[data.format] ?? 'font/opentype';
    const url = `data:${mime};base64,${data.base64Data}`;

    const style = document.createElement('style');
    style.textContent = `@font-face { font-family: '${cssName}'; src: url('${url}'); font-display: swap; }`;
    document.head.appendChild(style);
    fontCache.set(fontId, cssName);
    return cssName;
  } finally {
    loadingSet.delete(fontId);
  }
}

export function useFontFace(fontId: string | null): {
  fontFamily: string | null;
  loading: boolean;
  ref: (node: HTMLElement | null) => void;
} {
  const [fontFamily, setFontFamily] = useState<string | null>(
    fontId && fontCache.has(fontId) ? cssFamilyName(fontId) : null,
  );
  const [loading, setLoading] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const elRef = useRef<HTMLElement | null>(null);
  const loadedRef = useRef(false);

  const startLoad = useCallback(() => {
    if (!fontId || loadedRef.current) return;
    loadedRef.current = true;
    if (fontCache.has(fontId)) {
      setFontFamily(cssFamilyName(fontId));
      return;
    }
    setLoading(true);
    loadFont(fontId)
      .then((name) => setFontFamily(name))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [fontId]);

  const ref = useCallback(
    (node: HTMLElement | null) => {
      if (elRef.current && observerRef.current) {
        observerRef.current.unobserve(elRef.current);
      }
      elRef.current = node;
      if (!node || !fontId) return;
      if (fontCache.has(fontId)) {
        setFontFamily(cssFamilyName(fontId));
        return;
      }
      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) {
            startLoad();
            observerRef.current?.disconnect();
          }
        },
        { rootMargin: '200px' },
      );
      observerRef.current.observe(node);
    },
    [fontId, startLoad],
  );

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
    };
  }, []);

  return { fontFamily, loading, ref };
}
