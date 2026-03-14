import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

type UserRole = 'cashier' | 'manager' | 'admin' | 'superadmin';

const ROUTE_ROLES: Record<string, UserRole[]> = {
  '/cashier':    ['cashier'],
  '/manager':    ['manager'],
  '/admin':      ['admin', 'superadmin'],
  '/superadmin': ['superadmin'],
};

const ROLE_HOME: Record<UserRole, string> = {
  cashier:    '/cashier/sales-stock',
  manager:    '/manager',
  admin:      '/admin',
  superadmin: '/superadmin',
};

const PUBLIC_PATHS = ['/login', '/reset-password', '/auth/reset-password'];

function getProtectedPrefix(pathname: string): string | null {
  for (const prefix of Object.keys(ROUTE_ROLES)) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return prefix;
  }
  return null;
}

function setRoleCookie(res: NextResponse, role: UserRole): void {
  res.cookies.set('pos-role', role, {
    httpOnly: true,
    path: '/',
    maxAge: 60 * 60 * 24,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}

async function getRoleFromDb(clerkUserId: string): Promise<{ role: UserRole; is_active: boolean } | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('clerk_id', clerkUserId)
    .maybeSingle();
  if (!data?.role) return null;
  return { role: data.role as UserRole, is_active: data.is_active ?? true };
}

export default clerkMiddleware(async (auth, request: NextRequest) => {
  const { userId } = await auth();
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();

  // Clear stale role cookie when unauthenticated
  if (!userId && request.cookies.has('pos-role')) {
    response.cookies.delete('pos-role');
  }

  const isPublic = PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(`${p}/`));
  const isResetPath = pathname.startsWith('/reset-password') || pathname.startsWith('/auth/reset-password');

  // ── Public routes ──────────────────────────────────────────────────────
  if (isPublic) {
    if (isResetPath) return response;
    if (userId) {
      const cachedRole = request.cookies.get('pos-role')?.value as UserRole | undefined;
      if (cachedRole && ROLE_HOME[cachedRole]) {
        return NextResponse.redirect(new URL(ROLE_HOME[cachedRole], request.url));
      }
      const profile = await getRoleFromDb(userId);
      if (profile?.role) {
        const res = NextResponse.redirect(new URL(ROLE_HOME[profile.role], request.url));
        setRoleCookie(res, profile.role);
        return res;
      }
    }
    return response;
  }

  // ── Root path ──────────────────────────────────────────────────────────
  if (pathname === '/') {
    if (!userId) return NextResponse.redirect(new URL('/login', request.url));
    const cachedRole = request.cookies.get('pos-role')?.value as UserRole | undefined;
    if (cachedRole && ROLE_HOME[cachedRole]) {
      return NextResponse.redirect(new URL(ROLE_HOME[cachedRole], request.url));
    }
    const profile = await getRoleFromDb(userId);
    if (!profile?.role) return NextResponse.redirect(new URL('/login', request.url));
    if (!profile.is_active) return NextResponse.redirect(new URL('/login', request.url));
    const res = NextResponse.redirect(new URL(ROLE_HOME[profile.role], request.url));
    setRoleCookie(res, profile.role);
    return res;
  }

  // ── Role-protected routes ──────────────────────────────────────────────
  const prefix = getProtectedPrefix(pathname);
  if (!prefix) return response;

  if (!userId) return NextResponse.redirect(new URL('/login', request.url));

  let role = request.cookies.get('pos-role')?.value as UserRole | undefined;

  if (!role) {
    const profile = await getRoleFromDb(userId);
    if (!profile?.role) return NextResponse.redirect(new URL('/login', request.url));
    if (!profile.is_active) return NextResponse.redirect(new URL('/login', request.url));
    role = profile.role;
    setRoleCookie(response, role);
  }

  if (!ROUTE_ROLES[prefix].includes(role)) {
    return NextResponse.redirect(new URL(ROLE_HOME[role] ?? '/login', request.url));
  }

  return response;
});

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
