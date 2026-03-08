'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth/auth-context';
import { useClerkSupabaseClient } from '@/lib/supabase/client';
import {
  Loader2Icon, RefreshCwIcon, ClockIcon, TruckIcon,
  CheckCircleIcon, SearchIcon, ChevronUpIcon, ChevronDownIcon,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type TransferStatus = 'pending' | 'in_transit' | 'approved';
type SortField = 'transfer_date' | 'item' | 'status' | 'created_at';
type SortDir = 'asc' | 'desc';

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
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

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

export default function AdminTransfersPage() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const supabase = useClerkSupabaseClient();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Filters
  const [search, setSearch]               = useState('');
  const [filterDate, setFilterDate]       = useState('');
  const [filterStatus, setFilterStatus]   = useState('all');
  const [filterFrom, setFilterFrom]       = useState('all');
  const [filterTo, setFilterTo]           = useState('all');

  // Sorting
  const [sortField, setSortField] = useState<SortField>('transfer_date');
  const [sortDir, setSortDir]     = useState<SortDir>('desc');

  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showNotif = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const isAdmin = profile?.role === 'admin' || profile?.role === 'superadmin';
  const userRole = (profile?.role === 'superadmin' ? 'superadmin' : 'admin') as 'admin' | 'superadmin';

  // Block non-admins
  useEffect(() => {
    if (profile && !isAdmin) router.replace('/cashier');
  }, [profile?.role]);

  // ─── Fetch ──────────────────────────────────────────────────────────────────

  const fetchBranches = async () => {
    const { data } = await supabase.from('branches').select('id, name').eq('is_active', true).order('name');
    setBranches(data || []);
  };

  const fetchTransfers = async () => {
    const { data, error } = await supabase
      .from('transfers')
      .select(`
        id, transfer_id, item, price, quantity,
        from_branch, to_branch, transfer_date, status,
        created_at, updated_at,
        from_branch_info:branches!from_branch(name),
        to_branch_info:branches!to_branch(name),
        creator:profiles!created_by(full_name)
      `)
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
      created_by_name: row.creator?.full_name ?? '—',
      created_at: row.created_at,
      updated_at: row.updated_at,
    })));
  };

  useEffect(() => {
    if (authLoading) return;
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchBranches(), fetchTransfers()]);
      setLoading(false);
    };
    init();

    const sub = supabase
      .channel('admin_transfers_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transfers' }, fetchTransfers)
      .subscribe();

    return () => { sub.unsubscribe(); };
  }, [authLoading]);

  // ─── Filter + Sort ──────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = transfers.filter(t => {
      if (search && !t.item.toLowerCase().includes(search.toLowerCase()) && !t.transfer_id.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterDate && t.transfer_date !== filterDate) return false;
      if (filterStatus !== 'all' && t.status !== filterStatus) return false;
      if (filterFrom !== 'all' && t.from_branch !== filterFrom) return false;
      if (filterTo !== 'all' && t.to_branch !== filterTo) return false;
      return true;
    });

    list = [...list].sort((a, b) => {
      let va: any = a[sortField];
      let vb: any = b[sortField];
      if (sortField === 'transfer_date' || sortField === 'created_at') {
        va = new Date(va).getTime();
        vb = new Date(vb).getTime();
      } else {
        va = va?.toString().toLowerCase() ?? '';
        vb = vb?.toString().toLowerCase() ?? '';
      }
      return sortDir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });

    return list;
  }, [transfers, search, filterDate, filterStatus, filterFrom, filterTo, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronUpIcon className="h-3 w-3 opacity-30 inline ml-1" />;
    return sortDir === 'asc'
      ? <ChevronUpIcon className="h-3 w-3 text-primary inline ml-1" />
      : <ChevronDownIcon className="h-3 w-3 text-primary inline ml-1" />;
  };

  // ─── Stats ──────────────────────────────────────────────────────────────────

  const pendingCount   = transfers.filter(t => t.status === 'pending').length;
  const inTransitCount = transfers.filter(t => t.status === 'in_transit').length;
  const approvedCount  = transfers.filter(t => t.status === 'approved').length;

  // ─── Update status (admin override) ─────────────────────────────────────────

  const updateStatus = async (transfer: Transfer, newStatus: TransferStatus) => {
    setUpdatingId(transfer.id);
    try {
      const { error } = await supabase.from('transfers').update({ status: newStatus }).eq('id', transfer.id);
      if (error) throw error;
      showNotif('success', `Status updated to ${STATUS_LABELS[newStatus]}`);
      await fetchTransfers();
    } catch {
      showNotif('error', 'Failed to update status');
    } finally {
      setUpdatingId(null);
    }
  };

  const fmtDate = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });

  const fmtDateTime = (d: string) =>
    new Date(d).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  const clearFilters = () => { setSearch(''); setFilterDate(''); setFilterStatus('all'); setFilterFrom('all'); setFilterTo('all'); };
  const hasFilters = search || filterDate || filterStatus !== 'all' || filterFrom !== 'all' || filterTo !== 'all';

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout userName={profile?.full_name || 'Admin'} userRole={userRole}>
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
              <p className="text-muted-foreground mt-1">All inter-branch transfers across every location</p>
            </div>
            <Button variant="outline" size="sm" onClick={fetchTransfers}>
              <RefreshCwIcon className="h-4 w-4 mr-2" />
              Refresh
            </Button>
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
                    <div className={`p-3 rounded-lg ${color}`}><Icon className="h-5 w-5" /></div>
                    <div>
                      <p className="text-2xl font-bold">{count}</p>
                      <p className="text-sm text-muted-foreground">{label}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-end">
            <div className="relative">
              <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input type="text" placeholder="Search item or ID..." value={search} onChange={e => setSearch(e.target.value)} className={`${inputCls} pl-8 w-48`} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Date</label>
              <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">From Branch</label>
              <select value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className={inputCls}>
                <option value="all">All</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">To Branch</label>
              <select value={filterTo} onChange={e => setFilterTo(e.target.value)} className={inputCls}>
                <option value="all">All</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
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
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button>
            )}
          </div>

          {/* Table */}
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-4 py-3 text-xs font-medium uppercase text-muted-foreground">Transfer ID</th>
                    <th className="text-left px-4 py-3 text-xs font-medium uppercase text-muted-foreground cursor-pointer select-none" onClick={() => toggleSort('item')}>
                      Item <SortIcon field="item" />
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-medium uppercase text-muted-foreground">Price</th>
                    <th className="text-right px-4 py-3 text-xs font-medium uppercase text-muted-foreground">Qty</th>
                    <th className="text-left px-4 py-3 text-xs font-medium uppercase text-muted-foreground">From</th>
                    <th className="text-left px-4 py-3 text-xs font-medium uppercase text-muted-foreground">To</th>
                    <th className="text-left px-4 py-3 text-xs font-medium uppercase text-muted-foreground cursor-pointer select-none" onClick={() => toggleSort('transfer_date')}>
                      Date <SortIcon field="transfer_date" />
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium uppercase text-muted-foreground cursor-pointer select-none" onClick={() => toggleSort('status')}>
                      Status <SortIcon field="status" />
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium uppercase text-muted-foreground">Created By</th>
                    <th className="text-left px-4 py-3 text-xs font-medium uppercase text-muted-foreground cursor-pointer select-none" onClick={() => toggleSort('created_at')}>
                      Created At <SortIcon field="created_at" />
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium uppercase text-muted-foreground">Updated At</th>
                    <th className="text-left px-4 py-3 text-xs font-medium uppercase text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={12} className="text-center py-16"><Loader2Icon className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={12} className="text-center py-16 text-muted-foreground">No transfers found</td></tr>
                  ) : filtered.map(t => (
                    <tr key={t.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">{t.transfer_id}</td>
                      <td className="px-4 py-3 font-medium whitespace-nowrap">{t.item}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        KSh {Number(t.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right">{t.quantity}</td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{t.from_branch_name}</td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{t.to_branch_name}</td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtDate(t.transfer_date)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${STATUS_COLORS[t.status]}`}>
                          {STATUS_LABELS[t.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{t.created_by_name}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{fmtDateTime(t.created_at)}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{fmtDateTime(t.updated_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5">
                          {t.status === 'pending' && (
                            <Button size="sm" variant="outline" disabled={updatingId === t.id} onClick={() => updateStatus(t, 'in_transit')} className="text-xs h-7 px-2">
                              {updatingId === t.id ? <Loader2Icon className="h-3 w-3 animate-spin" /> : 'In Transit'}
                            </Button>
                          )}
                          {t.status === 'in_transit' && (
                            <Button size="sm" disabled={updatingId === t.id} onClick={() => updateStatus(t, 'approved')} className="text-xs h-7 px-2">
                              {updatingId === t.id ? <Loader2Icon className="h-3 w-3 animate-spin" /> : 'Approve'}
                            </Button>
                          )}
                          {t.status === 'approved' && (
                            <Badge variant="outline" className="text-green-600 border-green-300 text-xs">Done</Badge>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!loading && (
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
