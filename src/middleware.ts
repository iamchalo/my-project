import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

type UserRole = 'cashier' | 'manager' | 'admin' | 'superadmin';

/**
 * Which roles are allowed on each protected route prefix.
 * A prefix matches the route itself and all child routes.
 */
const ROUTE_ROLES: Record<string, UserRole[]> = {
  '/cashier':    ['cashier'],
  '/manager':    ['manager'],
  '/admin':      ['admin', 'superadmin'],
  '/superadmin': ['superadmin'],
};

/** Default landing page for each role after login. */
const ROLE_HOME: Record<UserRole, string> = {
  cashier:    '/cashier',
  manager:    '/manager',
  admin:      '/admin',
  superadmin: '/superadmin',
};

/** Routes that do not require authentication. */
const PUBLIC_PATHS = ['/login', '/reset-password', '/auth/reset-password'];

/** Returns the matching protected prefix for a pathname, or null. */
function getProtectedPrefix(pathname: string): string | null {
  for (const prefix of Object.keys(ROUTE_ROLES)) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return prefix;
    }
  }
  return null;
}

/**
 * Cache the role in a server-set httpOnly cookie so subsequent requests
 * don't need a DB round-trip.
 */
function setRoleCookie(res: NextResponse, role: UserRole): void {
  res.cookies.set('pos-role', role, {
    httpOnly: true,
    path: '/',
    maxAge: 60 * 60 * 24,           // 24 hours
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Start with a pass-through response; @supabase/ssr may replace it
  // inside setAll() to propagate refreshed session cookies.
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  // Create a Supabase server client that reads/writes cookies from the request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Propagate new/refreshed cookies to both the request and response.
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: request.headers } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Validate the session from cookies (refreshes expired tokens automatically;
  // no separate network call when the token is still valid).
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id ?? null;

  // ── Clear stale role cache when the user has no valid session ──────────────
  if (!userId && request.cookies.has('pos-role')) {
    response.cookies.delete('pos-role');
  }

  // ── Public routes ──────────────────────────────────────────────────────────
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );

  if (isPublic) {
    // Reset-password pages must always be accessible — even with an active session —
    // because the user arrives here via an emailed link to change their password.
    const isResetPath = pathname === '/reset-password' ||
      pathname.startsWith('/reset-password/') ||
      pathname === '/auth/reset-password' ||
      pathname.startsWith('/auth/reset-password/');
    if (isResetPath) return response;

    // An authenticated user on any other public route gets redirected to their dashboard.
    if (userId) {
      const cachedRole = request.cookies.get('pos-role')?.value as UserRole | undefined;
      if (cachedRole && ROLE_HOME[cachedRole]) {
        return NextResponse.redirect(new URL(ROLE_HOME[cachedRole], request.url));
      }
      // Role not cached yet — one DB call to find it.
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle();
      if (profile?.role) {
        const dest = ROLE_HOME[profile.role as UserRole] ?? '/';
        const res = NextResponse.redirect(new URL(dest, request.url));
        setRoleCookie(res, profile.role as UserRole);
        return res;
      }
    }
    return response;
  }

  // ── Root path ──────────────────────────────────────────────────────────────
  if (pathname === '/') {
    if (!userId) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    const cachedRole = request.cookies.get('pos-role')?.value as UserRole | undefined;
    if (cachedRole && ROLE_HOME[cachedRole]) {
      return NextResponse.redirect(new URL(ROLE_HOME[cachedRole], request.url));
    }
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();
    if (!profile?.role) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    const dest = ROLE_HOME[profile.role as UserRole] ?? '/login';
    const res = NextResponse.redirect(new URL(dest, request.url));
    setRoleCookie(res, profile.role as UserRole);
    return res;
  }

  // ── Role-protected routes ──────────────────────────────────────────────────
  const prefix = getProtectedPrefix(pathname);
  if (!prefix) {
    // Not a recognised protected prefix — allow through unmodified.
    return response;
  }

  // Not authenticated → send to login.
  if (!userId) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Get role: use cached cookie first, fall back to one DB call.
  let role = request.cookies.get('pos-role')?.value as UserRole | undefined;

  if (!role) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();
    if (!profile?.role) {
      // Profile missing — force re-login.
      return NextResponse.redirect(new URL('/login', request.url));
    }
    role = profile.role as UserRole;
    // Cache so future requests skip the DB call.
    setRoleCookie(response, role);
  }

  // Wrong role for this route → redirect to the user's own dashboard.
  if (!ROUTE_ROLES[prefix].includes(role)) {
    const home = ROLE_HOME[role] ?? '/login';
    return NextResponse.redirect(new URL(home, request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Run middleware on all routes EXCEPT:
     *   _next/static  — static build assets
     *   _next/image   — Next.js image optimisation
     *   favicon.ico
     *   api/          — API routes handle their own auth
     *   image files   — svg, png, jpg, jpeg, gif, webp
     */
    '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
