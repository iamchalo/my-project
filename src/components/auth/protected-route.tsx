'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: Array<'cashier' | 'manager' | 'admin' | 'superadmin'>;
  redirectTo?: string;
}

export function ProtectedRoute({
  children,
  allowedRoles,
  redirectTo = '/login',
}: ProtectedRouteProps) {
  const router = useRouter();
  const { user, profile, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      // Not authenticated
      if (!user || !profile) {
        router.push(redirectTo);
        return;
      }

      // Authenticated but wrong role
      if (allowedRoles && !allowedRoles.includes(profile.role)) {
        // Redirect to appropriate dashboard for their role
        const roleRoutes = {
          cashier: '/cashier',
          manager: '/manager',
          admin: '/admin',
          superadmin: '/superadmin',
        };
        router.push(roleRoutes[profile.role]);
        return;
      }

      // Inactive user
      if (!profile.is_active) {
        router.push('/account-disabled');
        return;
      }
    }
  }, [user, profile, loading, allowedRoles, router, redirectTo]);

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Verifying authentication...</p>
        </div>
      </div>
    );
  }

  // Not authenticated or wrong role
  if (!user || !profile) {
    return null; // Will redirect via useEffect
  }

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return null; // Will redirect via useEffect
  }

  if (!profile.is_active) {
    return null; // Will redirect via useEffect
  }

  // Authenticated and authorized
  return <>{children}</>;
}
