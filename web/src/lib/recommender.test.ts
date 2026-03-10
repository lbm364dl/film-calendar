import { describe, it, expect } from 'vitest';
import {
    buildUserProfile,
    scoreFilm,
    computeRecommendations,
    _testing,
    type FilmFeatures,
} from './recommender';

const {
    filmToVector,
    cosineSimilarity,
    magnitude,
    getDecadeBucket,
    getRuntimeBucket,
    popularityBoost,
    WEIGHTS,
    MAX_CAST,
} = _testing;

// ── Test helpers ────────────────────────────────────────────────────────────────

/** Create a FilmFeatures with sensible defaults, overriding specific fields. */
function makeFilm(overrides: Partial<FilmFeatures> & { id: number }): FilmFeatures {
    return {
        genres: [],
        director: null,
        directors: [],
        top_cast: [],
        keywords: [],
        production_companies: [],
        country: [],
        primary_language: [],
        spoken_languages: [],
        year: null,
        runtime_minutes: null,
        letterboxd_rating: null,
        tmdb_rating: null,
        tmdb_votes: null,
        letterboxd_viewers: null,
        collection_id: null,
        ...overrides,
    };
}

// ── Bucket helpers ──────────────────────────────────────────────────────────────

describe('getDecadeBucket', () => {
    it('returns unknown for null year', () => {
        expect(getDecadeBucket(null)).toBe('decade:unknown');
    });

    it('returns pre-1960 for old films', () => {
        expect(getDecadeBucket(1927)).toBe('decade:pre-1960');
        expect(getDecadeBucket(1959)).toBe('decade:pre-1960');
    });

    it('returns correct decade buckets', () => {
        expect(getDecadeBucket(1960)).toBe('decade:1960s');
        expect(getDecadeBucket(1975)).toBe('decade:1970s');
        expect(getDecadeBucket(1999)).toBe('decade:1990s');
        expect(getDecadeBucket(2024)).toBe('decade:2020s');
    });
});

describe('getRuntimeBucket', () => {
    it('returns unknown for null', () => {
        expect(getRuntimeBucket(null)).toBe('runtime:unknown');
    });

    it('categorizes runtimes correctly', () => {
        expect(getRuntimeBucket(75)).toBe('runtime:short');
        expect(getRuntimeBucket(100)).toBe('runtime:medium');
        expect(getRuntimeBucket(135)).toBe('runtime:long');
        expect(getRuntimeBucket(180)).toBe('runtime:epic');
    });

    it('handles boundary values', () => {
        expect(getRuntimeBucket(89)).toBe('runtime:short');
        expect(getRuntimeBucket(90)).toBe('runtime:medium');
        expect(getRuntimeBucket(120)).toBe('runtime:medium');
        expect(getRuntimeBucket(121)).toBe('runtime:long');
        expect(getRuntimeBucket(150)).toBe('runtime:long');
        expect(getRuntimeBucket(151)).toBe('runtime:epic');
    });
});

// ── Feature extraction ──────────────────────────────────────────────────────────

