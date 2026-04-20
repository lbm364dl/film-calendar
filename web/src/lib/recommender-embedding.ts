import type { CompactBreakdown } from './recommender';

// Embedding-based recommender. Replaces the PageRank path.
// The route layer does the DB I/O; this file is pure vector math so it's
// unit-testable and has no Supabase dependency.

export const EMBEDDING_DIM = 384;

// Minimum number of user-watched films with KG embeddings required before
// we bother computing affinity. Below this, taste signal is too noisy.
export const MIN_OVERLAP_THRESHOLD = 5;

export interface WatchedFilmInfo {
  film_id: number;              // calendar-side PK (films.id)
  tmdb_id: number | null;       // KG join key
  letterboxd_short_url: string;
  rating: number | null;        // 0.5–5.0 or null
  liked: boolean;
  watched_date: string | null;  // ISO date
  rewatch_count: number;
}

export interface EmbeddingRecord {
  tmdb_id: number;
  embedding: number[];          // 384 floats
  mood_tags: string[] | null;
  themes: string[] | null;
}

export interface ScreeningInfo {
  film_id: number;              // calendar-side PK
  tmdb_id: number | null;
}

export interface EmbeddingMatchScore {
  filmId: number;
  score: number;                // 0–100
  breakdown: CompactBreakdown;
}

// ── Adjustments: popularity + confidence ─────────────────────────────────────

/**
 * Log-scaled popularity multiplier: 0.60 (no viewers) → 1.00 (10k+ viewers).
 *
 * Equal vibe + 100k-viewer beats equal vibe + 100-viewer by ~25% on final
 * score. Demotes obscure films whose embeddings are likely noisy, without
 * killing serendipity.
 */
export function popularityAdj(viewers: number | null): number {
  if (viewers == null) return 0.90;
  if (viewers <= 0) return 0.60;
  return 0.60 + 0.40 * Math.min(1, Math.log10(viewers + 1) / 4);
}

/**
 * KG-confidence multiplier. The KG flags uncertain analyses (thin source
 * material, no Wikipedia, ambiguous film); we demote those mildly.
 */
export function confidenceAdj(conf: string | null): number {
  if (conf === 'high') return 1.00;
  if (conf === 'medium' || conf === 'moderate') return 0.92;
  if (conf === 'low') return 0.82;
  return 0.95;
}

// ── Seed weighting (ported from recommender-pagerank.ts:469-526) ─────────────

const DEFAULT_WATCHED_WEIGHT = 0.5625;

function recencyFactor(dateStr: string | null, nowMs: number): number {
  if (!dateStr) return 1.0;
  const watchedMs = new Date(dateStr).getTime();
  if (isNaN(watchedMs)) return 1.0;
  const days = (nowMs - watchedMs) / 86400000;
  return Math.max(0.3, Math.exp(-0.00385 * days));
}

export function seedWeight(wf: WatchedFilmInfo, nowMs: number): number {
  const rewatches = wf.rewatch_count ?? 0;
  const rewatchMult = rewatches > 0 ? 1 + 0.3 * Math.log2(1 + rewatches) : 1;

  if (wf.rating != null) {
    if (wf.rating < 3.0) return 0;
    return Math.pow((wf.rating - 1.5) / 2.5, 2) * rewatchMult;
  }

  const rec = recencyFactor(wf.watched_date, nowMs);
  if (wf.liked) return 4.0 * rec * rewatchMult;
  return DEFAULT_WATCHED_WEIGHT * rec * rewatchMult;
}

// ── Vector math ──────────────────────────────────────────────────────────────

function magnitude(v: Float32Array): number {
  let m = 0;
  for (let i = 0; i < v.length; i++) m += v[i] * v[i];
  return Math.sqrt(m);
}

