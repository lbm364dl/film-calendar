import { createServerSupabase } from '@/lib/supabase-server';
import { cookies } from 'next/headers';
import FilmCalendar from '@/components/FilmCalendar';
import type { LangKey } from '@/lib/translations';

// Force dynamic rendering — page depends on auth cookies
export const dynamic = 'force-dynamic';

/** Read user preferences from DB (if logged in) or fall back to cookie/defaults. */
async function getInitialProps() {
  const cookieStore = await cookies();

  // Default values
  let lang: LangKey = 'es';
  let watchlistUrls: string[] = [];
  let watchedUrls: string[] = [];
  let watchlistActive = false;
  let watchedActive = false;
  let userId: string | null = null;
  let userEmail: string | null = null;
  let initialScores: Record<number, number> = {};
  let initialBreakdowns: Record<number, any> = {};

  // 1. Language from cookie (works for both logged-in and anonymous users)
  const langCookie = cookieStore.get('fc_lang')?.value;
  if (langCookie === 'en' || langCookie === 'es') {
    lang = langCookie;
  }

  // 2. If authenticated, load full preferences from DB
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      userId = user.id;
      userEmail = user.email || null;

      // Run the four independent per-user queries in parallel.
      // Previously serial: ~8 round-trips back-to-back to eu-west-1 blocked TTFB.
      const [prefs, watched, watchlist, scores] = await Promise.all([
        (async () => {
          const { data } = await supabase
            .from('user_preferences')
            .select('lang, watchlist_active, watched_active')
            .eq('user_id', user.id)
            .single();
          return data;
        })(),
        (async () => {
          const urls: string[] = [];
          let offset = 0;
          while (true) {
            const { data } = await supabase.from('user_watched_films')
              .select('letterboxd_short_url').eq('user_id', user.id)
              .range(offset, offset + 999);
            if (!data || data.length === 0) break;
            urls.push(...data.map(r => r.letterboxd_short_url));
            if (data.length < 1000) break;
            offset += 1000;
          }
          return urls;
        })(),
        (async () => {
          const urls: string[] = [];
          let offset = 0;
          while (true) {
            const { data } = await supabase.from('user_watchlist_films')
              .select('letterboxd_short_url').eq('user_id', user.id)
              .range(offset, offset + 999);
            if (!data || data.length === 0) break;
            urls.push(...data.map(r => r.letterboxd_short_url));
            if (data.length < 1000) break;
            offset += 1000;
          }
          return urls;
        })(),
        (async () => {
          const s: Record<number, number> = {};
          const b: Record<number, any> = {};
          let offset = 0;
          while (true) {
            const { data } = await supabase.from('user_film_scores')
              .select('film_id, score, breakdown').eq('user_id', user.id)
              .range(offset, offset + 999);
            if (!data || data.length === 0) break;
            for (const row of data) {
              s[row.film_id] = row.score;
              if (row.breakdown) b[row.film_id] = row.breakdown;
            }
            if (data.length < 1000) break;
            offset += 1000;
          }
          return { scores: s, breakdowns: b };
        })(),
      ]);

      if (prefs) {
        lang = prefs.lang || lang;
        watchlistActive = prefs.watchlist_active ?? false;
        watchedActive = prefs.watched_active ?? false;
      }
      watchedUrls = watched;
      watchlistUrls = watchlist;
      initialScores = scores.scores;
      initialBreakdowns = scores.breakdowns;
    }
  } catch {
    // Not logged in or DB error — use defaults
  }

  return { lang, watchlistUrls, watchedUrls, watchlistActive, watchedActive, userId, userEmail, initialScores, initialBreakdowns };
}

type SortBy = 'rating' | 'viewers' | 'affinity';

function parseSort(raw: string | string[] | undefined): SortBy {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === 'viewers' || v === 'affinity' ? v : 'rating';
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [props, sp] = await Promise.all([getInitialProps(), searchParams]);
  const initialSortBy = parseSort(sp?.sort);

  return (
    <FilmCalendar
      initialLang={props.lang}
      initialWatchlistUrls={props.watchlistUrls}
      initialWatchedUrls={props.watchedUrls}
      initialWatchlistActive={props.watchlistActive}
      initialWatchedActive={props.watchedActive}
      initialUserId={props.userId}
      initialUserEmail={props.userEmail}
      initialScores={props.initialScores}
      initialBreakdowns={props.initialBreakdowns}
      initialSortBy={initialSortBy}
    />
  );
}
