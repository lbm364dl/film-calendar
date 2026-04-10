/**
 * Personalized PageRank recommendation engine.
 *
 * Algorithm ported from film-recommendations research repo (220+ experiments,
 * val_ndcg ~0.91). Builds a knowledge graph from film metadata and runs
 * Random Walk with Restart seeded from the user's highly-rated films.
 *
 * Key features vs naive PageRank:
 *   - Director×genre interaction nodes (captures "Spielberg sci-fi" vs "Spielberg drama")
 *   - Genre-pair nodes (captures "horror+comedy" as distinct from each alone)
 *   - Proportional hub pruning (not binary) with keyword-specific threshold
 *   - Quality prior from Letterboxd ratings
 *   - Percentile-based score calibration
 *   - Human-readable recommendation reasons
 */

import type { FilmFeatures, MatchScore, CompactBreakdown } from './recommender';

export type { FilmFeatures, MatchScore, CompactBreakdown };

// ── Graph construction ──────────────────────────────────────────────────────

/**
 * Edge weights per category — tuned over 220+ experiments in the
 * film-recommendations research repo.
 */
const EDGE_WEIGHTS: Record<string, number> = {
  director: 3.0,
  cinematographer: 2.5,
  writer: 2.5,
  keyword: 2.5,
  cast: 2.0,
  composer: 2.0,
  genre: 2.0,
  collection: 1.5,
  company: 1.0,
  country: 1.0,
  decade: 0.5,
  language: 0.3,
};

/**
 * Maximum fraction of films an attribute node can connect to before being
 * downweighted. E.g., if "english" connects to 60% of films, it's not
 * discriminating — it just pulls everything toward the mean.
 * Uses proportional downweighting (not binary removal) for smoother behavior.
 */
const MAX_HUB_FRACTION = 0.40;

/** Maximum items per category to avoid noise. */
const MAX_CAST = 5;
const MAX_KEYWORDS = 10;
const MAX_COMPANIES = 3;

/** Keywords that are metadata tags, not taste signals — skip in graph. */
const BLOCKED_KEYWORDS = new Set([
  'aftercreditsstinger', 'duringcreditsstinger', 'post-credits scene',
  'black and white', 'woman director', 'anime', 'based on manga',
  'excited', 'amused', 'admiring', 'dramatic', 'inspirational',
  'somber', 'playful', 'suspenseful', 'tense', 'angry', 'defiant',
  'arrogant', 'sequel', 'remake', '3d',
  'murder', 'love', 'superhero', 'cartoon', 'musical',
]);

