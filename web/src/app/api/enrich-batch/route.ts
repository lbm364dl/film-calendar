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

    // Total watched films for this user
    const { count: total } = await supabase
        .from('user_watched_films')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

    if (!total || total === 0) {
        return NextResponse.json({ total: 0, processed: 0 });
    }

    // Count how many have film_id resolved (= enriched and in films table)
    const { count: processed } = await supabase
        .from('user_watched_films')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .not('film_id', 'is', null);

    // Check if any queue entries are still actively processing for this user.
    // Exclude retry_count >= 5: those are stuck (batch skips them) and will never complete.
    const { count: activeQueue } = await supabase
        .from('film_enrichment_queue')
        .select('*', { count: 'exact', head: true })
        .eq('requested_by', user.id)
        .in('status', ['pending', 'processing'])
        .lt('retry_count', 5);

    // Done when nothing is pending/processing (failed entries are skipped by user)
    const done = (activeQueue ?? 0) === 0;

    return NextResponse.json({
        total,
        processed: processed ?? 0,
        done,
    });
}
