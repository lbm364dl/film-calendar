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
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (prefs) {
        lang = prefs.lang || lang;
        watchlistUrls = prefs.watchlist_urls || [];
        watchedUrls = prefs.watched_urls || [];
        watchlistActive = prefs.watchlist_active ?? false;
        watchedActive = prefs.watched_active ?? false;
      }
    }
  } catch {
    // Not logged in or DB error — use defaults
  }

  return { lang, watchlistUrls, watchedUrls, watchlistActive, watchedActive, userId, userEmail };
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
    />
  );
}