/** Block keywords matching decade patterns like "1970s", "1880s" */
function isBlockedKeyword(name: string): boolean {
  if (BLOCKED_KEYWORDS.has(name.toLowerCase())) return true;
  if (/^\d{4}s$/.test(name)) return true; // "1970s", "2000s", etc.
  return false;
}

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

    // Directors (strongest signal) + director×genre interactions
    const directors = film.directors ?? [];
    const dirIds: number[] = [];
    if (directors.length > 0) {
      for (const d of directors.slice(0, 2)) {
        if (d?.id) {
          const dIdx = getOrCreateNode(`director:${d.id}`, 'director');
          addEdge(filmIdx, dIdx, EDGE_WEIGHTS.director);
          dirIds.push(d.id);
        }
      }
    } else if (film.director) {
      for (const name of film.director.split(',').map(s => s.trim()).slice(0, 2)) {
        const dIdx = getOrCreateNode(`director:${name.toLowerCase()}`, 'director');
        addEdge(filmIdx, dIdx, EDGE_WEIGHTS.director);
      }
    }

    // Director×genre interaction nodes: captures "Spielberg sci-fi" vs "Spielberg drama"
    const genres = (film.genres ?? []).map(g => g.toLowerCase());
    for (const did of dirIds) {
      for (const g of genres.slice(0, 3)) {
        const dgIdx = getOrCreateNode(`dirgenre:${did}:${g}`, 'director');
        addEdge(filmIdx, dgIdx, EDGE_WEIGHTS.director * 0.3);
      }
    }

    // Cinematographers
    for (const dp of (film.cinematographers ?? []).slice(0, 2)) {
      if (dp?.id) {
        const dpIdx = getOrCreateNode(`cinematographer:${dp.id}`, 'cinematographer');
        addEdge(filmIdx, dpIdx, EDGE_WEIGHTS.cinematographer);
      }
    }

    // Composers
    for (const comp of (film.composers ?? []).slice(0, 2)) {
      if (comp?.id) {
        const compIdx = getOrCreateNode(`composer:${comp.id}`, 'composer');
        addEdge(filmIdx, compIdx, EDGE_WEIGHTS.composer);
      }
    }

    // Writers
    for (const w of (film.writers ?? []).slice(0, 3)) {
      if (w?.id) {
        const wIdx = getOrCreateNode(`writer:${w.id}`, 'writer');
        addEdge(filmIdx, wIdx, EDGE_WEIGHTS.writer);
      }
    }

    // Genres
    for (const g of genres) {
      const gIdx = getOrCreateNode(`genre:${g}`, 'genre');
      addEdge(filmIdx, gIdx, EDGE_WEIGHTS.genre);
    }

    // Genre-pair nodes: captures "horror+comedy" as distinct from each alone
    if (genres.length >= 2) {
      for (let gi = 0; gi < genres.length; gi++) {
        for (let gj = gi + 1; gj < Math.min(genres.length, 4); gj++) {
          const pair = [genres[gi], genres[gj]].sort().join('+');
          const pairIdx = getOrCreateNode(`genrepair:${pair}`, 'genre');
          addEdge(filmIdx, pairIdx, EDGE_WEIGHTS.genre * 0.5);
        }
      }
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

    // Keywords (skip blocked metadata tags)
    for (const kw of (film.keywords ?? []).slice(0, MAX_KEYWORDS)) {
      if (kw?.id && !isBlockedKeyword(kw.name ?? '')) {
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

  // ── TMDB recommendation edges (direct film-to-film, collaborative signal) ──
  // Build tmdb_id → node index lookup
  const tmdbIdToNodeIdx = new Map<number, number>();
  for (const film of films) {
    if (film.tmdb_id) {
      const idx = nodeIndex.get(`film:${film.id}`);
      if (idx !== undefined) tmdbIdToNodeIdx.set(film.tmdb_id, idx);
    }
  }
  const TMDB_REC_WEIGHT = 6.0;
  for (const film of films) {
    if (!film.tmdb_recommendations?.length) continue;
    const filmIdx = nodeIndex.get(`film:${film.id}`);
    if (filmIdx === undefined) continue;
    for (const recTmdbId of film.tmdb_recommendations) {
      const recIdx = tmdbIdToNodeIdx.get(recTmdbId);
      if (recIdx !== undefined && recIdx !== filmIdx) {
        // Direct film-to-film edge (only add once per pair)
        if (!adjacency[filmIdx].some(e => e.target === recIdx)) {
          addEdge(filmIdx, recIdx, TMDB_REC_WEIGHT);
        }
      }
    }
  }

  // ── Proportional hub pruning ────────────────────────────────────────────
  // Attribute nodes connected to too many films act as noise. Instead of
  // binary removal, scale edge weights proportionally — this preserves
  // some signal from common attributes while reducing their dominance.
  // Keywords use a tighter threshold (15%) since they're more numerous.
  const PRUNABLE_THRESHOLDS: Record<string, number> = {
    genre: MAX_HUB_FRACTION,
    country: MAX_HUB_FRACTION,
    language: MAX_HUB_FRACTION,
    decade: MAX_HUB_FRACTION,
    keyword: 0.15,
  };
  const filmCount = films.length;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const threshold = PRUNABLE_THRESHOLDS[node.category];
    if (threshold === undefined) continue;

    const maxConnections = Math.max(3, Math.floor(filmCount * threshold));
    const filmNeighbors = adjacency[i].filter(e => nodes[e.target].category === 'film').length;
    if (filmNeighbors <= maxConnections) continue;

    // Proportional downweight: scale edges by (maxConnections / filmNeighbors)
    const scale = maxConnections / filmNeighbors;
    adjacency[i] = adjacency[i].map(e => ({ target: e.target, weight: e.weight * scale }));
    for (const edge of adjacency[i]) {
      const backEdges = adjacency[edge.target];
      for (let j = 0; j < backEdges.length; j++) {
        if (backEdges[j].target === i) {
          backEdges[j] = { target: i, weight: backEdges[j].weight * scale };
        }
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

    // Only use specific/interesting attributes for explainers
    const INTERESTING = new Set(['director', 'cinematographer', 'composer', 'writer', 'cast', 'collection']);
    const filmNeighborCount = adjacency[edge.target].filter(e => nodes[e.target].category === 'film').length;
    // For interesting categories: only skip if truly a mega-hub (>25% of films)
    // For generic categories (genre, country, keyword, decade): skip entirely for explainers
    if (INTERESTING.has(attrNode.category)) {
      if (filmNeighborCount > totalFilms * 0.25) continue;
    } else {
      // Only allow very specific keywords (connected to <3% of films)
      if (attrNode.category === 'keyword' && filmNeighborCount <= totalFilms * 0.03) {
        // Keep niche keywords
      } else {
        continue;
      }
    }

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
  /** Map of letterboxd_short_url → number of rewatches from diary.csv. */
  rewatchCounts?: Record<string, number>;
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
  // Rewatch boost: rewatched films are stronger signals
  const rewatches = signals.rewatchCounts?.[url] ?? 0;
  const rewatchMultiplier = rewatches > 0 ? 1 + 0.3 * Math.log2(1 + rewatches) : 1;

  // ── 1. Has an explicit rating ──────────────────────────────────────
  if (rating != null) {
    if (rating < 3.0) return 0;                       // exclude disliked
    return Math.pow((rating - 1.5) / 2.5, 2) * rewatchMultiplier;
  }

  // ── 2. Liked but not rated ─────────────────────────────────────────
  const liked = signals.liked?.[url];
  if (liked) {
    // Equivalent to 5★ → 4.0, modulated by recency if available.
    // Liking is a deliberate positive signal — treat it as strongly as
    // a top rating so users who don't rate still get sharp recommendations.
    const recency = recencyFactor(url, signals.watchedDates, now);
    return 4.0 * recency * rewatchMultiplier;
  }

  // ── 3. Watched only (no rating, no like) ───────────────────────────
  const recency = recencyFactor(url, signals.watchedDates, now);
  return DEFAULT_WATCHED_WEIGHT * recency * rewatchMultiplier;
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


// ── Taste profile & reasons ─────────────────────────────────────────────────

/** Top contributing films for an attribute (kept for reference_film in reasons). */
type TopFilm = { title: string; filmId: number; weight: number };

/** Accumulated weight + display name + top contributing films for a taste attribute. */
type TasteEntry = { weight: number; name: string; topFilms: TopFilm[] };

interface TasteProfile {
  directors: Map<number, TasteEntry>;
  genres: Map<string, TasteEntry>;
  keywords: Map<number, TasteEntry>;
  cast: Map<number, TasteEntry>;
  cinematographers: Map<number, TasteEntry>;
}

/** Update a taste profile entry, tracking the top 2 contributing films. */
function updateTasteEntry<K>(
  map: Map<K, TasteEntry>,
  key: K,
  name: string,
  weight: number,
  filmTitle: string,
  filmId: number,
): void {
  const prev = map.get(key);
  const topFilms = [...(prev?.topFilms ?? []), { title: filmTitle, filmId, weight }]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 2);
  map.set(key, { weight: (prev?.weight ?? 0) + weight, name, topFilms });
}

/**
 * Build a weighted taste profile from the user's watched films.
 * Tracks the top 2 contributing films per attribute for personalized references.
 */
function buildTasteProfile(
  watchedFilms: FilmFeatures[],
  filmTitles: Record<number, string>,
  urlMap: Record<number, string>,
  ratings: Record<string, number>,
  signals: UserSignals,
  now: number,
): TasteProfile {
  const directors = new Map<number, TasteEntry>();
  const genres = new Map<string, TasteEntry>();
  const keywords = new Map<number, TasteEntry>();
  const cast = new Map<number, TasteEntry>();
  const cinematographers = new Map<number, TasteEntry>();

  for (const film of watchedFilms) {
    const url = urlMap[film.id];
    const w = computeSeedWeight(url, ratings, signals, now);
    if (w <= 0) continue;
    const title = filmTitles[film.id] ?? '?';

    for (const d of (film.directors ?? []).slice(0, 2)) {
      if (d?.id) updateTasteEntry(directors, d.id, d.name, w, title, film.id);
    }
    for (const g of film.genres ?? []) {
      updateTasteEntry(genres, g.toLowerCase(), g, w, title, film.id);
    }
    for (const kw of (film.keywords ?? []).slice(0, MAX_KEYWORDS)) {
      if (kw?.id) updateTasteEntry(keywords, kw.id, kw.name, w, title, film.id);
    }
    for (const m of (film.top_cast ?? []).slice(0, MAX_CAST)) {
      if (m?.id) updateTasteEntry(cast, m.id, m.name, w, title, film.id);
    }
    for (const dp of (film.cinematographers ?? []).slice(0, 2)) {
      if (dp?.id) updateTasteEntry(cinematographers, dp.id, dp.name, w, title, film.id);
    }
  }

  return { directors, genres, keywords, cast, cinematographers };
}

/** Pick the best reference film, skipping self-references. */
function pickRefFilm(topFilms: TopFilm[], excludeFilmId: number): string | null {
  for (const f of topFilms) {
    if (f.filmId !== excludeFilmId && f.title) return f.title;
  }
  return null;
}

/** Structured reason for a recommendation. */
type Reason = { type: string; value: string; referenceFilm: string | null };

/**
 * Generate structured reasons for recommending a film.
 * Each reason includes a type, value, and optionally a reference to a user's
 * watched film that triggered it (e.g., director: "Park Chan-wook" ← "Oldboy").
 * Returns up to 3 unique reasons, prioritized by taste profile weight.
 */
function generateReasons(film: FilmFeatures, filmId: number, profile: TasteProfile): Reason[] {
  const candidates: { type: string; weight: number; value: string; ref: string | null }[] = [];

  // Director match
  for (const d of (film.directors ?? []).slice(0, 2)) {
    if (d?.id) {
      const entry = profile.directors.get(d.id);
      if (entry && entry.weight >= 2.0) {
        candidates.push({ type: 'director', weight: entry.weight, value: entry.name, ref: pickRefFilm(entry.topFilms, filmId) });
      }
    }
  }

  // Cast match
  for (const m of (film.top_cast ?? []).slice(0, 3)) {
    if (m?.id) {
      const entry = profile.cast.get(m.id);
      if (entry && entry.weight >= 2.0) {
        candidates.push({ type: 'cast', weight: entry.weight, value: entry.name, ref: pickRefFilm(entry.topFilms, filmId) });
      }
    }
  }

  // Genre match (only strong signals)
  let topGenre: { entry: TasteEntry } | null = null;
  for (const g of film.genres ?? []) {
    const entry = profile.genres.get(g.toLowerCase());
    if (entry && entry.weight > (topGenre?.entry.weight ?? 0)) {
      topGenre = { entry };
    }
  }
  if (topGenre && topGenre.entry.weight >= 5.0) {
    candidates.push({ type: 'genre', weight: topGenre.entry.weight * 0.5, value: topGenre.entry.name, ref: pickRefFilm(topGenre.entry.topFilms, filmId) });
  }

  // Keyword / thematic match
  for (const kw of (film.keywords ?? []).slice(0, 5)) {
    if (kw?.id && !isBlockedKeyword(kw.name ?? '')) {
      const entry = profile.keywords.get(kw.id);
      if (entry && entry.weight >= 2.0) {
        candidates.push({ type: 'keyword', weight: entry.weight, value: entry.name, ref: pickRefFilm(entry.topFilms, filmId) });
      }
    }
  }

  // Cinematographer match
  for (const dp of (film.cinematographers ?? []).slice(0, 2)) {
    if (dp?.id) {
      const entry = profile.cinematographers.get(dp.id);
      if (entry && entry.weight >= 2.0) {
        candidates.push({ type: 'cinematographer', weight: entry.weight, value: entry.name, ref: pickRefFilm(entry.topFilms, filmId) });
      }
    }
  }

  // Sort by weight (most relevant first), genre last at equal weight
  candidates.sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    return (a.type === 'genre' ? 1 : 0) - (b.type === 'genre' ? 1 : 0);
  });

  // Deduplicate by type, take up to 3
  const seen = new Set<string>();
  const unique: Reason[] = [];
  for (const r of candidates) {
    if (!seen.has(r.type)) {
      unique.push({ type: r.type, value: r.value, referenceFilm: r.ref });
      seen.add(r.type);
    }
    if (unique.length >= 3) break;
  }

  // Fallback: if no strong reasons, use genre
  if (unique.length === 0 && (film.genres?.length ?? 0) > 0) {
    unique.push({ type: 'genre', value: film.genres[0], referenceFilm: null });
  }

  return unique;
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
 * @param filmTitles - Optional map of film_id → title for personalized reason references
 * @returns Sorted array of match scores with breakdowns
 */
export function computeRecommendationsWithBreakdown(
  watchedFilms: FilmFeatures[],
  userRatings: Record<string, number>,
  urlToFilmId: Record<number, string>,
  screenedFilms: FilmFeatures[],
  signals: UserSignals = {},
  filmTitles: Record<number, string> = {},
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

  // Adaptive damping: new users stay closer to seeds, cinephiles explore more
  const alpha = 0.10 + 0.15 * Math.exp(-watchedFilms.length / 200);

  // Run Personalized PageRank
  const probabilities = personalizedPageRank(adjacency, seedIndices, seedWeights, alpha);

  // Build taste profile for reasons generation
  const tasteProfile = buildTasteProfile(watchedFilms, filmTitles, urlToFilmId, userRatings, signals, now);

  // Extract raw scores for all screened films with quality prior
  const QUALITY_EPSILON = 0.25;
  const rawScores: { filmId: number; raw: number; idx: number; watched: boolean }[] = [];
  const prMax = Math.max(...Array.from(probabilities)) || 1.0;

  for (const film of screenedFilms) {
    const filmNodeId = `film:${film.id}`;
    const idx = nodeIndex.get(filmNodeId);
    const prScore = (idx !== undefined ? probabilities[idx] / prMax : 0);
    // Blend in Letterboxd quality prior (same as train.py non-XGB path)
    const lb = ((film.letterboxd_rating ?? 3.5) / 5.0);
    const raw = prScore + QUALITY_EPSILON * lb;
    rawScores.push({ filmId: film.id, raw, idx: idx ?? -1, watched: watchedIds.has(film.id) });
  }

  // Percentile-based calibration (from train.py): score = percentile rank among candidates
  // This preserves ranking exactly while making scores interpretable as
  // "better than X% of candidates"
  const unwatchedScores = rawScores.filter(s => !s.watched);
  const sortedValues = unwatchedScores.map(s => s.raw).sort((a, b) => a - b);
  const nCands = sortedValues.length;
  const scoreRange = nCands > 0 ? sortedValues[nCands - 1] - sortedValues[0] : 0;

  function percentileRank(value: number): number {
    if (nCands <= 1) return 0.5;
    if (scoreRange === 0) return 0.5; // All candidates have equal scores
    // Binary search for position
    let lo = 0, hi = sortedValues.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sortedValues[mid] < value) lo = mid + 1;
      else hi = mid;
    }
    return lo / (nCands - 1);
  }

  const results: (MatchScore & { breakdown: CompactBreakdown })[] = [];

  for (const { filmId, raw, idx, watched } of rawScores) {
    // Skip already-watched films from results
    if (watched) continue;

    // Calibrated score: sqrt compression so 80%+ feels earned, max 90
    const calibrated = percentileRank(raw);
    const score = Math.round(Math.sqrt(calibrated) * 90);

    // Compute breakdown + similar watched films
    const breakdown = idx >= 0
      ? computeBreakdown(idx, adjacency, nodes, probabilities)
      : { coverage: 0, byCategory: {} };
    if (idx >= 0) {
      // Store as {filmId, reason} temporarily — API resolves filmId to title
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (breakdown as any)._similarRaw = findSimilarWatched(idx, adjacency, nodes, probabilities, watchedFilmNodeIndices, allFilms.length);
    }

    // Generate structured reasons from taste profile
    const film = allFilmsMap.get(filmId);
    if (film) {
      breakdown.reasons = generateReasons(film, filmId, tasteProfile);
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
