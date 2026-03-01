import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

/**
 * Auth callback handler — Supabase redirects here after email confirmation
 * or OAuth login. Exchanges the code for a session and redirects to home.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
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

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Read return path from cookie (set before OAuth started)
      const rawNext = cookieStore.get('fc_auth_next')?.value;
      const next = rawNext ? decodeURIComponent(rawNext) : '/';
      const safePath = next.startsWith('/') ? next : '/';

      // Clear the cookie
      cookieStore.set('fc_auth_next', '', { path: '/', maxAge: 0 });

      return NextResponse.redirect(`${origin}${safePath}`);
    }
  }

  // If something went wrong, redirect home anyway
  return NextResponse.redirect(`${origin}/`);
}
