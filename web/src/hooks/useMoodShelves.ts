'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Film } from '@/lib/types';
import { getDateOnly } from '@/lib/film-helpers';

export interface MoodShelf {
  id: string;
  label: { es: string; en: string };
  films: Film[];
  scoresByFilmId: Record<number, number>;
}

interface RawMoodShelf {
  id: string;
  label: { es: string; en: string };
  topFilmIds: number[];
  topScores: Record<number, number>;
}

interface MoodShelvesApiResponse {
  moods: RawMoodShelf[];
}

function hasFutureScreening(film: Film, now: Date): boolean {
  return film.dates.some(d => {
    const dt = getDateOnly(d.timestamp);
    return dt != null && dt >= now;
  });
}

/**
 * Fetch mood-based shelves from /api/mood-shelves and hydrate each shelf
 * with the matching Film objects (pulled from the already-loaded allFilms
 * state in the parent, so we don't re-fetch film metadata).
 *
 * Films whose screenings have all passed are filtered out at hydration time
 * using a minute-ticking `nowMs`, so the shelf shrinks past 20:00 without
 * re-hitting the API.
 */
export function useMoodShelves(allFilms: Film[], enabled: boolean = true) {
  const [rawShelves, setRawShelves] = useState<RawMoodShelf[]>([]);
  const [loading, setLoading] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!enabled || allFilms.length === 0) return;

    // Only consider films with a tmdb_id (required for KG lookup) AND at
    // least one future screening — past-today films shouldn't occupy a shelf
    // slot.
    const now = new Date();
    const filmIds = allFilms
      .filter(f => f.tmdbId != null && hasFutureScreening(f, now))
      .map(f => f.id);
    if (filmIds.length === 0) return;

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const res = await fetch(`/api/mood-shelves?film_ids=${filmIds.join(',')}`);
        if (!res.ok) return;
        const json: MoodShelvesApiResponse = await res.json();
        if (cancelled) return;
        setRawShelves(json.moods);
      } catch {
        // best-effort — silently leave shelves empty
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [allFilms, enabled]);

  const shelves = useMemo<MoodShelf[]>(() => {
    if (rawShelves.length === 0) return [];
    const now = new Date(nowMs);
    const filmById = new Map(allFilms.map(f => [f.id, f]));
    const built: MoodShelf[] = rawShelves.map(m => ({
      id: m.id,
      label: m.label,
      films: m.topFilmIds
        .map(fid => filmById.get(fid))
        .filter((f): f is Film => f != null && hasFutureScreening(f, now)),
      scoresByFilmId: m.topScores,
    }));
    return built.filter(s => s.films.length > 0);
  }, [rawShelves, allFilms, nowMs]);

  return { shelves, loading };
}
