import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

/**
 * POST /api/preferences — save user preferences to DB.
 * Body: { lang?, watchlist_urls?, watched_urls?, watchlist_active?, watched_active? }
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

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await request.json();

  // Build update object from provided fields
  const update: Record<string, unknown> = {};
  if (body.lang === 'en' || body.lang === 'es') update.lang = body.lang;
  if (Array.isArray(body.watchlist_urls)) update.watchlist_urls = body.watchlist_urls;
  if (Array.isArray(body.watched_urls)) update.watched_urls = body.watched_urls;
  if (typeof body.watchlist_active === 'boolean') update.watchlist_active = body.watchlist_active;
  if (typeof body.watched_active === 'boolean') update.watched_active = body.watched_active;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields' }, { status: 400 });
  }

  const { error } = await supabase
    .from('user_preferences')
    .upsert({ user_id: user.id, ...update }, { onConflict: 'user_id' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
