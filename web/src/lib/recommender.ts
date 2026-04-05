/**
 * Content-based movie recommendation engine.
 *
 * Builds a user taste profile from watched films, then scores
 * currently-screened films by cosine similarity.
 *
 * Uses all available film metadata: genres, directors, cast, keywords,
 * production companies, countries, languages, decade, runtime, ratings,
 * popularity (letterboxd_viewers), and franchise/collection membership.
 */

// ── Types ───────────────────────────────────────────────────────────────────────

/** A named entity from TMDB jsonb columns (directors, cast, keywords, companies). */
export interface NamedEntity {
    id: number;
    name: string;
}

/** Film data needed for feature extraction. All fields are optional-safe. */
export interface FilmFeatures {
    id: number;
    genres: string[];
    director: string | null;
    directors: NamedEntity[];
    cinematographers: NamedEntity[];
    composers: NamedEntity[];
    writers: NamedEntity[];
    top_cast: NamedEntity[];
    keywords: NamedEntity[];
    production_companies: NamedEntity[];
    country: string[];
    primary_language: string[];
    spoken_languages: string[];
    year: number | null;
    runtime_minutes: number | null;
    letterboxd_rating: number | null;
    tmdb_rating: number | null;
    tmdb_votes: number | null;
    letterboxd_viewers: number | null;
    collection_id: number | null;
    tmdb_id: number | null;
    tmdb_recommendations: number[];
}

/** Sparse vector: dimension key → value. */
type SparseVector = Map<string, number>;

/** Match score result for a screened film. */
export interface MatchScore {
    filmId: number;
    score: number; // 0–100
}

/**
 * Compact per-film breakdown returned by the recommend API.
 * byCategory values are relative contributions (fractions of the dot product, sum ≈ 1).
 */
export interface CompactBreakdown {
    coverage: number;                    // 0–1: fraction of feature budget with real data
    byCategory: Record<string, number>;  // category → relative contribution
    similarTo?: { title: string; titleEn?: string; reason: string; value: string; url?: string; valueUrl?: string }[];  // top similar watched films with connection
}

/** Detailed explanation of why a film got a particular score. */
export interface ScoreExplanation {
    score: number;
    similarity: number; // 0–1, before popularity boost and coverage penalty
    popularityBoost: number;
    coverage: number;   // 0–1: fraction of feature budget with real data
    featuresByCategory: Record<
        string, // category (genre, director, etc.)
        Array<{
            feature: string;
            contribution: number;
        }>
    >;
    topMatchingFeatures: Array<{
        feature: string;
        contribution: number;
        category: string;
    }>;
}

// ── Feature weights ─────────────────────────────────────────────────────────────

const WEIGHTS = {
    genre: 0.10,
    director: 0.14,
    cast: 0.14,
    keyword: 0.20,
    country: 0.08,
    language: 0.06,
    decade: 0.08,
    company: 0.06,
    collection: 0.04,
    runtime: 0.04,
    rating: 0.06,
} as const;

// ── Bucket helpers ──────────────────────────────────────────────────────────────

function getDecadeBucket(year: number | null): string {
    if (year == null) return 'decade:unknown';
    if (year < 1960) return 'decade:pre-1960';
    const decade = Math.floor(year / 10) * 10;
    return `decade:${decade}s`;
}

function getRuntimeBucket(minutes: number | null): string {
    if (minutes == null) return 'runtime:unknown';
    if (minutes < 90) return 'runtime:short';
    if (minutes <= 120) return 'runtime:medium';
    if (minutes <= 150) return 'runtime:long';
    return 'runtime:epic';
}

// ── Feature extraction ──────────────────────────────────────────────────────────

/** Max cast members to consider (top-billed are most relevant). */
const MAX_CAST = 5;
/** Max keywords to consider (avoid noise from overly specific tags). */
const MAX_KEYWORDS = 10;
/**
 * Minimum divisor for genre weight splitting.
 * Prevents single-genre films (e.g. "Drama" only) from concentrating all
 * genre weight into one dimension and dominating the similarity score.
 */
const MIN_GENRE_DIVISOR = 3;
/** Max production companies to consider. */
const MAX_COMPANIES = 3;

/**
 * Convert a film into a weighted sparse feature vector.
 *
 * Every feature group gets its allocated weight budget spread across
 * its dimensions (multi-hot encoding). Missing data is simply skipped —
 * cosine similarity naturally handles sparse vectors.
 */
