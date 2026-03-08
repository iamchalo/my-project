'use client';

import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/auth-context';
import { useClerkSupabaseClient } from '@/lib/supabase/client';
import { UserIcon, Loader2, EyeIcon } from 'lucide-react';
import { ThemeDropdown } from '@/components/ui/theme-dropdown';
import { useNotification } from '@/components/ui/notification';

export default function ManagerSettingsPage() {
  const { profile, loading: authLoading } = useAuth();
  const supabase = useClerkSupabaseClient();
  const { showNotification } = useNotification();
  const [branchName, setBranchName] = useState('');
  const [loading, setLoading] = useState(false);

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

  if (authLoading || loading) {
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
                    value={profile?.full_name || ''}
                    readOnly
                    className="w-full px-4 py-2 border rounded-lg bg-gray-100 dark:bg-gray-800 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Email Address</label>
                  <input
                    type="email"
                    value={profile?.email || ''}
                    readOnly
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
                    value={profile?.phone || ''}
                    readOnly
                    className="w-full px-4 py-2 border rounded-lg bg-gray-100 dark:bg-gray-800 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Branch
                  </label>
                  <input
                    type="text"
                    value={branchName}
                    readOnly
                    className="w-full px-4 py-2 border rounded-lg bg-gray-100 dark:bg-gray-800 cursor-not-allowed"
                  />
                </div>
              </div>
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
