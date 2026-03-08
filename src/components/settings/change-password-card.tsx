'use client';

import { useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { KeyIcon, Loader2, CheckIcon, EyeIcon, EyeOffIcon } from 'lucide-react';

interface ChangePasswordCardProps {
  onNotification: (type: 'success' | 'error', message: string) => void;
}

export function ChangePasswordCard({ onNotification }: ChangePasswordCardProps) {
  const { user } = useUser();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changing, setChanging] = useState(false);
  const [succeeded, setSucceeded] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      onNotification('error', 'Please fill in all password fields'); return;
    }
    if (newPassword.length < 6) {
      onNotification('error', 'New password must be at least 6 characters'); return;
    }
    if (newPassword !== confirmPassword) {
      onNotification('error', 'New passwords do not match'); return;
    }
    if (currentPassword === newPassword) {
      onNotification('error', 'New password must be different from current password'); return;
    }

    try {
      setChanging(true);
      // Clerk verifies currentPassword and sets newPassword atomically
      await user!.updatePassword({ currentPassword, newPassword });
      onNotification('success', 'Password changed successfully!');
      setChanging(false);
      setSucceeded(true);
      await new Promise(r => setTimeout(r, 300));
      window.location.href = '/login';
    } catch (error: any) {
      const msg = error?.errors?.[0]?.longMessage ?? error?.errors?.[0]?.message ?? error.message ?? 'Failed to change password';
      onNotification('error', msg);
    } finally {
      setChanging(false);
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
        <div>
          <label className="text-sm font-medium mb-2 block">Current Password</label>
          <div className="relative">
            <input
              type={showCurrent ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              disabled={changing}
              className={`w-full px-4 py-2 pr-10 border rounded-lg bg-background disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary transition-all duration-300 ${showCurrent ? 'tracking-wide animate-reveal' : ''}`}
              autoComplete="current-password"
            />
            <button type="button" onClick={() => setShowCurrent(v => !v)} disabled={changing}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50" tabIndex={-1}>
              {showCurrent ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium mb-2 block">New Password</label>
          <div className="relative">
            <input
              type={showNew ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password (min. 6 characters)"
              disabled={changing}
              className={`w-full px-4 py-2 pr-10 border rounded-lg bg-background disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary transition-all duration-300 ${showNew ? 'tracking-wide animate-reveal' : ''}`}
              autoComplete="new-password"
            />
            <button type="button" onClick={() => setShowNew(v => !v)} disabled={changing}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50" tabIndex={-1}>
              {showNew ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium mb-2 block">Confirm New Password</label>
          <div className="relative">
            <input
              type={showConfirm ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              disabled={changing}
              className={`w-full px-4 py-2 pr-10 border rounded-lg bg-background disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary transition-all duration-300 ${showConfirm ? 'tracking-wide animate-reveal' : ''}`}
              autoComplete="new-password"
            />
            <button type="button" onClick={() => setShowConfirm(v => !v)} disabled={changing}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50" tabIndex={-1}>
              {showConfirm ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <Button onClick={handleChangePassword} disabled={changing || succeeded} className="w-full" size="lg">
          {changing ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-2" />Changing Password...</>
          ) : succeeded ? (
            <><CheckIcon className="h-4 w-4 mr-2" />Redirecting to login...</>
          ) : (
            'Change Password'
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
