import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { computeRecommendationsWithBreakdown, type FilmFeatures, type CompactBreakdown } from '@/lib/recommender-pagerank';

/** All film columns needed for recommendation scoring. */
const FILM_SELECT = 'id, genres, director, directors, top_cast, keywords, production_companies, country, primary_language, spoken_languages, year, runtime_minutes, letterboxd_rating, tmdb_rating, tmdb_votes, letterboxd_viewers, collection_id' as const;

/** Map a raw DB row to a FilmFeatures object, defaulting nulls to safe values. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toFilmFeatures(f: any): FilmFeatures {
    return {
        id: f.id,
        genres: f.genres ?? [],
        director: f.director ?? null,
        directors: f.directors ?? [],
        top_cast: f.top_cast ?? [],
        keywords: f.keywords ?? [],
        production_companies: f.production_companies ?? [],
        country: f.country ?? [],
        primary_language: f.primary_language ?? [],
        spoken_languages: f.spoken_languages ?? [],
        year: f.year ?? null,
        runtime_minutes: f.runtime_minutes ?? null,
        letterboxd_rating: f.letterboxd_rating ?? null,
        tmdb_rating: f.tmdb_rating ?? null,
        tmdb_votes: f.tmdb_votes ?? null,
        letterboxd_viewers: f.letterboxd_viewers ?? null,
        collection_id: f.collection_id ?? null,
    };
}

/**
 * GET /api/recommend — Compute match scores for all currently-screened films.
 *
 * Reads watched films from user_watched_films table, computes scores,
 * persists them to user_film_scores, and returns them.
 *
 * Returns: { scores: { [filmId]: number } }
 */
export async function GET() {
    const cookieStore = await cookies();

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key =
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const supabase = createServerClient(url, key!, {
        cookies: {
            getAll() {
                return cookieStore.getAll();
            },
            setAll(cookiesToSet) {
                cookiesToSet.forEach(({ name, value, options }) =>
                    cookieStore.set(name, value, options)
                );
            },
        },
    });

    // Auth check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Load user's watched films from the new relational table
    const BATCH = 500;
    let allWatchedData: { letterboxd_short_url: string; film_id: number | null; rating: number | null; liked: boolean; watched_date: string | null }[] = [];
    let offset = 0;

    // Paginate through all watched films
    while (true) {
        const { data, error: watchedError } = await supabase
            .from('user_watched_films')
            .select('letterboxd_short_url, film_id, rating, liked, watched_date')
            .eq('user_id', user.id)
            .range(offset, offset + BATCH - 1);

        if (watchedError || !data) break;
        allWatchedData = allWatchedData.concat(data);
        if (data.length < BATCH) break;
        offset += BATCH;
    }

    if (allWatchedData.length === 0) {
        return NextResponse.json({ scores: {}, ready: false });
    }

    // Build signal maps and collect film_ids
    const userRatings: Record<string, number> = {};
    const userLiked: Record<string, boolean> = {};
    const userWatchedDates: Record<string, string> = {};
    const filmIds: number[] = [];
    const urlMap: Record<number, string> = {};

    for (const row of allWatchedData) {
        if (row.rating != null) {
            userRatings[row.letterboxd_short_url] = row.rating;
        }
        if (row.liked) {
            userLiked[row.letterboxd_short_url] = true;
        }
        if (row.watched_date) {
            userWatchedDates[row.letterboxd_short_url] = row.watched_date;
        }
        if (row.film_id != null) {
            filmIds.push(row.film_id);
            urlMap[row.film_id] = row.letterboxd_short_url;
        }
    }

    // Load watched film features by film_id (much more efficient than URL matching)
    const allWatchedFilms: FilmFeatures[] = [];
    for (let i = 0; i < filmIds.length; i += BATCH) {
        const batch = filmIds.slice(i, i + BATCH);
        const { data: films } = await supabase
            .from('films')
            .select(FILM_SELECT)
            .in('id', batch);

        if (films) {
            for (const f of films) {
                allWatchedFilms.push(toFilmFeatures(f));
            }
        }
    }

    // Load currently-screened films (films with future screenings)
    // DB stores naive Madrid timestamps, so compare with Madrid "now"
    const now = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' });
    const { data: screenedFilmIds } = await supabase
        .from('screenings')
        .select('film_id')
        .gte('showtime', now);

    const uniqueFilmIds = [...new Set((screenedFilmIds ?? []).map(s => s.film_id))];

    if (uniqueFilmIds.length === 0) {
        return NextResponse.json({ scores: {} });
    }

    // Load screened film features
    const screenedFilms: FilmFeatures[] = [];
    for (let i = 0; i < uniqueFilmIds.length; i += BATCH) {
        const batch = uniqueFilmIds.slice(i, i + BATCH);
        const { data: films } = await supabase
            .from('films')
            .select(FILM_SELECT)
            .in('id', batch);

        if (films) {
            for (const f of films) {
                screenedFilms.push(toFilmFeatures(f));
            }
        }
    }

    // Compute recommendations with per-film breakdowns
    const matchScores = computeRecommendationsWithBreakdown(
        allWatchedFilms, userRatings, urlMap, screenedFilms,
        { liked: userLiked, watchedDates: userWatchedDates },
    );

    // Convert to { filmId: score } and { filmId: breakdown } maps
    const scores: Record<number, number> = {};
    const breakdowns: Record<number, CompactBreakdown> = {};
    for (const ms of matchScores) {
        scores[ms.filmId] = ms.score;
        breakdowns[ms.filmId] = ms.breakdown;
    }

    // Persist scores to user_film_scores for instant loading on next visit
    const scoreRows = matchScores.map(ms => ({
        user_id: user.id,
        film_id: ms.filmId,
        score: ms.score,
        computed_at: new Date().toISOString(),
    }));

    if (scoreRows.length > 0) {
        // Clear old scores and insert new ones
        await supabase.from('user_film_scores').delete().eq('user_id', user.id);
        for (let i = 0; i < scoreRows.length; i += BATCH) {
            const batch = scoreRows.slice(i, i + BATCH);
            await supabase.from('user_film_scores').insert(batch);
        }
    }

    return NextResponse.json({ scores, breakdowns });
}
