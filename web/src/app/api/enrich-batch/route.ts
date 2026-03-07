import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

/**
 * GET /api/enrich-batch — Check per-user enrichment progress.
 *
 * Returns how many of the user's watched_urls are already in the films table
 * vs how many total they have, giving an accurate per-user progress indicator.
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

    // Get user's watched URLs
    const { data: prefs } = await supabase
        .from('user_preferences')
        .select('watched_urls')
        .eq('user_id', user.id)
        .single();

    const watchedUrls: string[] = prefs?.watched_urls ?? [];
    const total = watchedUrls.length;

    if (total === 0) {
        return NextResponse.json({ total: 0, processed: 0 });
    }

    // Count how many of the user's watched URLs exist in the films table
    const QUERY_BATCH = 300;
    let processed = 0;

    for (let i = 0; i < watchedUrls.length; i += QUERY_BATCH) {
        const batch = watchedUrls.slice(i, i + QUERY_BATCH);
        const { count } = await supabase
            .from('films')
            .select('*', { count: 'exact', head: true })
            .in('letterboxd_short_url', batch);

        processed += count ?? 0;
    }

    return NextResponse.json({
        total,
        processed,
    });
}
