import { NextRequest, NextResponse } from 'next/server';
import { getKgSupabase } from '@/lib/supabase-kg';
import { createClient } from '@supabase/supabase-js';

interface KgFilm {
  id: number;
  tmdb_id: number;
  title: string;
  title_en: string | null;
  year: number | null;
  letterboxd_url: string | null;
}

export async function GET(req: NextRequest) {
  const tmdbIdParam = req.nextUrl.searchParams.get('tmdb_id');
  if (!tmdbIdParam) {
    return NextResponse.json({ error: 'tmdb_id required' }, { status: 400 });
  }
  const tmdbId = parseInt(tmdbIdParam, 10);
  if (isNaN(tmdbId)) {
    return NextResponse.json({ error: 'invalid tmdb_id' }, { status: 400 });
  }

  const kg = getKgSupabase();

  const { data: kgFilmRaw } = await kg
    .from('films')
    .select('id, tmdb_id, title, title_en, year, directors, letterboxd_url')
    .eq('tmdb_id', tmdbId)
    .maybeSingle();

  if (!kgFilmRaw) {
    return NextResponse.json({ error: 'Film not found in KG' }, { status: 404 });
  }

  const { data: connections } = await kg
    .from('film_connections')
    .select('film_a_id, film_b_id, connection_type, description, strength')
    .or(`film_a_id.eq.${kgFilmRaw.id},film_b_id.eq.${kgFilmRaw.id}`)
    .order('strength', { ascending: false });

  const connectedKgIds = new Set<number>();
  for (const c of connections ?? []) {
    const otherId = c.film_a_id === kgFilmRaw.id ? c.film_b_id : c.film_a_id;
    connectedKgIds.add(otherId);
  }

  const connectedKgIdsArr = [...connectedKgIds];

  let connectedKgFilms: KgFilm[] = [];
  if (connectedKgIdsArr.length > 0) {
    const { data } = await kg
      .from('films')
      .select('id, tmdb_id, title, title_en, year, letterboxd_url')
      .in('id', connectedKgIdsArr);
    connectedKgFilms = (data ?? []) as KgFilm[];
  }

  const kgIdToFilm = new Map<number, KgFilm>();
  for (const f of connectedKgFilms) {
    kgIdToFilm.set(f.id, f);
  }

  const connectedTmdbIds = connectedKgFilms
    .map(f => f.tmdb_id)
    .filter(Boolean);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const allTmdbIds = [tmdbId, ...connectedTmdbIds];
  const { data: mainFilms } = await supabase
    .from('films')
    .select('tmdb_id, poster_path')
    .in('tmdb_id', allTmdbIds);

  const posterMap = new Map<number, string | null>();
  for (const f of mainFilms ?? []) {
    posterMap.set(f.tmdb_id, f.poster_path ?? null);
  }

  const { data: upcomingScreenings } = await supabase
    .from('screenings')
    .select('film_id')
    .gte('showtime', new Date().toISOString());

  const screeningFilmIds = new Set<number>();
  for (const s of upcomingScreenings ?? []) {
    screeningFilmIds.add(s.film_id);
  }

  let screeningTmdbIds = new Set<number>();
  if (screeningFilmIds.size > 0) {
    const { data: screeningFilms } = await supabase
      .from('films')
      .select('id, tmdb_id')
      .in('id', [...screeningFilmIds]);
    for (const f of screeningFilms ?? []) {
      if (f.tmdb_id) screeningTmdbIds.add(f.tmdb_id);
    }
  }

  const bestByKgId = new Map<number, { connectionType: string; description: string; strength: number | null }>();
  for (const c of connections ?? []) {
    const otherId = c.film_a_id === kgFilmRaw.id ? c.film_b_id : c.film_a_id;
    const strength = c.strength != null ? parseFloat(String(c.strength)) : null;
    const existing = bestByKgId.get(otherId);
    if (!existing || (strength ?? 0) > (existing.strength ?? 0)) {
      bestByKgId.set(otherId, {
        connectionType: c.connection_type,
        description: c.description ?? '',
        strength,
      });
    }
  }

  const directorsRaw = kgFilmRaw.directors;
  let directorsStr = '';
  if (Array.isArray(directorsRaw)) {
    directorsStr = (directorsRaw as Array<{ name?: string } | string>)
      .map(d => typeof d === 'string' ? d : d?.name ?? '')
      .filter(Boolean)
      .join(', ');
  } else if (typeof directorsRaw === 'string') {
    directorsStr = directorsRaw;
  }

  const film = {
    tmdbId: kgFilmRaw.tmdb_id as number,
    title: ((kgFilmRaw.title_en || kgFilmRaw.title) as string),
    year: kgFilmRaw.year as number | null,
    posterPath: posterMap.get(tmdbId) ?? null,
    letterboxdUrl: kgFilmRaw.letterboxd_url as string | null,
    directors: directorsStr,
  };

  const resultConnections = [];
  for (const [kgId, best] of bestByKgId) {
    const kgConnFilm = kgIdToFilm.get(kgId);
    if (!kgConnFilm) continue;
    const connTmdbId = kgConnFilm.tmdb_id;
    resultConnections.push({
      film: {
        tmdbId: connTmdbId,
        title: (kgConnFilm.title_en || kgConnFilm.title),
        year: kgConnFilm.year,
        posterPath: posterMap.get(connTmdbId) ?? null,
        letterboxdUrl: kgConnFilm.letterboxd_url,
      },
      connectionType: best.connectionType,
      description: best.description,
      strength: best.strength,
      isScreening: screeningTmdbIds.has(connTmdbId),
    });
  }

  resultConnections.sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0));

  return NextResponse.json({ film, connections: resultConnections });
}
