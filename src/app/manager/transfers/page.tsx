'use client';

import { useState, useEffect, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/auth-context';
import { useClerkSupabaseClient } from '@/lib/supabase/client';
import { getKenyaDateString } from '@/lib/date-utils';
import {
  PlusIcon, Loader2Icon, XIcon, RefreshCwIcon,
  ClockIcon, TruckIcon, CheckCircleIcon, SearchIcon,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type TransferStatus = 'pending' | 'in_transit' | 'approved';

interface Branch { id: string; name: string; }

interface Transfer {
  id: string;
  transfer_id: string;
  item: string;
  price: number;
  quantity: number;
  from_branch: string;
  from_branch_name: string;
  to_branch: string;
  to_branch_name: string;
  transfer_date: string;
  status: TransferStatus;
  created_by: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PRESET_ITEMS = [
  'Serviettes', 'Cling Film', 'Foil', 'Dunes', 'Salt',
  'Tomato Takeaway', 'Tomato Table', 'Coffee Products',
  'Chicken', 'Sausage', 'Burger', 'Hot Dog', 'Spices',
  'Juice', 'Potatoes', 'Toothpicks', 'Onions',
];

const STATUS_LABELS: Record<TransferStatus, string> = {
  pending: 'Pending',
  in_transit: 'In Transit',
  approved: 'Approved',
};

const STATUS_COLORS: Record<TransferStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  in_transit: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
};

const inputCls = 'px-3 py-2 border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ManagerTransfersPage() {
  const { profile } = useAuth();
  const supabase = useClerkSupabaseClient();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDirection, setFilterDirection] = useState('all'); // all | sent | received

  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form state
  const [itemSelect, setItemSelect] = useState('');
  const [itemCustom, setItemCustom] = useState('');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [toBranch, setToBranch] = useState('');

  const showNotif = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  // ─── Fetch ──────────────────────────────────────────────────────────────────

  const fetchBranches = async () => {
    const { data } = await supabase.from('branches').select('id, name').eq('is_active', true).order('name');
    setBranches(data || []);
  };

  const fetchTransfers = async () => {
    if (!profile?.branch_id) return;
    const { data, error } = await supabase
      .from('transfers')
      .select(`
        id, transfer_id, item, price, quantity,
        from_branch, to_branch, transfer_date, status, created_by,
        from_branch_info:branches!from_branch(name),
        to_branch_info:branches!to_branch(name)
      `)
      .or(`from_branch.eq.${profile.branch_id},to_branch.eq.${profile.branch_id}`)
      .order('transfer_date', { ascending: false });

    if (error) { showNotif('error', 'Failed to load transfers'); return; }

    setTransfers((data || []).map((row: any) => ({
      id: row.id,
      transfer_id: row.transfer_id,
      item: row.item,
      price: row.price,
      quantity: row.quantity,
      from_branch: row.from_branch,
      from_branch_name: row.from_branch_info?.name ?? '—',
      to_branch: row.to_branch,
      to_branch_name: row.to_branch_info?.name ?? '—',
      transfer_date: row.transfer_date,
      status: row.status,
      created_by: row.created_by,
    })));
  };

  useEffect(() => {
    if (!profile?.branch_id) return;
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchBranches(), fetchTransfers()]);
      setLoading(false);
    };
    init();

    const sub = supabase
      .channel('manager_transfers_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transfers' }, fetchTransfers)
      .subscribe();

    return () => { sub.unsubscribe(); };
  }, [profile?.branch_id]);

  // ─── Filtered list ──────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return transfers.filter(t => {
      if (search && !t.item.toLowerCase().includes(search.toLowerCase()) && !t.transfer_id.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterDate && t.transfer_date !== filterDate) return false;
      if (filterStatus !== 'all' && t.status !== filterStatus) return false;
      if (filterDirection === 'sent' && t.from_branch !== profile?.branch_id) return false;
      if (filterDirection === 'received' && t.to_branch !== profile?.branch_id) return false;
      return true;
    });
  }, [transfers, search, filterDate, filterStatus, filterDirection, profile?.branch_id]);

  // ─── Stats ──────────────────────────────────────────────────────────────────

  const pendingCount = transfers.filter(t => t.status === 'pending').length;
  const inTransitCount = transfers.filter(t => t.status === 'in_transit').length;
  const approvedCount = transfers.filter(t => t.status === 'approved').length;

  // ─── Create ─────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalItem = itemSelect === '__custom__' ? itemCustom.trim() : itemSelect;
    if (!finalItem) { showNotif('error', 'Please specify an item'); return; }
    if (!price || parseFloat(price) < 0) { showNotif('error', 'Enter a valid price'); return; }
    if (!quantity || parseInt(quantity) < 1) { showNotif('error', 'Enter a valid quantity'); return; }
    if (!toBranch) { showNotif('error', 'Select a receiving branch'); return; }
    if (toBranch === profile?.branch_id) { showNotif('error', 'Cannot transfer to your own branch'); return; }

    setSubmitting(true);
    try {
      const { error } = await supabase.from('transfers').insert({
        item: finalItem,
        price: parseFloat(price),
        quantity: parseInt(quantity),
        from_branch: profile!.branch_id,
        to_branch: toBranch,
        transfer_date: getKenyaDateString(),
        status: 'pending',
        created_by: profile!.id,
      });
      if (error) throw error;
      showNotif('success', 'Transfer created successfully');
      setItemSelect(''); setItemCustom(''); setPrice(''); setQuantity(''); setToBranch('');
      setShowForm(false);
      await fetchTransfers();
    } catch (err: any) {
      showNotif('error', err.message || 'Failed to create transfer');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Update status ──────────────────────────────────────────────────────────

  const updateStatus = async (transfer: Transfer, newStatus: TransferStatus) => {
    if (profile?.branch_id !== transfer.to_branch) return;
    setUpdatingId(transfer.id);
    try {
      const { error } = await supabase.from('transfers').update({ status: newStatus }).eq('id', transfer.id);
      if (error) throw error;
      showNotif('success', `Transfer marked as ${STATUS_LABELS[newStatus]}`);
      await fetchTransfers();
    } catch {
      showNotif('error', 'Failed to update status');
    } finally {
      setUpdatingId(null);
    }
  };

  const isSender   = (t: Transfer) => t.from_branch === profile?.branch_id;
  const isReceiver = (t: Transfer) => t.to_branch   === profile?.branch_id;
  const receivableBranches = branches.filter(b => b.id !== profile?.branch_id);
  const fromBranchName = branches.find(b => b.id === profile?.branch_id)?.name ?? '—';

  const fmtDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout userName={profile?.full_name || 'Manager'} userRole="manager">
      {notification && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-lg shadow-lg text-white ${notification.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
          {notification.message}
        </div>
      )}

      <div className="p-8">
        <div className="max-w-7xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold">Stock Transfers</h1>
              <p className="text-muted-foreground mt-1">Send and receive stock between branches</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={fetchTransfers}>
                <RefreshCwIcon className="h-4 w-4" />
              </Button>
              <Button onClick={() => setShowForm(v => !v)} className="gap-2">
                {showForm ? <XIcon className="h-4 w-4" /> : <PlusIcon className="h-4 w-4" />}
                {showForm ? 'Cancel' : 'New Transfer'}
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { label: 'Pending', count: pendingCount, icon: ClockIcon, color: 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30' },
              { label: 'In Transit', count: inTransitCount, icon: TruckIcon, color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30' },
              { label: 'Approved', count: approvedCount, icon: CheckCircleIcon, color: 'text-green-600 bg-green-100 dark:bg-green-900/30' },
            ].map(({ label, count, icon: Icon, color }) => (
              <Card key={label}>
                <CardContent className="pt-5">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-lg ${color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{count}</p>
                      <p className="text-sm text-muted-foreground">{label}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* New Transfer Form */}
          {showForm && (
            <Card>
              <CardHeader><CardTitle>Create Transfer</CardTitle></CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium mb-2 block">From Branch</label>
                      <input value={fromBranchName} readOnly className="w-full px-4 py-2 border rounded-lg bg-muted cursor-not-allowed text-sm" />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-2 block">To Branch *</label>
                      <select value={toBranch} onChange={e => setToBranch(e.target.value)} className="w-full px-4 py-2 border rounded-lg bg-background text-sm" required>
                        <option value="">Select receiving branch...</option>
                        {receivableBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-2 block">Item *</label>
                      <select value={itemSelect} onChange={e => setItemSelect(e.target.value)} className="w-full px-4 py-2 border rounded-lg bg-background text-sm" required={itemSelect !== '__custom__'}>
                        <option value="">Select item...</option>
                        {PRESET_ITEMS.map(item => <option key={item} value={item}>{item}</option>)}
                        <option value="__custom__">Other (type manually)</option>
                      </select>
                    </div>
                    {itemSelect === '__custom__' && (
                      <div>
                        <label className="text-sm font-medium mb-2 block">Item Name *</label>
                        <input type="text" value={itemCustom} onChange={e => setItemCustom(e.target.value)} placeholder="Enter item name" className="w-full px-4 py-2 border rounded-lg bg-background text-sm" required />
                      </div>
                    )}
                    <div>
                      <label className="text-sm font-medium mb-2 block">Price (KSh) *</label>
                      <input type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" className="w-full px-4 py-2 border rounded-lg bg-background text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" required />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-2 block">Quantity *</label>
                      <input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="0" className="w-full px-4 py-2 border rounded-lg bg-background text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" required />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-2 block">Transfer Date</label>
                      <input value={getKenyaDateString()} readOnly className="w-full px-4 py-2 border rounded-lg bg-muted cursor-not-allowed text-sm" />
                    </div>
                  </div>
                  <div className="flex justify-end pt-2">
                    <Button type="submit" disabled={submitting} className="gap-2">
                      {submitting && <Loader2Icon className="h-4 w-4 animate-spin" />}
                      {submitting ? 'Submitting...' : 'Submit Transfer'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-end">
            <div className="relative">
              <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search item or ID..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className={`${inputCls} pl-8 w-48`}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Date</label>
              <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Direction</label>
              <select value={filterDirection} onChange={e => setFilterDirection(e.target.value)} className={inputCls}>
                <option value="all">All</option>
                <option value="sent">Sent</option>
                <option value="received">Received</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={inputCls}>
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="in_transit">In Transit</option>
                <option value="approved">Approved</option>
              </select>
            </div>
            {(search || filterDate || filterStatus !== 'all' || filterDirection !== 'all') && (
              <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setFilterDate(''); setFilterStatus('all'); setFilterDirection('all'); }}>
                Clear filters
              </Button>
            )}
          </div>

          {/* Table */}
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-4 py-3 font-medium text-xs uppercase text-muted-foreground">Transfer ID</th>
                    <th className="text-left px-4 py-3 font-medium text-xs uppercase text-muted-foreground">Item</th>
                    <th className="text-right px-4 py-3 font-medium text-xs uppercase text-muted-foreground">Price</th>
                    <th className="text-right px-4 py-3 font-medium text-xs uppercase text-muted-foreground">Qty</th>
                    <th className="text-left px-4 py-3 font-medium text-xs uppercase text-muted-foreground">From</th>
                    <th className="text-left px-4 py-3 font-medium text-xs uppercase text-muted-foreground">To</th>
                    <th className="text-left px-4 py-3 font-medium text-xs uppercase text-muted-foreground">Date</th>
                    <th className="text-left px-4 py-3 font-medium text-xs uppercase text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-xs uppercase text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={9} className="text-center py-16"><Loader2Icon className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={9} className="text-center py-16 text-muted-foreground">No transfers found</td></tr>
                  ) : filtered.map(t => (
                    <tr key={t.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{t.transfer_id}</td>
                      <td className="px-4 py-3 font-medium">{t.item}</td>
                      <td className="px-4 py-3 text-right">
                        KSh {Number(t.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right">{t.quantity}</td>
                      <td className="px-4 py-3">
                        <span className={isSender(t) ? 'font-medium text-primary' : 'text-muted-foreground'}>{t.from_branch_name}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={isReceiver(t) ? 'font-medium text-primary' : 'text-muted-foreground'}>{t.to_branch_name}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtDate(t.transfer_date)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[t.status]}`}>
                          {STATUS_LABELS[t.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {isSender(t) && !isReceiver(t) && <span className="text-xs text-muted-foreground">—</span>}
                        {isReceiver(t) && !isSender(t) && (
                          <div className="flex gap-2">
                            {t.status === 'pending' && (
                              <Button size="sm" variant="outline" disabled={updatingId === t.id} onClick={() => updateStatus(t, 'in_transit')}>
                                {updatingId === t.id ? <Loader2Icon className="h-3 w-3 animate-spin" /> : 'Mark In Transit'}
                              </Button>
                            )}
                            {t.status === 'in_transit' && (
                              <Button size="sm" disabled={updatingId === t.id} onClick={() => updateStatus(t, 'approved')}>
                                {updatingId === t.id ? <Loader2Icon className="h-3 w-3 animate-spin" /> : 'Approve'}
                              </Button>
                            )}
                            {t.status === 'approved' && (
                              <span className="text-xs text-green-600 font-medium">Received ✓</span>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length > 0 && (
              <div className="px-4 py-3 border-t text-xs text-muted-foreground">
                Showing {filtered.length} of {transfers.length} transfer{transfers.length !== 1 ? 's' : ''}
              </div>
            )}
          </Card>

        </div>
      </div>
    </DashboardLayout>
  );
}
