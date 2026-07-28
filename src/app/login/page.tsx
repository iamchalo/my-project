'use client';

import { useState, useEffect } from 'react';
import { useUser, useClerk } from '@clerk/nextjs';
import { useSignIn } from '@clerk/nextjs/legacy';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Notification, useNotification } from '@/components/ui/notification';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, LogIn } from 'lucide-react';
import { PasswordToggleButton } from '@/components/ui/password-toggle-button';

function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const width = window.innerWidth;
  const userAgent = navigator.userAgent.toLowerCase();
  const mobileKeywords = ['android', 'webos', 'iphone', 'ipod', 'blackberry', 'windows phone', 'opera mini', 'mobile'];
  const tabletKeywords = ['ipad', 'tablet', 'playbook', 'silk'];
  const isMobileUA = mobileKeywords.some(k => userAgent.includes(k));
  const isTabletUA = tabletKeywords.some(k => userAgent.includes(k));
  return isMobileUA || isTabletUA || (width < 1024 && 'ontouchstart' in window);
}

export default function LoginPage() {
  const { signIn, isLoaded } = useSignIn();
  const { setActive } = useClerk();
  const { isSignedIn } = useUser();
  const { notification, showNotification, hideNotification } = useNotification();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Show kicked-session message if redirected here after force sign-out
  useEffect(() => {
    const msg = sessionStorage.getItem('pos-session-kicked');
    if (msg) { sessionStorage.removeItem('pos-session-kicked'); showNotification('error', msg); }
  }, []);

  // Already signed in — middleware will redirect, but this handles edge cases
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      window.location.href = '/';
    }
  }, [isLoaded, isSignedIn]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signIn) return;
    if (!email || !password) { showNotification('error', 'Please enter both email and password'); return; }

    setIsSubmitting(true);
    showNotification('loading', 'Signing in...');

    try {
      const result = await signIn.create({ identifier: email, password });

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        // AuthProvider detects the new Clerk session, fetches profile,
        // sets session nonce, then we redirect via middleware on '/'
        showNotification('success', 'Signed in! Redirecting...');
        window.location.href = '/';
      } else {
        // MFA or other additional steps required
        showNotification('error', 'Additional verification required. Please contact admin.');
        setIsSubmitting(false);
      }
    } catch (err: any) {
      const code = err?.errors?.[0]?.code ?? '';
      const msg  = err?.errors?.[0]?.longMessage ?? err?.errors?.[0]?.message ?? err.message ?? 'Sign in failed';

      if (code === 'form_password_incorrect' || code === 'form_identifier_not_found') {
        showNotification('error', 'Invalid email or password');
      } else {
        showNotification('error', `${msg} [code: ${code}]`);
      }
      setIsSubmitting(false);
    }
  };

  // Waiting for Clerk to initialise
  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Skeleton className="h-12 w-12 rounded-full mx-auto mb-4" />
            <Skeleton className="h-8 w-48 mx-auto mb-2" />
            <Skeleton className="h-4 w-64 mx-auto" />
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div><Skeleton className="h-4 w-24 mb-2" /><Skeleton className="h-10 w-full" /></div>
              <div><Skeleton className="h-4 w-24 mb-2" /><Skeleton className="h-10 w-full" /></div>
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[1,2,3,4].map(i => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-4">
      {notification && (
        <Notification type={notification.type} message={notification.message} onClose={hideNotification} />
      )}

      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <LogIn className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">Welcome Back</CardTitle>
          <p className="text-sm text-muted-foreground mt-2">Sign in to your account to continue</p>
        </CardHeader>

        <CardContent className="space-y-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="text-sm font-medium mb-2 block">Email Address</label>
              <input
                id="email" type="email" value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com" disabled={isSubmitting}
                className="w-full px-4 py-2 border rounded-lg disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary"
                autoComplete="email" required
              />
            </div>
            <div>
              <label htmlFor="password" className="text-sm font-medium mb-2 block">Password</label>
              <div className="relative">
                <input
                  id="password" type={showPassword ? 'text' : 'password'} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••" disabled={isSubmitting}
                  className="w-full px-4 py-2 pr-10 border rounded-lg disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary"
                  autoComplete="current-password" required
                />
                <PasswordToggleButton visible={showPassword} onToggle={() => setShowPassword(v => !v)} disabled={isSubmitting} />
              </div>
            </div>
            <Button type="submit" disabled={isSubmitting} className="w-full gap-2">
              {isSubmitting ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Signing in...</>
              ) : (
                <><LogIn className="h-4 w-4" />Sign In</>
              )}
            </Button>
            <div className="text-center">
              <Link href="/forgot-password" className="text-sm text-muted-foreground hover:text-primary underline-offset-4 hover:underline">
                Forgot password?
              </Link>
            </div>
          </form>

        </CardContent>
      </Card>
    </div>
  );
}
