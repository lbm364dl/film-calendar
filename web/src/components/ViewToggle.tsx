'use client';

import { useCallback, useSyncExternalStore } from 'react';

export type ViewMode = 'list' | 'grid';
const STORAGE_KEY = 'mfc.view';

const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  // Cross-tab updates via the native storage event.
  const onStorage = (e: StorageEvent) => { if (e.key === STORAGE_KEY) cb(); };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', onStorage);
  };
}

function notifyAll() { listeners.forEach(fn => fn()); }

function getClientSnapshot(): ViewMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'grid' ? 'grid' : 'list';
  } catch {
    return 'list';
  }
}

function getServerSnapshot(): ViewMode {
  return 'list';
}

/**
 * useSyncExternalStore yields a hydration-safe way to read a client-only
 * preference without the list-then-grid flash on first paint. React uses the
 * server snapshot during SSR and the client snapshot as soon as hydration is
 * done, without warning about the intentional mismatch.
 */
export function useViewMode(): [ViewMode, (v: ViewMode) => void] {
  const mode = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);

  const set = useCallback((next: ViewMode) => {
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
    notifyAll();
  }, []);

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
        suppressHydrationWarning
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <rect x="1" y="2" width="10" height="1.4" fill="currentColor" />
          <rect x="1" y="5.3" width="10" height="1.4" fill="currentColor" />
          <rect x="1" y="8.6" width="10" height="1.4" fill="currentColor" />
        </svg>
        <span className="view-toggle-label">{listLabel}</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'grid'}
        disabled={disabled}
        className={`view-toggle-btn${mode === 'grid' ? ' active' : ''}`}
        onClick={() => onChange('grid')}
        title={gridLabel}
        suppressHydrationWarning
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <rect x="1" y="1" width="4" height="4" fill="currentColor" />
          <rect x="7" y="1" width="4" height="4" fill="currentColor" />
          <rect x="1" y="7" width="4" height="4" fill="currentColor" />
          <rect x="7" y="7" width="4" height="4" fill="currentColor" />
        </svg>
        <span className="view-toggle-label">{gridLabel}</span>
      </button>
    </div>
  );
}
