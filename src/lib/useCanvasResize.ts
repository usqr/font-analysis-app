import { useEffect, useState, type RefObject } from 'react';

export function useCanvasResize(ref: RefObject<HTMLElement | null>): number {
  const [resizeCount, setResizeCount] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      setResizeCount((c) => c + 1);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return resizeCount;
}
