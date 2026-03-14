import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { parseExportZip } from '@/lib/letterboxd';

/**
 * POST /api/upload-watched — Parse a Letterboxd export ZIP and save data.
 *
 * Accepts: multipart/form-data with a 'file' field (ZIP)
 * Returns: { total, alreadyKnown, toEnrich, watchedUrls, watchlistUrls }
 */
export async function POST(request: Request) {
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

    // Parse the uploaded ZIP
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || !(file instanceof Blob)) {
        return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    let parsed;
    try {
        const buffer = await file.arrayBuffer();
        parsed = await parseExportZip(buffer);
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to parse ZIP';
        return NextResponse.json({ error: msg }, { status: 400 });
    }

    const { watchedUrls, watchlistUrls, ratings, likedUrls, watchedDates } = parsed;
    const total = watchedUrls.length;

    if (total === 0) {
        return NextResponse.json({ error: 'No watched films found in ZIP' }, { status: 400 });
    }

    // Update activity flags in user_preferences
    const prefsUpdate: Record<string, unknown> = {
        user_id: user.id,
        watched_active: true,
    };
    if (watchlistUrls.length > 0) {
        prefsUpdate.watchlist_active = true;
    }
    await supabase.from('user_preferences').upsert(prefsUpdate, { onConflict: 'user_id' });

    // Replace watched/watchlist/scores for this user (full replace on re-upload)
    await supabase.from('user_watched_films').delete().eq('user_id', user.id);
    await supabase.from('user_watchlist_films').delete().eq('user_id', user.id);
    await supabase.from('user_film_scores').delete().eq('user_id', user.id);

    // Insert watched films
    const BATCH = 500;
    const watchedRows = watchedUrls.map(url => ({
        user_id: user.id,
        letterboxd_short_url: url,
        rating: ratings[url] ?? null,
        liked: likedUrls.has(url),
        watched_date: watchedDates[url] ?? null,
    }));

    for (let i = 0; i < watchedRows.length; i += BATCH) {
        const { error } = await supabase.from('user_watched_films').insert(watchedRows.slice(i, i + BATCH));
        if (error) console.error('Error inserting user_watched_films:', error);
    }

    // Insert watchlist films
    if (watchlistUrls.length > 0) {
        const wlRows = watchlistUrls.map(url => ({ user_id: user.id, letterboxd_short_url: url }));
        for (let i = 0; i < wlRows.length; i += BATCH) {
            const { error } = await supabase.from('user_watchlist_films').insert(wlRows.slice(i, i + BATCH));
            if (error) console.error('Error inserting user_watchlist_films:', error);
        }
    }

    // Check which watched URLs are already enriched (in films table)
    const QUERY_BATCH = 300;
    const knownUrls = new Set<string>();

    for (let i = 0; i < watchedUrls.length; i += QUERY_BATCH) {
        const batch = watchedUrls.slice(i, i + QUERY_BATCH);
        const { data: knownFilms } = await supabase
            .from('films')
            .select('letterboxd_short_url')
            .in('letterboxd_short_url', batch)
            .limit(batch.length);

        for (const f of knownFilms ?? []) {
            knownUrls.add(f.letterboxd_short_url);
        }
    }

    const unknownUrls = watchedUrls.filter(u => !knownUrls.has(u));

    // Add unknown films to enrichment queue in chunks (each chunk triggers a worker)
    if (unknownUrls.length > 0) {
        const queueRows = unknownUrls.map(u => ({
            letterboxd_short_url: u,
            status: 'pending',
            requested_by: user.id,
            locked_at: null,
            processed_at: null,
        }));

        const CHUNK_SIZE = 30;
        for (let i = 0; i < queueRows.length; i += CHUNK_SIZE) {
            await supabase
                .from('film_enrichment_queue')
                .upsert(queueRows.slice(i, i + CHUNK_SIZE), { onConflict: 'letterboxd_short_url' });
        }
    }

    const { count: toEnrich } = await supabase
        .from('film_enrichment_queue')
        .select('*', { count: 'exact', head: true })
        .in('status', ['pending', 'processing']);

    return NextResponse.json({
        total,
        alreadyKnown: knownUrls.size,
        toEnrich: toEnrich ?? unknownUrls.length,
        watchedUrls,
        watchlistUrls,
    });
}