function filmToVector(film: FilmFeatures): SparseVector {
    const vec: SparseVector = new Map();

    // ── Genres (multi-hot, with minimum divisor) ──────────────────────
    if (film.genres.length > 0) {
        const per = WEIGHTS.genre / Math.max(film.genres.length, MIN_GENRE_DIVISOR);
        for (const g of film.genres) {
            vec.set(`genre:${g.toLowerCase()}`, per);
        }
    }

    // ── Directors (prefer jsonb directors with IDs, fall back to string) ─
    const dirs = film.directors?.length ? film.directors : null;
    if (dirs && dirs.length > 0) {
        const per = WEIGHTS.director / dirs.length;
        for (const d of dirs) {
            vec.set(`director:${d.id}`, per);
        }
    } else if (film.director) {
        vec.set(`director:${film.director.toLowerCase()}`, WEIGHTS.director);
    }

    // ── Cast (top N, weighted by billing order) ─────────────────────────
    const cast = film.top_cast?.slice(0, MAX_CAST) ?? [];
    if (cast.length > 0) {
        // Billing-order weighting: first-billed gets more weight.
        // Weights: [N, N-1, ..., 1] normalized to sum = 1
        const totalOrder = (cast.length * (cast.length + 1)) / 2;
        for (let i = 0; i < cast.length; i++) {
            const orderWeight = (cast.length - i) / totalOrder;
            vec.set(`cast:${cast[i].id}`, WEIGHTS.cast * orderWeight);
        }
    }

    // ── Keywords (thematic tags) ────────────────────────────────────────
    const kws = film.keywords?.slice(0, MAX_KEYWORDS) ?? [];
    if (kws.length > 0) {
        const per = WEIGHTS.keyword / kws.length;
        for (const k of kws) {
            vec.set(`keyword:${k.id}`, per);
        }
    }

    // ── Production Companies (top N) ────────────────────────────────────
    const companies = film.production_companies?.slice(0, MAX_COMPANIES) ?? [];
    if (companies.length > 0) {
        const per = WEIGHTS.company / companies.length;
        for (const c of companies) {
            vec.set(`company:${c.id}`, per);
        }
    }

    // ── Country (multi-hot) ─────────────────────────────────────────────
    if (film.country.length > 0) {
        const per = WEIGHTS.country / film.country.length;
        for (const c of film.country) {
            vec.set(`country:${c.toLowerCase()}`, per);
        }
    }

    // ── Languages (combine primary + spoken, deduplicated) ──────────────
    const allLangs = new Set([
        ...(film.primary_language ?? []),
        ...(film.spoken_languages ?? []),
    ].map(l => l.toLowerCase()));
    if (allLangs.size > 0) {
        const per = WEIGHTS.language / allLangs.size;
        for (const l of allLangs) {
            vec.set(`lang:${l}`, per);
        }
    }

    // ── Decade ──────────────────────────────────────────────────────────
    vec.set(getDecadeBucket(film.year), WEIGHTS.decade);

    // ── Runtime bucket ──────────────────────────────────────────────────
    vec.set(getRuntimeBucket(film.runtime_minutes), WEIGHTS.runtime);

    // ── Rating (combine Letterboxd + TMDB, normalized 0-1) ──────────────
    const ratings: number[] = [];
    if (film.letterboxd_rating != null) ratings.push(film.letterboxd_rating / 5);
    if (film.tmdb_rating != null) ratings.push(film.tmdb_rating / 10);
    if (ratings.length > 0) {
        const avgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
        vec.set('rating', avgRating * WEIGHTS.rating);
    }

    // ── Collection / franchise ───────────────────────────────────────────
    if (film.collection_id != null) {
        vec.set(`collection:${film.collection_id}`, WEIGHTS.collection);
    }

    return vec;
}

// ── Vector math ─────────────────────────────────────────────────────────────────

function dotProduct(a: SparseVector, b: SparseVector): number {
    let sum = 0;
    const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
    for (const [key, valA] of smaller) {
        const valB = larger.get(key);
        if (valB !== undefined) {
            sum += valA * valB;
        }
    }
    return sum;
}

function magnitude(v: SparseVector): number {
    let sum = 0;
    for (const val of v.values()) {
        sum += val * val;
    }
    return Math.sqrt(sum);
}

function cosineSimilarity(a: SparseVector, b: SparseVector): number {
    const magA = magnitude(a);
    const magB = magnitude(b);
    if (magA === 0 || magB === 0) return 0;
    return dotProduct(a, b) / (magA * magB);
}

/** Add vector b into accumulator a (mutates a), scaled by weight. */
function addScaled(acc: SparseVector, vec: SparseVector, weight: number): void {
    for (const [key, val] of vec) {
        acc.set(key, (acc.get(key) ?? 0) + val * weight);
    }
}

