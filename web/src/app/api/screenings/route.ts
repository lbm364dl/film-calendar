import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const BATCH = 1000;

/**
 * In-memory cache for the screenings payload.
 * Survives across requests within the same server process.
 * Invalidated by POST /api/screenings.
 */
let cachedPayload: string | null = null;
let cachedAt = 0;
let cachedEtag: string | null = null;
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

async function createSupabase() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return createServerClient(url, key!, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll() { /* read-only in route handler GET */ },
    },
  });
}

async function buildPayload(): Promise<string> {
  const supabase = await createSupabase();

  // Fetch all films (paginated)
  const allFilms: any[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('films')
      .select('*')
      .order('title')
      .range(offset, offset + BATCH - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allFilms.push(...data);
    if (data.length < BATCH) break;
    offset += BATCH;
  }

  // Fetch all screenings (paginated)
  const screeningsByFilm = new Map<number, any[]>();
  offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('screenings')
      .select('*')
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

  // Merge screenings into films
  for (const film of allFilms) {
    film.screenings = screeningsByFilm.get(film.id) || [];
  }

  return JSON.stringify(allFilms);
}

/**
 * GET /api/screenings — returns all films with nested screenings.
 * Cached in-memory; cache busted via POST.
 */
export async function GET(request: Request) {
  try {
    const now = Date.now();
    if (!cachedPayload || now - cachedAt > MAX_AGE_MS) {
      cachedPayload = await buildPayload();
      cachedAt = now;
      cachedEtag = `"${cachedAt}"`;
    }

    // If browser already has this version, skip sending the body
    const ifNoneMatch = request.headers.get('if-none-match');
    if (ifNoneMatch === cachedEtag) {
      return new NextResponse(null, {
        status: 304,
        headers: { 'ETag': cachedEtag! },
      });
    }

    return new NextResponse(cachedPayload, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'ETag': cachedEtag!,
      },
    });
  } catch (err) {
    console.error('Error building screenings payload:', err);
    return NextResponse.json({ error: 'Failed to load screenings' }, { status: 500 });
  }
}

/**
 * POST /api/screenings — invalidate the cache.
 * Call this after merging new data into Supabase.
 * Optionally protect with ?secret=<REVALIDATE_SECRET>.
 */
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  const expectedSecret = process.env.REVALIDATE_SECRET;

  if (expectedSecret && secret !== expectedSecret) {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
  }

  cachedPayload = null;
  cachedAt = 0;
  cachedEtag = null;

  return NextResponse.json({ revalidated: true });
}
