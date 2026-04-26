'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Film } from '@/lib/types';
import type { MoodShelf } from '@/hooks/useMoodShelves';
import { getDateOnly } from '@/lib/film-helpers';

interface RawBecauseShelf {
  seedFilmId: number;
  seedTmdbId: number;
  seedTitle: string;
  topFilmIds: number[];
}

interface BecauseYouLikedApiResponse {
  shelves: RawBecauseShelf[];
}

function hasFutureScreening(film: Film, now: Date): boolean {
  return film.dates.some(d => {
    const dt = getDateOnly(d.timestamp);
    return dt != null && dt >= now;
  });
}

export function useBecauseYouLiked(
  allFilms: Film[],
  enabled: boolean = true,
): { shelves: MoodShelf[]; loading: boolean } {
  const [rawShelves, setRawShelves] = useState<RawBecauseShelf[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || allFilms.length === 0) return;

    const now = new Date();
    const filmIds = allFilms
      .filter(f => f.tmdbId != null && hasFutureScreening(f, now))
      .map(f => f.id);
    if (filmIds.length === 0) return;

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const res = await fetch(`/api/because-you-liked?film_ids=${filmIds.join(',')}`);
        if (!res.ok) return;
        const json: BecauseYouLikedApiResponse = await res.json();
        if (cancelled) return;
        setRawShelves(json.shelves ?? []);
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
    const now = new Date();
    const filmById = new Map(allFilms.map(f => [f.id, f]));

    return rawShelves
      .map(s => ({
        id: `because-${s.seedTmdbId}`,
        label: {
          es: `Porque te gustó ${s.seedTitle}`,
          en: `Because you liked ${s.seedTitle}`,
        },
        films: s.topFilmIds
          .map(fid => filmById.get(fid))
          .filter((f): f is Film => f != null && hasFutureScreening(f, now)),
        scoresByFilmId: {},
      }))
      .filter(s => s.films.length > 0);
  }, [rawShelves, allFilms]);

  return { shelves, loading };
}
