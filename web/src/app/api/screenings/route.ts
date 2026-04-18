import { createClient } from '@supabase/supabase-js';
import { unstable_cache, revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';

const BATCH = 1000;
const CACHE_TAG = 'screenings-payload';

function createSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return createClient(url, key!, { auth: { persistSession: false } });
}

async function buildPayload(): Promise<string> {
  const supabase = createSupabase();

  // screenings.showtime is a naive timestamp; compare against today's date-only
  // boundary so today's later showtimes stay visible.
  const todayIso = new Date().toISOString().slice(0, 10);

  // Fetch upcoming screenings only (paginated)
  const screeningsByFilm = new Map<number, any[]>();
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('screenings')
      .select('*')
      .gte('showtime', todayIso)
      .range(offset, offset + BATCH - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const s of data) {
      const arr = screeningsByFilm.get(s.film_id);
      if (arr) arr.push(s);
      else screeningsByFilm.set(s.film_id, [s]);
    }
    if (data.length < BATCH) break;
    offset += BATCH;
  }

  const filmIds = Array.from(screeningsByFilm.keys());
  if (filmIds.length === 0) return JSON.stringify([]);

  // Fetch only films that have upcoming screenings (chunked to stay under PostgREST URL limits)
  const allFilms: any[] = [];
  const CHUNK = 500;
  for (let i = 0; i < filmIds.length; i += CHUNK) {
    const chunk = filmIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('films')
      .select('*')
      .in('id', chunk);
    if (error) throw error;
    if (data) allFilms.push(...data);
  }

  allFilms.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''));

  for (const film of allFilms) {
    film.screenings = screeningsByFilm.get(film.id) || [];
  }

  return JSON.stringify(allFilms);
}

const getCachedPayload = unstable_cache(
  async () => {
    const body = await buildPayload();
    const etag = `W/"${body.length}-${Date.now().toString(36)}"`;
    return { body, etag };
  },
  ['screenings-payload-v1'],
  { tags: [CACHE_TAG], revalidate: 3600 }
);

/**
 * GET /api/screenings — returns films with their upcoming screenings.
 * Cached by Next.js data cache (keyed by tag) and by the CDN via Cache-Control.
 */
export async function GET(request: Request) {
  try {
    const { body, etag } = await getCachedPayload();

    const ifNoneMatch = request.headers.get('if-none-match');
    if (ifNoneMatch === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: { ETag: etag },
      });
    }

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        ETag: etag,
      },
    });
  } catch (err) {
    console.error('Error building screenings payload:', err);
    return NextResponse.json({ error: 'Failed to load screenings' }, { status: 500 });
  }
}

/**
 * POST /api/screenings — invalidate the cache after merging new data.
 * Optionally protect with ?secret=<REVALIDATE_SECRET>.
 */
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  const expectedSecret = process.env.REVALIDATE_SECRET;

  if (expectedSecret && secret !== expectedSecret) {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
  }

  revalidateTag(CACHE_TAG);
  return NextResponse.json({ revalidated: true });
}
