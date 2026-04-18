import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

/**
 * GET /api/enrich-batch — Check per-user enrichment progress.
 *
 * Counts how many of the user's watched films have been enriched
 * (film_id resolved) vs total, giving an accurate progress indicator.
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

    // Run the three counts in parallel — they're independent.
    // Exclude retry_count >= 5 from active queue: those are stuck (batch skips them).
    const [totalRes, processedRes, activeQueueRes] = await Promise.all([
        supabase.from('user_watched_films')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id),
        supabase.from('user_watched_films')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .not('film_id', 'is', null),
        supabase.from('film_enrichment_queue')
            .select('*', { count: 'exact', head: true })
            .eq('requested_by', user.id)
            .in('status', ['pending', 'processing'])
            .lt('retry_count', 5),
    ]);

    const total = totalRes.count;
    const processed = processedRes.count;
    const activeQueue = activeQueueRes.count;

    if (!total || total === 0) {
        return NextResponse.json({ total: 0, processed: 0 });
    }

    // Done when nothing is pending/processing (failed entries are skipped by user)
    const done = (activeQueue ?? 0) === 0;

    return NextResponse.json({
        total,
        processed: processed ?? 0,
        done,
    });
}
