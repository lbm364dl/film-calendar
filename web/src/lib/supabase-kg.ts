import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Server-side only. Never import this from a client component.
// The KG project is read-only from this app; we only call RPCs.

let _client: SupabaseClient | null = null;

export function getKgSupabase(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.KG_SUPABASE_URL;
  const key = process.env.KG_SUPABASE_KEY;

  if (!url || !key) {
    throw new Error('Missing KG Supabase env vars (KG_SUPABASE_URL, KG_SUPABASE_KEY)');
  }

  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-client-info': 'film-calendar-kg' } },
  });
  return _client;
}

export type NearestFilm = {
  tmdb_id: number;
  title: string;
  year: number | null;
  letterboxd_url: string | null;
  letterboxd_viewers: number | null;
  similarity: number;
  mood_tags: string[] | null;
  themes: string[] | null;
};

export type ScoredFilm = {
  tmdb_id: number;
  similarity: number;
};

export type FilmEmbedding = {
  tmdb_id: number;
  embedding: number[];
  mood_tags: string[] | null;
  themes: string[] | null;
  atmosphere: string | null;
  tone: string | null;
  pacing: string | null;
  confidence: string | null;
};

export async function nearestFilmsByTmdb(
  refTmdbId: number,
  k = 10
): Promise<NearestFilm[]> {
  const { data, error } = await getKgSupabase().rpc('nearest_films_by_tmdb', {
    ref_tmdb_id: refTmdbId,
    k,
  });
  if (error) throw error;
  return (data ?? []) as NearestFilm[];
}

export async function scoreFilmsByVector(
  queryVec: number[],
  candidateTmdbIds: number[]
): Promise<ScoredFilm[]> {
  if (candidateTmdbIds.length === 0) return [];
  const { data, error } = await getKgSupabase().rpc('score_films_by_vector', {
    query_vec: queryVec,
    candidate_tmdb_ids: candidateTmdbIds,
  });
  if (error) throw error;
  return (data ?? []) as ScoredFilm[];
}

export type BulkNearestRow = NearestFilm & { ref_tmdb_id: number };

export async function nearestFilmsBulk(
  refTmdbIds: number[],
  perK = 5
): Promise<BulkNearestRow[]> {
  if (refTmdbIds.length === 0) return [];
  const { data, error } = await getKgSupabase().rpc('nearest_films_bulk', {
    ref_tmdb_ids: refTmdbIds,
    per_k: perK,
  });
  if (error) throw error;
  return (data ?? []) as BulkNearestRow[];
}

export async function embeddingsByTmdb(
  tmdbIds: number[]
): Promise<FilmEmbedding[]> {
  if (tmdbIds.length === 0) return [];
  const { data, error } = await getKgSupabase().rpc('embeddings_by_tmdb', {
    candidate_tmdb_ids: tmdbIds,
  });
  if (error) throw error;
  return (data ?? []) as FilmEmbedding[];
}