function normalize(v: Float32Array): Float32Array {
  const m = magnitude(v);
  if (m === 0) return v;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / m;
  return out;
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

// ── Taste vector ─────────────────────────────────────────────────────────────

export interface TasteVectorResult {
  vector: Float32Array;
  overlapCount: number;         // # watched films with embeddings that contributed
  totalWatched: number;
}

export function buildTasteVector(
  watched: WatchedFilmInfo[],
  embeddingByTmdb: Map<number, Float32Array>,
  nowMs: number,
): TasteVectorResult | null {
  const acc = new Float32Array(EMBEDDING_DIM);
  let overlapCount = 0;
  let totalWeight = 0;

  for (const wf of watched) {
    if (wf.tmdb_id == null) continue;
    const emb = embeddingByTmdb.get(wf.tmdb_id);
    if (!emb) continue;
    const w = seedWeight(wf, nowMs);
    if (w <= 0) continue;
    for (let i = 0; i < EMBEDDING_DIM; i++) acc[i] += emb[i] * w;
    totalWeight += w;
    overlapCount += 1;
  }

  if (overlapCount === 0 || totalWeight === 0) return null;

  return {
    vector: normalize(acc),
    overlapCount,
    totalWatched: watched.length,
  };
}

// ── Pairwise nearest-watched lookup (for breakdowns) ─────────────────────────

export interface NeighborMatch {
  watchedFilmId: number;
  tmdb_id: number;
  similarity: number;
  sharedMoodTags: string[];
  sharedThemes: string[];
}

/**
 * For each screening, find the top-K nearest watched films (by cosine on
 * KG embeddings), intersecting mood_tags/themes for the "why" attribution.
 *
 * Watched films with weight 0 (rated <3) are excluded — we don't want
 * "because you hated X" as a reason.
 */
export function findNearestWatchedPerScreening(
  screeningEmbeddings: Map<number /* tmdb_id */, Float32Array>,
  screeningTagsByTmdb: Map<number, { mood_tags: string[]; themes: string[] }>,
  watched: WatchedFilmInfo[],
  watchedEmbeddings: Map<number, Float32Array>,
  watchedTagsByTmdb: Map<number, { mood_tags: string[]; themes: string[] }>,
  nowMs: number,
  topK = 3,
): Map<number /* screening tmdb_id */, NeighborMatch[]> {
  // Precompute watched vectors + metadata for the ones that qualify as seeds.
  const seeds: Array<{
    film_id: number;
    tmdb_id: number;
    vec: Float32Array;
    mood_tags: string[];
    themes: string[];
  }> = [];

  for (const wf of watched) {
    if (wf.tmdb_id == null) continue;
    const emb = watchedEmbeddings.get(wf.tmdb_id);
    if (!emb) continue;
    if (seedWeight(wf, nowMs) <= 0) continue;
    const tags = watchedTagsByTmdb.get(wf.tmdb_id);
    seeds.push({
      film_id: wf.film_id,
      tmdb_id: wf.tmdb_id,
      vec: emb,
      mood_tags: tags?.mood_tags ?? [],
      themes: tags?.themes ?? [],
    });
  }

  const out = new Map<number, NeighborMatch[]>();
  if (seeds.length === 0) return out;

  for (const [screenTmdb, screenVec] of screeningEmbeddings) {
    const screenTags = screeningTagsByTmdb.get(screenTmdb);
    const screenMoods = new Set(screenTags?.mood_tags ?? []);
    const screenThemes = new Set(screenTags?.themes ?? []);

    // Score each seed
    const scored: NeighborMatch[] = [];
    for (const s of seeds) {
      const sim = cosine(screenVec, s.vec);
      scored.push({
        watchedFilmId: s.film_id,
        tmdb_id: s.tmdb_id,
        similarity: sim,
        sharedMoodTags: s.mood_tags.filter((t) => screenMoods.has(t)),
        sharedThemes: s.themes.filter((t) => screenThemes.has(t)),
      });
    }

    scored.sort((a, b) => b.similarity - a.similarity);
    out.set(screenTmdb, scored.slice(0, topK));
  }

  return out;
}

// ── Score normalization ──────────────────────────────────────────────────────

/**
 * Min-max normalize raw cosine similarities to the 5–95 range (same output
 * range as PageRank path, so UI thresholds don't need to change).
 *
 * Excludes watched films from the normalization window — they're seeds, would
 * dominate the scale — but still returns their scores.
 */
export function normalizeScores(
  rawByFilmId: Map<number, number>,
  watchedFilmIds: Set<number>,
): Map<number, number> {
  const unwatchedValues: number[] = [];
  for (const [fid, v] of rawByFilmId) {
    if (!watchedFilmIds.has(fid)) unwatchedValues.push(v);
  }

  if (unwatchedValues.length === 0) {
    // Everything is watched — give them all 50 as a neutral score.
    const out = new Map<number, number>();
    for (const [fid] of rawByFilmId) out.set(fid, 50);
    return out;
  }

  let min = Infinity;
  let max = -Infinity;
  for (const v of unwatchedValues) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min;

  const out = new Map<number, number>();
  for (const [fid, v] of rawByFilmId) {
    if (range === 0) {
      out.set(fid, 50);
    } else {
      const t = Math.max(0, Math.min(1, (v - min) / range));
      out.set(fid, Math.round(5 + t * 90));
    }
  }
  return out;
}
