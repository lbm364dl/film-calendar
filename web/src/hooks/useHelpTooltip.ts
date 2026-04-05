'use client';

import { useState, useEffect, useCallback } from 'react';

export function useHelpModal() {
  const [content, setContent] = useState<{ title: string; body: string } | null>(null);
  const [closing, setClosing] = useState(false);

  const open = useCallback((title: string, body: string) => {
    setClosing(false);
    setContent({ title, body });
  }, []);

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(() => { setContent(null); setClosing(false); }, 150);
  }, []);

  useEffect(() => {
    if (!content) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); close(); }
    };
    document.addEventListener('keydown', handle, true);
    return () => document.removeEventListener('keydown', handle, true);
  }, [content, close]);

  return { content, closing, open, close };
}
