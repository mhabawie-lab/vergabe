import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Session refresh and route protection.
 *
 * Supabase access tokens are short-lived; without a refresh on each request
 * a Server Component would see an expired session. The middleware refreshes
 * the token and writes the rotated cookies onto the response.
 *
 * It also keeps unauthenticated users out of the application shell. Pages
 * additionally call `requireSession()` — the middleware is a fast first
 * gate, never the only one.
 *
 * Without Supabase credentials the app runs in local demo mode and this
 * middleware is a no-op.
 */

const PUBLIC_PATHS = ['/login', '/auth'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (
    url === undefined ||
    url.length === 0 ||
    anonKey === undefined ||
    anonKey.length === 0
  ) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Refreshes the session as a side effect. Must not be removed.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (user === null && !isPublicPath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except Next.js internals, static assets and the internal
     * ingestion endpoints, which authenticate with their own shared secret.
     */
    '/((?!_next/static|_next/image|favicon.ico|api/v1/internal|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
