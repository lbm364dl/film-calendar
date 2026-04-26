import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Server-side only. Never import this from a client component.

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

export type KgConnectionResult = {
  connectedTmdbId: number;
  connectionType: string;
  description: string;
  strength: number | null;
};

/**
 * For each seed tmdb_id, return KG connections whose "other side" is among
 * candidateTmdbIds. Does a 2-hop traversal: direct connections first, then
 * connections-of-connections (with a small strength penalty). This is needed
 * because the screened set is ~1% of the KG, so direct connections alone
 * rarely land on a screened film.
 */
export async function connectedFilmsByTmdb(
  seedTmdbIds: number[],
  candidateTmdbIds: number[],
): Promise<Map<number, KgConnectionResult[]>> {
  if (seedTmdbIds.length === 0 || candidateTmdbIds.length === 0) return new Map();

  const kg = getKgSupabase();

  const [{ data: seedFilms }, { data: candFilms }] = await Promise.all([
    kg.from('films').select('id, tmdb_id').in('tmdb_id', seedTmdbIds),
    kg.from('films').select('id, tmdb_id').in('tmdb_id', candidateTmdbIds),
  ]);

  if (!seedFilms?.length || !candFilms?.length) return new Map();

  const seedKgIdToTmdb = new Map<number, number>(
    seedFilms.map(f => [f.id as number, f.tmdb_id as number]),
  );
  const candKgIdToTmdb = new Map<number, number>(
    candFilms.map(f => [f.id as number, f.tmdb_id as number]),
  );
  const seedKgIds = seedFilms.map(f => f.id as number);
  const seedKgIdSet = new Set(seedKgIds);
  const candKgIds = new Set(candFilms.map(f => f.id as number));

  // ── Hop 1: direct connections from seeds ─────────────────────────────
  const { data: hop1Conns } = await kg
    .from('film_connections')
    .select('film_a_id, film_b_id, connection_type, description, strength')
    .or(`film_a_id.in.(${seedKgIds.join(',')}),film_b_id.in.(${seedKgIds.join(',')})`);

  const result = new Map<number, KgConnectionResult[]>();

  // Maps seed KG id → set of directly connected KG ids (for hop 2 attribution)
  const seedToHop1 = new Map<number, Set<number>>();

  for (const c of hop1Conns ?? []) {
    for (const [seedKgId, seedTmdb] of seedKgIdToTmdb) {
      let otherKgId: number | null = null;
      if (c.film_a_id === seedKgId) otherKgId = c.film_b_id;
      else if (c.film_b_id === seedKgId) otherKgId = c.film_a_id;
      if (otherKgId == null) continue;

      // Track all hop-1 neighbors (regardless of candidate) for hop-2 traversal
      const h1 = seedToHop1.get(seedKgId) ?? new Set();
      h1.add(otherKgId);
      seedToHop1.set(seedKgId, h1);

      // Only record as result if it's a candidate
      if (!candKgIds.has(otherKgId)) continue;
      const connectedTmdb = candKgIdToTmdb.get(otherKgId);
      if (connectedTmdb == null) continue;

      const arr = result.get(seedTmdb) ?? [];
      arr.push({
        connectedTmdbId: connectedTmdb,
        connectionType: c.connection_type,
        description: c.description ?? '',
        strength: c.strength != null ? parseFloat(String(c.strength)) : null,
      });
      result.set(seedTmdb, arr);
    }
  }

  // ── Hop 2: connections of hop-1 neighbors ────────────────────────────
  const allHop1Ids = [...new Set([...seedToHop1.values()].flatMap(s => [...s]))]
    .filter(id => !seedKgIdSet.has(id));

  if (allHop1Ids.length > 0) {
    const { data: hop2Conns } = await kg
      .from('film_connections')
      .select('film_a_id, film_b_id, connection_type, description, strength')
      .or(`film_a_id.in.(${allHop1Ids.join(',')}),film_b_id.in.(${allHop1Ids.join(',')})`);

    // Already-found tmdb_ids per seed (to avoid 1-hop/2-hop duplicates)
    const foundPerSeed = new Map<number, Set<number>>();
    for (const [seedTmdb, arr] of result) {
      foundPerSeed.set(seedTmdb, new Set(arr.map(r => r.connectedTmdbId)));
    }

    for (const c of hop2Conns ?? []) {
      for (const [seedKgId, seedTmdb] of seedKgIdToTmdb) {
        const hop1Set = seedToHop1.get(seedKgId);
        if (!hop1Set) continue;

        let otherKgId: number | null = null;
        if (hop1Set.has(c.film_a_id)) otherKgId = c.film_b_id;
        else if (hop1Set.has(c.film_b_id)) otherKgId = c.film_a_id;
        if (otherKgId == null || seedKgIdSet.has(otherKgId) || !candKgIds.has(otherKgId)) continue;

        const connectedTmdb = candKgIdToTmdb.get(otherKgId);
        if (connectedTmdb == null) continue;

        const found = foundPerSeed.get(seedTmdb) ?? new Set();
        if (found.has(connectedTmdb)) continue;
        found.add(connectedTmdb);
        foundPerSeed.set(seedTmdb, found);

        const arr = result.get(seedTmdb) ?? [];
        arr.push({
          connectedTmdbId: connectedTmdb,
          connectionType: c.connection_type,
          description: c.description ?? '',
          // Slight penalty so 1-hop results stay ranked above 2-hop
          strength: c.strength != null ? parseFloat(String(c.strength)) * 0.8 : null,
        });
        result.set(seedTmdb, arr);
      }
    }
  }

  for (const [key, arr] of result) {
    arr.sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0));
    result.set(key, arr);
  }

  return result;
}
