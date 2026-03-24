/**
 * Personalized PageRank recommendation engine.
 *
 * Builds a knowledge graph from film metadata (directors, cast, genres,
 * keywords, countries, decades, etc.) and runs Random Walk with Restart
 * seeded from the user's highly-rated films.
 *
 * Films reachable through many short paths from liked films score highest.
 * This naturally captures director-following, genre affinity, and transitive
 * connections that cosine-similarity misses.
 */

import type { FilmFeatures, MatchScore, CompactBreakdown } from './recommender';

export type { FilmFeatures, MatchScore, CompactBreakdown };

// ── Graph construction ──────────────────────────────────────────────────────

/** Edge weights per category — controls how much influence flows through each type. */
const EDGE_WEIGHTS: Record<string, number> = {
  director: 3.0,
  genre: 2.0,
  cast: 1.5,
  keyword: 1.5,
  country: 2.0,
  language: 1.0,
  decade: 1.5,
  collection: 1.0,
  company: 1.0,
};

/** Maximum items per category to avoid noise. */
const MAX_CAST = 5;
const MAX_KEYWORDS = 10;
const MAX_COMPANIES = 3;

interface GraphNode {
  id: string;         // e.g., "film:42", "director:125025", "genre:drama"
  category: string;   // "film", "director", "genre", "cast", etc.
}

interface GraphEdge {
  target: number;     // index into nodes array
  weight: number;
}

/**
 * Build a knowledge graph from a set of films.
 *
 * Nodes: film nodes + attribute nodes (directors, genres, cast, keywords, etc.)
 * Edges: bidirectional between films and their attributes, with category-based weights.
 */
function buildGraph(films: FilmFeatures[]) {
  const nodeIndex = new Map<string, number>(); // node id → index
  const nodes: GraphNode[] = [];
  const adjacency: GraphEdge[][] = [];  // adjacency[nodeIdx] = list of edges

  function getOrCreateNode(id: string, category: string): number {
    let idx = nodeIndex.get(id);
    if (idx !== undefined) return idx;
    idx = nodes.length;
    nodeIndex.set(id, idx);
    nodes.push({ id, category });
    adjacency.push([]);
    return idx;
  }

  function addEdge(a: number, b: number, weight: number) {
    adjacency[a].push({ target: b, weight });
    adjacency[b].push({ target: a, weight });
  }

  for (const film of films) {
    const filmIdx = getOrCreateNode(`film:${film.id}`, 'film');

    // Directors (strongest signal)
    const directors = film.directors ?? [];
    if (directors.length > 0) {
      for (const d of directors.slice(0, 2)) {
        if (d?.id) {
          const dIdx = getOrCreateNode(`director:${d.id}`, 'director');
          addEdge(filmIdx, dIdx, EDGE_WEIGHTS.director);
        }
      }
    } else if (film.director) {
      for (const name of film.director.split(',').map(s => s.trim()).slice(0, 2)) {
        const dIdx = getOrCreateNode(`director:${name.toLowerCase()}`, 'director');
        addEdge(filmIdx, dIdx, EDGE_WEIGHTS.director);
      }
    }

    // Genres
    for (const g of film.genres ?? []) {
      const gIdx = getOrCreateNode(`genre:${g.toLowerCase()}`, 'genre');
      addEdge(filmIdx, gIdx, EDGE_WEIGHTS.genre);
    }

    // Cast (top billed get stronger edges)
    const cast = (film.top_cast ?? []).slice(0, MAX_CAST);
    for (let i = 0; i < cast.length; i++) {
      const m = cast[i];
      if (m?.id) {
        // Lead actors get stronger edges
        const weight = i < 2 ? EDGE_WEIGHTS.cast * 1.5 : EDGE_WEIGHTS.cast;
        const cIdx = getOrCreateNode(`cast:${m.id}`, 'cast');
        addEdge(filmIdx, cIdx, weight);
      }
    }

    // Keywords
    for (const kw of (film.keywords ?? []).slice(0, MAX_KEYWORDS)) {
      if (kw?.id) {
        const kIdx = getOrCreateNode(`keyword:${kw.id}`, 'keyword');
        addEdge(filmIdx, kIdx, EDGE_WEIGHTS.keyword);
      }
    }

    // Countries
    for (const c of film.country ?? []) {
      const cIdx = getOrCreateNode(`country:${c.toLowerCase()}`, 'country');
      addEdge(filmIdx, cIdx, EDGE_WEIGHTS.country);
    }

    // Languages (deduplicated)
    const langs = new Set<string>();
    for (const l of film.primary_language ?? []) langs.add(l.toLowerCase());
    for (const l of film.spoken_languages ?? []) langs.add(l.toLowerCase());
    for (const l of langs) {
      const lIdx = getOrCreateNode(`lang:${l}`, 'language');
      addEdge(filmIdx, lIdx, EDGE_WEIGHTS.language);
    }

    // Decade
    const decade = getDecadeBucket(film.year);
    const decIdx = getOrCreateNode(`decade:${decade}`, 'decade');
    addEdge(filmIdx, decIdx, EDGE_WEIGHTS.decade);

    // Collection
    if (film.collection_id) {
      const colIdx = getOrCreateNode(`collection:${film.collection_id}`, 'collection');
      addEdge(filmIdx, colIdx, EDGE_WEIGHTS.collection);
    }

    // Production companies
    for (const co of (film.production_companies ?? []).slice(0, MAX_COMPANIES)) {
      if (co?.id) {
        const coIdx = getOrCreateNode(`company:${co.id}`, 'company');
        addEdge(filmIdx, coIdx, EDGE_WEIGHTS.company);
      }
    }
  }

  return { nodes, adjacency, nodeIndex };
}

