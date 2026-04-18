'use client';

import { useCallback, useEffect, useState } from 'react';

type ThemePref = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'mfc.theme';

function resolveSystem(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function applyTheme(pref: ThemePref) {
  const root = document.documentElement;
  const resolved = pref === 'system' ? resolveSystem() : pref;
  root.dataset.theme = resolved;
  root.dataset.themePref = pref;
}

interface ThemeToggleProps {
  // `grouped` drops the pill border/radius so a parent wrapper (e.g. .prefs-pill)
  // can draw one unified border around the theme + language toggles.
  variant?: 'standalone' | 'grouped';
}

export default function ThemeToggle({ variant = 'standalone' }: ThemeToggleProps = {}) {
  const [pref, setPref] = useState<ThemePref>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as ThemePref | null);
    const initial: ThemePref = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'dark';
    setPref(initial);
    setMounted(true);
  }, []);

  // When following system, re-resolve on OS preference changes.
  useEffect(() => {
    if (pref !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [pref]);

  const cycle = useCallback(() => {
    setPref(prev => {
      const next: ThemePref = prev === 'dark' ? 'light' : prev === 'light' ? 'system' : 'dark';
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

  const label = pref === 'system' ? 'Auto' : pref === 'light' ? 'Día' : 'Noche';
  const title = `Tema: ${label} — click para cambiar`;

  return (
    <button
      type="button"
      className={variant === 'grouped' ? 'theme-toggle theme-toggle-grouped' : 'theme-toggle'}
      onClick={cycle}
      title={title}
      aria-label={title}
    >
      {pref === 'light' ? (
        // Sun
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : pref === 'dark' ? (
        // Moon
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
        </svg>
      ) : (
        // Half / auto
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" />
        </svg>
      )}
    </button>
  );
}
