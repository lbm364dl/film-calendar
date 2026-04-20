'use client';

import { useEffect, useState } from 'react';
import type { Film } from '@/lib/types';

export interface MoodShelf {
  id: string;
  label: { es: string; en: string };
  films: Film[];
  scoresByFilmId: Record<number, number>;
}

interface MoodShelvesApiResponse {
  moods: Array<{
    id: string;
    label: { es: string; en: string };
    topFilmIds: number[];
    topScores: Record<number, number>;
  }>;
}

/**
 * Fetch mood-based shelves from /api/mood-shelves and hydrate each shelf
 * with the matching Film objects (pulled from the already-loaded allFilms
 * state in the parent, so we don't re-fetch film metadata).
 */
export function useMoodShelves(allFilms: Film[], enabled: boolean = true) {
  const [shelves, setShelves] = useState<MoodShelf[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || allFilms.length === 0) return;

    // Only consider films with a tmdb_id (required for KG lookup).
    const filmIds = allFilms.filter(f => f.tmdbId != null).map(f => f.id);
    if (filmIds.length === 0) return;

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const res = await fetch(`/api/mood-shelves?film_ids=${filmIds.join(',')}`);
        if (!res.ok) return;
        const json: MoodShelvesApiResponse = await res.json();
        if (cancelled) return;

        const filmById = new Map(allFilms.map(f => [f.id, f]));
        const built: MoodShelf[] = json.moods.map(m => ({
          id: m.id,
          label: m.label,
          films: m.topFilmIds.map(fid => filmById.get(fid)).filter((f): f is Film => f != null),
          scoresByFilmId: m.topScores,
        }));
        setShelves(built.filter(s => s.films.length > 0));
      } catch {
        // best-effort — silently leave shelves empty
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [allFilms, enabled]);

  return { shelves, loading };
}