function getDecadeBucket(year: number | null): string {
  if (year == null) return 'unknown';
  if (year < 1960) return 'pre-1960';
  return `${Math.floor(year / 10) * 10}s`;
}


// ── Personalized PageRank ───────────────────────────────────────────────────

/**
 * Run Personalized PageRank via power iteration.
 *
 * @param adjacency - Weighted adjacency list
 * @param seedIndices - Node indices to restart from (liked films)
 * @param seedWeights - Weight for each seed (higher rating = higher restart probability)
 * @param alpha - Restart probability (0.15 = 15% chance of teleporting back to seeds)
 * @param iterations - Number of power iterations
 * @returns Probability distribution over all nodes
 */
function personalizedPageRank(
  adjacency: GraphEdge[][],
  seedIndices: number[],
  seedWeights: number[],
  alpha: number = 0.15,
  iterations: number = 25,
): Float64Array {
  const n = adjacency.length;
  if (n === 0 || seedIndices.length === 0) return new Float64Array(n);

  // Build restart distribution (normalized seed weights)
  const restart = new Float64Array(n);
  let totalSeedWeight = 0;
  for (let i = 0; i < seedIndices.length; i++) {
    totalSeedWeight += seedWeights[i];
  }
  if (totalSeedWeight > 0) {
    for (let i = 0; i < seedIndices.length; i++) {
      restart[seedIndices[i]] = seedWeights[i] / totalSeedWeight;
    }
  }

  // Precompute total outgoing weight for each node
  const outWeights = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let total = 0;
    for (const edge of adjacency[i]) total += edge.weight;
    outWeights[i] = total;
  }

  // Power iteration
  let p = new Float64Array(restart);
  for (let iter = 0; iter < iterations; iter++) {
    const next = new Float64Array(n);

    // Random walk step: distribute probability along weighted edges
    for (let i = 0; i < n; i++) {
      if (p[i] === 0) continue;
      const outW = outWeights[i];
      if (outW === 0) continue;
      for (const edge of adjacency[i]) {
        next[edge.target] += (1 - alpha) * p[i] * (edge.weight / outW);
      }
    }

    // Restart: teleport back to seed nodes
    for (let i = 0; i < n; i++) {
      next[i] += alpha * restart[i];
    }

    p = next;
  }

  return p;
}


// ── Score computation & breakdown ───────────────────────────────────────────

/**
 * Compute a category breakdown for a film's PageRank score.
 *
 * Looks at the film's neighbor attribute nodes and measures how much
 * PageRank probability flows through each category.
 */
function computeBreakdown(
  filmNodeIdx: number,
  adjacency: GraphEdge[][],
  nodes: GraphNode[],
  probabilities: Float64Array,
): CompactBreakdown {
  const categoryProb: Record<string, number> = {};
  let totalProb = 0;
  let categoriesWithData = 0;
  const allCategories = new Set<string>();

  for (const edge of adjacency[filmNodeIdx]) {
    const neighbor = nodes[edge.target];
    if (neighbor.category === 'film') continue; // Skip film-film connections

    allCategories.add(neighbor.category);
    const prob = probabilities[edge.target] * edge.weight;
    categoryProb[neighbor.category] = (categoryProb[neighbor.category] ?? 0) + prob;
    totalProb += prob;
  }

  // Normalize to relative contributions
  const byCategory: Record<string, number> = {};
  if (totalProb > 0) {
    for (const [cat, prob] of Object.entries(categoryProb)) {
      byCategory[cat] = prob / totalProb;
      if (prob > 0) categoriesWithData++;
    }
  }

  // Coverage: fraction of possible categories that have data
  const possibleCategories = Object.keys(EDGE_WEIGHTS).length;
  const coverage = possibleCategories > 0 ? categoriesWithData / possibleCategories : 0;

  return { coverage, byCategory };
}


