'use client';

import { useCallback, useSyncExternalStore } from 'react';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'mfc.theme';

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.themePref = theme;
}

// ── useSyncExternalStore plumbing ────────────────────────────────────────
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => { if (e.key === STORAGE_KEY) cb(); };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', onStorage);
  };
}

function notifyAll() { listeners.forEach(fn => fn()); }

function getClientSnapshot(): Theme {
  // Prefer the value the bootstrap script wrote to the <html> attribute —
  // it's already resolved from localStorage at this point, so reading it
  // avoids duplicating the migration logic.
  try {
    const attr = document.documentElement.dataset.themePref;
    if (attr === 'light' || attr === 'dark') return attr;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch { /* ignore */ }
  return 'dark';
}

function getServerSnapshot(): Theme {
  // SSR always renders as dark (the DC default). Client takes over at
  // hydration via useSyncExternalStore and React handles the swap quietly.
  return 'dark';
}

interface ThemeToggleProps {
  // `grouped` drops the pill border/radius so a parent wrapper (e.g. .prefs-pill)
  // can draw one unified border around the theme + language toggles.
  variant?: 'standalone' | 'grouped';
}

export default function ThemeToggle({ variant = 'standalone' }: ThemeToggleProps = {}) {
  const theme = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
    applyTheme(next);
    notifyAll();
  }, [theme]);

  const isLight = theme === 'light';
  const title = isLight ? 'Tema claro — cambiar a oscuro' : 'Tema oscuro — cambiar a claro';

  return (
    <button
      type="button"
      className={variant === 'grouped' ? 'theme-toggle theme-toggle-grouped' : 'theme-toggle'}
      onClick={toggle}
      title={title}
      aria-label={title}
      suppressHydrationWarning
    >
      {isLight ? (
        // Sun
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        // Moon
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
        </svg>
      )}
    </button>
  );
}