describe('filmToVector', () => {
    it('creates empty-ish vector for film with no data', () => {
        const film = makeFilm({ id: 1 });
        const vec = filmToVector(film);
        // Should still have decade:unknown and runtime:unknown
        expect(vec.has('decade:unknown')).toBe(true);
        expect(vec.has('runtime:unknown')).toBe(true);
        expect(vec.get('decade:unknown')).toBe(WEIGHTS.decade);
        expect(vec.get('runtime:unknown')).toBe(WEIGHTS.runtime);
    });

    it('encodes genres as multi-hot with weight split', () => {
        const film = makeFilm({ id: 1, genres: ['Drama', 'Thriller'] });
        const vec = filmToVector(film);
        expect(vec.get('genre:drama')).toBeCloseTo(WEIGHTS.genre / 2);
        expect(vec.get('genre:thriller')).toBeCloseTo(WEIGHTS.genre / 2);
    });

    it('prefers directors jsonb over director string', () => {
        const film = makeFilm({
            id: 1,
            director: 'Denis Villeneuve',
            directors: [{ id: 137427, name: 'Denis Villeneuve' }],
        });
        const vec = filmToVector(film);
        expect(vec.has('director:137427')).toBe(true);
        expect(vec.has('director:denis villeneuve')).toBe(false);
    });

    it('falls back to director string when directors jsonb is empty', () => {
        const film = makeFilm({ id: 1, director: 'Denis Villeneuve', directors: [] });
        const vec = filmToVector(film);
        expect(vec.has('director:denis villeneuve')).toBe(true);
    });

    it('handles multiple directors', () => {
        const film = makeFilm({
            id: 1,
            directors: [
                { id: 1, name: 'Coen' },
                { id: 2, name: 'Coen' },
            ],
        });
        const vec = filmToVector(film);
        expect(vec.get('director:1')).toBeCloseTo(WEIGHTS.director / 2);
        expect(vec.get('director:2')).toBeCloseTo(WEIGHTS.director / 2);
    });

    it('encodes cast with billing-order weighting', () => {
        const film = makeFilm({
            id: 1,
            top_cast: [
                { id: 100, name: 'Lead Actor' },
                { id: 200, name: 'Supporting Actor' },
            ],
        });
        const vec = filmToVector(film);
        const leadWeight = vec.get('cast:100')!;
        const supportWeight = vec.get('cast:200')!;
        // Lead should get more weight than support
        expect(leadWeight).toBeGreaterThan(supportWeight);
        // Together they should sum to WEIGHTS.cast
        expect(leadWeight + supportWeight).toBeCloseTo(WEIGHTS.cast);
    });

    it('limits cast to MAX_CAST entries', () => {
        const cast = Array.from({ length: 20 }, (_, i) => ({ id: i, name: `Actor ${i}` }));
        const film = makeFilm({ id: 1, top_cast: cast });
        const vec = filmToVector(film);
        const castKeys = [...vec.keys()].filter(k => k.startsWith('cast:'));
        expect(castKeys.length).toBe(MAX_CAST);
    });

    it('encodes keywords evenly', () => {
        const film = makeFilm({
            id: 1,
            keywords: [
                { id: 10, name: 'dystopia' },
                { id: 20, name: 'rebellion' },
                { id: 30, name: 'survival' },
            ],
        });
        const vec = filmToVector(film);
        expect(vec.get('keyword:10')).toBeCloseTo(WEIGHTS.keyword / 3);
        expect(vec.get('keyword:20')).toBeCloseTo(WEIGHTS.keyword / 3);
        expect(vec.get('keyword:30')).toBeCloseTo(WEIGHTS.keyword / 3);
    });

    it('encodes production companies', () => {
        const film = makeFilm({
            id: 1,
            production_companies: [{ id: 41077, name: 'A24' }],
        });
        const vec = filmToVector(film);
        expect(vec.get('company:41077')).toBeCloseTo(WEIGHTS.company);
    });

    it('deduplicates primary and spoken languages', () => {
        const film = makeFilm({
            id: 1,
            primary_language: ['English'],
            spoken_languages: ['English', 'French'],
        });
        const vec = filmToVector(film);
        // 2 unique languages, not 3
        expect(vec.get('lang:english')).toBeCloseTo(WEIGHTS.language / 2);
        expect(vec.get('lang:french')).toBeCloseTo(WEIGHTS.language / 2);
    });

    it('combines letterboxd and tmdb ratings', () => {
        const film = makeFilm({
            id: 1,
            letterboxd_rating: 4.0, // 4/5 = 0.8
            tmdb_rating: 8.0,       // 8/10 = 0.8
        });
        const vec = filmToVector(film);
        // avg = 0.8, weighted = 0.8 * WEIGHTS.rating
        expect(vec.get('rating')).toBeCloseTo(0.8 * WEIGHTS.rating);
    });

    it('uses only available rating when one is missing', () => {
        const film = makeFilm({ id: 1, letterboxd_rating: 3.5 });
        const vec = filmToVector(film);
        expect(vec.get('rating')).toBeCloseTo((3.5 / 5) * WEIGHTS.rating);
    });

    it('encodes collection_id', () => {
        const film = makeFilm({ id: 1, collection_id: 119 });
        const vec = filmToVector(film);
        expect(vec.get('collection:119')).toBe(WEIGHTS.collection);
    });
});

// ── Vector math ─────────────────────────────────────────────────────────────────

describe('cosineSimilarity', () => {
    it('returns 1 for identical vectors', () => {
        const v = new Map([['a', 1], ['b', 2]]);
        expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
    });

    it('returns 0 for orthogonal vectors', () => {
        const a = new Map([['a', 1]]);
        const b = new Map([['b', 1]]);
        expect(cosineSimilarity(a, b)).toBeCloseTo(0.0);
    });

    it('returns 0 when either vector is empty', () => {
        const empty = new Map<string, number>();
        const v = new Map([['a', 1]]);
        expect(cosineSimilarity(empty, v)).toBe(0);
        expect(cosineSimilarity(v, empty)).toBe(0);
    });

    it('is symmetric', () => {
        const a = new Map([['a', 1], ['b', 2]]);
        const b = new Map([['a', 3], ['c', 4]]);
        expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a));
    });
});

