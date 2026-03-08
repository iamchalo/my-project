'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { useAuth } from '@/lib/auth/auth-context';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: Array<'cashier' | 'manager' | 'admin' | 'superadmin'>;
  redirectTo?: string;
}

export function ProtectedRoute({ children, allowedRoles, redirectTo = '/login' }: ProtectedRouteProps) {
  const router = useRouter();
  const { isSignedIn, isLoaded } = useUser();
  const { profile, loading } = useAuth();

  const ready = isLoaded && !loading;

  useEffect(() => {
    if (!ready) return;

    if (!isSignedIn || !profile) {
      router.push(redirectTo);
      return;
    }

    if (!profile.is_active) {
      router.push('/account-disabled');
      return;
    }

    if (allowedRoles && !allowedRoles.includes(profile.role)) {
      const roleRoutes: Record<string, string> = {
        cashier: '/cashier', manager: '/manager', admin: '/admin', superadmin: '/superadmin',
      };
      router.push(roleRoutes[profile.role]);
    }
  }, [ready, isSignedIn, profile, allowedRoles, router, redirectTo]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Verifying authentication...</p>
        </div>
      </div>
    );
  }

  if (!isSignedIn || !profile) return null;
  if (!profile.is_active) return null;
  if (allowedRoles && !allowedRoles.includes(profile.role)) return null;

  return <>{children}</>;
}
