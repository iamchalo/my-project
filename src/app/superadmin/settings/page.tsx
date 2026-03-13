'use client';

import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/auth-context';
import { useClerkSupabaseClient } from '@/lib/supabase/client';
import { UserIcon, ShieldIcon, DatabaseIcon, EyeIcon, Loader2, PrinterIcon, RefreshCwIcon } from 'lucide-react';
import { ThemeDropdown } from '@/components/ui/theme-dropdown';
import { connect as connectQZ, getPrinters } from '@/lib/printing/qz-tray';

export default function SuperadminSettingsPage() {
  const { profile } = useAuth();
  const supabase = useClerkSupabaseClient();

  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form state — initialised empty; synced from profile once it loads
  const [formData, setFormData] = useState({ full_name: '', phone: '' });

  // Printer state
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [printerBranch, setPrinterBranch] = useState('');
  const [availablePrinters, setAvailablePrinters] = useState<string[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState('');
  const [loadingPrinters, setLoadingPrinters] = useState(false);
  const [savingPrinter, setSavingPrinter] = useState(false);
  const [printerConfigs, setPrinterConfigs] = useState<Record<string, string>>({}); // branch_id -> printer_name

  useEffect(() => {
    if (profile) {
      setFormData({
        full_name: profile.full_name || '',
        phone: profile.phone || '',
      });
    }
  }, [profile]);

  // Load branches and existing printer configs
  useEffect(() => {
    const load = async () => {
      const { data: branchData } = await supabase
        .from('branches')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      if (branchData) setBranches(branchData);

      const { data: configs } = await supabase
        .from('printer_configs')
        .select('branch_id, printer_name')
        .eq('is_active', true);
      if (configs) {
        const map: Record<string, string> = {};
        configs.forEach((c: any) => { map[c.branch_id] = c.printer_name; });
        setPrinterConfigs(map);
      }
    };
    load();
  }, []);

  const handleLoadPrinters = async () => {
    setLoadingPrinters(true);
    setAvailablePrinters([]);
    try {
      const connected = await connectQZ();
      if (!connected) {
        showNotification('error', 'QZ Tray not running on this machine');
        return;
      }
      const list = await getPrinters();
      setAvailablePrinters(list);
      if (printerBranch && printerConfigs[printerBranch]) {
        setSelectedPrinter(printerConfigs[printerBranch]);
      }
    } catch {
      showNotification('error', 'Failed to load printers');
    } finally {
      setLoadingPrinters(false);
    }
  };

  const handleSavePrinter = async () => {
    if (!printerBranch || !selectedPrinter) {
      showNotification('error', 'Select a branch and printer');
      return;
    }
    setSavingPrinter(true);
    try {
      const { error } = await supabase.from('printer_configs').upsert({
        branch_id: printerBranch,
        printer_name: selectedPrinter,
        is_active: true,
      }, { onConflict: 'branch_id' });
      if (error) throw error;
      setPrinterConfigs(prev => ({ ...prev, [printerBranch]: selectedPrinter }));
      showNotification('success', 'Printer saved for branch');
    } catch {
      showNotification('error', 'Failed to save printer');
    } finally {
      setSavingPrinter(false);
    }
  };

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
  };

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

  return (
    <DashboardLayout userName={profile?.full_name || 'Superadmin'} userRole="superadmin">
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

          <div>
            <h1 className="text-4xl font-bold">System Settings</h1>
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
                  <label className="text-sm font-medium mb-2 block">Role</label>
                  <input
                    type="text"
                    value="Super Admin"
                    disabled
                    className="w-full px-4 py-2 border rounded-lg bg-gray-100 dark:bg-gray-800 cursor-not-allowed"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
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

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <ShieldIcon className="h-5 w-5" />
                <CardTitle>Security & Access Control</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Password Policy</p>
                  <p className="text-sm text-muted-foreground">Minimum 6 characters required</p>
                </div>
                <Button variant="outline">Configure</Button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Session Timeout</p>
                  <p className="text-sm text-muted-foreground">Auto logout after inactivity</p>
                </div>
                <select className="px-4 py-2 border rounded-lg bg-background">
                  <option>15 minutes</option>
                  <option>30 minutes</option>
                  <option>1 hour</option>
                  <option>4 hours</option>
                </select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <DatabaseIcon className="h-5 w-5" />
                <CardTitle>Database & Backup</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Automatic Backups</p>
                  <p className="text-sm text-muted-foreground">Managed by Supabase</p>
                </div>
                <Button variant="outline" disabled>Configured</Button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Database Status</p>
                  <p className="text-sm text-green-600">Connected</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Printer Settings */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <PrinterIcon className="h-5 w-5" />
                <CardTitle>Receipt Printer Settings</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Configure the receipt printer for each branch. QZ Tray must be running on the machine where printing happens.
              </p>

              {/* Existing configs summary */}
              {Object.keys(printerConfigs).length > 0 && (
                <div className="rounded-lg border p-3 space-y-1 bg-muted/30">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Configured Printers</p>
                  {branches.filter(b => printerConfigs[b.id]).map(b => (
                    <div key={b.id} className="flex justify-between text-sm">
                      <span className="font-medium">{b.name}</span>
                      <span className="text-muted-foreground">{printerConfigs[b.id]}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Branch</label>
                  <select
                    value={printerBranch}
                    onChange={e => { setPrinterBranch(e.target.value); setSelectedPrinter(printerConfigs[e.target.value] || ''); setAvailablePrinters([]); }}
                    className="w-full px-4 py-2 border rounded-lg bg-background"
                  >
                    <option value="">Select branch...</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}{printerConfigs[b.id] ? ` (${printerConfigs[b.id]})` : ''}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <Button
                    variant="outline"
                    onClick={handleLoadPrinters}
                    disabled={!printerBranch || loadingPrinters}
                    className="w-full gap-2"
                  >
                    {loadingPrinters ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCwIcon className="h-4 w-4" />}
                    {loadingPrinters ? 'Scanning...' : 'Scan Printers'}
                  </Button>
                </div>
              </div>

              {availablePrinters.length > 0 && (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Select Printer</label>
                    <select
                      value={selectedPrinter}
                      onChange={e => setSelectedPrinter(e.target.value)}
                      className="w-full px-4 py-2 border rounded-lg bg-background"
                    >
                      <option value="">Select printer...</option>
                      {availablePrinters.map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={handleSavePrinter} disabled={!selectedPrinter || savingPrinter} className="gap-2">
                      {savingPrinter ? <><Loader2 className="h-4 w-4 animate-spin" />Saving...</> : <><PrinterIcon className="h-4 w-4" />Save Printer</>}
                    </Button>
                  </div>
                </div>
              )}

              {availablePrinters.length === 0 && printerBranch && !loadingPrinters && (
                <p className="text-sm text-muted-foreground">Click "Scan Printers" to detect printers connected to this machine via QZ Tray.</p>
              )}
            </CardContent>
          </Card>

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
