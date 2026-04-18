'use client';

import { useCallback, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'mfc.theme';

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.themePref = theme;
}

interface ThemeToggleProps {
  // `grouped` drops the pill border/radius so a parent wrapper (e.g. .prefs-pill)
  // can draw one unified border around the theme + language toggles.
  variant?: 'standalone' | 'grouped';
}

export default function ThemeToggle({ variant = 'standalone' }: ThemeToggleProps = {}) {
  const [theme, setTheme] = useState<Theme>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Read whatever the bootstrap script resolved (dark, light, or — legacy —
    // "system", in which case we use whatever's actually on the <html> element).
    const stored = localStorage.getItem(STORAGE_KEY);
    let initial: Theme;
    if (stored === 'light' || stored === 'dark') {
      initial = stored;
    } else {
      const current = document.documentElement.dataset.theme;
      initial = current === 'light' ? 'light' : 'dark';
      localStorage.setItem(STORAGE_KEY, initial);
    }
    setTheme(initial);
    setMounted(true);
  }, []);

  const toggle = useCallback(() => {
    setTheme(prev => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem(STORAGE_KEY, next);
      applyTheme(next);
      return next;
    });
  }, []);

  if (!mounted) {
    // Render a stable placeholder on the server / during first client render so
    // the bootstrap script can do its job without layout shift.
    return (
      <button
        className={variant === 'grouped' ? 'theme-toggle theme-toggle-grouped' : 'theme-toggle'}
        aria-label="Theme"
        style={{ visibility: 'hidden' }}
      />
    );
  }

  const isLight = theme === 'light';
  const title = isLight ? 'Tema claro — cambiar a oscuro' : 'Tema oscuro — cambiar a claro';

  return (
    <button
      type="button"
      className={variant === 'grouped' ? 'theme-toggle theme-toggle-grouped' : 'theme-toggle'}
      onClick={toggle}
      title={title}
      aria-label={title}
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
