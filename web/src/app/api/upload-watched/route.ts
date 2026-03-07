import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { parseExportZip } from '@/lib/letterboxd';

/**
 * POST /api/upload-watched — Parse a Letterboxd export ZIP and save data.
 *
 * Accepts: multipart/form-data with a 'file' field (ZIP)
 * Returns: { total, alreadyKnown, toEnrich }
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

    const { watchedUrls, ratings } = parsed;
    const total = watchedUrls.length;

    if (total === 0) {
        return NextResponse.json({ error: 'No watched films found in ZIP' }, { status: 400 });
    }

    // Save to user_preferences
    const { error: prefsError } = await supabase
        .from('user_preferences')
        .upsert({
            user_id: user.id,
            watched_urls: watchedUrls,
            watched_ratings: ratings,
            watched_active: true,
        }, { onConflict: 'user_id' });

    if (prefsError) {
        return NextResponse.json({ error: prefsError.message }, { status: 500 });
    }

    // Check which of these URLs are already in our films table.
    // The watched CSV uses boxd.it short URLs — match against letterboxd_short_url.
    // Must batch to avoid Supabase's default 1000-row limit and URL-length limits.
    const QUERY_BATCH = 300;
    const knownUrls = new Set<string>();

    for (let i = 0; i < watchedUrls.length; i += QUERY_BATCH) {
        const batch = watchedUrls.slice(i, i + QUERY_BATCH);
        const { data: knownFilms, error: filmsError } = await supabase
            .from('films')
            .select('letterboxd_short_url')
            .in('letterboxd_short_url', batch)
            .limit(batch.length);

        if (filmsError) {
            console.error('Error querying films table:', filmsError);
            return NextResponse.json({ error: 'Failed to check existing films' }, { status: 500 });
        }

        for (const f of knownFilms ?? []) {
            knownUrls.add(f.letterboxd_short_url);
        }
    }

    const unknownUrls = watchedUrls.filter(u => !knownUrls.has(u));

    // Add unknown films to the enrichment queue.
    // Using upsert WITHOUT ignoreDuplicates so that existing entries (done/failed)
    // are reset to 'pending' for reprocessing on re-upload.
    if (unknownUrls.length > 0) {
        const queueRows = unknownUrls.map(u => ({
            letterboxd_short_url: u,
            status: 'pending',
            requested_by: user.id,
            locked_at: null,
            processed_at: null,
        }));

        // Insert in small chunks so the INSERT trigger fires once per chunk,
        // spawning a parallel Edge Function worker for each. Chunk size matches
        // the Edge Function's BATCH_SIZE so each worker has exactly one batch ready.
        const CHUNK_SIZE = 30;
        for (let i = 0; i < queueRows.length; i += CHUNK_SIZE) {
            const chunk = queueRows.slice(i, i + CHUNK_SIZE);
            await supabase
                .from('film_enrichment_queue')
                .upsert(chunk, { onConflict: 'letterboxd_short_url' });
        }
    }

    // Count actual pending items for the response
    const { count: toEnrich } = await supabase
        .from('film_enrichment_queue')
        .select('*', { count: 'exact', head: true })
        .in('status', ['pending', 'processing']);

    return NextResponse.json({
        total,
        alreadyKnown: knownUrls.size,
        toEnrich: toEnrich ?? unknownUrls.length,
    });
}
