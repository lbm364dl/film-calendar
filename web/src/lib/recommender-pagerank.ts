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
  keyword: 2.5,
  country: 2.0,
  cast: 1.5,
  genre: 1.5,
  decade: 1.5,
  collection: 1.0,
  language: 1.0,
  company: 1.0,
};

/**
 * Maximum fraction of films an attribute node can connect to before being
 * pruned as noise. E.g., if "english" connects to 60% of films, it's not
 * discriminating — it just pulls everything toward the mean.
 */
const MAX_HUB_FRACTION = 0.30;

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

  // ── Prune noisy hub nodes ──────────────────────────────────────────────
  // Attribute nodes connected to too many films act as noise (e.g. "english",
  // "united states", "2020s", "drama"). Remove their edges so they don't
  // distort the random walk. Only prune broad categories — directors, cast,
  // keywords, collections, and companies are specific enough to keep.
  const PRUNABLE_CATEGORIES = new Set(['genre', 'country', 'language', 'decade']);
  const filmCount = films.length;
  const maxConnections = Math.max(3, Math.floor(filmCount * MAX_HUB_FRACTION));

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!PRUNABLE_CATEGORIES.has(node.category)) continue;

    const filmNeighbors = adjacency[i].filter(e => nodes[e.target].category === 'film').length;
    if (filmNeighbors <= maxConnections) continue;

    // Disconnect: remove all edges from this node AND back-references to it
    const targets = adjacency[i].map(e => e.target);
    adjacency[i] = [];
    for (const t of targets) {
      adjacency[t] = adjacency[t].filter(e => e.target !== i);
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

/**
 * Find the top N watched films most connected to a screened film through
 * shared attribute nodes in the graph. Returns film IDs with the primary
 * attribute category that connects them (e.g. "director", "cast", "keyword").
 */
function findSimilarWatched(
  filmNodeIdx: number,
  adjacency: GraphEdge[][],
  nodes: GraphNode[],
  probabilities: Float64Array,
  watchedFilmIndices: Set<number>,
  totalFilms: number,
  topN: number = 3,
): { filmId: number; reason: string; attrValue: string }[] {
  // Per watched film: total score + per attribute node scores
  const watchedData = new Map<number, { total: number; attrs: Map<number, number> }>();

  for (const edge of adjacency[filmNodeIdx]) {
    const attrNode = nodes[edge.target];
    if (attrNode.category === 'film') continue;

    // Skip hub nodes — too many films connected, not discriminating
    const filmNeighborCount = adjacency[edge.target].filter(e => nodes[e.target].category === 'film').length;
    if (filmNeighborCount > totalFilms * 0.15) continue;

    const attrProb = probabilities[edge.target];
    for (const attrEdge of adjacency[edge.target]) {
      if (!watchedFilmIndices.has(attrEdge.target)) continue;
      const contribution = attrProb * edge.weight * attrEdge.weight;
      let entry = watchedData.get(attrEdge.target);
      if (!entry) { entry = { total: 0, attrs: new Map() }; watchedData.set(attrEdge.target, entry); }
      entry.total += contribution;
      // Track individual attribute node (not just category)
      entry.attrs.set(edge.target, (entry.attrs.get(edge.target) ?? 0) + contribution);
    }
  }

  return [...watchedData.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, topN)
    .map(([idx, data]) => {
      // Find the top contributing attribute node
      let topAttrIdx = -1;
      let topVal = 0;
      for (const [attrIdx, val] of data.attrs) {
        if (val > topVal) { topAttrIdx = attrIdx; topVal = val; }
      }
      const attrNode = topAttrIdx >= 0 ? nodes[topAttrIdx] : null;
      // Extract the value from the node ID: "genre:drama" → "drama", "director:12345" → keep ID for now
      const reason = attrNode?.category ?? '';
      const attrValue = attrNode ? attrNode.id.split(':').slice(1).join(':') : '';
      return {
        filmId: parseInt(nodes[idx].id.split(':')[1], 10),
        reason,
        attrValue,
      };
    });
}

// ── Seed weight computation ────────────────────────────────────────────────

/** Extra signals beyond numeric ratings. */
export interface UserSignals {
  /** Map of letterboxd_short_url → true for hearted films. */
  liked?: Record<string, boolean>;
  /** Map of letterboxd_short_url → ISO date string (e.g. "2025-03-15"). */
  watchedDates?: Record<string, string>;
}

/**
 * Compute a seed weight for a watched film using all available signals.
 *
 * Priority:
 *   1. Explicit rating  → quadratic scaling (existing behavior)
 *   2. Liked (hearted)  → strong positive (equivalent to ~4.5★)
 *   3. Watched-only     → recency-based: recent watches weigh more
 *
 * Returns 0 to exclude the film as a seed (e.g. rated < 3).
 */
function computeSeedWeight(
  url: string | undefined,
  ratings: Record<string, number>,
  signals: UserSignals,
  now: number,
): number {
  if (!url) return DEFAULT_WATCHED_WEIGHT;

  const rating = ratings[url];

  // ── 1. Has an explicit rating ──────────────────────────────────────
  if (rating != null) {
    if (rating < 3.0) return 0;                       // exclude disliked
    return Math.pow((rating - 1.5) / 2.5, 2);         // 5★→4.0  4★→1.56  3★→0.56
  }

  // ── 2. Liked but not rated ─────────────────────────────────────────
  const liked = signals.liked?.[url];
  if (liked) {
    // Equivalent to 5★ → 4.0, modulated by recency if available.
    // Liking is a deliberate positive signal — treat it as strongly as
    // a top rating so users who don't rate still get sharp recommendations.
    const recency = recencyFactor(url, signals.watchedDates, now);
    return 4.0 * recency;
  }

  // ── 3. Watched only (no rating, no like) ───────────────────────────
  // Still a positive signal (user chose to watch it), but weaker.
  // Recency matters more here: a film watched last week is a stronger
  // signal than one watched 5 years ago.
  const recency = recencyFactor(url, signals.watchedDates, now);
  return DEFAULT_WATCHED_WEIGHT * recency;
}

/** Base weight for watched-but-unrated-unliked films (≈ 3★ equivalent). */
const DEFAULT_WATCHED_WEIGHT = 0.5625;

/**
 * Recency multiplier: 1.0 for films watched today, decays to 0.3 over
 * ~2 years via exponential decay (half-life ≈ 6 months).
 * Returns 1.0 if no watched_date is available (no penalty for missing data).
 */
function recencyFactor(
  url: string,
  watchedDates: Record<string, string> | undefined,
  now: number,
): number {
  if (!watchedDates) return 1.0;
  const dateStr = watchedDates[url];
  if (!dateStr) return 1.0;

  const watchedMs = new Date(dateStr).getTime();
  if (isNaN(watchedMs)) return 1.0;

  const daysSince = (now - watchedMs) / (1000 * 60 * 60 * 24);
  // Exponential decay: half-life ~180 days, floor at 0.3
  return Math.max(0.3, Math.exp(-0.00385 * daysSince));
}


// ── Public API (same interface as recommender.ts) ───────────────────────────

/**
 * Compute recommendations using Personalized PageRank.
 *
 * @param watchedFilms - All films the user has watched (with metadata)
 * @param userRatings - Map of letterboxd_short_url → rating (0.5-5.0)
 * @param urlToFilmId - Map of film_id → letterboxd_short_url
 * @param screenedFilms - Currently-screening candidate films
 * @param signals - Optional extra signals (liked, watched dates) for users who don't rate
 * @returns Sorted array of match scores with breakdowns
 */
export function computeRecommendationsWithBreakdown(
  watchedFilms: FilmFeatures[],
  userRatings: Record<string, number>,
  urlToFilmId: Record<number, string>,
  screenedFilms: FilmFeatures[],
  signals: UserSignals = {},
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

  // Identify seed nodes from watched films
  const seedIndices: number[] = [];
  const seedWeights: number[] = [];
  const watchedIds = new Set<number>();
  const now = Date.now();

  for (const film of watchedFilms) {
    watchedIds.add(film.id);
    const url = urlToFilmId[film.id];
    const weight = computeSeedWeight(url, userRatings, signals, now);

    if (weight <= 0) continue;   // excluded (rated < 3)

    const filmNodeId = `film:${film.id}`;
    const idx = nodeIndex.get(filmNodeId);
    if (idx === undefined) continue;

    seedIndices.push(idx);
    seedWeights.push(weight);
  }

  // Collect all watched film node indices for similarity lookup
  const watchedFilmNodeIndices = new Set<number>();
  for (const film of watchedFilms) {
    const idx = nodeIndex.get(`film:${film.id}`);
    if (idx !== undefined) watchedFilmNodeIndices.add(idx);
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

  // Extract scores for all screened films (including already-watched)
  const rawScores: { filmId: number; raw: number; idx: number; watched: boolean }[] = [];
  for (const film of screenedFilms) {
    const filmNodeId = `film:${film.id}`;
    const idx = nodeIndex.get(filmNodeId);
    if (idx === undefined) {
      rawScores.push({ filmId: film.id, raw: 0, idx: -1, watched: watchedIds.has(film.id) });
      continue;
    }
    rawScores.push({ filmId: film.id, raw: probabilities[idx], idx, watched: watchedIds.has(film.id) });
  }

  // Min-max normalize using only unwatched films (watched films are seeds and
  // would dominate the scale, compressing everything else to near-zero)
  const unwatchedRaws = rawScores.filter(s => !s.watched).map(s => s.raw);
  const minRaw = unwatchedRaws.length > 0 ? Math.min(...unwatchedRaws) : 0;
  const maxRaw = unwatchedRaws.length > 0 ? Math.max(...unwatchedRaws) : 1;
  const range = maxRaw - minRaw;

  const results: (MatchScore & { breakdown: CompactBreakdown })[] = [];

  for (const { filmId, raw, idx } of rawScores) {
    // Normalize to 5-95 range
    const normalized = range > 0 ? (raw - minRaw) / range : 0.5;
    const score = Math.round(5 + normalized * 90);

    // Compute breakdown + similar watched films
    const breakdown = idx >= 0
      ? computeBreakdown(idx, adjacency, nodes, probabilities)
      : { coverage: 0, byCategory: {} };
    if (idx >= 0) {
      // Store as {filmId, reason} temporarily — API resolves filmId to title
      (breakdown as any)._similarRaw = findSimilarWatched(idx, adjacency, nodes, probabilities, watchedFilmNodeIndices, allFilms.length);
    }

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
  signals: UserSignals = {},
): MatchScore[] {
  return computeRecommendationsWithBreakdown(
    watchedFilms, userRatings, urlToFilmId, screenedFilms, signals,
  ).map(({ filmId, score }) => ({ filmId, score }));
}
