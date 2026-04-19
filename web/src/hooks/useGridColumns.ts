'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Observes a CSS grid element and returns its actual column count by reading
 * the resolved `grid-template-columns`. Returns a callback ref so the effect
 * re-subscribes whenever the target element is mounted/unmounted (needed for
 * grids rendered conditionally behind a loading gate).
 */
export function useGridColumns(fallback = 3): [number, (el: HTMLElement | null) => void] {
  const [cols, setCols] = useState(fallback);
  const [el, setEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!el) return;
    const read = () => {
      const tpl = getComputedStyle(el).gridTemplateColumns;
      if (!tpl || tpl === 'none') return;
      const count = tpl.split(' ').filter(Boolean).length;
      if (count > 0) setCols(count);
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);

  const setRef = useCallback((node: HTMLElement | null) => setEl(node), []);
  return [cols, setRef];
}