// ── Feature coverage ────────────────────────────────────────────────────────────

/**
 * Fraction of the total feature weight budget that has real data (non-unknown).
 * Used to penalize films with very sparse metadata — e.g. a film with only a
 * genre tag would otherwise score artificially high via cosine similarity.
 * Range: 0–1.  A fully-described film scores close to 1.
 */
function featureCoverage(filmVec: SparseVector): number {
    let realWeight = 0;
    for (const [k, v] of filmVec) {
        if (!k.endsWith(':unknown')) realWeight += v;
    }
    // collection is too rare to penalize missing films for lacking it
    const MAX_EXPECTED = 1.0 - WEIGHTS.collection;
    return Math.min(realWeight / MAX_EXPECTED, 1.0);
}

// ── Popularity boost ────────────────────────────────────────────────────────────

/**
 * Compute a small popularity multiplier from letterboxd_viewers.
 *
 * Uses log-scaling to avoid blockbusters dominating. The boost is mild:
 * - 0 viewers or null → 1.0 (no penalty)
 * - ~1,000 viewers → ~1.01
 * - ~100,000 viewers → ~1.03
 * - ~1,000,000 viewers → ~1.04
 *
 * This acts as a gentle tiebreaker, not a dominant signal.
 */
function popularityBoost(viewers: number | null): number {
    if (viewers == null || viewers <= 0) return 1.0;
    // log10(1000) = 3, log10(1M) = 6 → maps to 0.01–0.04 boost
    const logViewers = Math.log10(viewers);
    // Clamp between 0 and ~0.05 boost
    const boost = Math.min(logViewers / 150, 0.05);
    return 1.0 + boost;
}

// ── User profile ────────────────────────────────────────────────────────────────

/**
 * Build a user taste profile from their watched films.
 *
 * Each watched film's vector is weighted by the user's own rating
 * (if available). Films rated 5★ contribute 2× more than films rated 2.5★.
 *
 * @param watchedFilms  Films the user has watched (with all features populated)
 * @param userRatings   Map of letterboxd_short_url → user rating (0.5–5.0)
 * @param urlMap        Map of film.id → letterboxd_short_url (for rating lookup)
 */
export function buildUserProfile(
    watchedFilms: FilmFeatures[],
    userRatings: Record<string, number>,
    urlMap: Record<number, string>,
): SparseVector {
    const profile: SparseVector = new Map();

    if (watchedFilms.length === 0) return profile;

    let totalWeight = 0;

    for (const film of watchedFilms) {
        const vec = filmToVector(film);
        const shortUrl = urlMap[film.id];
        // User rating as weight (default 3.0 if unrated — neutral)
        const userRating = shortUrl ? (userRatings[shortUrl] ?? 3.0) : 3.0;
        const weight = userRating / 5.0; // normalize to 0–1

        addScaled(profile, vec, weight);
        totalWeight += weight;
    }

    // Normalize: divide by total weight to get average
    if (totalWeight > 0) {
        for (const [key, val] of profile) {
            profile.set(key, val / totalWeight);
        }
    }

    return profile;
}

// ── Scoring ─────────────────────────────────────────────────────────────────────

/**
 * Score a single film against the user profile.
 * @returns 0–100 match percentage.
 */
export function scoreFilm(userProfile: SparseVector, film: FilmFeatures): number {
    if (userProfile.size === 0) return 0;
    const filmVec = filmToVector(film);
    const similarity = cosineSimilarity(userProfile, filmVec);
    const coverage = featureCoverage(filmVec);
    // Penalize films with sparse metadata: sqrt keeps the penalty soft for
    // moderately-complete films while substantially dampening drama-only entries.
    const coveragePenalty = Math.sqrt(coverage);
    const boosted = similarity * popularityBoost(film.letterboxd_viewers) * coveragePenalty;
    return Math.min(100, Math.round(boosted * 100));
}

/**
 * Score a film and return a detailed breakdown of contributing features.
 * Useful for understanding why a film got a particular score.
 */
