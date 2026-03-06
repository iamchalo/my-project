'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShiftProvider } from '@/lib/shift/shift-context';
import { useAuth } from '@/lib/auth/auth-context';
import { Skeleton } from '@/components/ui/skeleton';
import { Monitor } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

// Device detection helper
function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;

  const width = window.innerWidth;
  const userAgent = navigator.userAgent.toLowerCase();

  const mobileKeywords = [
    'android', 'webos', 'iphone', 'ipod', 'blackberry',
    'windows phone', 'opera mini', 'mobile'
  ];
  const tabletKeywords = ['ipad', 'tablet', 'playbook', 'silk'];

  const isMobileUA = mobileKeywords.some(keyword => userAgent.includes(keyword));
  const isTabletUA = tabletKeywords.some(keyword => userAgent.includes(keyword));
  const isSmallScreen = width < 1024;

  return isMobileUA || isTabletUA || (isSmallScreen && 'ontouchstart' in window);
}

export default function CashierLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { signOut, loading } = useAuth();
  const [isMobile, setIsMobile] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Check device type immediately (synchronous)
    setIsMobile(isMobileDevice());
    setChecking(false);

    // Set up resize listener
    const checkDevice = () => {
      setIsMobile(isMobileDevice());
    };

    window.addEventListener('resize', checkDevice);

    return () => {
      window.removeEventListener('resize', checkDevice);
    };
  }, []);

  const handleLogout = async () => {
    await signOut();
    router.push('/login');
  };

  // Show skeleton while loading auth
  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        {/* Top bar skeleton */}
        <div className="fixed top-0 left-0 right-0 z-50 h-16 border-b bg-background/95 backdrop-blur-md">
          <div className="flex items-center justify-between h-full px-4">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-10 w-24" />
          </div>
        </div>

        {/* Content skeleton */}
        <div className="pt-16 p-8">
          <div className="max-w-7xl mx-auto space-y-8">
            <div className="space-y-2">
              <Skeleton className="h-10 w-64" />
              <Skeleton className="h-4 w-96" />
            </div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              <Skeleton className="h-32 rounded-lg" />
              <Skeleton className="h-32 rounded-lg" />
              <Skeleton className="h-32 rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show desktop-only message if on mobile
  if (isMobile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-950 dark:to-orange-950 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900">
              <Monitor className="h-8 w-8 text-red-600 dark:text-red-400" />
            </div>
            <h2 className="text-xl font-bold">Desktop Only Access</h2>
            <p className="text-muted-foreground">
              Cashier accounts can only access this system from a desktop computer.
              Please use a desktop or laptop to continue.
            </p>
            <Button onClick={handleLogout} variant="outline" className="w-full">
              Logout and Return to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <ShiftProvider>
      {children}
    </ShiftProvider>
  );
}
