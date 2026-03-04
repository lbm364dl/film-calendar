import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { fetchLetterboxdInfo, resolveShortUrl } from '@/lib/letterboxd';
import { fetchTmdbInfo } from '@/lib/tmdb-client';

const BATCH_SIZE = 15; // films per request (~4s each = ~60s total, within Vercel limit)
const TMDB_DELAY_MS = 300; // ~3.3 req/s, well within TMDB's 40/10s limit

/**
 * GET /api/enrich-batch — Check enrichment queue status.
 * Returns: { pending, processing, done, failed }
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

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { count: pending } = await supabase
        .from('film_enrichment_queue')
        .select('*', { count: 'exact', head: true })
        .in('status', ['pending', 'processing']);

    return NextResponse.json({ pending: pending ?? 0 });
}

/**
 * POST /api/enrich-batch — Process the next batch of pending films.
 *
 * Fetches Letterboxd info + TMDB metadata and inserts into films table.
 * Returns progress: { processed, remaining, done }
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

    // Get the next batch of pending items safely (FOR UPDATE SKIP LOCKED)
    const { data: pending, error: queueError } = await supabase
        .rpc('take_enrichment_batch', { batch_size: BATCH_SIZE });

    if (queueError) {
        return NextResponse.json({ error: queueError.message }, { status: 500 });
    }

    if (!pending || pending.length === 0) {
        // Check if we're truly done
        const { count } = await supabase
            .from('film_enrichment_queue')
            .select('*', { count: 'exact', head: true })
            .in('status', ['pending', 'processing']);

        return NextResponse.json({ processed: 0, remaining: count ?? 0, done: (count ?? 0) === 0 });
    }

    let processedCount = 0;

    for (const item of pending) {
        const shortUrl = item.letterboxd_short_url;

        try {
            // 1. Resolve short URL → full Letterboxd URL
            const fullUrl = await resolveShortUrl(shortUrl);
            if (!fullUrl) {
                console.error(`Could not resolve short URL: ${shortUrl}`);
                await supabase
                    .from('film_enrichment_queue')
                    .update({ status: 'failed', processed_at: new Date().toISOString() })
                    .eq('id', item.id);
                continue;
            }

            // 2. Fetch Letterboxd info (rating, tmdb_url)
            const lbInfo = await fetchLetterboxdInfo(fullUrl);

            // 3. Fetch TMDB info if we got a tmdb_url
            let tmdbInfo = null;
            if (lbInfo.tmdb_url) {
                tmdbInfo = await fetchTmdbInfo(lbInfo.tmdb_url);
                // Rate limiting
                await new Promise(r => setTimeout(r, TMDB_DELAY_MS));
            }

            // 4. Extract title/director/year from the Letterboxd URL slug as fallback
            // URL format: letterboxd.com/film/film-name/ or letterboxd.com/film/film-name-year/
            const slugMatch = fullUrl.match(/\/film\/([^/]+)/);
            const slug = slugMatch?.[1] ?? '';
            const fallbackTitle = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

            // 5. Insert into films table
            const filmData: Record<string, unknown> = {
                title: tmdbInfo?.title_es || tmdbInfo?.title_en || tmdbInfo?.title_original || fallbackTitle,
                letterboxd_url: fullUrl,
                letterboxd_short_url: shortUrl,
                letterboxd_rating: lbInfo.letterboxd_rating,
                tmdb_url: lbInfo.tmdb_url,
            };

            if (tmdbInfo) {
                filmData.genres = tmdbInfo.genres;
                filmData.country = tmdbInfo.country;
                filmData.primary_language = tmdbInfo.primary_language;
                filmData.spoken_languages = tmdbInfo.spoken_languages;
                filmData.runtime_minutes = tmdbInfo.runtime_minutes;
                filmData.year = tmdbInfo.year;
                filmData.director = tmdbInfo.director;
                filmData.title_original = tmdbInfo.title_original;
                filmData.title_en = tmdbInfo.title_en;
                filmData.title_es = tmdbInfo.title_es;
            }

            // Upsert: if the film already exists (by letterboxd_short_url), update it
            const { error: insertError } = await supabase
                .from('films')
                .upsert(filmData, { onConflict: 'letterboxd_short_url' });

            if (insertError) {
                console.error(`Failed to insert film ${shortUrl}:`, insertError);
                await supabase
                    .from('film_enrichment_queue')
                    .update({ status: 'failed', processed_at: new Date().toISOString() })
                    .eq('id', item.id);
                continue;
            }

            // 6. Mark as done
            await supabase
                .from('film_enrichment_queue')
                .update({ status: 'done', processed_at: new Date().toISOString() })
                .eq('id', item.id);

            processedCount++;
        } catch (error) {
            console.error(`Error enriching ${shortUrl}:`, error);
            await supabase
                .from('film_enrichment_queue')
                .update({ status: 'failed', processed_at: new Date().toISOString() })
                .eq('id', item.id);
        }
    }

    // Count remaining
    const { count: remaining } = await supabase
        .from('film_enrichment_queue')
        .select('*', { count: 'exact', head: true })
        .in('status', ['pending', 'processing']);

    return NextResponse.json({
        processed: processedCount,
        remaining: remaining ?? 0,
        done: (remaining ?? 0) === 0,
    });
}
