'use client';

import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/auth/auth-context';
import { useClerkSupabaseClient } from '@/lib/supabase/client';
import { getKenyaDateString } from '@/lib/date-utils';
import { ActivityIcon, LogInIcon, LogOutIcon, UsersIcon, Loader2 } from 'lucide-react';

interface AuthLog {
  id: string;
  user_id: string;
  user_name: string;
  role: string;
  branch: string | null;
  action: 'login' | 'logout';
  created_at: string;
}

export default function SuperadminLogsPage() {
  const { profile, loading: authLoading } = useAuth();
  const supabase = useClerkSupabaseClient();

  const [loading, setLoading]           = useState(true);
  const [logs, setLogs]                 = useState<AuthLog[]>([]);
  const [selectedDate, setSelectedDate] = useState(getKenyaDateString());
  const [selectedAction, setSelectedAction] = useState<string>('all');
  const [selectedRole, setSelectedRole]     = useState<string>('all');

  useEffect(() => { if (!authLoading) fetchLogs(); }, [authLoading, selectedDate, selectedAction, selectedRole]);

  const fetchLogs = async () => {
    try {
      setLoading(true);

      let query = supabase
        .from('auth_logs')
        .select('id, user_id, user_name, role, branch, action, created_at')
        // Superadmins must not see other superadmins' activity
        .neq('role', 'superadmin')
        .gte('created_at', `${selectedDate}T00:00:00`)
        .lte('created_at', `${selectedDate}T23:59:59`)
        .order('created_at', { ascending: false });

      if (selectedAction !== 'all') query = query.eq('action', selectedAction);
      if (selectedRole !== 'all') query = query.eq('role', selectedRole);

      const { data, error } = await query;
      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error('Error fetching auth logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = logs;

  const loginCount    = filteredLogs.filter(l => l.action === 'login').length;
  const logoutCount   = filteredLogs.filter(l => l.action === 'logout').length;
  const uniqueUsers   = new Set(filteredLogs.map(l => l.user_id)).size;

  const fmtTime = (ts: string) =>
    new Date(ts).toLocaleString('en-KE', {
      timeZone: 'Africa/Nairobi',
      dateStyle: 'short',
      timeStyle: 'medium',
    });

  const roleColors: Record<string, string> = {
    cashier:  'bg-blue-100   text-blue-800   dark:bg-blue-900/30   dark:text-blue-300',
    manager:  'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
    admin:    'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  };

  if (loading) {
    return (
      <DashboardLayout userName={profile?.full_name || 'Superadmin'} userRole="superadmin">
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userName={profile?.full_name || 'Superadmin'} userRole="superadmin">
      <div className="p-8">
        <div className="max-w-7xl mx-auto space-y-8">

          {/* Header */}
          <div>
            <h1 className="text-4xl font-bold">System Logs</h1>
            <p className="text-muted-foreground">User authentication activity across all branches</p>
          </div>

          {/* Stats */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="p-6 flex items-center gap-4">
                <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <ActivityIcon className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Events</p>
                  <p className="text-2xl font-bold">{filteredLogs.length}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 flex items-center gap-4">
                <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
                  <LogInIcon className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Logins</p>
                  <p className="text-2xl font-bold">{loginCount}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 flex items-center gap-4">
                <div className="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                  <UsersIcon className="h-6 w-6 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Unique Users</p>
                  <p className="text-2xl font-bold">{uniqueUsers}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card>
            <CardHeader><CardTitle>Filter Logs</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Date</label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={e => { setSelectedDate(e.target.value); }}
                    className="w-full px-4 py-2 border rounded-lg bg-background"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Action</label>
                  <select
                    value={selectedAction}
                    onChange={e => setSelectedAction(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg bg-background"
                  >
                    <option value="all">All Actions</option>
                    <option value="login">Login</option>
                    <option value="logout">Logout</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Role</label>
                  <select
                    value={selectedRole}
                    onChange={e => setSelectedRole(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg bg-background"
                  >
                    <option value="all">All Roles</option>
                    <option value="cashier">Cashier</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Logs Table */}
          {filteredLogs.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No authentication logs found for this date.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Authentication Events ({filteredLogs.length})</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left px-4 py-3 font-medium">User</th>
                        <th className="text-left px-4 py-3 font-medium">Role</th>
                        <th className="text-left px-4 py-3 font-medium">Branch</th>
                        <th className="text-left px-4 py-3 font-medium">Action</th>
                        <th className="text-left px-4 py-3 font-medium">Date & Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLogs.map(log => (
                        <tr key={log.id} className="border-b hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 font-medium">{log.user_name}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded text-xs font-medium capitalize ${roleColors[log.role] || 'bg-gray-100 text-gray-800'}`}>
                              {log.role}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {log.branch || '—'}
                          </td>
                          <td className="px-4 py-3">
                            {log.action === 'login' ? (
                              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                                <LogInIcon className="h-3 w-3" />
                                Login
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                                <LogOutIcon className="h-3 w-3" />
                                Logout
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{fmtTime(log.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

        </div>
      </div>
    </DashboardLayout>
  );
}
