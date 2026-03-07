'use client';

import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/auth-context';
import { createClient } from '@/lib/supabase/client';
import { UserIcon, KeyIcon, EyeIcon, Loader2 } from 'lucide-react';
import { ThemeDropdown } from '@/components/ui/theme-dropdown';
import { Skeleton } from '@/components/ui/skeleton';

export default function CashierSettingsPage() {
  const { profile, loading: authLoading } = useAuth();
  const supabase = createClient();

  const [branchName, setBranchName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingResetEmail, setSendingResetEmail] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    full_name: profile?.full_name || '',
    phone: profile?.phone || '',
  });

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
  };

  // Fetch branch name
  useEffect(() => {
    if (authLoading) return;
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
  }, [authLoading, profile?.branch_id]);

  // Update form data when profile loads
  useEffect(() => {
    if (profile) {
      setFormData({
        full_name: profile.full_name || '',
        phone: profile.phone || '',
      });
    }
  }, [profile]);

  const handleSaveProfile = async () => {
    if (!profile?.id) return;

    try {
      setSaving(true);
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: formData.full_name.trim(),
          phone: formData.phone.trim() || null,
        })
        .eq('id', profile.id);

      if (error) throw error;
      showNotification('success', 'Profile updated successfully');
    } catch (error) {
      console.error('Error updating profile:', error);
      showNotification('error', 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!profile?.email) {
      showNotification('error', 'Email address not found');
      return;
    }

    try {
      setSendingResetEmail(true);
      const { error } = await supabase.auth.resetPasswordForEmail(profile.email, {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin}/reset-password`,
      });

      if (error) throw error;
      showNotification('success', 'Password reset email sent! Check your inbox.');
    } catch (error: any) {
      console.error('Error sending reset email:', error);
      showNotification('error', error.message || 'Failed to send reset email');
    } finally {
      setSendingResetEmail(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout userName={profile?.full_name || 'Cashier'} userRole="cashier">
        <div className="h-full flex flex-col">
          {/* Header Skeleton */}
          <div className="px-8 pt-6 pb-4 border-b">
            <Skeleton className="h-8 w-40 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>

          {/* Content Skeleton */}
          <div className="flex-1 p-6">
            <div className="max-w-2xl space-y-6">
              {/* Account Info Card Skeleton */}
              <Card>
                <CardHeader>
                  <Skeleton className="h-6 w-48" />
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                </CardContent>
              </Card>

              {/* Password Card Skeleton */}
              <Card>
                <CardHeader>
                  <Skeleton className="h-6 w-40" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-10 w-40" />
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userName={profile?.full_name || 'Cashier'} userRole="cashier">
      <div className="p-8">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Notification */}
          {notification && (
            <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 rounded-lg shadow-lg ${
              notification.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
            }`}>
              {notification.message}
            </div>
          )}

          {/* Header */}
          <div>
            <h1 className="text-4xl font-bold">Settings</h1>
            <p className="text-muted-foreground">
              Manage your profile and preferences
            </p>
          </div>

          {/* Profile Settings */}
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
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg bg-background"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Email Address</label>
                  <input
                    type="email"
                    value={profile?.email || ''}
                    disabled
                    className="w-full px-4 py-2 border rounded-lg bg-gray-100 dark:bg-gray-800 cursor-not-allowed"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Phone Number</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+254 712 345 678"
                    className="w-full px-4 py-2 border rounded-lg bg-background"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Branch</label>
                  <input
                    type="text"
                    value={branchName}
                    disabled
                    className="w-full px-4 py-2 border rounded-lg bg-gray-100 dark:bg-gray-800 cursor-not-allowed"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setFormData({ full_name: profile?.full_name || '', phone: profile?.phone || '' })}>
                  Cancel
                </Button>
                <Button onClick={handleSaveProfile} disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Password Reset */}
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
