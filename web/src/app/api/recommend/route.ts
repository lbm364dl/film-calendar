import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { computeRecommendationsWithBreakdown, type FilmFeatures, type CompactBreakdown } from '@/lib/recommender-pagerank';

/** All film columns needed for recommendation scoring. */
const FILM_SELECT = 'id, genres, director, directors, cinematographers, composers, writers, top_cast, keywords, production_companies, country, primary_language, spoken_languages, year, runtime_minutes, letterboxd_rating, tmdb_rating, tmdb_votes, letterboxd_viewers, collection_id' as const;

/** Map a raw DB row to a FilmFeatures object, defaulting nulls to safe values. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toFilmFeatures(f: any): FilmFeatures {
    return {
        id: f.id,
        genres: f.genres ?? [],
        director: f.director ?? null,
        directors: f.directors ?? [],
        cinematographers: f.cinematographers ?? [],
        composers: f.composers ?? [],
        writers: f.writers ?? [],
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
    let allWatchedData: { letterboxd_short_url: string; film_id: number | null; rating: number | null; liked: boolean; watched_date: string | null; rewatch_count: number }[] = [];
    let offset = 0;

    // Paginate through all watched films
    while (true) {
        const { data, error: watchedError } = await supabase
            .from('user_watched_films')
            .select('letterboxd_short_url, film_id, rating, liked, watched_date, rewatch_count')
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
    const userRewatchCounts: Record<string, number> = {};
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
        if (row.rewatch_count > 0) {
            userRewatchCounts[row.letterboxd_short_url] = row.rewatch_count;
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
    // Use RPC to get distinct film_ids — avoids Supabase's 1000-row default limit
    const now = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' });
    const allScreenedIds: number[] = [];
    let screenOffset = 0;
    while (true) {
        const { data } = await supabase
            .from('screenings')
            .select('film_id')
            .gte('showtime', now)
            .range(screenOffset, screenOffset + BATCH - 1);
        if (!data || data.length === 0) break;
        for (const s of data) allScreenedIds.push(s.film_id);
        if (data.length < BATCH) break;
        screenOffset += BATCH;
    }
    const uniqueFilmIds = [...new Set(allScreenedIds)];

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
        { liked: userLiked, watchedDates: userWatchedDates, rewatchCounts: userRewatchCounts },
    );

    // Build attribute ID → name lookup from film data (for directors, cast, keywords, companies)
    const attrNames: Record<string, string> = {};
    for (const f of [...allWatchedFilms, ...screenedFilms]) {
        for (const d of f.directors ?? []) attrNames[`director:${d.id}`] = d.name;
        for (const dp of f.cinematographers ?? []) attrNames[`cinematographer:${dp.id}`] = dp.name;
        for (const comp of f.composers ?? []) attrNames[`composer:${comp.id}`] = comp.name;
        for (const w of f.writers ?? []) attrNames[`writer:${w.id}`] = w.name;
        for (const c of f.top_cast ?? []) attrNames[`cast:${c.id}`] = c.name;
        for (const k of f.keywords ?? []) attrNames[`keyword:${k.id}`] = k.name;
        for (const co of f.production_companies ?? []) attrNames[`company:${co.id}`] = co.name;
    }

    // Build film ID → title lookup for resolving similarTo IDs
    const allFilmTitles: Record<number, string> = {};
    for (const f of allWatchedFilms) allFilmTitles[f.id] = '';
    for (const f of screenedFilms) allFilmTitles[f.id] = '';
    // Fetch titles for all referenced films
    const titleIds = Object.keys(allFilmTitles).map(Number);
    for (let i = 0; i < titleIds.length; i += BATCH) {
        const batch = titleIds.slice(i, i + BATCH);
        const { data: films } = await supabase.from('films').select('id, title').in('id', batch);
        if (films) for (const f of films) allFilmTitles[f.id] = f.title;
    }

    // Convert to { filmId: score } and { filmId: breakdown } maps
    // Resolve similarTo IDs to titles
    const scores: Record<number, number> = {};
    const breakdowns: Record<number, CompactBreakdown> = {};
    for (const ms of matchScores) {
        scores[ms.filmId] = ms.score;
        const bd = { ...ms.breakdown };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = (bd as any)._similarRaw as { filmId: number; reason: string; attrValue: string }[] | undefined;
        if (raw) {
            bd.similarTo = raw
                .filter(r => allFilmTitles[r.filmId])
                .map(r => {
                    // Resolve attribute value to human name
                    const key = `${r.reason}:${r.attrValue}`;
                    const resolvedValue = attrNames[key] || r.attrValue;
                    return { title: allFilmTitles[r.filmId], reason: r.reason, value: resolvedValue };
                });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            delete (bd as any)._similarRaw;
        }
        breakdowns[ms.filmId] = bd;
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
