'use client';

import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth/auth-context';
import { useNotification } from '@/components/ui/notification';
import {
  MonitorIcon,
  SmartphoneIcon,
  TabletIcon,
  Loader2Icon,
  LogOutIcon,
  MapPinIcon,
} from 'lucide-react';

interface SessionEntry {
  id: string;
  isCurrent: boolean;
  status: string;
  lastActiveAt: number;
  createdAt: number;
  browserName: string | null;
  deviceType: string | null;
  isMobile: boolean;
  city: string | null;
  country: string | null;
  ipAddress: string | null;
}

function DeviceIcon({ isMobile, deviceType }: { isMobile: boolean; deviceType: string | null }) {
  if (isMobile) return <SmartphoneIcon className="h-5 w-5" />;
  if (deviceType?.toLowerCase().includes('tablet')) return <TabletIcon className="h-5 w-5" />;
  return <MonitorIcon className="h-5 w-5" />;
}

function formatWhen(ms: number): string {
  const d = new Date(ms);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${dd}/${mm}/${yyyy} ${time}`;
}

export default function SuperadminSecurityPage() {
  const { profile, signOut } = useAuth();
  const { showNotification } = useNotification();

  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmingLogoutAll, setConfirmingLogoutAll] = useState(false);
  const [loggingOutAll, setLoggingOutAll] = useState(false);
  const [kickingId, setKickingId] = useState<string | null>(null);

  const fetchSessions = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/security/sessions');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load sessions');
      const sorted = ((data.sessions || []) as SessionEntry[]).sort((a, b) => {
        const aActive = a.status === 'active';
        const bActive = b.status === 'active';
        if (aActive !== bActive) return aActive ? -1 : 1;
        return b.lastActiveAt - a.lastActiveAt;
      });
      setSessions(sorted);
    } catch (error: any) {
      showNotification('error', error?.message || 'Failed to load logged-in areas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleLogoutAll = async () => {
    try {
      setLoggingOutAll(true);
      const res = await fetch('/api/security/sessions/revoke-all', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to log out of all devices');

      showNotification('success', 'Logged out of all devices');
      setConfirmingLogoutAll(false);
      await signOut();
      window.location.href = '/login';
    } catch (error: any) {
      showNotification('error', error?.message || 'Failed to log out of all devices');
      setLoggingOutAll(false);
    }
  };

  const handleKickOut = async (sessionId: string) => {
    try {
      setKickingId(sessionId);
      const res = await fetch('/api/security/sessions/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to log out of that device');

      showNotification('success', 'Device logged out');
      await fetchSessions();
    } catch (error: any) {
      showNotification('error', error?.message || 'Failed to log out of that device');
    } finally {
      setKickingId(null);
    }
  };

  return (
    <DashboardLayout userName={profile?.full_name || 'Superadmin'} userRole="superadmin">
      {/* Logout-all confirmation modal */}
      {confirmingLogoutAll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg shadow-xl w-full max-w-sm mx-4 p-6 space-y-4">
            <h2 className="text-xl font-semibold text-destructive">Log out of all devices?</h2>
            <p className="text-sm text-muted-foreground">
              This will end every active session for your account, including this one. You&apos;ll need to sign in again.
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setConfirmingLogoutAll(false)} disabled={loggingOutAll}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleLogoutAll} disabled={loggingOutAll} className="gap-2">
                {loggingOutAll ? (
                  <><Loader2Icon className="h-4 w-4 animate-spin" />Logging out...</>
                ) : (
                  <><LogOutIcon className="h-4 w-4" />Log Out of All Devices</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          <div className="flex items-center justify-between">
            <h1 className="text-4xl font-bold">Security</h1>
            <Button
              variant="destructive"
              className="gap-2"
              onClick={() => setConfirmingLogoutAll(true)}
              disabled={loading || sessions.length === 0}
            >
              <LogOutIcon className="h-4 w-4" />
              Log Out of All Devices
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Logged-in Areas</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No login history found.</p>
              ) : (
                <div className="space-y-2">
                  {/* Column headers */}
                  <div className="hidden md:grid grid-cols-[minmax(0,1fr)_160px_180px_110px] gap-4 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    <span>Device / Location</span>
                    <span className="text-center">IP Address</span>
                    <span className="text-center">Last Active</span>
                    <span className="text-center">Status</span>
                  </div>

                  {sessions.map((s) => {
                    const isActive = s.status === 'active';
                    const location = [s.city, s.country].filter(Boolean).join(', ');
                    return (
                      <div
                        key={s.id}
                        className="relative grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_160px_180px_110px] items-center gap-4 rounded-lg border p-4 pr-10"
                      >
                        {isActive && !s.isCurrent && (
                          <button
                            type="button"
                            title="Log out this device"
                            aria-label="Log out this device"
                            onClick={() => handleKickOut(s.id)}
                            disabled={kickingId === s.id}
                            className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-50"
                          >
                            {kickingId === s.id ? (
                              <Loader2Icon className="h-4 w-4 animate-spin" />
                            ) : (
                              <LogOutIcon className="h-4 w-4" />
                            )}
                          </button>
                        )}

                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                            <DeviceIcon isMobile={s.isMobile} deviceType={s.deviceType} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 font-medium">
                              {s.browserName || 'Unknown browser'}
                              {s.deviceType ? ` · ${s.deviceType}` : ''}
                              {s.isCurrent && <Badge variant="secondary">This device</Badge>}
                            </div>
                            {location && (
                              <div className="text-sm text-muted-foreground flex items-center gap-1">
                                <MapPinIcon className="h-3.5 w-3.5" />
                                {location}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="text-sm text-center font-mono">
                          {s.ipAddress || '—'}
                        </div>

                        <div className="text-sm text-center text-muted-foreground">
                          {formatWhen(s.lastActiveAt)}
                        </div>

                        <div className="flex justify-center">
                          <Badge variant={isActive ? 'default' : 'secondary'}>
                            {isActive ? 'Active' : s.status}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
