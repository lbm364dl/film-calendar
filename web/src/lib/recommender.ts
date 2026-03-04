/**
 * Content-based movie recommendation engine.
 *
 * Builds a user taste profile from watched films, then scores
 * currently-screened films by cosine similarity.
 */

// ── Types ───────────────────────────────────────────────────────────────────────

/** Minimal film data needed for feature extraction. */
export interface FilmFeatures {
    id: number;
    genres: string[];
    director: string | null;
    country: string[];
    primary_language: string[];
    year: number | null;
    runtime_minutes: number | null;
    letterboxd_rating: number | null;
}

/** Sparse vector: dimension key → value. */
type SparseVector = Map<string, number>;

/** Match score result for a screened film. */
export interface MatchScore {
    filmId: number;
    score: number; // 0–100
}

// ── Feature weights ─────────────────────────────────────────────────────────────

const WEIGHTS = {
    genre: 0.30,
    director: 0.25,
    country: 0.15,
    language: 0.10,
    decade: 0.10,
    runtime: 0.05,
    rating: 0.05,
} as const;

// ── Decade buckets ──────────────────────────────────────────────────────────────

function getDecadeBucket(year: number | null): string {
    if (year == null) return 'decade:unknown';
    if (year < 1960) return 'decade:pre-1960';
    const decade = Math.floor(year / 10) * 10;
    return `decade:${decade}s`;
}

// ── Runtime buckets ─────────────────────────────────────────────────────────────

function getRuntimeBucket(minutes: number | null): string {
    if (minutes == null) return 'runtime:unknown';
    if (minutes < 90) return 'runtime:short';
    if (minutes <= 120) return 'runtime:medium';
    if (minutes <= 150) return 'runtime:long';
    return 'runtime:epic';
}

// ── Feature extraction ──────────────────────────────────────────────────────────

/**
 * Convert a film into a weighted sparse feature vector.
 */
function filmToVector(film: FilmFeatures): SparseVector {
    const vec: SparseVector = new Map();

    // Genres (multi-hot, weight split across genres)
    if (film.genres.length > 0) {
        const perGenre = WEIGHTS.genre / film.genres.length;
        for (const g of film.genres) {
            vec.set(`genre:${g.toLowerCase()}`, perGenre);
        }
    }

    // Director
    if (film.director) {
        vec.set(`director:${film.director.toLowerCase()}`, WEIGHTS.director);
    }

    // Country (multi-hot)
    if (film.country.length > 0) {
        const perCountry = WEIGHTS.country / film.country.length;
        for (const c of film.country) {
            vec.set(`country:${c.toLowerCase()}`, perCountry);
        }
    }

    // Primary language
    if (film.primary_language.length > 0) {
        const perLang = WEIGHTS.language / film.primary_language.length;
        for (const l of film.primary_language) {
            vec.set(`lang:${l.toLowerCase()}`, perLang);
        }
    }

    // Decade
    vec.set(getDecadeBucket(film.year), WEIGHTS.decade);

    // Runtime bucket
    vec.set(getRuntimeBucket(film.runtime_minutes), WEIGHTS.runtime);

    // Letterboxd rating (normalized 0–1, then weighted)
    if (film.letterboxd_rating != null) {
        vec.set('rating', (film.letterboxd_rating / 5) * WEIGHTS.rating);
    }

    return vec;
}

// ── Vector math ─────────────────────────────────────────────────────────────────

function dotProduct(a: SparseVector, b: SparseVector): number {
    let sum = 0;
    // Iterate over the smaller vector for efficiency
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
    return Math.round(similarity * 100);
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

// ── Exports for testing ─────────────────────────────────────────────────────────

export const _testing = {
    filmToVector,
    cosineSimilarity,
    dotProduct,
    magnitude,
    getDecadeBucket,
    getRuntimeBucket,
};
