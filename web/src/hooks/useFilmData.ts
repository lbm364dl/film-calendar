'use client';

import { useState, useEffect } from 'react';
import { mapFilmRows, getLocalTodayStart, getDateOnly } from '@/lib/film-helpers';
import type { Film, FilmRow } from '@/lib/types';

export interface FilmDataState {
  allFilms: Film[];
  loading: boolean;
  error: boolean;
  yearBoundsMin: number;
  yearBoundsMax: number;
}

export function useFilmData() {
  const [allFilms, setAllFilms] = useState<Film[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [yearBoundsMin, setYearBoundsMin] = useState(1900);
  const [yearBoundsMax, setYearBoundsMax] = useState(2026);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/screenings');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const allFilmRows: FilmRow[] = await res.json();

        const films = mapFilmRows(allFilmRows);
        setAllFilms(films);

        const todayStart = getLocalTodayStart();
        const validYears = films
          .filter(f => f.dates.some(d => {
            const dt = getDateOnly(d.timestamp);
            return dt && dt >= todayStart;
          }))
          .map(f => f.year)
          .filter((y): y is number => y !== null && !isNaN(y));

        if (validYears.length > 0) {
          setYearBoundsMin(Math.min(...validYears));
          setYearBoundsMax(Math.max(...validYears));
        }
      } catch (err) {
        console.error('Error loading films:', err);
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return { allFilms, loading, error, yearBoundsMin, yearBoundsMax };
}
