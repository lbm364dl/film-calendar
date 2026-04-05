import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
  const origin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : new URL(request.url).origin;

  if (code) {
    const cookieStore = await cookies();

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // Capture cookies set during session exchange
    const newCookies: { name: string; value: string; options: any }[] = [];

    const supabase = createServerClient(url, key!, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
            newCookies.push({ name, value, options });
          });
        },
      },
    });

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const rawNext = cookieStore.get('fc_auth_next')?.value;
      const next = rawNext ? decodeURIComponent(rawNext) : '/';
      const safePath = next.startsWith('/') ? next : '/';
      cookieStore.set('fc_auth_next', '', { path: '/', maxAge: 0 });

      // Use NextResponse.redirect and explicitly set the auth cookies on it
      const response = NextResponse.redirect(`${origin}${safePath}`);
      for (const { name, value, options } of newCookies) {
        response.cookies.set(name, value, options);
      }
      return response;
    }
  }

  return NextResponse.redirect(`${origin}/`);
}
