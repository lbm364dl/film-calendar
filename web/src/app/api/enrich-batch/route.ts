import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

/**
 * GET /api/enrich-batch — Check enrichment queue status.
 *
 * Processing is handled by the Supabase Edge Function (process-enrichment),
 * triggered automatically by database INSERT trigger and pg_cron.
 * This endpoint only reports progress for the client UI.
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

    const { count: failed } = await supabase
        .from('film_enrichment_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'failed');

    return NextResponse.json({
        pending: pending ?? 0,
        failed: failed ?? 0,
    });
}
