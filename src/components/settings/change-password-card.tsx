'use client';

import { useState } from 'react';
import { useClerk } from '@clerk/nextjs';
import { useSignIn } from '@clerk/nextjs/legacy';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { KeyIcon, Loader2 } from 'lucide-react';
import { PasswordToggleButton } from '@/components/ui/password-toggle-button';

interface ChangePasswordCardProps {
  onNotification: (type: 'success' | 'error', message: string) => void;
}

const Rule = ({ met, label }: { met: boolean; label: string }) => (
  <li className={`flex items-center gap-1.5 text-xs ${met ? 'text-green-600' : 'text-muted-foreground'}`}>
    <span>{met ? '✓' : '○'}</span> {label}
  </li>
);

export function ChangePasswordCard({ onNotification }: ChangePasswordCardProps) {
  const { profile } = useAuth();
  const { signIn, isLoaded } = useSignIn();
  const { setActive } = useClerk();
  const router = useRouter();

  const [step, setStep] = useState<'idle' | 'reset'>('idle');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const hasMinLength = password.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const passwordsMatch = password === confirm && confirm !== '';

  const handleSendCode = async () => {
    if (!isLoaded || !signIn || !profile?.email) return;

    setSending(true);
    try {
      await signIn.create({ strategy: 'reset_password_email_code', identifier: profile.email });
      setStep('reset');
    } catch (err: any) {
      const msg = err?.errors?.[0]?.longMessage ?? err?.errors?.[0]?.message ?? 'Failed to send code';
      onNotification('error', msg);
    } finally {
      setSending(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!isLoaded || !signIn) return;

    if (!code) { onNotification('error', 'Please enter the 6-digit code from your email.'); return; }
    if (!hasMinLength || !hasLetter || !hasNumber) { onNotification('error', 'Password does not meet the requirements.'); return; }
    if (!passwordsMatch) { onNotification('error', 'Passwords do not match.'); return; }

    setSubmitting(true);
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code,
        password,
      });

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        onNotification('success', 'Password updated. Please sign in again.');
        setTimeout(() => router.push('/login'), 1500);
      } else {
        onNotification('error', 'Could not complete password reset. Please try again.');
        setSubmitting(false);
      }
    } catch (err: any) {
      const msg = err?.errors?.[0]?.longMessage ?? err?.errors?.[0]?.message ?? 'Password reset failed';
      onNotification('error', msg);
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <KeyIcon className="h-5 w-5" />
          <CardTitle>Change Password</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {step === 'idle' ? (
          <>
            <p className="text-sm text-muted-foreground">
              We&apos;ll send a 6-digit code to <span className="font-medium text-foreground">{profile?.email}</span>
            </p>
            <Button onClick={handleSendCode} disabled={sending || !isLoaded} className="w-full" size="lg">
              {sending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Sending...</>
              ) : (
                'Send Code'
              )}
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Code sent to <span className="font-medium text-foreground">{profile?.email}</span>
            </p>

            <div>
              <label className="text-sm font-medium mb-2 block">6-Digit Code</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.trim())}
                placeholder="123456"
                disabled={submitting}
                maxLength={6}
                className="w-full px-4 py-2 border rounded-lg disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary tracking-widest text-center text-lg"
                autoComplete="one-time-code"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">New Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={submitting}
                  className="w-full px-4 py-2 pr-10 border rounded-lg bg-background disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary"
                  autoComplete="new-password"
                />
                <PasswordToggleButton visible={showPassword} onToggle={() => setShowPassword(v => !v)} disabled={submitting} />
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
              <label className="text-sm font-medium mb-1.5 block">Confirm New Password</label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  disabled={submitting}
                  className="w-full px-4 py-2 pr-10 border rounded-lg bg-background disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary"
                  autoComplete="new-password"
                />
                <PasswordToggleButton visible={showConfirm} onToggle={() => setShowConfirm(v => !v)} disabled={submitting} />
              </div>
              {confirm && (
                <p className={`text-xs mt-1 ${passwordsMatch ? 'text-green-600' : 'text-destructive'}`}>
                  {passwordsMatch ? '✓ Passwords match' : 'Passwords do not match'}
                </p>
              )}
            </div>

            <Button
              onClick={handleUpdatePassword}
              disabled={submitting || !hasMinLength || !hasLetter || !hasNumber || !passwordsMatch || !code}
              className="w-full"
              size="lg"
            >
              {submitting ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Updating...</>
              ) : (
                'Update Password'
              )}
            </Button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => { setStep('idle'); setCode(''); setPassword(''); setConfirm(''); }}
                className="text-sm text-muted-foreground hover:text-primary underline-offset-4 hover:underline"
              >
                Resend code
              </button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
