'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { PasswordToggleButton } from '@/components/ui/password-toggle-button';

// ─── Inner component (uses useSearchParams — must be inside Suspense) ──────────

function ResetPasswordForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const token        = searchParams.get('token') ?? '';

  const [password,        setPassword]        = useState('');
  const [confirm,         setConfirm]         = useState('');
  const [showPassword,    setShowPassword]    = useState(false);
  const [showConfirm,     setShowConfirm]     = useState(false);
  const [submitting,      setSubmitting]      = useState(false);
  const [success,         setSuccess]         = useState(false);
  const [pageError,       setPageError]       = useState('');
  const [fieldError,      setFieldError]      = useState('');

  // Basic client-side token check
  useEffect(() => {
    if (!token) setPageError('No reset token found. Please request a new reset link.');
  }, [token]);

  // Password strength indicators
  const hasMinLength = password.length >= 8;
  const hasLetter    = /[a-zA-Z]/.test(password);
  const hasNumber    = /[0-9]/.test(password);
  const passwordsMatch = password === confirm && confirm !== '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError('');

    if (!hasMinLength || !hasLetter || !hasNumber) {
      setFieldError('Password does not meet the requirements below.');
      return;
    }
    if (!passwordsMatch) {
      setFieldError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token, password }),
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        setFieldError(data.error ?? 'Something went wrong. Please request a new reset link.');
        return;
      }

      setSuccess(true);
      setTimeout(() => router.push('/login'), 3000);
    } catch {
      setFieldError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Invalid token ────────────────────────────────────────────────────────────
  if (pageError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8 flex flex-col items-center text-center gap-4">
            <XCircle className="h-12 w-12 text-destructive" />
            <h2 className="text-xl font-bold">Link Invalid</h2>
            <p className="text-muted-foreground text-sm">{pageError}</p>
            <Button className="mt-2" onClick={() => router.push('/login')}>
              Back to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Success ──────────────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8 flex flex-col items-center text-center gap-4">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <h2 className="text-xl font-bold">Password Updated!</h2>
            <p className="text-muted-foreground text-sm">
              Your password has been reset successfully. Redirecting to login…
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Form ─────────────────────────────────────────────────────────────────────
  const Rule = ({ met, label }: { met: boolean; label: string }) => (
    <li className={`flex items-center gap-1.5 text-xs ${met ? 'text-green-600' : 'text-muted-foreground'}`}>
      <span>{met ? '✓' : '○'}</span> {label}
    </li>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Set New Password</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Choose a strong password for your account
          </p>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* New password */}
            <div>
              <label className="text-sm font-medium block mb-1.5">New Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  disabled={submitting}
                  placeholder="••••••••"
                  className="w-full px-4 py-2 border rounded-lg pr-10 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                  required
                />
                <PasswordToggleButton visible={showPassword} onToggle={() => setShowPassword(v => !v)} disabled={submitting} />
              </div>

              {/* Password rules */}
              {password && (
                <ul className="mt-2 space-y-0.5 pl-1">
                  <Rule met={hasMinLength} label="At least 8 characters" />
                  <Rule met={hasLetter}    label="Contains letters" />
                  <Rule met={hasNumber}    label="Contains numbers" />
                </ul>
              )}
            </div>

            {/* Confirm password */}
            <div>
              <label className="text-sm font-medium block mb-1.5">Confirm Password</label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  disabled={submitting}
                  placeholder="••••••••"
                  className="w-full px-4 py-2 border rounded-lg pr-10 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                  required
                />
                <PasswordToggleButton visible={showConfirm} onToggle={() => setShowConfirm(v => !v)} disabled={submitting} />
              </div>
              {confirm && (
                <p className={`text-xs mt-1 ${passwordsMatch ? 'text-green-600' : 'text-destructive'}`}>
                  {passwordsMatch ? '✓ Passwords match' : 'Passwords do not match'}
                </p>
              )}
            </div>

            {/* Error */}
            {fieldError && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-lg px-4 py-3 text-sm text-destructive">
                {fieldError}
              </div>
            )}

            <Button
              type="submit"
              disabled={submitting || !hasMinLength || !hasLetter || !hasNumber || !passwordsMatch}
              className="w-full gap-2"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? 'Updating password…' : 'Update Password'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Page wrapper (Suspense required for useSearchParams) ──────────────────────

export default function AuthResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