export function scoreFilmWithBreakdown(
    userProfile: SparseVector,
    film: FilmFeatures,
): ScoreExplanation {
    if (userProfile.size === 0) {
        return {
            score: 0,
            similarity: 0,
            popularityBoost: 1.0,
            coverage: 0,
            featuresByCategory: {},
            topMatchingFeatures: [],
        };
    }

    const filmVec = filmToVector(film);

    // Compute similarity, boost, and coverage penalty (mirrors scoreFilm)
    const similarity = cosineSimilarity(userProfile, filmVec);
    const boost = popularityBoost(film.letterboxd_viewers);
    const coverage = featureCoverage(filmVec);
    const coveragePenalty = Math.sqrt(coverage);
    const boosted = similarity * boost * coveragePenalty;
    const finalScore = Math.min(100, Math.round(boosted * 100));

    // Decompose by feature category
    const featuresByCategory: Record<string, Array<{ feature: string; contribution: number }>> = {};
    const matchingFeatures: Array<{ feature: string; contribution: number; category: string }> = [];

    for (const [featureKey, filmValue] of filmVec) {
        const profileValue = userProfile.get(featureKey) ?? 0;
        if (profileValue > 0) {
            const contribution = profileValue * filmValue;

            // Extract category (e.g., "genre:drama" → "genre")
            const category = featureKey.split(':')[0];
            if (!featuresByCategory[category]) {
                featuresByCategory[category] = [];
            }

            featuresByCategory[category].push({
                feature: featureKey,
                contribution,
            });

            matchingFeatures.push({
                feature: featureKey,
                contribution,
                category,
            });
        }
    }

    // Sort features within each category
    for (const category in featuresByCategory) {
        featuresByCategory[category].sort((a, b) => b.contribution - a.contribution);
    }

    // Sort overall matching features
    matchingFeatures.sort((a, b) => b.contribution - a.contribution);

    return {
        score: finalScore,
        similarity: Math.round(similarity * 10000) / 10000, // Round to 4 decimals
        popularityBoost: Math.round(boost * 10000) / 10000,
        coverage: Math.round(coverage * 100) / 100,
        featuresByCategory,
        topMatchingFeatures: matchingFeatures.slice(0, 10), // Top 10
    };
}

/**
 * Compute match scores for all screened films.
 *
 * @param watchedFilms   All watched films with features populated
 * @param userRatings    User's own ratings: short_url → rating
 * @param urlMap         film.id → letterboxd_short_url for watched films
 * @param screenedFilms  Currently screened films to score
 * @returns Array of { filmId, score } sorted by score descending
 */
export function computeRecommendations(
    watchedFilms: FilmFeatures[],
    userRatings: Record<string, number>,
    urlMap: Record<number, string>,
    screenedFilms: FilmFeatures[],
): MatchScore[] {
    const profile = buildUserProfile(watchedFilms, userRatings, urlMap);

    const scores: MatchScore[] = screenedFilms.map(film => ({
        filmId: film.id,
        score: scoreFilm(profile, film),
    }));

    scores.sort((a, b) => b.score - a.score);
    return scores;
}

/**
 * Like computeRecommendations but also returns a compact per-film breakdown
 * showing which feature categories matched and the film's data coverage.
 */
export function computeRecommendationsWithBreakdown(
    watchedFilms: FilmFeatures[],
    userRatings: Record<string, number>,
    urlMap: Record<number, string>,
    screenedFilms: FilmFeatures[],
): Array<MatchScore & { breakdown: CompactBreakdown }> {
    const profile = buildUserProfile(watchedFilms, userRatings, urlMap);

    const results = screenedFilms.map(film => {
        const explanation = scoreFilmWithBreakdown(profile, film);

        // Build relative category contributions (fraction of total dot product)
        const totalDot = Object.values(explanation.featuresByCategory)
            .flatMap(feats => feats.map(f => f.contribution))
            .reduce((a, b) => a + b, 0);

        const byCategory: Record<string, number> = {};
        for (const [cat, feats] of Object.entries(explanation.featuresByCategory)) {
            const catTotal = feats.reduce((a, f) => a + f.contribution, 0);
            byCategory[cat] = totalDot > 0 ? Math.round((catTotal / totalDot) * 100) / 100 : 0;
        }

        return {
            filmId: film.id,
            score: explanation.score,
            breakdown: {
                coverage: explanation.coverage,
                byCategory,
            },
        };
    });

    results.sort((a, b) => b.score - a.score);
    return results;
}

// ── Exports for testing ─────────────────────────────────────────────────────────

export const _testing = {
    filmToVector,
    cosineSimilarity,
    dotProduct,
    magnitude,
    getDecadeBucket,
    getRuntimeBucket,
    popularityBoost,
    featureCoverage,
    addScaled,
    WEIGHTS,
    MAX_CAST,
    MAX_KEYWORDS,
    MAX_COMPANIES,
    MIN_GENRE_DIVISOR,
    scoreFilmWithBreakdown,
};
