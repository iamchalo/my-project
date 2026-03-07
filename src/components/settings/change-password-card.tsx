'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { KeyIcon, Loader2, CheckCircle2 } from 'lucide-react';

interface ChangePasswordCardProps {
  onNotification: (type: 'success' | 'error', message: string) => void;
}

export function ChangePasswordCard({ onNotification }: ChangePasswordCardProps) {
  const supabase = createClient();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changing, setChanging] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) {
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

    try {
      setChanging(true);
      setSuccess(false);

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) throw updateError;

      // Clear form and show success
      setNewPassword('');
      setConfirmPassword('');
      setSuccess(true);
      onNotification('success', 'Password changed successfully!');

      // Hide success state after a few seconds
      setTimeout(() => setSuccess(false), 5000);
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
        {success && (
          <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
            <p className="text-sm text-green-800 dark:text-green-200">
              Your password has been changed successfully.
            </p>
          </div>
        )}

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
          disabled={changing}
          className="w-full"
          size="lg"
        >
          {changing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Changing Password...
            </>
          ) : (
            'Change Password'
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
