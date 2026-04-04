import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let _browser: SupabaseClient | null = null;

/**
 * Singleton Supabase client for use in Client Components.
 * Uses @supabase/ssr's createBrowserClient which handles auth cookies
 * automatically (reads/writes via document.cookie).
 */
export function getBrowserSupabase(): SupabaseClient {
  if (_browser) return _browser;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.'
    );
  }

  _browser = createBrowserClient(url, key);
  return _browser;
}