// ── Public API (same interface as recommender.ts) ───────────────────────────

/**
 * Compute recommendations using Personalized PageRank.
 *
 * @param watchedFilms - All films the user has watched (with metadata)
 * @param userRatings - Map of letterboxd_short_url → rating (0.5-5.0)
 * @param urlToFilmId - Map of film_id → letterboxd_short_url
 * @param screenedFilms - Currently-screening candidate films
 * @returns Sorted array of match scores with breakdowns
 */
export function computeRecommendationsWithBreakdown(
  watchedFilms: FilmFeatures[],
  userRatings: Record<string, number>,
  urlToFilmId: Record<number, string>,
  screenedFilms: FilmFeatures[],
): (MatchScore & { breakdown: CompactBreakdown })[] {
  if (watchedFilms.length === 0 || screenedFilms.length === 0) {
    return [];
  }

  // Deduplicate films (a film can be both watched and screened)
  const allFilmsMap = new Map<number, FilmFeatures>();
  for (const f of watchedFilms) allFilmsMap.set(f.id, f);
  for (const f of screenedFilms) allFilmsMap.set(f.id, f);
  const allFilms = [...allFilmsMap.values()];

  // Build graph
  const { nodes, adjacency, nodeIndex } = buildGraph(allFilms);

  // Identify seed nodes: watched films with high ratings
  const seedIndices: number[] = [];
  const seedWeights: number[] = [];
  const watchedIds = new Set<number>();

  for (const film of watchedFilms) {
    watchedIds.add(film.id);
    const url = urlToFilmId[film.id];
    const rating = url ? (userRatings[url] ?? 3.0) : 3.0;

    // Only seed from films rated 3+ (skip disliked films)
    if (rating < 3.0) continue;

    const filmNodeId = `film:${film.id}`;
    const idx = nodeIndex.get(filmNodeId);
    if (idx === undefined) continue;

    // Weight: quadratic scaling emphasizes highly-rated films
    // 5★ → 4.0, 4★ → 1.5625, 3★ → 0.5625
    const weight = Math.pow((rating - 1.5) / 2.5, 2);
    seedIndices.push(idx);
    seedWeights.push(weight);
  }

  if (seedIndices.length === 0) {
    return screenedFilms.map(f => ({
      filmId: f.id,
      score: 0,
      breakdown: { coverage: 0, byCategory: {} },
    }));
  }

  // Run Personalized PageRank
  const probabilities = personalizedPageRank(adjacency, seedIndices, seedWeights);

  // Extract scores for screened films (excluding already-watched)
  const rawScores: { filmId: number; raw: number; idx: number }[] = [];
  for (const film of screenedFilms) {
    if (watchedIds.has(film.id)) continue; // Skip already watched

    const filmNodeId = `film:${film.id}`;
    const idx = nodeIndex.get(filmNodeId);
    if (idx === undefined) {
      rawScores.push({ filmId: film.id, raw: 0, idx: -1 });
      continue;
    }
    rawScores.push({ filmId: film.id, raw: probabilities[idx], idx });
  }

  // Min-max normalize to 0-100
  const rawValues = rawScores.map(s => s.raw);
  const minRaw = Math.min(...rawValues);
  const maxRaw = Math.max(...rawValues);
  const range = maxRaw - minRaw;

  const results: (MatchScore & { breakdown: CompactBreakdown })[] = [];

  for (const { filmId, raw, idx } of rawScores) {
    // Normalize to 5-95 range
    const normalized = range > 0 ? (raw - minRaw) / range : 0.5;
    const score = Math.round(5 + normalized * 90);

    // Compute breakdown
    const breakdown = idx >= 0
      ? computeBreakdown(idx, adjacency, nodes, probabilities)
      : { coverage: 0, byCategory: {} };

    results.push({ filmId, score, breakdown });
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  return results;
}

/**
 * Compute recommendations without breakdowns (lighter, for batch use).
 */
export function computeRecommendations(
  watchedFilms: FilmFeatures[],
  userRatings: Record<string, number>,
  urlToFilmId: Record<number, string>,
  screenedFilms: FilmFeatures[],
): MatchScore[] {
  return computeRecommendationsWithBreakdown(
    watchedFilms, userRatings, urlToFilmId, screenedFilms,
  ).map(({ filmId, score }) => ({ filmId, score }));
}
