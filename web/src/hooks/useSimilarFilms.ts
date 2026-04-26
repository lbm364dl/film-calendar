'use client';

import { useEffect, useState } from 'react';
import type { Film } from '@/lib/types';

export interface SimilarNeighbor {
  tmdb_id: number;
  title: string;
  year: number | null;
  letterboxd_url: string | null;
  similarity: number;
  mood_tags: string[];
  themes: string[];
}

/**
 * Fetch "similar films" neighbors from /api/similar for every film with a
 * tmdb_id. Used to show a logged-out "if you liked X" reason on each tile
 * and as a fallback for logged-in users whose personalized breakdown is
 * empty (e.g. no watched-film overlap with the screening's vibe cluster).
 */
export function useSimilarFilms(films: Film[], enabled: boolean = true) {
  const [byFilmId, setByFilmId] = useState<Record<number, SimilarNeighbor[]>>({});

  useEffect(() => {
    if (!enabled || films.length === 0) return;

    const tmdbToFilmId = new Map<number, number>();
    for (const f of films) {
      if (f.tmdbId != null) tmdbToFilmId.set(f.tmdbId, f.id);
    }
    const ids = [...tmdbToFilmId.keys()];
    if (ids.length === 0) return;

    let cancelled = false;
    const CHUNK = 100;

    (async () => {
      for (let i = 0; i < ids.length; i += CHUNK) {
        if (cancelled) return;
        const chunk = ids.slice(i, i + CHUNK);
        try {
          const res = await fetch(`/api/similar?tmdb_ids=${chunk.join(',')}`);
          if (!res.ok) continue;
          const json: Record<string, { neighbors: SimilarNeighbor[] }> = await res.json();
          if (cancelled) return;
          setByFilmId(prev => {
            const next = { ...prev };
            for (const [tmdbStr, v] of Object.entries(json)) {
              const tmdb = parseInt(tmdbStr, 10);
              const fid = tmdbToFilmId.get(tmdb);
              if (fid != null && v.neighbors.length > 0) {
                next[fid] = v.neighbors;
              }
            }
            return next;
          });
        } catch {
          // best-effort — silently skip chunks that fail
        }
      }
    })();

    return () => { cancelled = true; };
  }, [films, enabled]);

  return byFilmId;
}