// ── Popularity boost ────────────────────────────────────────────────────────────

describe('popularityBoost', () => {
    it('returns 1.0 for null viewers', () => {
        expect(popularityBoost(null)).toBe(1.0);
    });

    it('returns 1.0 for zero viewers', () => {
        expect(popularityBoost(0)).toBe(1.0);
    });

    it('returns a mild boost for moderate viewers', () => {
        const boost = popularityBoost(100_000);
        expect(boost).toBeGreaterThan(1.0);
        expect(boost).toBeLessThan(1.05);
    });

    it('caps the boost for very popular films', () => {
        const boost = popularityBoost(100_000_000);
        expect(boost).toBeLessThanOrEqual(1.05);
    });

    it('increases monotonically with viewer count', () => {
        const b1 = popularityBoost(100);
        const b2 = popularityBoost(10_000);
        const b3 = popularityBoost(1_000_000);
        expect(b2).toBeGreaterThan(b1);
        expect(b3).toBeGreaterThan(b2);
    });
});

// ── User profile ────────────────────────────────────────────────────────────────

describe('buildUserProfile', () => {
    it('returns empty profile for no watched films', () => {
        const profile = buildUserProfile([], {}, {});
        expect(profile.size).toBe(0);
    });

    it('builds profile from a single watched film', () => {
        const film = makeFilm({ id: 1, genres: ['Drama'], year: 2020 });
        const profile = buildUserProfile([film], {}, { 1: 'url1' });
        // With default rating 3.0, weight = 0.6
        // Genre dimension should be present
        expect(profile.has('genre:drama')).toBe(true);
        expect(profile.has('decade:2020s')).toBe(true);
    });

    it('weights films by user rating', () => {
        // Two films with different user ratings
        const drama = makeFilm({ id: 1, genres: ['Drama'] });
        const comedy = makeFilm({ id: 2, genres: ['Comedy'] });

        const ratings = { 'url1': 5.0, 'url2': 1.0 };
        const urlMap = { 1: 'url1', 2: 'url2' };

        const profile = buildUserProfile([drama, comedy], ratings, urlMap);

        // Drama should dominate because rated 5★
        const dramaWeight = profile.get('genre:drama') ?? 0;
        const comedyWeight = profile.get('genre:comedy') ?? 0;
        expect(dramaWeight).toBeGreaterThan(comedyWeight);
    });

    it('uses default 3.0 rating for unrated films', () => {
        const film = makeFilm({ id: 1, genres: ['Horror'] });
        const profile = buildUserProfile([film], {}, { 1: 'url1' });
        // 3.0/5.0 = 0.6 weight, single film so normalized by 0.6
        // genre:horror = WEIGHTS.genre * 0.6 / 0.6 = WEIGHTS.genre
        expect(profile.get('genre:horror')).toBeCloseTo(WEIGHTS.genre);
    });
});

// ── Scoring ─────────────────────────────────────────────────────────────────────

describe('scoreFilm', () => {
    it('returns 0 for empty profile', () => {
        const emptyProfile = new Map<string, number>();
        const film = makeFilm({ id: 1, genres: ['Drama'] });
        expect(scoreFilm(emptyProfile, film)).toBe(0);
    });

    it('gives high score to film matching user taste', () => {
        const watched = makeFilm({
            id: 1, genres: ['Drama'], country: ['France'],
            primary_language: ['French'], year: 2020,
        });
        const profile = buildUserProfile([watched], { 'url1': 5.0 }, { 1: 'url1' });

        const similar = makeFilm({
            id: 2, genres: ['Drama'], country: ['France'],
            primary_language: ['French'], year: 2022,
        });

        const score = scoreFilm(profile, similar);
        expect(score).toBeGreaterThan(70);
    });

    it('gives low score to very different film', () => {
        const watched = makeFilm({
            id: 1, genres: ['Horror'], country: ['Japan'],
            primary_language: ['Japanese'], year: 1998,
        });
        const profile = buildUserProfile([watched], { 'url1': 5.0 }, { 1: 'url1' });

        const different = makeFilm({
            id: 2, genres: ['Musical'], country: ['India'],
            primary_language: ['Hindi'], year: 2024,
        });

        const score = scoreFilm(profile, different);
        expect(score).toBeLessThan(30);
    });
});

