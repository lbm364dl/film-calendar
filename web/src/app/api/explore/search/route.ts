import { NextRequest, NextResponse } from 'next/server';
import { getKgSupabase } from '@/lib/supabase-kg';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('q') ?? '';
  const q = decodeURIComponent(raw).trim();
  if (q.length < 2) {
    return NextResponse.json({ films: [] });
  }

  const kg = getKgSupabase();
  const { data: kgFilms, error } = await kg
    .from('films')
    .select('tmdb_id, title, title_en, year')
    .or(`title.ilike.%${q}%,title_en.ilike.%${q}%`)
    .not('tmdb_id', 'is', null)
    .limit(8);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!kgFilms || kgFilms.length === 0) {
    return NextResponse.json({ films: [] });
  }

  const tmdbIds = kgFilms.map(f => f.tmdb_id as number);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: mainFilms } = await supabase
    .from('films')
    .select('tmdb_id, poster_path')
    .in('tmdb_id', tmdbIds);

  const posterMap = new Map<number, string | null>();
  for (const f of mainFilms ?? []) {
    posterMap.set(f.tmdb_id, f.poster_path ?? null);
  }

  const films = kgFilms.map(f => ({
    tmdbId: f.tmdb_id as number,
    title: (f.title_en || f.title) as string,
    year: f.year as number | null,
    posterPath: posterMap.get(f.tmdb_id as number) ?? null,
  }));

  return NextResponse.json({ films });
}
