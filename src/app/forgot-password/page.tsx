'use client';

import { useState } from 'react';
import { useClerk } from '@clerk/nextjs';
import { useSignIn } from '@clerk/nextjs/legacy';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Notification, useNotification } from '@/components/ui/notification';
import { Loader2, KeyRound, CheckCircle2 } from 'lucide-react';
import { PasswordToggleButton } from '@/components/ui/password-toggle-button';

const Rule = ({ met, label }: { met: boolean; label: string }) => (
  <li className={`flex items-center gap-1.5 text-xs ${met ? 'text-green-600' : 'text-muted-foreground'}`}>
    <span>{met ? '✓' : '○'}</span> {label}
  </li>
);

export default function ForgotPasswordPage() {
  const { signIn, isLoaded } = useSignIn();
  const { setActive } = useClerk();
  const router = useRouter();
  const { notification, showNotification, hideNotification } = useNotification();

  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const hasMinLength = password.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const passwordsMatch = password === confirm && confirm !== '';

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signIn) return;
    if (!email) { showNotification('error', 'Please enter your email address'); return; }

    setIsSubmitting(true);
    showNotification('loading', 'Sending reset code...');

    try {
      await signIn.create({ strategy: 'reset_password_email_code', identifier: email });
      showNotification('success', 'Code sent! Check your email.');
      setStep('reset');
    } catch (err: any) {
      const msg = err?.errors?.[0]?.longMessage ?? err?.errors?.[0]?.message ?? 'Failed to send reset code';
      showNotification('error', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signIn) return;

    if (!hasMinLength || !hasLetter || !hasNumber) {
      showNotification('error', 'Password does not meet the requirements below.');
      return;
    }
    if (!passwordsMatch) {
      showNotification('error', 'Passwords do not match.');
      return;
    }
    if (!code) {
      showNotification('error', 'Please enter the 6-digit code from your email.');
      return;
    }

    setIsSubmitting(true);
    showNotification('loading', 'Updating password...');

    try {
      const result = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code,
        password,
      });

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        setSuccess(true);
        setTimeout(() => router.push('/login'), 2500);
      } else {
        showNotification('error', 'Could not complete password reset. Please try again.');
        setIsSubmitting(false);
      }
    } catch (err: any) {
      const msg = err?.errors?.[0]?.longMessage ?? err?.errors?.[0]?.message ?? 'Password reset failed';
      showNotification('error', msg);
      setIsSubmitting(false);
    }
  };

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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-4">
      {notification && (
        <Notification type={notification.type} message={notification.message} onClose={hideNotification} />
      )}

      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <KeyRound className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">Reset Password</CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            {step === 'request'
              ? 'Enter your email and we\'ll send you a reset code'
              : 'Enter the code from your email and choose a new password'}
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          {step === 'request' ? (
            <form onSubmit={handleRequestCode} className="space-y-4">
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
              <Button type="submit" disabled={isSubmitting} className="w-full gap-2">
                {isSubmitting
                  ? <><Loader2 className="h-4 w-4 animate-spin" />Sending...</>
                  : 'Send Reset Code'}
              </Button>
              <div className="text-center">
                <Link href="/login" className="text-sm text-muted-foreground hover:text-primary underline-offset-4 hover:underline">
                  Back to login
                </Link>
              </div>
            </form>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label htmlFor="code" className="text-sm font-medium mb-2 block">6-Digit Code</label>
                <input
                  id="code" type="text" value={code}
                  onChange={(e) => setCode(e.target.value.trim())}
                  placeholder="123456" disabled={isSubmitting}
                  maxLength={6}
                  className="w-full px-4 py-2 border rounded-lg disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary tracking-widest text-center text-lg"
                  autoComplete="one-time-code" required
                />
              </div>

              <div>
                <label className="text-sm font-medium block mb-1.5">New Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    disabled={isSubmitting}
                    placeholder="••••••••"
                    className="w-full px-4 py-2 border rounded-lg pr-10 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                    required
                  />
                  <PasswordToggleButton visible={showPassword} onToggle={() => setShowPassword(v => !v)} disabled={isSubmitting} />
                </div>
                {password && (
                  <ul className="mt-2 space-y-0.5 pl-1">
                    <Rule met={hasMinLength} label="At least 8 characters" />
                    <Rule met={hasLetter} label="Contains letters" />
                    <Rule met={hasNumber} label="Contains numbers" />
                  </ul>
                )}
              </div>

              <div>
                <label className="text-sm font-medium block mb-1.5">Confirm Password</label>
                <div className="relative">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    disabled={isSubmitting}
                    placeholder="••••••••"
                    className="w-full px-4 py-2 border rounded-lg pr-10 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                    required
                  />
                  <PasswordToggleButton visible={showConfirm} onToggle={() => setShowConfirm(v => !v)} disabled={isSubmitting} />
                </div>
                {confirm && (
                  <p className={`text-xs mt-1 ${passwordsMatch ? 'text-green-600' : 'text-destructive'}`}>
                    {passwordsMatch ? '✓ Passwords match' : 'Passwords do not match'}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                disabled={isSubmitting || !hasMinLength || !hasLetter || !hasNumber || !passwordsMatch || !code}
                className="w-full gap-2"
              >
                {isSubmitting
                  ? <><Loader2 className="h-4 w-4 animate-spin" />Updating...</>
                  : 'Update Password'}
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setStep('request')}
                  className="text-sm text-muted-foreground hover:text-primary underline-offset-4 hover:underline"
                >
                  Resend code
                </button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
