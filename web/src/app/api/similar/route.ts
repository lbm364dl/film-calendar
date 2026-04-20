import { NextResponse } from 'next/server';
import { nearestFilmsBulk, type BulkNearestRow } from '@/lib/supabase-kg';

/**
 * GET /api/similar?tmdb_ids=1,2,3 — For each tmdb_id, return top-K nearest
 * films from the KG embedding space. No auth; no user data used.
 *
 * Response: { [tmdb_id]: { neighbors: SimilarNeighbor[] } }
 */

const PER_K = 4;
const BULK_BATCH = 80;          // refs per KG RPC call (RPC expands to ~80×PER_K rows)
const CACHE_TTL_MS = 1000 * 60 * 60 * 6;   // 6h — KG is near-static
const CACHE_MAX_ENTRIES = 5000;

export interface SimilarNeighbor {
  tmdb_id: number;
  title: string;
  year: number | null;
  letterboxd_url: string | null;
  similarity: number;
  mood_tags: string[];
  themes: string[];
}

interface CacheEntry {
  neighbors: SimilarNeighbor[];
  cachedAt: number;
}

// Module-level cache. Persists across requests within a single Node process.
const cache = new Map<number, CacheEntry>();

function getCached(tmdbId: number): SimilarNeighbor[] | null {
  const entry = cache.get(tmdbId);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    cache.delete(tmdbId);
    return null;
  }
  return entry.neighbors;
}

function setCached(tmdbId: number, neighbors: SimilarNeighbor[]): void {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    // Simple eviction: drop the oldest inserted entry (Map preserves insertion order).
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(tmdbId, { neighbors, cachedAt: Date.now() });
}

function toNeighbor(row: BulkNearestRow): SimilarNeighbor {
  return {
    tmdb_id: row.tmdb_id,
    title: row.title,
    year: row.year,
    letterboxd_url: row.letterboxd_url,
    similarity: row.similarity,
    mood_tags: row.mood_tags ?? [],
    themes: row.themes ?? [],
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = url.searchParams.get('tmdb_ids');
  if (!raw) {
    return NextResponse.json({ error: 'Missing tmdb_ids' }, { status: 400 });
  }

  const ids = raw
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => Number.isFinite(n) && n > 0);

  if (ids.length === 0) {
    return NextResponse.json({});
  }

  const result: Record<number, { neighbors: SimilarNeighbor[] }> = {};
  const misses: number[] = [];

  for (const id of ids) {
    const cached = getCached(id);
    if (cached) {
      result[id] = { neighbors: cached };
    } else {
      misses.push(id);
    }
  }

  // Fetch misses from KG in batches.
  for (let i = 0; i < misses.length; i += BULK_BATCH) {
    const batch = misses.slice(i, i + BULK_BATCH);
    const rows = await nearestFilmsBulk(batch, PER_K);

    // Group rows by ref_tmdb_id
    const grouped = new Map<number, SimilarNeighbor[]>();
    for (const row of rows) {
      const arr = grouped.get(row.ref_tmdb_id) ?? [];
      arr.push(toNeighbor(row));
      grouped.set(row.ref_tmdb_id, arr);
    }

    // Sort each group by similarity desc (SQL doesn't guarantee order across groups)
    for (const [ref, arr] of grouped) {
      arr.sort((a, b) => b.similarity - a.similarity);
      setCached(ref, arr);
      result[ref] = { neighbors: arr };
    }

    // Refs with no rows returned (no embedding / not in KG): cache empty so we
    // don't re-query.
    for (const ref of batch) {
      if (!grouped.has(ref)) {
        setCached(ref, []);
        result[ref] = { neighbors: [] };
      }
    }
  }

  return NextResponse.json(result);
}
