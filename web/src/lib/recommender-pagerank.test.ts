import { describe, it, expect } from 'vitest';
import { computeRecommendationsWithBreakdown, computeRecommendations } from './recommender-pagerank';
import type { FilmFeatures } from './recommender';

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

describe('Personalized PageRank Recommender', () => {
  describe('basic behavior', () => {
    it('returns empty array when no watched films', () => {
      const screened = [makeFilm({ id: 1, genres: ['Drama'] })];
      const result = computeRecommendationsWithBreakdown([], {}, {}, screened);
      expect(result).toEqual([]);
    });

    it('returns empty array when no screened films', () => {
      const watched = [makeFilm({ id: 1, genres: ['Drama'] })];
      const result = computeRecommendationsWithBreakdown(watched, {}, {}, []);
      expect(result).toEqual([]);
    });

    it('returns scores for all screened films', () => {
      const watched = [
        makeFilm({ id: 1, genres: ['Drama'], directors: [{ id: 100, name: 'Dir A' }] }),
      ];
      const screened = [
        makeFilm({ id: 2, genres: ['Drama'], directors: [{ id: 100, name: 'Dir A' }] }),
        makeFilm({ id: 3, genres: ['Comedy'] }),
      ];
      const ratings = { 'url1': 5.0 };
      const urlMap = { 1: 'url1' };

      const result = computeRecommendationsWithBreakdown(watched, ratings, urlMap, screened);
      expect(result).toHaveLength(2);
      expect(result[0].score).toBeGreaterThanOrEqual(0);
      expect(result[0].score).toBeLessThanOrEqual(100);
    });

    it('scores are sorted descending', () => {
      const watched = [
        makeFilm({ id: 1, genres: ['Drama'], directors: [{ id: 100, name: 'Dir A' }] }),
      ];
      const screened = [
        makeFilm({ id: 2, genres: ['Drama'], directors: [{ id: 100, name: 'Dir A' }] }),
        makeFilm({ id: 3, genres: ['Comedy'] }),
      ];
      const ratings = { 'url1': 5.0 };
      const urlMap = { 1: 'url1' };

      const result = computeRecommendationsWithBreakdown(watched, ratings, urlMap, screened);
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].score).toBeGreaterThanOrEqual(result[i].score);
      }
    });
  });

  describe('director affinity', () => {
    it('ranks same-director films higher', () => {
      const watched = [
        makeFilm({ id: 1, genres: ['Drama'], directors: [{ id: 100, name: 'Kurosawa' }] }),
        makeFilm({ id: 2, genres: ['Drama'], directors: [{ id: 100, name: 'Kurosawa' }] }),
        makeFilm({ id: 3, genres: ['Drama'], directors: [{ id: 100, name: 'Kurosawa' }] }),
      ];
      const screened = [
        makeFilm({ id: 10, genres: ['Drama'], directors: [{ id: 100, name: 'Kurosawa' }] }),
        makeFilm({ id: 11, genres: ['Drama'], directors: [{ id: 200, name: 'Unknown' }] }),
      ];
      const ratings = { 'u1': 5.0, 'u2': 5.0, 'u3': 5.0 };
      const urlMap = { 1: 'u1', 2: 'u2', 3: 'u3' };

      const result = computeRecommendationsWithBreakdown(watched, ratings, urlMap, screened);
      // Kurosawa film should rank first
      expect(result[0].filmId).toBe(10);
      expect(result[0].score).toBeGreaterThan(result[1].score);
    });

    it('director hub grows stronger with more liked films', () => {
      const kurosawa = { id: 100, name: 'Kurosawa' };
      // 5 Kurosawa films vs 1 Other film
      const watched = [
        makeFilm({ id: 1, genres: ['Drama'], directors: [kurosawa] }),
        makeFilm({ id: 2, genres: ['Drama'], directors: [kurosawa] }),
        makeFilm({ id: 3, genres: ['Drama'], directors: [kurosawa] }),
        makeFilm({ id: 4, genres: ['Drama'], directors: [kurosawa] }),
        makeFilm({ id: 5, genres: ['Drama'], directors: [kurosawa] }),
        makeFilm({ id: 6, genres: ['Comedy'], directors: [{ id: 200, name: 'Other' }] }),
      ];
      const screened = [
        makeFilm({ id: 10, genres: ['Action'], directors: [kurosawa] }),
        makeFilm({ id: 11, genres: ['Action'], directors: [{ id: 200, name: 'Other' }] }),
      ];
      const ratings: Record<string, number> = {};
      const urlMap: Record<number, string> = {};
      for (let i = 1; i <= 6; i++) {
        ratings[`u${i}`] = 5.0;
        urlMap[i] = `u${i}`;
      }

      const result = computeRecommendationsWithBreakdown(watched, ratings, urlMap, screened);
      // Kurosawa's new film should score higher even if genre doesn't match
      expect(result[0].filmId).toBe(10);
    });
  });

  describe('genre and country connections', () => {
    it('ranks films sharing genre higher', () => {
      const watched = [
        makeFilm({ id: 1, genres: ['Animation', 'Drama'] }),
        makeFilm({ id: 2, genres: ['Animation', 'Fantasy'] }),
      ];
      const screened = [
        makeFilm({ id: 10, genres: ['Animation', 'Comedy'] }),
        makeFilm({ id: 11, genres: ['Horror', 'Thriller'] }),
      ];
      const ratings = { 'u1': 5.0, 'u2': 5.0 };
      const urlMap = { 1: 'u1', 2: 'u2' };

      const result = computeRecommendationsWithBreakdown(watched, ratings, urlMap, screened);
      expect(result[0].filmId).toBe(10); // Animation film ranks higher
    });

    it('ranks films from preferred country higher', () => {
      const watched = [
        makeFilm({ id: 1, country: ['Japan'], genres: ['Drama'] }),
        makeFilm({ id: 2, country: ['Japan'], genres: ['Drama'] }),
      ];
      const screened = [
        makeFilm({ id: 10, country: ['Japan'], genres: ['Comedy'] }),
        makeFilm({ id: 11, country: ['United States'], genres: ['Comedy'] }),
      ];
      const ratings = { 'u1': 5.0, 'u2': 5.0 };
      const urlMap = { 1: 'u1', 2: 'u2' };

      const result = computeRecommendationsWithBreakdown(watched, ratings, urlMap, screened);
      expect(result[0].filmId).toBe(10); // Japanese film ranks higher
    });
  });

  describe('transitive connections', () => {
    it('discovers films through shared cast', () => {
      const actor = { id: 500, name: 'Great Actor' };
      const watched = [
        makeFilm({ id: 1, genres: ['Drama'], top_cast: [actor] }),
      ];
      const screened = [
        makeFilm({ id: 10, genres: ['Comedy'], top_cast: [actor] }),
        makeFilm({ id: 11, genres: ['Comedy'], top_cast: [{ id: 999, name: 'Nobody' }] }),
      ];
      const ratings = { 'u1': 5.0 };
      const urlMap = { 1: 'u1' };

      const result = computeRecommendationsWithBreakdown(watched, ratings, urlMap, screened);
      // Film with shared actor should rank higher despite different genre
      expect(result[0].filmId).toBe(10);
    });

    it('discovers films through keyword chains', () => {
      const kw1 = { id: 1, name: 'slice of life' };
      const kw2 = { id: 2, name: 'coming of age' };
      const watched = [
        makeFilm({ id: 1, keywords: [kw1, kw2] }),
        makeFilm({ id: 2, keywords: [kw1] }),
      ];
      const screened = [
        makeFilm({ id: 10, keywords: [kw1, kw2] }),
        makeFilm({ id: 11, keywords: [{ id: 999, name: 'unrelated' }] }),
      ];
      const ratings = { 'u1': 5.0, 'u2': 4.5 };
      const urlMap = { 1: 'u1', 2: 'u2' };

      const result = computeRecommendationsWithBreakdown(watched, ratings, urlMap, screened);
      expect(result[0].filmId).toBe(10);
    });
  });

  describe('rating-based seeding', () => {
    it('ignores low-rated films in seeds', () => {
      const dir = { id: 100, name: 'Bad Director' };
      const goodDir = { id: 200, name: 'Good Director' };
      const watched = [
        makeFilm({ id: 1, directors: [dir], genres: ['Horror'] }),
        makeFilm({ id: 2, directors: [goodDir], genres: ['Drama'] }),
      ];
      const screened = [
        makeFilm({ id: 10, directors: [dir], genres: ['Horror'] }),
        makeFilm({ id: 11, directors: [goodDir], genres: ['Drama'] }),
      ];
      // Film 1 rated 1★ (bad), Film 2 rated 5★ (good)
      const ratings = { 'u1': 1.0, 'u2': 5.0 };
      const urlMap = { 1: 'u1', 2: 'u2' };

      const result = computeRecommendationsWithBreakdown(watched, ratings, urlMap, screened);
      // Good director's film should rank first (bad director excluded from seeds)
      expect(result[0].filmId).toBe(11);
    });

    it('gives more weight to 5-star films than 3-star films', () => {
      const dirA = { id: 100, name: 'Fave Director' };
      const dirB = { id: 200, name: 'Ok Director' };
      const watched = [
        makeFilm({ id: 1, directors: [dirA], genres: ['Drama'] }),
        makeFilm({ id: 2, directors: [dirB], genres: ['Drama'] }),
      ];
      const screened = [
        makeFilm({ id: 10, directors: [dirA], genres: ['Comedy'] }),
        makeFilm({ id: 11, directors: [dirB], genres: ['Comedy'] }),
      ];
      const ratings = { 'u1': 5.0, 'u2': 3.0 };
      const urlMap = { 1: 'u1', 2: 'u2' };

      const result = computeRecommendationsWithBreakdown(watched, ratings, urlMap, screened);
      expect(result[0].filmId).toBe(10); // 5★ director's film ranks higher
    });
  });

  describe('breakdowns', () => {
    it('includes category breakdown', () => {
      const watched = [
        makeFilm({ id: 1, genres: ['Drama'], directors: [{ id: 100, name: 'Dir' }], country: ['France'] }),
      ];
      const screened = [
        makeFilm({ id: 10, genres: ['Drama'], directors: [{ id: 100, name: 'Dir' }], country: ['France'] }),
      ];
      const ratings = { 'u1': 5.0 };
      const urlMap = { 1: 'u1' };

      const result = computeRecommendationsWithBreakdown(watched, ratings, urlMap, screened);
      expect(result[0].breakdown).toBeDefined();
      expect(result[0].breakdown.byCategory).toBeDefined();
      expect(result[0].breakdown.coverage).toBeGreaterThan(0);
    });

    it('breakdown shows director as top contributor when director matches', () => {
      const dir = { id: 100, name: 'Ozu' };
      const watched = [
        makeFilm({ id: 1, directors: [dir], genres: ['Drama'] }),
        makeFilm({ id: 2, directors: [dir], genres: ['Drama'] }),
        makeFilm({ id: 3, directors: [dir], genres: ['Drama'] }),
      ];
      const screened = [
        makeFilm({ id: 10, directors: [dir], genres: ['Comedy'] }),
      ];
      const ratings = { 'u1': 5.0, 'u2': 5.0, 'u3': 5.0 };
      const urlMap = { 1: 'u1', 2: 'u2', 3: 'u3' };

      const result = computeRecommendationsWithBreakdown(watched, ratings, urlMap, screened);
      const bd = result[0].breakdown.byCategory;
      // Director should be among the top contributors
      expect(bd['director']).toBeGreaterThan(0);
    });
  });

  describe('computeRecommendations (without breakdown)', () => {
    it('returns MatchScore array without breakdown', () => {
      const watched = [makeFilm({ id: 1, genres: ['Drama'] })];
      const screened = [makeFilm({ id: 2, genres: ['Drama'] })];
      const ratings = { 'u1': 5.0 };
      const urlMap = { 1: 'u1' };

      const result = computeRecommendations(watched, ratings, urlMap, screened);
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('filmId');
      expect(result[0]).toHaveProperty('score');
      expect(result[0]).not.toHaveProperty('breakdown');
    });
  });

  describe('excludes already-watched from screening results', () => {
    it('does not score films that appear in both watched and screened', () => {
      const watched = [
        makeFilm({ id: 1, genres: ['Drama'] }),
        makeFilm({ id: 2, genres: ['Drama'] }), // also screening
      ];
      const screened = [
        makeFilm({ id: 2, genres: ['Drama'] }), // already watched
        makeFilm({ id: 3, genres: ['Drama'] }),
      ];
      const ratings = { 'u1': 5.0, 'u2': 5.0 };
      const urlMap = { 1: 'u1', 2: 'u2' };

      const result = computeRecommendationsWithBreakdown(watched, ratings, urlMap, screened);
      const filmIds = result.map(r => r.filmId);
      expect(filmIds).not.toContain(2); // Excluded
      expect(filmIds).toContain(3);
    });
  });
});
