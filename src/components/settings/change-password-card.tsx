'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { KeyIcon, Loader2, CheckIcon } from 'lucide-react';

interface ChangePasswordCardProps {
  email: string;
  onNotification: (type: 'success' | 'error', message: string) => void;
}

export function ChangePasswordCard({ email, onNotification }: ChangePasswordCardProps) {
  const supabase = createClient();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changing, setChanging] = useState(false);
  const [succeeded, setSucceeded] = useState(false);

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      onNotification('error', 'Please fill in all password fields');
      return;
    }

    if (newPassword.length < 6) {
      onNotification('error', 'New password must be at least 6 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      onNotification('error', 'New passwords do not match');
      return;
    }

    if (currentPassword === newPassword) {
      onNotification('error', 'New password must be different from current password');
      return;
    }

    try {
      setChanging(true);

      // Verify current password using the shared client
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });

      if (verifyError) {
        onNotification('error', 'Current password is incorrect');
        return;
      }

      // Update password on the main (authenticated) client
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) throw updateError;

      onNotification('success', 'Password changed successfully!');
      setChanging(false);
      setSucceeded(true);

      // Clear session and sign out immediately
      try { await supabase.rpc('clear_active_session'); } catch {}
      localStorage.removeItem('pos-session-id');
      await supabase.auth.signOut({ scope: 'global' });

      // Brief pause so the success state is visible before navigating
      await new Promise(r => setTimeout(r, 300));
      window.location.href = '/login';
    } catch (error: any) {
      console.error('Error changing password:', error);
      onNotification('error', error.message || 'Failed to change password');
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
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Enter current password"
            disabled={changing}
            className="w-full px-4 py-2 border rounded-lg bg-background disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary"
            autoComplete="current-password"
          />
        </div>
        <div>
          <label className="text-sm font-medium mb-2 block">New Password</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Enter new password (min. 6 characters)"
            disabled={changing}
            className="w-full px-4 py-2 border rounded-lg bg-background disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary"
            autoComplete="new-password"
          />
        </div>
        <div>
          <label className="text-sm font-medium mb-2 block">Confirm New Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter new password"
            disabled={changing}
            className="w-full px-4 py-2 border rounded-lg bg-background disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary"
            autoComplete="new-password"
          />
        </div>

        <Button
          onClick={handleChangePassword}
          disabled={changing || succeeded}
          className="w-full"
          size="lg"
        >
          {changing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Changing Password...
            </>
          ) : succeeded ? (
            <>
              <CheckIcon className="h-4 w-4 mr-2" />
              Redirecting to login...
            </>
          ) : (
            'Change Password'
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
