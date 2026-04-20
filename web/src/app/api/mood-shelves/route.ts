import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { MOODS, type MoodDef } from '@/lib/moods';
import { embeddingsByTmdb, scoreFilmsByVector } from '@/lib/supabase-kg';
import {
  EMBEDDING_DIM,
  popularityAdj,
  confidenceAdj,
} from '@/lib/recommender-embedding';

/**
 * GET /api/mood-shelves?film_ids=1,2,3
 *
 * For the supplied list of film_ids (currently-screening), return per-mood
 * top-ranked screenings. No user data used. Safe for anon users.
 *
 * Response: {
 *   moods: [{ id, label, topFilmIds: [int], topScores: { film_id: number } }]
 * }
 */

const TOP_PER_SHELF = 12;

// ── Cached mood vectors (computed once per process) ─────────────────────────
//
// Anchor embeddings never change. Cache the averaged, normalized mood vector
// in a module-level Map. Populated lazily on first request.

let moodVectorsCache: Map<string, Float32Array> | null = null;

async function getMoodVectors(): Promise<Map<string, Float32Array>> {
  if (moodVectorsCache) return moodVectorsCache;

  // Fetch embeddings for every unique anchor across all moods in one round-trip.
  const allAnchorIds = [...new Set(MOODS.flatMap(m => m.anchorTmdbIds))];
  const records = allAnchorIds.length > 0 ? await embeddingsByTmdb(allAnchorIds) : [];

  const embByTmdb = new Map<number, Float32Array>();
  for (const r of records) {
    if (r.embedding?.length === EMBEDDING_DIM) {
      embByTmdb.set(r.tmdb_id, Float32Array.from(r.embedding));
    }
  }

  const out = new Map<string, Float32Array>();
  for (const mood of MOODS) {
    if (mood.anchorTmdbIds.length === 0) continue;  // anchorless → no vibe vector
    const vec = averageEmbeddings(mood.anchorTmdbIds, embByTmdb);
    if (vec) out.set(mood.id, vec);
  }

  moodVectorsCache = out;
  return out;
}

