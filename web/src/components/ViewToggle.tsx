'use client';

import { useEffect, useState } from 'react';

export type ViewMode = 'list' | 'grid';
const STORAGE_KEY = 'mfc.view';

export function useViewMode(): [ViewMode, (v: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>('list');

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'list' || stored === 'grid') setMode(stored);
  }, []);

  const set = (next: ViewMode) => {
    setMode(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
  };

  return [mode, set];
}

interface ViewToggleProps {
  mode: ViewMode;
  onChange: (m: ViewMode) => void;
  disabled?: boolean;
  lang?: 'es' | 'en';
}

export default function ViewToggle({ mode, onChange, disabled, lang = 'es' }: ViewToggleProps) {
  const listLabel = lang === 'es' ? 'Lista' : 'List';
  const gridLabel = lang === 'es' ? 'Grid' : 'Grid';
  return (
    <div className="view-toggle" role="tablist" aria-label="View mode">
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'list'}
        disabled={disabled}
        className={`view-toggle-btn${mode === 'list' ? ' active' : ''}`}
        onClick={() => onChange('list')}
        title={listLabel}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <rect x="1" y="2" width="10" height="1.4" fill="currentColor" />
          <rect x="1" y="5.3" width="10" height="1.4" fill="currentColor" />
          <rect x="1" y="8.6" width="10" height="1.4" fill="currentColor" />
        </svg>
        {listLabel}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'grid'}
        disabled={disabled}
        className={`view-toggle-btn${mode === 'grid' ? ' active' : ''}`}
        onClick={() => onChange('grid')}
        title={gridLabel}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <rect x="1" y="1" width="4" height="4" fill="currentColor" />
          <rect x="7" y="1" width="4" height="4" fill="currentColor" />
          <rect x="1" y="7" width="4" height="4" fill="currentColor" />
          <rect x="7" y="7" width="4" height="4" fill="currentColor" />
        </svg>
        {gridLabel}
      </button>
    </div>
  );
}
