'use client';

import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/auth-context';
import { createClient } from '@/lib/supabase/client';
import { UserIcon, KeyIcon, Loader2, EyeIcon } from 'lucide-react';
import { ThemeDropdown } from '@/components/ui/theme-dropdown';
import { useNotification } from '@/components/ui/notification';

export default function ManagerSettingsPage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const { showNotification } = useNotification();
  const [branchName, setBranchName] = useState('');
  const [loading, setLoading] = useState(true);

  // Password reset state
  const [sendingResetEmail, setSendingResetEmail] = useState(false);

  const handlePasswordReset = async () => {
    if (!profile?.email) {
      showNotification('error', 'Email address not found');
      return;
    }

    try {
      setSendingResetEmail(true);

      // Send password reset email
      const { error } = await supabase.auth.resetPasswordForEmail(profile.email, {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin}/reset-password`,
      });

      if (error) throw error;

      // Log the password reset request
      try {
        await supabase.from('password_change_logs').insert({
          user_id: profile.id,
          event_type: 'request',
          ip_address: null,
          user_agent: navigator.userAgent,
        });
      } catch (logError) {
        console.error('Failed to log password reset request:', logError);
      }

      showNotification('success', 'Password reset email sent! Check your inbox.');
    } catch (error: any) {
      console.error('Error sending reset email:', error);
      showNotification('error', error.message || 'Failed to send reset email');
    } finally {
      setSendingResetEmail(false);
    }
  };

  useEffect(() => {
    const fetchBranchName = async () => {
      if (!profile?.branch_id) {
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('branches')
          .select('name')
          .eq('id', profile.branch_id)
          .single();

        if (error) throw error;
        setBranchName(data?.name || '');
      } catch (error) {
        console.error('Error fetching branch:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchBranchName();
  }, [profile?.branch_id]);

  if (loading) {
    return (
      <DashboardLayout userName={profile?.full_name || 'Manager'} userRole="manager">
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userName={profile?.full_name || 'Manager'} userRole="manager">
      <div className="p-8">
        <div className="max-w-4xl mx-auto space-y-8">
          <div>
            <h1 className="text-4xl font-bold">Settings</h1>
            <p className="text-muted-foreground">
              Manage your profile settings
            </p>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <UserIcon className="h-5 w-5" />
                <CardTitle>Profile Information</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Full Name</label>
                  <input
                    type="text"
                    defaultValue={profile?.full_name || ''}
                    disabled
                    className="w-full px-4 py-2 border rounded-lg bg-gray-100 dark:bg-gray-800 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Email Address</label>
                  <input
                    type="email"
                    defaultValue={profile?.email || ''}
                    disabled
                    className="w-full px-4 py-2 border rounded-lg bg-gray-100 dark:bg-gray-800 cursor-not-allowed"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    defaultValue={profile?.phone || ''}
                    disabled
                    className="w-full px-4 py-2 border rounded-lg bg-gray-100 dark:bg-gray-800 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Branch
                  </label>
                  <input
                    type="text"
                    defaultValue={branchName}
                    disabled
                    className="w-full px-4 py-2 border rounded-lg bg-gray-100 dark:bg-gray-800 cursor-not-allowed"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <KeyIcon className="h-5 w-5" />
                <CardTitle>Reset Password</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  For security reasons, password changes require email verification. Click the button below to receive a password reset link at <strong>{profile?.email}</strong>.
                </p>
                <ul className="mt-2 text-xs text-blue-700 dark:text-blue-300 list-disc list-inside space-y-1">
                  <li>Reset link expires in 30 minutes</li>
                  <li>You will be signed out from all devices after reset</li>
                  <li>Check your spam folder if you don't see the email</li>
                </ul>
              </div>

              <Button
                onClick={handlePasswordReset}
                disabled={sendingResetEmail}
                className="w-full"
                size="lg"
              >
                {sendingResetEmail ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Sending Reset Email...
                  </>
                ) : (
                  'Send Password Reset Email'
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Display Settings */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <EyeIcon className="h-5 w-5" />
                <CardTitle>Display Settings</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Theme</p>
                  <p className="text-sm text-muted-foreground">
                    Switch between light and dark theme
                  </p>
                </div>
                <ThemeDropdown />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
