import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { computeRecommendations, type FilmFeatures } from '@/lib/recommender';

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
 * Returns: { scores: { [filmId]: number }, ready: boolean, pending: number }
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

    // Load user preferences
    const { data: prefs } = await supabase
        .from('user_preferences')
        .select('watched_urls, watched_ratings, watched_active')
        .eq('user_id', user.id)
        .single();

    if (!prefs?.watched_active || !prefs.watched_urls?.length) {
        return NextResponse.json({ scores: {}, ready: false, pending: 0 });
    }

    const watchedUrls: string[] = prefs.watched_urls;
    const userRatings: Record<string, number> = prefs.watched_ratings ?? {};

    // Load watched films from DB (match on letterboxd_short_url)
    // Supabase .in() has a limit, so batch if needed
    const BATCH = 500;
    const allWatchedFilms: FilmFeatures[] = [];
    const urlMap: Record<number, string> = {};

    for (let i = 0; i < watchedUrls.length; i += BATCH) {
        const batch = watchedUrls.slice(i, i + BATCH);
        const { data: films } = await supabase
            .from('films')
            .select(`${FILM_SELECT}, letterboxd_short_url`)
            .in('letterboxd_short_url', batch);

        if (films) {
            for (const f of films) {
                allWatchedFilms.push(toFilmFeatures(f));
                urlMap[f.id] = f.letterboxd_short_url;
            }
        }
    }

    // Load currently-screened films (films with future screenings)
    const now = new Date().toISOString();
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

    // Compute recommendations
    const matchScores = computeRecommendations(allWatchedFilms, userRatings, urlMap, screenedFilms);

    // Convert to { filmId: score } map
    const scores: Record<number, number> = {};
    for (const ms of matchScores) {
        scores[ms.filmId] = ms.score;
    }

    return NextResponse.json({ scores });
}
