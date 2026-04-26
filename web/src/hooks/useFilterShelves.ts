'use client';

import { useMemo } from 'react';
import type { Film } from '@/lib/types';
import type { MoodShelf } from '@/hooks/useMoodShelves';
import { buildShelfCtx, FILTER_SHELVES } from '@/lib/filter-shelves';

const CAP = 12;

export function useFilterShelves(allFilms: Film[], enabled: boolean = true): MoodShelf[] {
  return useMemo<MoodShelf[]>(() => {
    if (!enabled || allFilms.length === 0) return [];

    const ctx = buildShelfCtx(new Date());

    const futureFilms = allFilms.filter(film =>
      film.dates.some(d => d.timestamp.slice(0, 10) >= ctx.todayStr),
    );

    const shelves: MoodShelf[] = [];

    for (const def of FILTER_SHELVES) {
      const filtered = futureFilms.filter(f => def.filter(f, ctx));
      if (filtered.length < def.minFilms) continue;

      const sorted = [...filtered].sort((a, b) => def.sort(a, b, ctx));
      const films = sorted.slice(0, CAP);

      shelves.push({
        id: def.id,
        label: def.label,
        films,
        scoresByFilmId: {},
      });
    }

    return shelves;
  }, [allFilms, enabled]);
}
