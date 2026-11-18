import { useState, useEffect, useRef, useCallback } from 'react';

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
    const url = `/api/fonts/${fontId}/file`;
    const style = document.createElement('style');
    style.textContent = `@font-face { font-family: '${cssName}'; src: url('${url}'); font-display: swap; }`;
    document.head.appendChild(style);

    await document.fonts.load(`16px '${cssName}'`).catch(() => {});
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
  // Tracks which fontId has been loaded (or started loading) so that a
  // changed fontId re-triggers loading — enables swapping font files
  // (e.g. stepped weight selection) after the initial lazy load.
  const loadedForRef = useRef<string | null>(null);
  // Tracks the previous fontId so a post-mount change can trigger an eager load.
  const prevIdRef = useRef<string | null>(fontId);

  const startLoad = useCallback(() => {
    if (!fontId || loadedForRef.current === fontId) return;
    loadedForRef.current = fontId;
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

  // When fontId changes after the element has mounted (e.g. a static weight /
  // slant / width swap selects a different font file), load it eagerly — the
  // card is on-screen during interaction. The initial load stays lazy via the
  // IntersectionObserver set up in `ref`.
  useEffect(() => {
    if (prevIdRef.current === fontId) return;
    prevIdRef.current = fontId;
    if (elRef.current) startLoad();
  }, [fontId, startLoad]);

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
    };
  }, []);

  return { fontFamily, loading, ref };
}
