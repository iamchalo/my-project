'use client';

import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Printer, Plus, Pencil, Trash2, Wifi, WifiOff, FlaskConical } from 'lucide-react';
import { useClerkSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth/auth-context';
import { Notification, useNotification } from '@/components/ui/notification';
import { connect as connectQZ, isConnected, getPrinters, printReceipt } from '@/lib/printing/qz-tray';

interface Branch {
  id: string;
  name: string;
}

interface PrinterConfig {
  id: string;
  branch_id: string;
  printer_name: string;
  paper_size: '58mm' | '80mm';
  is_active: boolean;
  notes: string | null;
  created_at: string;
  branch?: Branch;
}

interface FormState {
  branch_id: string;
  printer_name: string;
  paper_size: '58mm' | '80mm';
  is_active: boolean;
  notes: string;
}

const emptyForm: FormState = {
  branch_id: '',
  printer_name: '',
  paper_size: '80mm',
  is_active: true,
  notes: '',
};

export default function PrintersPage() {
  const { profile } = useAuth();
  const supabase = useClerkSupabaseClient();
  const { notification, showNotification, hideNotification } = useNotification();

  const [configs, setConfigs] = useState<PrinterConfig[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [qzConnected, setQzConnected] = useState(false);
  const [availablePrinters, setAvailablePrinters] = useState<string[]>([]);
  const [checkingQZ, setCheckingQZ] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [{ data: branchData }, { data: configData }] = await Promise.all([
        supabase.from('branches').select('id, name').order('name'),
        supabase
          .from('printer_configs')
          .select('*, branch:branches(id, name)')
          .order('created_at', { ascending: false }),
      ]);
      setBranches(branchData || []);
      setConfigs((configData as PrinterConfig[]) || []);
    } catch {
      showNotification('error', 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const checkQZStatus = async () => {
    setCheckingQZ(true);
    try {
      const connected = await connectQZ();
      setQzConnected(connected);
      if (connected) {
        const printers = await getPrinters();
        setAvailablePrinters(printers);
      }
    } finally {
      setCheckingQZ(false);
    }
  };

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (config: PrinterConfig) => {
    setEditingId(config.id);
    setForm({
      branch_id: config.branch_id,
      printer_name: config.printer_name,
      paper_size: config.paper_size,
      is_active: config.is_active,
      notes: config.notes || '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.branch_id || !form.printer_name.trim()) {
      showNotification('error', 'Branch and printer name are required');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        const { error } = await supabase
          .from('printer_configs')
          .update({
            branch_id: form.branch_id,
            printer_name: form.printer_name.trim(),
            paper_size: form.paper_size,
            is_active: form.is_active,
            notes: form.notes || null,
          })
          .eq('id', editingId);
        if (error) throw error;
        showNotification('success', 'Printer config updated');
      } else {
        const { error } = await supabase.from('printer_configs').insert({
          branch_id: form.branch_id,
          printer_name: form.printer_name.trim(),
          paper_size: form.paper_size,
          is_active: form.is_active,
          notes: form.notes || null,
        });
        if (error) throw error;
        showNotification('success', 'Printer config added');
      }
      setShowModal(false);
      fetchData();
    } catch {
      showNotification('error', 'Failed to save printer config');
    } finally {
      setSaving(false);
    }
  };

  const handleTestPrint = async (config: PrinterConfig) => {
    const connected = await connectQZ();
    if (!connected) {
      showNotification('error', 'QZ Tray not connected — open QZ Tray app first');
      return;
    }
    const now = new Date();
    const lines = [
      '',
      '========================================',
      '          ** TEST PRINT **',
      '========================================',
      `Branch  : ${config.branch?.name || config.branch_id}`,
      `Printer : ${config.printer_name}`,
      `Paper   : ${config.paper_size}`,
      `Time    : ${now.toLocaleString('en-KE')}`,
      '----------------------------------------',
      'If you can read this, printing works!',
      '========================================',
      '',
      '',
      '',
    ];
    await printReceipt(config.printer_name, lines);
    showNotification('success', `Test sent to "${config.printer_name}"`);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this printer config?')) return;
    const { error } = await supabase.from('printer_configs').delete().eq('id', id);
    if (error) {
      showNotification('error', 'Failed to delete');
    } else {
      showNotification('success', 'Deleted');
      fetchData();
    }
  };

  return (
    <DashboardLayout userName={profile?.full_name || 'Superadmin'} userRole="superadmin">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Printer className="h-7 w-7" />
              Printers
            </h1>
          </div>
          <Button onClick={openAdd} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Printer
          </Button>
        </div>

        {/* QZ Tray Status */}
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {qzConnected ? (
                <Wifi className="h-5 w-5 text-green-500" />
              ) : (
                <WifiOff className="h-5 w-5 text-muted-foreground" />
              )}
              <div>
                <p className="font-medium text-sm">
                  QZ Tray: {qzConnected ? 'Connected' : 'Not connected'}
                </p>
                {qzConnected && availablePrinters.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {availablePrinters.length} printer(s) found: {availablePrinters.join(', ')}
                  </p>
                )}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={checkQZStatus} disabled={checkingQZ}>
              {checkingQZ ? 'Checking...' : 'Check Status'}
            </Button>
          </CardContent>
        </Card>

        {/* Printer Configs Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Branch Printer Configs</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 text-center text-muted-foreground">Loading...</div>
            ) : configs.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">
                No printer configs yet. Add one above.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b">
                    <tr className="text-left text-muted-foreground">
                      <th className="px-4 py-3 font-medium">Branch</th>
                      <th className="px-4 py-3 font-medium">Printer Name</th>
                      <th className="px-4 py-3 font-medium">Paper</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Notes</th>
                      <th className="px-4 py-3 font-medium">Test</th>
                      <th className="px-4 py-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {configs.map((cfg) => (
                      <tr key={cfg.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">{cfg.branch?.name || cfg.branch_id}</td>
                        <td className="px-4 py-3">{cfg.printer_name}</td>
                        <td className="px-4 py-3">{cfg.paper_size}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              cfg.is_active
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {cfg.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{cfg.notes || '—'}</td>
                        <td className="px-4 py-3">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleTestPrint(cfg)}
                            className="h-8 gap-1.5 text-xs"
                          >
                            <FlaskConical className="h-3.5 w-3.5" />
                            Test Print
                          </Button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEdit(cfg)}
                              className="h-8 w-8 p-0"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(cfg.id)}
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
            <h2 className="text-lg font-semibold">
              {editingId ? 'Edit Printer Config' : 'Add Printer Config'}
            </h2>

            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Branch</label>
                <select
                  className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.branch_id}
                  onChange={(e) => setForm((f) => ({ ...f, branch_id: e.target.value }))}
                >
                  <option value="">Select branch...</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium">Printer Name</label>
                {qzConnected && availablePrinters.length > 0 ? (
                  <select
                    className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.printer_name}
                    onChange={(e) => setForm((f) => ({ ...f, printer_name: e.target.value }))}
                  >
                    <option value="">Select printer...</option>
                    {availablePrinters.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    placeholder="e.g. EPSON TM-T82"
                    value={form.printer_name}
                    onChange={(e) => setForm((f) => ({ ...f, printer_name: e.target.value }))}
                  />
                )}
                {!qzConnected && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Connect QZ Tray to pick from available printers
                  </p>
                )}
              </div>

              <div>
                <label className="text-sm font-medium">Paper Size</label>
                <select
                  className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.paper_size}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, paper_size: e.target.value as '58mm' | '80mm' }))
                  }
                >
                  <option value="80mm">80mm</option>
                  <option value="58mm">58mm</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={form.is_active}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                  className="rounded"
                />
                <label htmlFor="is_active" className="text-sm font-medium">
                  Active
                </label>
              </div>

              <div>
                <label className="text-sm font-medium">Notes (optional)</label>
                <input
                  type="text"
                  className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="e.g. Counter printer"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={saving} className="flex-1">
                {saving ? 'Saving...' : 'Save'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowModal(false)}
                disabled={saving}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {notification && (
        <Notification
          type={notification.type}
          message={notification.message}
          onClose={hideNotification}
        />
      )}
    </DashboardLayout>
  );
}
