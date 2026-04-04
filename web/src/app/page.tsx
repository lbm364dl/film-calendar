import { createServerSupabase } from '@/lib/supabase-server';
import { cookies } from 'next/headers';
import FilmCalendar from '@/components/FilmCalendar';
import type { LangKey } from '@/lib/translations';

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

      const { data: prefs } = await supabase
        .from('user_preferences')
        .select('lang, watchlist_active, watched_active')
        .eq('user_id', user.id)
        .single();

      if (prefs) {
        lang = prefs.lang || lang;
        watchlistActive = prefs.watchlist_active ?? false;
        watchedActive = prefs.watched_active ?? false;
      }

      // Load watched URLs from new relational table (always load if data exists, regardless of active state)
      const { data: watchedData } = await supabase
        .from('user_watched_films')
        .select('letterboxd_short_url')
        .eq('user_id', user.id);
      if (watchedData) {
        watchedUrls = watchedData.map(r => r.letterboxd_short_url);
      }

      // Load watchlist URLs from new relational table (always load if data exists, regardless of active state)
      const { data: watchlistData } = await supabase
        .from('user_watchlist_films')
        .select('letterboxd_short_url')
        .eq('user_id', user.id);
      if (watchlistData) {
        watchlistUrls = watchlistData.map(r => r.letterboxd_short_url);
      }

      // Load precomputed match scores (always load if watched data exists, regardless of active state)
      if (watchedUrls.length > 0) {
        const { data: scores } = await supabase
          .from('user_film_scores')
          .select('film_id, score')
          .eq('user_id', user.id);
        if (scores && scores.length > 0) {
          for (const s of scores) {
            initialScores[s.film_id] = s.score;
          }
        }
      }
    }
  } catch {
    // Not logged in or DB error — use defaults
  }

  return { lang, watchlistUrls, watchedUrls, watchlistActive, watchedActive, userId, userEmail, initialScores };
}

export default async function Home() {
  const props = await getInitialProps();

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
    />
  );
}
