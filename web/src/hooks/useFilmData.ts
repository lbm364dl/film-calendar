'use client';

import { useState, useEffect } from 'react';
import { getBrowserSupabase } from '@/lib/supabase-browser';
import { mapFilmRows, getLocalTodayStart, getDateOnly } from '@/lib/film-helpers';
import type { Film, FilmRow } from '@/lib/types';

export interface FilmDataState {
  allFilms: Film[];
  loading: boolean;
  error: boolean;
  yearBoundsMin: number;
  yearBoundsMax: number;
}

const BATCH = 1000;

export function useFilmData() {
  const [allFilms, setAllFilms] = useState<Film[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [yearBoundsMin, setYearBoundsMin] = useState(1900);
  const [yearBoundsMax, setYearBoundsMax] = useState(2026);

  useEffect(() => {
    async function load() {
      try {
        const supabase = getBrowserSupabase();

        // Load films (paginated)
        const allFilmRows: any[] = [];
        let offset = 0;
        while (true) {
          const { data, error: err } = await supabase
            .from('films')
            .select('*')
            .order('title')
            .range(offset, offset + BATCH - 1);
          if (err) throw err;
          if (!data || data.length === 0) break;
          allFilmRows.push(...data);
          if (data.length < BATCH) break;
          offset += BATCH;
        }

        // Load screenings separately (paginated)
        const screeningsByFilm = new Map<number, any[]>();
        offset = 0;
        while (true) {
          const { data, error: err } = await supabase
            .from('screenings')
            .select('*')
            .range(offset, offset + BATCH - 1);
          if (err) throw err;
          if (!data || data.length === 0) break;
          for (const s of data) {
            const arr = screeningsByFilm.get(s.film_id);
            if (arr) arr.push(s);
            else screeningsByFilm.set(s.film_id, [s]);
          }
          if (data.length < BATCH) break;
          offset += BATCH;
        }

        // Merge screenings into film rows
        for (const row of allFilmRows) {
          row.screenings = screeningsByFilm.get(row.id) || [];
        }

        const films = mapFilmRows(allFilmRows as FilmRow[]);
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
