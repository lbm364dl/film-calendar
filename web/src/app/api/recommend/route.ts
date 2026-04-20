import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { CompactBreakdown, SimilarWatched } from '@/lib/recommender';
import {
  buildTasteVector,
  findNearestWatchedPerScreening,
  normalizeScores,
  popularityAdj,
  confidenceAdj,
  MIN_OVERLAP_THRESHOLD,
  EMBEDDING_DIM,
  type WatchedFilmInfo,
} from '@/lib/recommender-embedding';
import { embeddingsByTmdb } from '@/lib/supabase-kg';

/**
 * GET /api/recommend — Compute match scores for all currently-screened films
 * using the KG's vibe embeddings.
 *
 * Returns: { scores: { [filmId]: 0-100 }, breakdowns: { [filmId]: CompactBreakdown }, ready: boolean }
 */
export async function GET() {
  const cookieStore = await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const supabase = createServerClient(url, key!, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options));
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const BATCH = 500;

  // ── 1. Load user's watched films (paginated) ──────────────────────────
  const watchedRows: {
    letterboxd_short_url: string;
    film_id: number | null;
    rating: number | null;
    liked: boolean;
    watched_date: string | null;
    rewatch_count: number;
  }[] = [];
  {
    let offset = 0;
    while (true) {
      const { data, error } = await supabase
        .from('user_watched_films')
        .select('letterboxd_short_url, film_id, rating, liked, watched_date, rewatch_count')
        .eq('user_id', user.id)
        .range(offset, offset + BATCH - 1);
      if (error || !data) break;
      watchedRows.push(...data);
      if (data.length < BATCH) break;
      offset += BATCH;
    }
  }

  if (watchedRows.length === 0) {
    return NextResponse.json({ scores: {}, breakdowns: {}, ready: false });
  }

  // ── 2. Resolve tmdb_id + title for watched films (needed for KG join + UI) ──
  const watchedFilmIds = watchedRows
    .map(r => r.film_id)
    .filter((id): id is number => id != null);

  const filmInfoById = new Map<number, {
    tmdb_id: number | null;
    title: string;
    title_en: string | null;
    letterboxd_url: string | null;
    letterboxd_viewers: number | null;
  }>();

  for (let i = 0; i < watchedFilmIds.length; i += BATCH) {
    const batch = watchedFilmIds.slice(i, i + BATCH);
    const { data } = await supabase
      .from('films')
      .select('id, tmdb_id, title, title_en, letterboxd_url, letterboxd_viewers')
      .in('id', batch);
    if (data) {
      for (const f of data) {
        filmInfoById.set(f.id, {
          tmdb_id: f.tmdb_id ?? null,
          title: f.title,
          title_en: f.title_en ?? null,
          letterboxd_url: f.letterboxd_url ?? null,
          letterboxd_viewers: f.letterboxd_viewers ?? null,
        });
      }
    }
  }

  const watched: WatchedFilmInfo[] = watchedRows
    .filter(r => r.film_id != null && filmInfoById.has(r.film_id))
    .map(r => ({
      film_id: r.film_id!,
      tmdb_id: filmInfoById.get(r.film_id!)!.tmdb_id,
      letterboxd_short_url: r.letterboxd_short_url,
      rating: r.rating,
      liked: r.liked ?? false,
      watched_date: r.watched_date,
      rewatch_count: r.rewatch_count ?? 0,
    }));

  // ── 3. Load currently-screened films + their tmdb_ids ─────────────────
  const nowMadrid = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' });
  const screenedIds: number[] = [];
  {
    let offset = 0;
    while (true) {
      const { data } = await supabase
        .from('screenings')
        .select('film_id')
        .gte('showtime', nowMadrid)
        .range(offset, offset + BATCH - 1);
      if (!data || data.length === 0) break;
      for (const s of data) screenedIds.push(s.film_id);
      if (data.length < BATCH) break;
      offset += BATCH;
    }
  }
  const uniqueScreenedFilmIds = [...new Set(screenedIds)];

  if (uniqueScreenedFilmIds.length === 0) {
    return NextResponse.json({ scores: {}, breakdowns: {}, ready: false });
  }

  // Fetch tmdb_id + title info for screened films (fill the same map)
  for (let i = 0; i < uniqueScreenedFilmIds.length; i += BATCH) {
    const batch = uniqueScreenedFilmIds.slice(i, i + BATCH);
    const { data } = await supabase
      .from('films')
      .select('id, tmdb_id, title, title_en, letterboxd_url, letterboxd_viewers')
      .in('id', batch);
    if (data) {
      for (const f of data) {
        filmInfoById.set(f.id, {
          tmdb_id: f.tmdb_id ?? null,
          title: f.title,
          title_en: f.title_en ?? null,
          letterboxd_url: f.letterboxd_url ?? null,
          letterboxd_viewers: f.letterboxd_viewers ?? null,
        });
      }
    }
  }

  // ── 4. Fetch embeddings from KG for watched + screened (deduped) ──────
  const watchedTmdbIds = [...new Set(
    watched.map(w => w.tmdb_id).filter((t): t is number => t != null)
  )];
  const screenedTmdbIds = [...new Set(
    uniqueScreenedFilmIds
      .map(id => filmInfoById.get(id)?.tmdb_id)
      .filter((t): t is number => t != null)
  )];

  // Batch KG calls to avoid oversized JSON payloads
  const KG_BATCH = 300;
  const watchedEmbRecords = [];
  for (let i = 0; i < watchedTmdbIds.length; i += KG_BATCH) {
    const slice = watchedTmdbIds.slice(i, i + KG_BATCH);
    watchedEmbRecords.push(...await embeddingsByTmdb(slice));
  }
  const screenedEmbRecords = [];
  for (let i = 0; i < screenedTmdbIds.length; i += KG_BATCH) {
    const slice = screenedTmdbIds.slice(i, i + KG_BATCH);
    screenedEmbRecords.push(...await embeddingsByTmdb(slice));
  }

  const watchedEmbedMap = new Map<number, Float32Array>();
  const watchedTagsMap = new Map<number, { mood_tags: string[]; themes: string[] }>();
  for (const r of watchedEmbRecords) {
    if (r.embedding?.length === EMBEDDING_DIM) {
      watchedEmbedMap.set(r.tmdb_id, Float32Array.from(r.embedding));
      watchedTagsMap.set(r.tmdb_id, {
        mood_tags: r.mood_tags ?? [],
        themes: r.themes ?? [],
      });
    }
  }

  const screenedEmbedMap = new Map<number, Float32Array>();
  const screenedTagsMap = new Map<number, { mood_tags: string[]; themes: string[] }>();
  const screenedAnalysisMap = new Map<number, {
    atmosphere: string | null;
    tone: string | null;
    pacing: string | null;
    confidence: string | null;
  }>();
  for (const r of screenedEmbRecords) {
    if (r.embedding?.length === EMBEDDING_DIM) {
      screenedEmbedMap.set(r.tmdb_id, Float32Array.from(r.embedding));
      screenedTagsMap.set(r.tmdb_id, {
        mood_tags: r.mood_tags ?? [],
        themes: r.themes ?? [],
      });
      screenedAnalysisMap.set(r.tmdb_id, {
        atmosphere: r.atmosphere,
        tone: r.tone,
        pacing: r.pacing,
        confidence: r.confidence,
      });
    }
  }

  // ── 5. Build taste vector ─────────────────────────────────────────────
  const nowMs = Date.now();
  const taste = buildTasteVector(watched, watchedEmbedMap, nowMs);

  if (!taste || taste.overlapCount < MIN_OVERLAP_THRESHOLD) {
    return NextResponse.json({
      scores: {},
      breakdowns: {},
      ready: false,
      reason: 'insufficient_overlap',
      overlap: taste?.overlapCount ?? 0,
      needed: MIN_OVERLAP_THRESHOLD,
    });
  }

  // ── 6. Raw cosine × popularity × confidence, per screening ────────────
  //
  // Pure vibe similarity over-ranks obscure films whose embeddings might be
  // noisy. We multiply by a log-scaled popularity factor and a KG-confidence
  // factor so equal-vibe popular films outrank obscure ones, but serendipity
  // isn't killed.
  const rawScoreByFilmId = new Map<number, number>();
  const adjByFilmId = new Map<number, { popularity: number; confidence: number }>();
  for (const fid of uniqueScreenedFilmIds) {
    const info = filmInfoById.get(fid);
    const tmdb = info?.tmdb_id;
    if (tmdb == null) continue;
    const emb = screenedEmbedMap.get(tmdb);
    if (!emb) continue;

    let dot = 0;
    for (let i = 0; i < EMBEDDING_DIM; i++) dot += taste.vector[i] * emb[i];

    const popAdj = popularityAdj(info?.letterboxd_viewers ?? null);
    const conf = screenedAnalysisMap.get(tmdb)?.confidence ?? null;
    const confAdj = confidenceAdj(conf);

    rawScoreByFilmId.set(fid, dot * popAdj * confAdj);
    adjByFilmId.set(fid, { popularity: popAdj, confidence: confAdj });
  }

  const nearestByScreenTmdb = findNearestWatchedPerScreening(
    screenedEmbedMap,
    screenedTagsMap,
    watched,
    watchedEmbedMap,
    watchedTagsMap,
    nowMs,
    3,
  );

  // ── 7. Normalize + build breakdowns ───────────────────────────────────
  const watchedFilmIdsSet = new Set(watched.map(w => w.film_id));
  const normScores = normalizeScores(rawScoreByFilmId, watchedFilmIdsSet);

  const scores: Record<number, number> = {};
  const breakdowns: Record<number, CompactBreakdown> = {};

  for (const fid of uniqueScreenedFilmIds) {
    const s = normScores.get(fid);
    if (s == null) continue;
    scores[fid] = s;

    const info = filmInfoById.get(fid);
    const tmdb = info?.tmdb_id ?? null;
    const neighbors = tmdb != null ? nearestByScreenTmdb.get(tmdb) ?? [] : [];

    // Only cite a watched film as "similar to" when the raw cosine is strong
    // enough to be meaningful. Voyage top-neighbors typically sit around
    // 0.78-0.82; below ~0.65 the claim is misleading on a low-match card.
    const SIMILAR_TO_MIN = 0.65;
    const similarTo: SimilarWatched[] = [];
    for (const n of neighbors) {
      if (n.similarity < SIMILAR_TO_MIN) continue;
      const nInfo = filmInfoById.get(n.watchedFilmId);
      if (!nInfo) continue;
      const primary = n.sharedMoodTags[0] ?? n.sharedThemes[0] ?? '';
      similarTo.push({
        title: nInfo.title,
        titleEn: nInfo.title_en ?? undefined,
        reason: n.sharedMoodTags.length > 0 ? 'mood' : (n.sharedThemes.length > 0 ? 'theme' : 'vibe'),
        value: primary || 'similar vibe',
        url: nInfo.letterboxd_url ?? undefined,
        sharedMoodTags: n.sharedMoodTags.length > 0 ? n.sharedMoodTags : undefined,
        sharedThemes: n.sharedThemes.length > 0 ? n.sharedThemes : undefined,
        similarity: Math.round(n.similarity * 10000) / 10000,
      });
    }

    // byCategory: count of shared mood_tags across neighbors → UI attribution.
    const byCategory: Record<string, number> = {};
    for (const n of neighbors) {
      for (const tag of n.sharedMoodTags) {
        byCategory[tag] = (byCategory[tag] ?? 0) + 1;
      }
    }
    const totalCat = Object.values(byCategory).reduce((a, b) => a + b, 0);
    if (totalCat > 0) {
      for (const k of Object.keys(byCategory)) byCategory[k] = byCategory[k] / totalCat;
    }

    const screenAnalysis = tmdb != null ? screenedAnalysisMap.get(tmdb) : undefined;
    const screenTags = tmdb != null ? screenedTagsMap.get(tmdb) : undefined;
    const adj = adjByFilmId.get(fid);

    breakdowns[fid] = {
      coverage: 1,
      byCategory,
      similarTo: similarTo.length > 0 ? similarTo : undefined,
      moodTags: screenTags?.mood_tags?.length ? screenTags.mood_tags : undefined,
      themes: screenTags?.themes?.length ? screenTags.themes : undefined,
      atmosphere: screenAnalysis?.atmosphere ?? undefined,
      tone: screenAnalysis?.tone ?? undefined,
      pacing: screenAnalysis?.pacing ?? undefined,
      confidence: screenAnalysis?.confidence ?? undefined,
      popularityAdj: adj ? Math.round(adj.popularity * 1000) / 1000 : undefined,
      confidenceAdj: adj ? Math.round(adj.confidence * 1000) / 1000 : undefined,
    };
  }

  // Screenings without KG embeddings get no score. Mark them explicitly so UI
  // can distinguish "no data" from "low match".
  // (Currently we just omit them from `scores`; UI treats absence as unknown.)

  // ── 8. Persist ────────────────────────────────────────────────────────
  const rows = Object.keys(scores).map(k => ({
    user_id: user.id,
    film_id: Number(k),
    score: scores[Number(k)],
    breakdown: breakdowns[Number(k)] ?? null,
    computed_at: new Date().toISOString(),
  }));

  if (rows.length > 0) {
    await supabase.from('user_film_scores').delete().eq('user_id', user.id);
    for (let i = 0; i < rows.length; i += BATCH) {
      await supabase.from('user_film_scores').insert(rows.slice(i, i + BATCH));
    }
  }

  return NextResponse.json({
    scores,
    breakdowns,
    ready: true,
    overlap: taste.overlapCount,
    screenedWithEmbeddings: Object.keys(scores).length,
    screenedTotal: uniqueScreenedFilmIds.length,
  });
}
