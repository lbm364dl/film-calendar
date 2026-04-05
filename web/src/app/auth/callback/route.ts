import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

/**
 * Auth callback handler — Supabase redirects here after email confirmation
 * or OAuth login. Exchanges the code for a session and redirects to home.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  // Use forwarded host (from Vercel/proxy) or fall back to request URL origin
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
  const origin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : new URL(request.url).origin;

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
      const rawNext = cookieStore.get('fc_auth_next')?.value;
      const next = rawNext ? decodeURIComponent(rawNext) : '/';
      const safePath = next.startsWith('/') ? next : '/';
      cookieStore.set('fc_auth_next', '', { path: '/', maxAge: 0 });

      // Return HTML that redirects client-side — ensures cookies are
      // stored by the browser before the next page load
      return new NextResponse(
        `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=${origin}${safePath}"><script>window.location.href="${origin}${safePath}"</script></head><body>Redirecting...</body></html>`,
        { headers: { 'content-type': 'text/html' } }
      );
    }
  }

  return NextResponse.redirect(`${origin}/`);
}
