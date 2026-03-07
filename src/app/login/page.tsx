'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Notification, useNotification } from '@/components/ui/notification';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, LogIn, Mail, X } from 'lucide-react';

// Device detection helper function
function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;

  const width = window.innerWidth;
  const userAgent = navigator.userAgent.toLowerCase();

  // Check user agent for mobile/tablet keywords
  const mobileKeywords = [
    'android', 'webos', 'iphone', 'ipod', 'blackberry',
    'windows phone', 'opera mini', 'mobile'
  ];
  const tabletKeywords = ['ipad', 'tablet', 'playbook', 'silk'];

  const isMobileUA = mobileKeywords.some(keyword => userAgent.includes(keyword));
  const isTabletUA = tabletKeywords.some(keyword => userAgent.includes(keyword));

  // Screen width check (< 1024px considered non-desktop)
  const isSmallScreen = width < 1024;

  return isMobileUA || isTabletUA || (isSmallScreen && 'ontouchstart' in window);
}

export default function LoginPage() {
  const router = useRouter();
  const { signIn, signOut, user, profile, loading: authLoading } = useAuth();
  const supabase = createClient();
  const { notification, showNotification, hideNotification } = useNotification();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSessionBlocked, setActiveSessionBlocked] = useState(false);

  // Forgot password modal state
  const [showForgotModal,   setShowForgotModal]   = useState(false);
  const [modalEmail,        setModalEmail]        = useState('');
  const [resetSending,      setResetSending]      = useState(false);
  const [resetSent,         setResetSent]         = useState(false);
  const [resetError,        setResetError]        = useState('');

  // Open forgot-password modal, pre-filling email from the login field
  const openForgotModal = () => {
    setModalEmail(email.trim());
    setResetSent(false);
    setResetError('');
    setShowForgotModal(true);
  };

  const handleSendResetLink = async () => {
    const target = modalEmail.trim();
    if (!target) { setResetError('Please enter your email address.'); return; }

    setResetSending(true);
    setResetError('');
    try {
      // Use Supabase's built-in password reset — no external email service needed.
      // Supabase always returns success (even for unregistered emails) to prevent
      // email enumeration attacks, so we show a success message regardless.
      const { error } = await supabase.auth.resetPasswordForEmail(target, {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setResetSent(true);
    } catch (err: any) {
      setResetError(err.message || 'Failed to send reset email. Please try again.');
    } finally {
      setResetSending(false);
    }
  };

  // Show message if user was kicked from another session
  useEffect(() => {
    const msg = sessionStorage.getItem('pos-session-kicked');
    if (msg) {
      sessionStorage.removeItem('pos-session-kicked');
      showNotification('error', msg);
    }
  }, []);

  // Redirect if already logged in
  useEffect(() => {
    if (!authLoading && user && profile) {
      // Check if user account is deactivated
      if (!profile.is_active) {
        signOut();
        showNotification('error', 'Your account has been deactivated. Please contact admin.');
        return;
      }

      // Check if cashier is on mobile device
      if (profile.role === 'cashier' && isMobileDevice()) {
        // Don't redirect, show desktop-only message
        showNotification('error', 'Cashiers can only access from desktop computers');
        return;
      }

      // Redirect based on role
      const roleRoutes: Record<string, string> = {
        cashier: '/cashier',
        manager: '/manager',
        admin: '/admin',
        superadmin: '/superadmin',
      };
      const targetRoute = roleRoutes[profile.role] || '/cashier';
      console.log('useEffect redirect to:', targetRoute, 'Role:', profile.role);
      window.location.href = targetRoute;
    }
  }, [user, profile, authLoading]);

  const handleForceLogin = async () => {
    if (!email || !password) {
      showNotification('error', 'Please enter both email and password');
      return;
    }
    setIsSubmitting(true);
    showNotification('loading', 'Ending previous session and signing in...');
    try {
      const { error, profile: userProfile } = await signIn(email, password, true);
      if (error) {
        showNotification('error', `Sign in failed: ${error.message}`);
        setIsSubmitting(false);
        return;
      }
      setActiveSessionBlocked(false);
      if (userProfile?.role) {
        if (!userProfile.is_active) {
          await signOut();
          showNotification('error', 'Your account has been deactivated. Please contact admin.');
          setIsSubmitting(false);
          return;
        }
        showNotification('success', 'Previous session ended. Signing in...');
        const roleRoutes: Record<string, string> = {
          cashier: '/cashier', manager: '/manager', admin: '/admin', superadmin: '/superadmin',
        };
        window.location.href = roleRoutes[userProfile.role] || '/cashier';
      } else {
        showNotification('error', 'Profile not found. Please contact admin.');
        setIsSubmitting(false);
      }
    } catch {
      showNotification('error', 'An unexpected error occurred');
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      showNotification('error', 'Please enter both email and password');
      return;
    }

    setIsSubmitting(true);
    showNotification('loading', 'Signing in...');

    try {
      const { error, profile: userProfile } = await signIn(email, password);

      if (error) {
        // Check for specific error types
        if (error.message === 'ACTIVE_SESSION_EXISTS') {
          setActiveSessionBlocked(true);
          showNotification('error', 'This account already has an active session on another device.');
          setIsSubmitting(false);
          return;
        } else if (error.message.includes('Invalid login credentials')) {
          showNotification('error', 'Invalid email or password');
        } else if (error.message.includes('Email not confirmed')) {
          showNotification('error', 'Please confirm your email address');
        } else {
          showNotification('error', `Sign in failed: ${error.message}`);
        }
        setActiveSessionBlocked(false);
        setIsSubmitting(false);
      } else {
        // Direct redirect based on profile role
        if (userProfile?.role) {
          // Check if user account is deactivated
          if (!userProfile.is_active) {
            await signOut();
            showNotification('error', 'Your account has been deactivated. Please contact admin.');
            setIsSubmitting(false);
            return;
          }

          // Check if cashier is on mobile device
          if (userProfile.role === 'cashier' && isMobileDevice()) {
            // Sign out the cashier and show error
            await signOut();
            showNotification('error', 'Cashiers can only access this system from a desktop computer');
            setIsSubmitting(false);
            return;
          }

          showNotification('success', 'Signed in successfully! Redirecting...');
          const roleRoutes: Record<string, string> = {
            cashier: '/cashier',
            manager: '/manager',
            admin: '/admin',
            superadmin: '/superadmin',
          };
          const targetRoute = roleRoutes[userProfile.role] || '/cashier';
          console.log('Direct redirect to:', targetRoute, 'Role:', userProfile.role);
          // Use window.location for reliable redirect
          window.location.href = targetRoute;
        } else {
          // Profile not found - show error
          console.error('Profile is null after login');
          showNotification('error', 'Profile not found. Please contact admin.');
          setIsSubmitting(false);
        }
      }
    } catch (error: any) {
      console.error('Login error:', error);
      showNotification('error', 'An unexpected error occurred');
      setIsSubmitting(false);
    }
  };

  // Show skeleton while checking auth state
  if (authLoading) {
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
              <div>
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-10 w-full" />
              </div>
              <div>
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-10 w-full" />
              </div>
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Quick login buttons for testing
  const quickLogins = [
    { email: 'cashier@kfries.com', password: 'password123', role: 'Cashier', color: 'bg-blue-500' },
    { email: 'manager@kfries.com', password: 'password123', role: 'Manager', color: 'bg-green-500' },
    { email: 'admin@company.com', password: 'password123', role: 'Admin', color: 'bg-purple-500' },
    { email: 'superadmin@company.com', password: 'password123', role: 'Superadmin', color: 'bg-orange-500' },
  ];

  return (
    <>
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-4">
      {notification && (
        <Notification
          type={notification.type}
          message={notification.message}
          onClose={hideNotification}
        />
      )}

      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <LogIn className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">Welcome Back</CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Sign in to your account to continue
          </p>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="text-sm font-medium mb-2 block">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={isSubmitting}
                className="w-full px-4 py-2 border rounded-lg disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary"
                autoComplete="email"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="text-sm font-medium mb-2 block">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={isSubmitting}
                className="w-full px-4 py-2 border rounded-lg disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary"
                autoComplete="current-password"
                required
              />
            </div>

            {/* Forgot password link */}
            <div className="flex justify-end -mt-1">
              <button
                type="button"
                onClick={openForgotModal}
                className="text-xs text-primary hover:underline"
              >
                Forgot Password?
              </button>
            </div>

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4" />
                  Sign In
                </>
              )}
            </Button>

            {activeSessionBlocked && (
              <Button
                type="button"
                variant="outline"
                onClick={handleForceLogin}
                disabled={isSubmitting}
                className="w-full gap-2 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Ending session...
                  </>
                ) : (
                  'End Previous Session & Log In Here'
                )}
              </Button>
            )}
          </form>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Quick Access (Testing)
              </span>
            </div>
          </div>

          {/* Quick Login Buttons */}
          <div className="grid grid-cols-2 gap-2">
            {quickLogins.map((login) => (
              <Button
                key={login.role}
                type="button"
                variant="outline"
                size="sm"
                disabled={isSubmitting}
                onClick={() => {
                  setEmail(login.email);
                  setPassword(login.password);
                }}
                className="text-xs"
              >
                <div className={`w-2 h-2 rounded-full ${login.color} mr-2`} />
                {login.role}
              </Button>
            ))}
          </div>

          {/* Info Text */}
          <div className="text-xs text-center text-muted-foreground">
            <p>Use the quick access buttons above to auto-fill credentials</p>
            <p className="mt-1">Default password: <code className="bg-muted px-1 py-0.5 rounded">password123</code></p>
          </div>
        </CardContent>
      </Card>
    </div>

      {/* ── Forgot Password Modal ────────────────────────────────────────── */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-sm p-6 relative">

            {/* Close button */}
            <button
              onClick={() => setShowForgotModal(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>

            {resetSent ? (
              /* ── Success state ── */
              <div className="text-center space-y-3 py-2">
                <div className="mx-auto h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                  <Mail className="h-6 w-6 text-green-600" />
                </div>
                <h2 className="text-lg font-semibold">Check your email</h2>
                <p className="text-sm text-muted-foreground">
                  A password reset link has been sent to <strong>{modalEmail}</strong>.
                  The link expires in <strong>15 minutes</strong>.
                </p>
                <Button className="w-full mt-2" onClick={() => setShowForgotModal(false)}>
                  Done
                </Button>
              </div>
            ) : (
              /* ── Request state ── */
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold">Forgot your password?</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    We'll send a secure reset link to your registered email address.
                  </p>
                </div>

                <div>
                  <label className="text-sm font-medium block mb-1.5">Email Address</label>
                  <input
                    type="email"
                    value={modalEmail}
                    onChange={e => { setModalEmail(e.target.value); setResetError(''); }}
                    placeholder="you@example.com"
                    disabled={resetSending}
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                    autoFocus
                  />
                </div>

                {resetError && (
                  <p className="text-sm text-destructive">{resetError}</p>
                )}

                <div className="flex gap-2 pt-1">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setShowForgotModal(false)}
                    disabled={resetSending}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1 gap-2"
                    onClick={handleSendResetLink}
                    disabled={resetSending}
                  >
                    {resetSending && <Loader2 className="h-4 w-4 animate-spin" />}
                    {resetSending ? 'Sending…' : 'Send Reset Link'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