// ── Full pipeline ───────────────────────────────────────────────────────────────

describe('computeRecommendations', () => {
    it('returns empty array when no screened films', () => {
        const watched = makeFilm({ id: 1, genres: ['Drama'] });
        const result = computeRecommendations([watched], {}, { 1: 'url1' }, []);
        expect(result).toEqual([]);
    });

    it('sorts results by score descending', () => {
        const watched = makeFilm({
            id: 1, genres: ['Sci-Fi'], year: 2010,
            directors: [{ id: 100, name: 'Director' }],
        });

        const match = makeFilm({
            id: 2, genres: ['Sci-Fi'], year: 2015,
            directors: [{ id: 100, name: 'Director' }],
        });
        const mismatch = makeFilm({
            id: 3, genres: ['Romance'], year: 1960,
            directors: [{ id: 999, name: 'Other' }],
        });

        const result = computeRecommendations(
            [watched], { 'url1': 5.0 }, { 1: 'url1' },
            [mismatch, match],
        );

        expect(result[0].filmId).toBe(2);
        expect(result[1].filmId).toBe(3);
        expect(result[0].score).toBeGreaterThan(result[1].score);
    });

    it('handles films with missing data gracefully', () => {
        const watched = makeFilm({ id: 1, genres: ['Drama'] });
        const sparse = makeFilm({ id: 2 }); // Completely empty except id

        // Should not throw
        const result = computeRecommendations(
            [watched], {}, { 1: 'url1' },
            [sparse],
        );
        expect(result.length).toBe(1);
        expect(result[0].score).toBeGreaterThanOrEqual(0);
        expect(result[0].score).toBeLessThanOrEqual(100);
    });
});

// ── Realistic scenario ─────────────────────────────────────────────────────────