function averageEmbeddings(
  tmdbIds: number[],
  embByTmdb: Map<number, Float32Array>,
): Float32Array | null {
  const acc = new Float32Array(EMBEDDING_DIM);
  let n = 0;
  for (const id of tmdbIds) {
    const e = embByTmdb.get(id);
    if (!e) continue;
    for (let i = 0; i < EMBEDDING_DIM; i++) acc[i] += e[i];
    n += 1;
  }
  if (n === 0) return null;
  for (let i = 0; i < EMBEDDING_DIM; i++) acc[i] /= n;
  let mag = 0;
  for (let i = 0; i < EMBEDDING_DIM; i++) mag += acc[i] * acc[i];
  mag = Math.sqrt(mag);
  if (mag === 0) return null;
  for (let i = 0; i < EMBEDDING_DIM; i++) acc[i] /= mag;
  return acc;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = url.searchParams.get('film_ids');
  if (!raw) {
    return NextResponse.json({ error: 'Missing film_ids' }, { status: 400 });
  }

  const filmIds = raw
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => Number.isFinite(n) && n > 0);

  if (filmIds.length === 0) {
    return NextResponse.json({ moods: [] });
  }

  // Fetch candidate films' tmdb_id + letterboxd_viewers from calendar DB.
  // We build the server client without cookies since this endpoint is public
  // (anon users allowed); we only need read access to the films table.
  const cookieStore = await cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll() { /* no-op — public endpoint, no session write */ },
    },
  });

  const BATCH = 500;
  const filmInfo = new Map<number, {
    tmdb_id: number;
    viewers: number | null;
    year: number | null;
    rating: number | null;
  }>();
  for (let i = 0; i < filmIds.length; i += BATCH) {
    const slice = filmIds.slice(i, i + BATCH);
    const { data } = await supabase
      .from('films')
      .select('id, tmdb_id, letterboxd_viewers, year, letterboxd_rating')
      .in('id', slice);
    if (data) {
      for (const f of data) {
        if (f.tmdb_id != null) {
          filmInfo.set(f.id, {
            tmdb_id: f.tmdb_id,
            viewers: f.letterboxd_viewers ?? null,
            year: f.year ?? null,
            rating: f.letterboxd_rating != null ? parseFloat(String(f.letterboxd_rating)) : null,
          });
        }
      }
    }
  }

  const candidateTmdbIds = [...new Set([...filmInfo.values()].map(v => v.tmdb_id))];
  if (candidateTmdbIds.length === 0) {
    return NextResponse.json({ moods: [] });
  }

  // Fetch confidence per candidate (for adjustment). We don't need embeddings
  // here — the scoring happens server-side in KG via score_films_by_vector.
  const analysisRecords = await embeddingsByTmdb(candidateTmdbIds);
  const confidenceByTmdb = new Map<number, string | null>();
  for (const r of analysisRecords) {
    confidenceByTmdb.set(r.tmdb_id, r.confidence ?? null);
  }

  // Mood vectors (cached per process)
  const moodVectors = await getMoodVectors();

  // Per-tmdb lookup maps (for shelf-level filtering).
  const infoByTmdb = new Map<number, { viewers: number | null; year: number | null; rating: number | null }>();
  for (const info of filmInfo.values()) {
    infoByTmdb.set(info.tmdb_id, { viewers: info.viewers, year: info.year, rating: info.rating });
  }

  function applyShelfFilters(pool: number[], mood: MoodDef): number[] {
    return pool.filter(tid => {
      const info = infoByTmdb.get(tid);
      if (!info) return false;
      if (mood.yearRange) {
        if (info.year == null || info.year < mood.yearRange.start || info.year > mood.yearRange.end) return false;
      }
      if (mood.maxViewers != null) {
        // Null viewers → film never matched Letterboxd → can't call it underdog.
        if (info.viewers == null || info.viewers > mood.maxViewers) return false;
      }
      if (mood.minRating != null) {
        if (info.rating == null || info.rating < mood.minRating) return false;
      }
      return true;
    });
  }

  // Score candidates against every mood in parallel.
  // Vibe shelves: cosine against the mood vector, times popularity+confidence.
  // Anchorless shelves (e.g. "underdogs"): rank by Letterboxd rating desc.
  const moodResults = await Promise.all(
    MOODS.map(async (mood): Promise<MoodShelfResult | null> => {
      const pool = applyShelfFilters(candidateTmdbIds, mood);
      if (pool.length === 0) return { mood, scored: [] };

      if (mood.anchorTmdbIds.length === 0) {
        // Rating-ranked shelf — no embedding call.
        const scored = pool
          .map(tid => ({ tmdb_id: tid, similarity: infoByTmdb.get(tid)?.rating ?? 0 }))
          .sort((a, b) => b.similarity - a.similarity);
        return { mood, scored };
      }

      const vec = moodVectors.get(mood.id);
      if (!vec) return null;
      const scored = await scoreFilmsByVector(Array.from(vec), pool);
      return { mood, scored };
    })
  );

  // Build a reverse map: tmdb_id → calendar film_ids (can be many-to-one
  // in theory; usually 1:1).
  const filmIdsByTmdb = new Map<number, number[]>();
  for (const [fid, info] of filmInfo) {
    const arr = filmIdsByTmdb.get(info.tmdb_id) ?? [];
    arr.push(fid);
    filmIdsByTmdb.set(info.tmdb_id, arr);
  }

  const shelves = [];
  for (const result of moodResults) {
    if (!result) continue;
    const { mood, scored } = result;

    // Apply popularity + confidence adjustments, then take top N. For
    // rating-ranked (anchorless) shelves skip popularityAdj — it would
    // deliberately penalize the exact films we want to surface.
    const isRatingRanked = mood.anchorTmdbIds.length === 0;
    const scoredWithAdj = scored
      .map(s => {
        const fids = filmIdsByTmdb.get(s.tmdb_id) ?? [];
        if (fids.length === 0) return null;
        const fid = fids[0];   // pick first; duplicates are rare
        const info = filmInfo.get(fid);
        const viewers = info?.viewers ?? null;
        const conf = confidenceByTmdb.get(s.tmdb_id) ?? null;
        const adj = isRatingRanked
          ? s.similarity
          : s.similarity * popularityAdj(viewers) * confidenceAdj(conf);
        return { filmId: fid, adjustedScore: adj, rawSimilarity: s.similarity };
      })
      .filter((x): x is { filmId: number; adjustedScore: number; rawSimilarity: number } => x !== null);

    scoredWithAdj.sort((a, b) => b.adjustedScore - a.adjustedScore);
    const top = scoredWithAdj.slice(0, TOP_PER_SHELF);

    shelves.push({
      id: mood.id,
      label: mood.label,
      topFilmIds: top.map(t => t.filmId),
      topScores: Object.fromEntries(top.map(t => [t.filmId, Math.round(t.adjustedScore * 100)])),
    });
  }

  return NextResponse.json({ moods: shelves });
}

interface MoodShelfResult {
  mood: MoodDef;
  scored: Array<{ tmdb_id: number; similarity: number }>;
}
