import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { connectedFilmsByTmdb } from '@/lib/supabase-kg';

/**
 * GET /api/because-you-liked?film_ids=1,2,3
 *
 * Returns 2-3 shelves keyed on the user's top liked/rated watched films.
 * Each shelf lists currently-screening films connected via the KG.
 *
 * Response: {
 *   shelves: [{
 *     seedFilmId: number,
 *     seedTmdbId: number,
 *     seedTitle: string,
 *     topFilmIds: number[],
 *   }]
 * }
 *
 * Requires authentication. Returns 401 for anon users.
 */

const SEED_COUNT = 4;
const TOP_PER_SHELF = 12;
const BATCH = 500;

function likedScore(row: {
  rating: number | null;
  liked: boolean | null;
  rewatch_count: number | null;
}): number {
  return (row.liked ? 2 : 0)
    + (row.rating != null ? Number(row.rating) / 5 : 0)
    + (row.rewatch_count ?? 0) * 0.3;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = url.searchParams.get('film_ids');
  if (!raw) return NextResponse.json({ error: 'Missing film_ids' }, { status: 400 });

  const filmIds = raw
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => Number.isFinite(n) && n > 0);

  if (filmIds.length === 0) return NextResponse.json({ shelves: [] });

  const cookieStore = await cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options));
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  // ── 1. Load user's watched films ──────────────────────────────────────
  const watchedRows: {
    film_id: number | null;
    rating: number | null;
    liked: boolean | null;
    rewatch_count: number | null;
  }[] = [];
  {
    let offset = 0;
    while (true) {
      const { data, error } = await supabase
        .from('user_watched_films')
        .select('film_id, rating, liked, rewatch_count')
        .eq('user_id', user.id)
        .not('film_id', 'is', null)
        .range(offset, offset + BATCH - 1);
      if (error || !data) break;
      watchedRows.push(...data);
      if (data.length < BATCH) break;
      offset += BATCH;
    }
  }

  if (watchedRows.length === 0) return NextResponse.json({ shelves: [] });

  // Score and rank watched films; only keep those with any positive signal.
  const scored = watchedRows
    .filter(r => r.film_id != null)
    .map(r => ({ film_id: r.film_id!, score: likedScore(r) }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return NextResponse.json({ shelves: [] });

  // ── 2. Resolve tmdb_ids for top candidates ────────────────────────────
  const topFilmIds = scored.slice(0, 50).map(r => r.film_id);
  const { data: watchedFilmData } = await supabase
    .from('films')
    .select('id, tmdb_id, title, title_en')
    .in('id', topFilmIds)
    .not('tmdb_id', 'is', null);

  const tmdbInfoByFilmId = new Map(
    (watchedFilmData ?? []).map(f => [
      f.id,
      { tmdb_id: f.tmdb_id as number, title: (f.title_en ?? f.title) as string },
    ]),
  );

  const seeds = scored
    .filter(r => tmdbInfoByFilmId.has(r.film_id))
    .slice(0, SEED_COUNT)
    .map(r => ({ film_id: r.film_id, ...tmdbInfoByFilmId.get(r.film_id)! }));

  if (seeds.length === 0) return NextResponse.json({ shelves: [] });

  // ── 3. Resolve candidate (currently-screened) films' tmdb_ids ─────────
  const candTmdbToFilmId = new Map<number, number>();
  for (let i = 0; i < filmIds.length; i += BATCH) {
    const slice = filmIds.slice(i, i + BATCH);
    const { data } = await supabase
      .from('films')
      .select('id, tmdb_id')
      .in('id', slice)
      .not('tmdb_id', 'is', null);
    if (data) {
      for (const f of data) candTmdbToFilmId.set(f.tmdb_id as number, f.id);
    }
  }

  if (candTmdbToFilmId.size === 0) return NextResponse.json({ shelves: [] });

  const seedTmdbIds = seeds.map(s => s.tmdb_id);
  const candidateTmdbIds = [...candTmdbToFilmId.keys()];

  // ── 4. Query KG for connections ───────────────────────────────────────
  const connections = await connectedFilmsByTmdb(seedTmdbIds, candidateTmdbIds);

  // ── 5. Build shelves ──────────────────────────────────────────────────
  const shelves = [];
  const usedFilmIds = new Set<number>();

  for (const seed of seeds) {
    const conns = connections.get(seed.tmdb_id) ?? [];
    const topFilmIds: number[] = [];
    for (const c of conns) {
      const fid = candTmdbToFilmId.get(c.connectedTmdbId);
      if (fid == null || usedFilmIds.has(fid)) continue;
      topFilmIds.push(fid);
      usedFilmIds.add(fid); // mark immediately so duplicate connection rows don't repeat the film
      if (topFilmIds.length >= TOP_PER_SHELF) break;
    }
    if (topFilmIds.length === 0) continue;

    shelves.push({
      seedFilmId: seed.film_id,
      seedTmdbId: seed.tmdb_id,
      seedTitle: seed.title,
      topFilmIds,
    });
  }

  return NextResponse.json({ shelves });
}