describe('realistic recommendation scenario', () => {
    // Simulate a user who loves auteur sci-fi dramas
    const watchedFilms: FilmFeatures[] = [
        makeFilm({
            id: 1,
            genres: ['Science Fiction', 'Drama'],
            directors: [{ id: 137427, name: 'Denis Villeneuve' }],
            top_cast: [
                { id: 1, name: 'Timothée Chalamet' },
                { id: 2, name: 'Zendaya' },
            ],
            keywords: [{ id: 10, name: 'dystopia' }, { id: 11, name: 'desert' }],
            production_companies: [{ id: 923, name: 'Legendary' }],
            country: ['United States'],
            primary_language: ['English'],
            spoken_languages: ['English'],
            year: 2021,
            runtime_minutes: 155,
            letterboxd_rating: 4.0,
            tmdb_rating: 8.0,
            letterboxd_viewers: 1_500_000,
            collection_id: 726871,
        }),
        makeFilm({
            id: 2,
            genres: ['Science Fiction', 'Drama'],
            directors: [{ id: 525, name: 'Christopher Nolan' }],
            top_cast: [
                { id: 3, name: 'Matthew McConaughey' },
                { id: 4, name: 'Anne Hathaway' },
            ],
            keywords: [{ id: 12, name: 'space' }, { id: 13, name: 'time travel' }],
            production_companies: [{ id: 923, name: 'Legendary' }],
            country: ['United States', 'United Kingdom'],
            primary_language: ['English'],
            spoken_languages: ['English'],
            year: 2014,
            runtime_minutes: 169,
            letterboxd_rating: 4.2,
            tmdb_rating: 8.6,
            letterboxd_viewers: 3_000_000,
            collection_id: null,
        }),
    ];

    const urlMap = { 1: 'dune', 2: 'interstellar' };
    const ratings = { 'dune': 4.5, 'interstellar': 5.0 };

    const profile = buildUserProfile(watchedFilms, ratings, urlMap);

    it('ranks a similar sci-fi film highly', () => {
        const arrival = makeFilm({
            id: 10,
            genres: ['Science Fiction', 'Drama'],
            directors: [{ id: 137427, name: 'Denis Villeneuve' }],
            top_cast: [{ id: 5, name: 'Amy Adams' }],
            keywords: [{ id: 14, name: 'alien' }, { id: 10, name: 'dystopia' }],
            production_companies: [{ id: 50, name: 'FilmNation' }],
            country: ['United States'],
            primary_language: ['English'],
            spoken_languages: ['English'],
            year: 2016,
            runtime_minutes: 116,
            letterboxd_rating: 3.9,
            tmdb_rating: 7.6,
            letterboxd_viewers: 2_000_000,
            collection_id: null,
        });

        const score = scoreFilm(profile, arrival);
        expect(score).toBeGreaterThan(60);
    });

    it('ranks a romantic comedy much lower', () => {
        const romcom = makeFilm({
            id: 20,
            genres: ['Comedy', 'Romance'],
            directors: [{ id: 999, name: 'Rom-Com Director' }],
            top_cast: [{ id: 90, name: 'Actor X' }],
            keywords: [{ id: 50, name: 'wedding' }, { id: 51, name: 'love' }],
            production_companies: [{ id: 500, name: 'Working Title' }],
            country: ['United Kingdom'],
            primary_language: ['English'],
            spoken_languages: ['English'],
            year: 2023,
            runtime_minutes: 95,
            letterboxd_rating: 3.0,
            tmdb_rating: 6.5,
            letterboxd_viewers: 500_000,
            collection_id: null,
        });

        const score = scoreFilm(profile, romcom);
        expect(score).toBeLessThan(30);
    });

    it('gives a franchise sequel a boost from collection_id', () => {
        const sequel = makeFilm({
            id: 30,
            genres: ['Science Fiction', 'Drama'],
            directors: [{ id: 137427, name: 'Denis Villeneuve' }],
            top_cast: [
                { id: 1, name: 'Timothée Chalamet' },
                { id: 2, name: 'Zendaya' },
            ],
            keywords: [{ id: 10, name: 'dystopia' }, { id: 11, name: 'desert' }],
            production_companies: [{ id: 923, name: 'Legendary' }],
            country: ['United States'],
            primary_language: ['English'],
            spoken_languages: ['English'],
            year: 2024,
            runtime_minutes: 166,
            letterboxd_rating: 4.1,
            tmdb_rating: 8.3,
            letterboxd_viewers: 2_000_000,
            collection_id: 726871, // Same Dune collection
        });

        const noCollection = makeFilm({
            ...sequel,
            id: 31,
            collection_id: null,
        });

        const scoreWith = scoreFilm(profile, sequel);
        const scoreWithout = scoreFilm(profile, noCollection);
        expect(scoreWith).toBeGreaterThanOrEqual(scoreWithout);
    });

    it('gives cast overlap a noticeable signal', () => {
        const sameActors = makeFilm({
            id: 40,
            genres: ['Drama'],
            directors: [{ id: 888, name: 'Other Director' }],
            top_cast: [
                { id: 1, name: 'Timothée Chalamet' },
                { id: 3, name: 'Matthew McConaughey' },
            ],
            keywords: [{ id: 70, name: 'family' }],
            country: ['United States'],
            primary_language: ['English'],
            spoken_languages: ['English'],
            year: 2022,
            runtime_minutes: 130,
            letterboxd_rating: 3.5,
            tmdb_rating: 7.0,
            collection_id: null,
        });

        const noActorOverlap = makeFilm({
            ...sameActors,
            id: 41,
            top_cast: [{ id: 999, name: 'Unknown Actor' }],
        });

        const scoreWith = scoreFilm(profile, sameActors);
        const scoreWithout = scoreFilm(profile, noActorOverlap);
        expect(scoreWith).toBeGreaterThan(scoreWithout);
    });

    it('keyword overlap improves score', () => {
        const dystopiaFilm = makeFilm({
            id: 50,
            genres: ['Thriller'],
            keywords: [{ id: 10, name: 'dystopia' }, { id: 12, name: 'space' }],
            country: ['Canada'],
            primary_language: ['French'],
            year: 2019,
            runtime_minutes: 110,
        });

        const noKeywords = makeFilm({
            ...dystopiaFilm,
            id: 51,
            keywords: [{ id: 99, name: 'unrelated' }],
        });

        const scoreWith = scoreFilm(profile, dystopiaFilm);
        const scoreWithout = scoreFilm(profile, noKeywords);
        expect(scoreWith).toBeGreaterThan(scoreWithout);
    });

    it('production company overlap improves score', () => {
        const legendaryFilm = makeFilm({
            id: 60,
            genres: ['Action'],
            production_companies: [{ id: 923, name: 'Legendary' }],
            country: ['United States'],
            primary_language: ['English'],
            year: 2023,
            runtime_minutes: 140,
        });

        const otherStudio = makeFilm({
            ...legendaryFilm,
            id: 61,
            production_companies: [{ id: 1, name: 'Other Studio' }],
        });

        const scoreWith = scoreFilm(profile, legendaryFilm);
        const scoreWithout = scoreFilm(profile, otherStudio);
        expect(scoreWith).toBeGreaterThan(scoreWithout);
    });
});
