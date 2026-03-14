'use client';

import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { StatCard } from '@/components/dashboard/stat-card';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/auth-context';
import { useClerkSupabaseClient } from '@/lib/supabase/client';
import { getKenyaDateString } from '@/lib/date-utils';
import { useNotification } from '@/components/ui/notification';
import {
  DollarSignIcon,
  TrendingUpIcon,
  Loader2,
  ChevronDownIcon,
  ChevronUpIcon,
  CalendarIcon,
  BuildingIcon,
  BanknoteIcon,
  SmartphoneIcon,
  ReceiptIcon,
  ChefHatIcon,
  PencilIcon,
  XIcon,
  SaveIcon,
} from 'lucide-react';

interface ShiftRecord {
  id: string;
  shift_number: number;
  shift_date: string;
  shift_type: 'day' | 'night';
  branch_id: string;
  branch_name: string;
  cashier_id: string;
  cashier_name: string;
  chef_names: string;
  active_shift_id: string | null;
  balance_brought_down: number;
  mpesa_amount: number;
  paybill_amount: number;
  expense_total: number;
  cash_in_hand: number;
  grand_total: number;
  denom_1000_qty: number; denom_1000_total: number;
  denom_500_qty: number;  denom_500_total: number;
  denom_200_qty: number;  denom_200_total: number;
  denom_100_qty: number;  denom_100_total: number;
  denom_50_qty: number;   denom_50_total: number;
  coins_amount: number;
  started_at: string;
  ended_at: string | null;
}

interface StockCount {
  id: string;
  product_id: string;
  product_name: string;
  product_price: number;
  opening_stock: number;
  additions: number;
  transfer: number;
  spoilt: number;
  closing_stock: number;
  sales_qty: number;
}

interface Branch {
  id: string;
  name: string;
}

interface DailySummary {
  branch_name: string;
  total_sales: number;
  total_mpesa: number;
  total_cash: number;
  total_expenses: number;
  net_total: number;
  shift_count: number;
}

export default function AdminSalesStockPage() {
  const { profile, loading: authLoading } = useAuth();
  const supabase = useClerkSupabaseClient();
  const { showNotification } = useNotification();

  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [records, setRecords] = useState<ShiftRecord[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [stockCounts, setStockCounts] = useState<{ [shiftId: string]: StockCount[] }>({});
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [selectedDate, setSelectedDate] = useState(getKenyaDateString());
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [dailySummaries, setDailySummaries] = useState<DailySummary[]>([]);

  // Edit mode state
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [editShiftForm, setEditShiftForm] = useState<{
    balance_brought_down: string; mpesa_amount: string; paybill_amount: string;
    denom_1000_qty: string; denom_500_qty: string; denom_200_qty: string;
    denom_100_qty: string; denom_50_qty: string; coins_amount: string;
  } | null>(null);
  const [editStockCounts, setEditStockCounts] = useState<StockCount[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    supabase.from('branches').select('id, name').order('name')
      .then(({ data }) => { if (data) setBranches(data); });
  }, [authLoading]);

  const fetchRecords = async () => {
    try {
      setLoading(true);
      setFetchError(null);

      let query = supabase
        .from('shifts')
        .select('id, shift_number, shift_date, shift_type, branch_id, cashier_id, active_shift_id, balance_brought_down, mpesa_amount, paybill_amount, expense_total, cash_in_hand, grand_total, denom_1000_qty, denom_1000_total, denom_500_qty, denom_500_total, denom_200_qty, denom_200_total, denom_100_qty, denom_100_total, denom_50_qty, denom_50_total, coins_amount, started_at, ended_at, created_at')
        .eq('shift_date', selectedDate)
        .eq('is_active', false)
        .not('shift_number', 'is', null)
        .order('created_at', { ascending: false });

      if (selectedBranch !== 'all') query = query.eq('branch_id', selectedBranch);

      const { data: shiftsData, error: shiftsError } = await query;
      if (shiftsError) throw shiftsError;

      // Debug: log raw query result to browser console
      console.log('[sales-stock] selectedDate:', selectedDate);
      console.log('[sales-stock] shiftsData count:', shiftsData?.length ?? 0);
      console.log('[sales-stock] shiftsData:', shiftsData);

      if (!shiftsData || shiftsData.length === 0) {
        // Run a looser query to see what IS in the table
        const { data: allShifts } = await supabase
          .from('shifts')
          .select('id, shift_number, shift_date, is_active, created_at')
          .order('created_at', { ascending: false })
          .limit(5);
        console.log('[sales-stock] Latest 5 shifts (no filter):', allShifts);

        setRecords([]);
        setDailySummaries([]);
        return;
      }

      // Fetch branch and cashier names in parallel
      const branchIds = [...new Set(shiftsData.map(s => s.branch_id))];
      const cashierIds = [...new Set(shiftsData.map(s => s.cashier_id))];
      const [{ data: branchData }, { data: cashierData }] = await Promise.all([
        supabase.from('branches').select('id, name').in('id', branchIds),
        supabase.from('profiles').select('id, full_name').in('id', cashierIds),
      ]);
      const branchMap = new Map(branchData?.map(b => [b.id, b.name]) || []);
      const cashierMap = new Map(cashierData?.map(c => [c.id, c.full_name]) || []);

      // Fetch chef names via active_shift_id → shift_chef_assignments → employees
      const activeShiftIds = shiftsData
        .map(s => s.active_shift_id)
        .filter(Boolean) as string[];
      const chefMap = new Map<string, string>();
      if (activeShiftIds.length > 0) {
        const { data: chefAssignments } = await supabase
          .from('shift_chef_assignments')
          .select('shift_id, employees!inner(full_name)')
          .in('shift_id', activeShiftIds);
        // Group by shift_id
        (chefAssignments || []).forEach((ca: any) => {
          const existing = chefMap.get(ca.shift_id);
          const name = ca.employees?.full_name || '';
          chefMap.set(ca.shift_id, existing ? `${existing}, ${name}` : name);
        });
      }

      const recordsWithNames: ShiftRecord[] = shiftsData.map(shift => ({
        ...shift,
        branch_name: branchMap.get(shift.branch_id) || 'Unknown Branch',
        cashier_name: cashierMap.get(shift.cashier_id) || 'Unknown Cashier',
        chef_names: shift.active_shift_id ? (chefMap.get(shift.active_shift_id) || 'No chef assigned') : 'No chef assigned',
      }));

      setRecords(recordsWithNames);

      const summaryMap = new Map<string, DailySummary>();
      recordsWithNames.forEach(record => {
        const existing = summaryMap.get(record.branch_id) || {
          branch_name: record.branch_name,
          total_sales: 0, total_mpesa: 0, total_cash: 0,
          total_expenses: 0, net_total: 0, shift_count: 0,
        };
        existing.total_sales    += Number(record.grand_total || 0);
        existing.total_mpesa    += Number(record.mpesa_amount || 0) + Number(record.paybill_amount || 0);
        existing.total_cash     += Number(record.cash_in_hand || 0);
        existing.total_expenses += Number(record.expense_total || 0);
        existing.net_total      += Number(record.grand_total || 0) - Number(record.expense_total || 0);
        existing.shift_count    += 1;
        summaryMap.set(record.branch_id, existing);
      });
      setDailySummaries(Array.from(summaryMap.values()));
    } catch (error: any) {
      console.error('Error fetching records:', error);
      const msg = error?.message || JSON.stringify(error) || 'Unknown error';
      setFetchError(msg);
      showNotification('error', `Failed to load records: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (!authLoading) fetchRecords(); }, [authLoading, selectedDate, selectedBranch]);

  const fetchStockCounts = async (shiftId: string) => {
    if (stockCounts[shiftId] !== undefined) return;
    try {
      const shift = records.find(r => r.id === shiftId);

      // ── 1. Fetch stock count rows ─────────────────────────────────────────
      const { data, error } = await supabase
        .from('stock_counts')
        .select('*, products:product_id(product_name, base_price)')
        .eq('shift_id', shiftId);
      if (error) throw error;

      // ── 2. Compute sales_qty from order_items for this shift ──────────────
      // sales_qty is not stored in stock_counts — derive it from actual orders
      const salesMap = new Map<string, number>(); // product_id → qty sold

      if (shift) {
        // Get all orders for this branch on the shift date
        const { data: orders } = await supabase
          .from('orders')
          .select('id, created_at')
          .eq('branch_id', shift.branch_id)
          .gte('created_at', `${shift.shift_date}T00:00:00`)
          .lte('created_at', `${shift.shift_date}T23:59:59`);

        // Filter orders to only those belonging to this shift_type by Kenya hour
        const matchingOrderIds = (orders || [])
          .filter(o => {
            const kenyaHour = parseInt(
              new Date(o.created_at).toLocaleString('en-US', {
                timeZone: 'Africa/Nairobi',
                hour: 'numeric',
                hour12: false,
              })
            );
            return shift.shift_type === 'day'
              ? kenyaHour >= 7 && kenyaHour < 19
              : kenyaHour < 7 || kenyaHour >= 19;
          })
          .map(o => o.id);

        if (matchingOrderIds.length > 0) {
          const { data: items } = await supabase
            .from('order_items')
            .select('product_id, quantity')
            .in('order_id', matchingOrderIds);

          (items || []).forEach((item: any) => {
            if (item.product_id) {
              salesMap.set(item.product_id, (salesMap.get(item.product_id) || 0) + Number(item.quantity));
            }
          });
        }
      }

      const counts: StockCount[] = (data || []).map((item: any) => ({
        ...item,
        product_name: item.products?.product_name || 'Unknown Product',
        product_price: item.products?.base_price ?? 0,
        transfer: item.transfer || 0,
        sales_qty: salesMap.get(item.product_id) || 0,
      }));
      setStockCounts(prev => ({ ...prev, [shiftId]: counts }));
    } catch (error) {
      console.error('Error fetching stock counts:', error);
      // Set empty array so the spinner stops — don't leave shiftId undefined
      setStockCounts(prev => ({ ...prev, [shiftId]: [] }));
    }
  };

  const toggleRow = async (shiftId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(shiftId)) {
      newExpanded.delete(shiftId);
    } else {
      newExpanded.add(shiftId);
      await fetchStockCounts(shiftId);
    }
    setExpandedRows(newExpanded);
  };

  const startEdit = async (record: ShiftRecord) => {
    setEditShiftForm({
      balance_brought_down: String(record.balance_brought_down || 0),
      mpesa_amount: String(record.mpesa_amount || 0),
      paybill_amount: String(record.paybill_amount || 0),
      denom_1000_qty: String(record.denom_1000_qty || 0),
      denom_500_qty: String(record.denom_500_qty || 0),
      denom_200_qty: String(record.denom_200_qty || 0),
      denom_100_qty: String(record.denom_100_qty || 0),
      denom_50_qty: String(record.denom_50_qty || 0),
      coins_amount: String(record.coins_amount || 0),
    });
    setEditingShiftId(record.id);
    setExpandedRows(prev => new Set([...prev, record.id]));

    // Fetch stock counts if not yet loaded; use callback form to read fresh state
    if (stockCounts[record.id] === undefined) {
      await fetchStockCounts(record.id);
      // fetchStockCounts calls setStockCounts — read the updated value via a small delay
      // by using a state update callback that reads the latest stockCounts
      setStockCounts(prev => {
        setEditStockCounts((prev[record.id] || []).map(sc => ({ ...sc })));
        return prev; // no change to stockCounts itself
      });
    } else {
      setEditStockCounts(stockCounts[record.id].map(sc => ({ ...sc })));
    }
  };

  const cancelEdit = () => {
    setEditingShiftId(null);
    setEditShiftForm(null);
    setEditStockCounts(null);
  };

  const saveEdit = async (record: ShiftRecord) => {
    if (!editShiftForm || !editStockCounts) return;
    try {
      setSaving(true);

      const d1000 = parseInt(editShiftForm.denom_1000_qty || '0');
      const d500  = parseInt(editShiftForm.denom_500_qty  || '0');
      const d200  = parseInt(editShiftForm.denom_200_qty  || '0');
      const d100  = parseInt(editShiftForm.denom_100_qty  || '0');
      const d50   = parseInt(editShiftForm.denom_50_qty   || '0');
      const coins = parseFloat(editShiftForm.coins_amount || '0');
      const mpesa = parseFloat(editShiftForm.mpesa_amount || '0');
      const paybill = parseFloat(editShiftForm.paybill_amount || '0');
      const bbd = parseFloat(editShiftForm.balance_brought_down || '0');

      const cash_in_hand = d1000*1000 + d500*500 + d200*200 + d100*100 + d50*50 + coins;
      const grand_total = cash_in_hand + mpesa + paybill + Number(record.expense_total || 0) - bbd;

      const { error: shiftError } = await supabase.from('shifts').update({
        balance_brought_down: bbd,
        mpesa_amount: mpesa,
        paybill_amount: paybill,
        denom_1000_qty: d1000, denom_1000_total: d1000 * 1000,
        denom_500_qty:  d500,  denom_500_total:  d500  * 500,
        denom_200_qty:  d200,  denom_200_total:  d200  * 200,
        denom_100_qty:  d100,  denom_100_total:  d100  * 100,
        denom_50_qty:   d50,   denom_50_total:   d50   * 50,
        coins_amount: coins,
        cash_in_hand,
        grand_total,
      }).eq('id', record.id);
      if (shiftError) throw shiftError;

      // Update each stock count row
      for (const sc of editStockCounts) {
        const { error } = await supabase.from('stock_counts').update({
          opening_stock: Number(sc.opening_stock) || 0,
          additions:     Number(sc.additions)     || 0,
          transfer:      Number(sc.transfer)      || 0,
          spoilt:        Number(sc.spoilt)        || 0,
          closing_stock: Number(sc.closing_stock) || 0,
        }).eq('id', sc.id);
        if (error) throw error;
      }

      showNotification('success', 'Shift updated successfully');
      cancelEdit();
      // Refresh records and clear cached stock counts so they reload
      setStockCounts(prev => { const n = { ...prev }; delete n[record.id]; return n; });
      await fetchRecords();
    } catch (error: any) {
      showNotification('error', `Failed to save: ${error?.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const formatTime = (timestamp: string) =>
    new Date(timestamp).toLocaleTimeString('en-KE', {
      timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit',
    });

  const fmtKsh = (n: number) => `KSh ${n.toLocaleString()}`;

  const totalGrandTotal = records.reduce((sum, r) => sum + Number(r.grand_total || 0), 0);
  const totalMpesa      = records.reduce((sum, r) => sum + Number(r.mpesa_amount || 0) + Number(r.paybill_amount || 0), 0);
  const totalCash       = records.reduce((sum, r) => sum + Number(r.cash_in_hand || 0), 0);
  const totalExpenses   = records.reduce((sum, r) => sum + Number(r.expense_total || 0), 0);

  if (loading && records.length === 0) {
    return (
      <DashboardLayout userName={profile?.full_name || (profile?.role === 'superadmin' ? 'Superadmin' : 'Admin')} userRole={(profile?.role === 'superadmin' ? 'superadmin' : 'admin') as 'admin' | 'superadmin'}>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userName={profile?.full_name || (profile?.role === 'superadmin' ? 'Superadmin' : 'Admin')} userRole={(profile?.role === 'superadmin' ? 'superadmin' : 'admin') as 'admin' | 'superadmin'}>
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="px-8 pt-6 pb-4 border-b">
          <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
            <div>
              <h1 className="text-3xl font-bold">Sales & Stock Reports</h1>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-5 w-5 text-muted-foreground" />
                <input type="date" value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  className="px-3 py-2 border rounded-lg bg-background" />
              </div>
              <div className="flex items-center gap-2">
                <BuildingIcon className="h-5 w-5 text-muted-foreground" />
                <select value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)}
                  className="px-3 py-2 border rounded-lg bg-background">
                  <option value="all">All Branches</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 p-6 overflow-auto">
          <div className="space-y-6">
            {/* Error Banner */}
            {fetchError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 text-sm">
                <strong>Error loading data:</strong> {fetchError}
                <br />
                <span className="text-xs text-red-600">This usually means a database column is missing. Run the latest migration: <code>20260311_add_missing_shift_columns.sql</code></span>
              </div>
            )}

            {/* Summary Stats */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <StatCard title="Total Revenue" value={fmtKsh(totalGrandTotal)} description={`${records.length} shifts completed`} icon={DollarSignIcon} />
              <StatCard title="M-Pesa / Paybill" value={fmtKsh(totalMpesa)} description="Digital payments" icon={SmartphoneIcon} />
              <StatCard title="Cash Collections" value={fmtKsh(totalCash)} description="Physical cash" icon={BanknoteIcon} />
              <StatCard title="Total Expenses" value={fmtKsh(totalExpenses)} description="Deducted from revenue" icon={ReceiptIcon} />
            </div>

            {/* Branch Breakdown */}
            {dailySummaries.length > 0 && (
              <Card>
                <CardHeader><CardTitle>Branch Performance Summary</CardTitle></CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-3 px-2 font-medium">Branch</th>
                          <th className="text-right py-3 px-2 font-medium">Shifts</th>
                          <th className="text-right py-3 px-2 font-medium">Total Sales</th>
                          <th className="text-right py-3 px-2 font-medium">M-Pesa</th>
                          <th className="text-right py-3 px-2 font-medium">Cash</th>
                          <th className="text-right py-3 px-2 font-medium">Expenses</th>
                          <th className="text-right py-3 px-2 font-medium">Net Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dailySummaries.map((s, idx) => (
                          <tr key={idx} className="border-b hover:bg-muted/50">
                            <td className="py-3 px-2 font-medium">{s.branch_name}</td>
                            <td className="text-right py-3 px-2">{s.shift_count}</td>
                            <td className="text-right py-3 px-2">{fmtKsh(s.total_sales)}</td>
                            <td className="text-right py-3 px-2 text-blue-600">{fmtKsh(s.total_mpesa)}</td>
                            <td className="text-right py-3 px-2 text-green-600">{fmtKsh(s.total_cash)}</td>
                            <td className="text-right py-3 px-2 text-red-600">{fmtKsh(s.total_expenses)}</td>
                            <td className="text-right py-3 px-2 font-bold">{fmtKsh(s.net_total)}</td>
                          </tr>
                        ))}
                        <tr className="bg-muted/50 font-bold">
                          <td className="py-3 px-2">TOTAL</td>
                          <td className="text-right py-3 px-2">{records.length}</td>
                          <td className="text-right py-3 px-2">{fmtKsh(totalGrandTotal)}</td>
                          <td className="text-right py-3 px-2 text-blue-600">{fmtKsh(totalMpesa)}</td>
                          <td className="text-right py-3 px-2 text-green-600">{fmtKsh(totalCash)}</td>
                          <td className="text-right py-3 px-2 text-red-600">{fmtKsh(totalExpenses)}</td>
                          <td className="text-right py-3 px-2">{fmtKsh(totalGrandTotal - totalExpenses)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Individual Shift Records */}
            {records.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">No shift records found for {selectedDate}</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Individual Shift Records</h3>
                {records.map(record => (
                  <Card key={record.id} className={editingShiftId === record.id ? 'ring-2 ring-primary' : ''}>
                    <CardHeader className="pb-3">
                      <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2 py-1 rounded text-xs font-medium bg-primary/10 text-primary">
                            {record.branch_name}
                          </span>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            record.shift_type === 'day'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {record.shift_type === 'day' ? 'Day' : 'Night'} Shift
                          </span>
                          <span className="text-sm font-semibold">{record.cashier_name}</span>
                          <span className="text-sm text-muted-foreground">•</span>
                          <ChefHatIcon className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">{record.chef_names}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-sm text-muted-foreground">
                            <span className="text-green-600">{formatTime(record.started_at)}</span>
                            <span className="mx-1">→</span>
                            <span className="text-red-600">{record.ended_at ? formatTime(record.ended_at) : 'Active'}</span>
                          </div>
                          {editingShiftId !== record.id && (
                            <Button variant="outline" size="sm" onClick={() => startEdit(record)} className="gap-1 h-7 px-2 text-xs">
                              <PencilIcon className="h-3 w-3" />Edit
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {(() => {
                        const isEditing = editingShiftId === record.id && editShiftForm !== null;

                        // Live-computed values in edit mode
                        const editCashInHand = isEditing ? (
                          parseInt(editShiftForm!.denom_1000_qty || '0') * 1000 +
                          parseInt(editShiftForm!.denom_500_qty  || '0') * 500  +
                          parseInt(editShiftForm!.denom_200_qty  || '0') * 200  +
                          parseInt(editShiftForm!.denom_100_qty  || '0') * 100  +
                          parseInt(editShiftForm!.denom_50_qty   || '0') * 50   +
                          parseFloat(editShiftForm!.coins_amount || '0')
                        ) : 0;
                        const editGrandTotal = isEditing ? (
                          editCashInHand +
                          parseFloat(editShiftForm!.mpesa_amount || '0') +
                          parseFloat(editShiftForm!.paybill_amount || '0') +
                          Number(record.expense_total || 0) -
                          parseFloat(editShiftForm!.balance_brought_down || '0')
                        ) : 0;

                        const editInputCls = 'w-full px-2 py-1 border rounded text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

                        return (
                          <>
                            {/* Summary stat boxes */}
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
                              {/* Balance B/D */}
                              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                                <p className="text-xs text-muted-foreground mb-1">Balance B/D</p>
                                {isEditing ? (
                                  <input type="number" min="0" step="0.01" className={editInputCls}
                                    value={editShiftForm!.balance_brought_down}
                                    onChange={e => setEditShiftForm(f => f && ({ ...f, balance_brought_down: e.target.value }))} />
                                ) : (
                                  <p className="font-semibold">{fmtKsh(record.balance_brought_down || 0)}</p>
                                )}
                              </div>
                              {/* M-Pesa */}
                              <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                                <p className="text-xs text-muted-foreground mb-1">M-Pesa</p>
                                {isEditing ? (
                                  <input type="number" min="0" step="0.01" className={editInputCls}
                                    value={editShiftForm!.mpesa_amount}
                                    onChange={e => setEditShiftForm(f => f && ({ ...f, mpesa_amount: e.target.value }))} />
                                ) : (
                                  <p className="font-semibold text-blue-600">{fmtKsh(record.mpesa_amount || 0)}</p>
                                )}
                              </div>
                              {/* Paybill */}
                              <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                                <p className="text-xs text-muted-foreground mb-1">Paybill</p>
                                {isEditing ? (
                                  <input type="number" min="0" step="0.01" className={editInputCls}
                                    value={editShiftForm!.paybill_amount}
                                    onChange={e => setEditShiftForm(f => f && ({ ...f, paybill_amount: e.target.value }))} />
                                ) : (
                                  <p className="font-semibold text-blue-600">{fmtKsh(record.paybill_amount || 0)}</p>
                                )}
                              </div>
                              {/* Cash in Hand — computed */}
                              <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
                                <p className="text-xs text-muted-foreground mb-1">Cash in Hand</p>
                                <p className="font-semibold text-green-600">
                                  {fmtKsh(isEditing ? editCashInHand : (record.cash_in_hand || 0))}
                                </p>
                              </div>
                              {/* Expenses — read-only */}
                              <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                                <p className="text-xs text-muted-foreground mb-1">Expenses</p>
                                <p className="font-semibold text-red-600">{fmtKsh(record.expense_total || 0)}</p>
                              </div>
                              {/* Grand Total — computed */}
                              <div className="bg-primary/10 p-3 rounded-lg">
                                <p className="text-xs text-muted-foreground mb-1">Grand Total</p>
                                <p className="font-bold text-primary">
                                  {fmtKsh(isEditing ? editGrandTotal : (record.grand_total || 0))}
                                </p>
                              </div>
                            </div>

                            {/* Action buttons */}
                            {isEditing ? (
                              <div className="flex gap-2 mb-4">
                                <Button size="sm" onClick={() => saveEdit(record)} disabled={saving} className="gap-1">
                                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <SaveIcon className="h-3 w-3" />}
                                  {saving ? 'Saving...' : 'Save Changes'}
                                </Button>
                                <Button size="sm" variant="outline" onClick={cancelEdit} disabled={saving} className="gap-1">
                                  <XIcon className="h-3 w-3" />Cancel
                                </Button>
                              </div>
                            ) : (
                              <Button variant="outline" size="sm" onClick={() => toggleRow(record.id)} className="w-full mb-0">
                                {expandedRows.has(record.id) ? (
                                  <><ChevronUpIcon className="h-4 w-4 mr-2" />Hide Details</>
                                ) : (
                                  <><ChevronDownIcon className="h-4 w-4 mr-2" />Show Cash Denominations & Stock</>
                                )}
                              </Button>
                            )}

                            {/* Expanded / edit details */}
                            {(expandedRows.has(record.id) || isEditing) && (
                              <div className="mt-4 space-y-4">
                                {/* Cash Denominations */}
                                <div>
                                  <h4 className="font-medium mb-2">Cash Denominations</h4>
                                  {isEditing ? (
                                    <div className="border rounded p-3 space-y-2">
                                      {([
                                        { label: '1000', key: 'denom_1000_qty' as const },
                                        { label: '500',  key: 'denom_500_qty'  as const },
                                        { label: '200',  key: 'denom_200_qty'  as const },
                                        { label: '100',  key: 'denom_100_qty'  as const },
                                        { label: '50',   key: 'denom_50_qty'   as const },
                                      ]).map(d => {
                                        const qty = parseInt(editShiftForm![d.key] || '0');
                                        const denom = parseInt(d.label);
                                        return (
                                          <div key={d.label} className="grid grid-cols-3 gap-2 items-center">
                                            <span className="text-sm font-medium">KSh {d.label}</span>
                                            <input type="number" min="0" className="px-2 py-1 border rounded text-sm text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                              value={editShiftForm![d.key]}
                                              onChange={e => setEditShiftForm(f => f && ({ ...f, [d.key]: e.target.value }))}
                                              placeholder="Qty" />
                                            <span className="text-sm text-muted-foreground text-right">
                                              {qty > 0 ? fmtKsh(qty * denom) : ''}
                                            </span>
                                          </div>
                                        );
                                      })}
                                      <div className="grid grid-cols-3 gap-2 items-center">
                                        <span className="text-sm font-medium">Coins</span>
                                        <input type="number" min="0" step="0.01" className="px-2 py-1 border rounded text-sm text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                          value={editShiftForm!.coins_amount}
                                          onChange={e => setEditShiftForm(f => f && ({ ...f, coins_amount: e.target.value }))}
                                          placeholder="0.00" />
                                        <span className="text-sm text-muted-foreground text-right">
                                          {parseFloat(editShiftForm!.coins_amount || '0') > 0 ? fmtKsh(parseFloat(editShiftForm!.coins_amount)) : ''}
                                        </span>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-sm">
                                      {([
                                        { label: '1000', qty: record.denom_1000_qty, total: record.denom_1000_total },
                                        { label: '500',  qty: record.denom_500_qty,  total: record.denom_500_total  },
                                        { label: '200',  qty: record.denom_200_qty,  total: record.denom_200_total  },
                                        { label: '100',  qty: record.denom_100_qty,  total: record.denom_100_total  },
                                        { label: '50',   qty: record.denom_50_qty,   total: record.denom_50_total   },
                                      ] as const).filter(d => d.qty > 0).map(d => (
                                        <div key={d.label} className="bg-gray-50 dark:bg-gray-800 p-2 rounded">
                                          <p className="text-xs text-muted-foreground">KSh {d.label}</p>
                                          <p>{d.qty} × = {fmtKsh(d.total)}</p>
                                        </div>
                                      ))}
                                      {record.coins_amount > 0 && (
                                        <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded">
                                          <p className="text-xs text-muted-foreground">Coins</p>
                                          <p>{fmtKsh(record.coins_amount)}</p>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>

                                {/* Stock Counts */}
                                <div>
                                  <h4 className="font-medium mb-2">Stock Counts</h4>
                                  {(() => {
                                    const counts = isEditing ? editStockCounts : stockCounts[record.id];
                                    if (counts === undefined || counts === null) {
                                      return (
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                          <Loader2 className="h-4 w-4 animate-spin" />Loading...
                                        </div>
                                      );
                                    }
                                    if (counts.length === 0) {
                                      return <p className="text-sm text-muted-foreground">No stock counts recorded</p>;
                                    }
                                    return (
                                      <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                          <thead>
                                            <tr className="border-b">
                                              <th className="text-left py-2 px-2">Product</th>
                                              <th className="text-center py-2 px-2">Opening</th>
                                              <th className="text-center py-2 px-2">Addition</th>
                                              <th className="text-center py-2 px-2">Transfer</th>
                                              <th className="text-center py-2 px-2">Spoilt</th>
                                              <th className="text-center py-2 px-2 bg-muted/30">Totals</th>
                                              <th className="text-center py-2 px-2 text-blue-600">Sales</th>
                                              <th className="text-center py-2 px-2">Closing</th>
                                              {!isEditing && <>
                                                <th className="text-center py-2 px-2 bg-muted/30">Variance</th>
                                                <th className="text-right py-2 px-2 bg-muted/30">Stock Amount</th>
                                              </>}
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {counts.map((stock, si) => {
                                              const totals = Number(stock.opening_stock) + Number(stock.additions) - Number(stock.transfer) - Number(stock.spoilt);
                                              const variance = isEditing ? null : (totals - Number(stock.closing_stock) - Number(stock.sales_qty)) * -1;
                                              const stockAmount = isEditing ? null : (variance! * stock.product_price);
                                              return (
                                                <tr key={stock.id} className="border-b hover:bg-muted/20">
                                                  <td className="py-2 px-2 font-medium">{stock.product_name}</td>
                                                  {isEditing ? (
                                                    <>
                                                      {(['opening_stock', 'additions', 'transfer', 'spoilt'] as const).map(field => (
                                                        <td key={field} className="py-1 px-1 text-center">
                                                          <input type="number" min="0"
                                                            className="w-14 px-1 py-1 border rounded text-xs text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                            value={String(stock[field])}
                                                            onChange={e => {
                                                              const val = e.target.value;
                                                              setEditStockCounts(prev => prev ? prev.map((s, i) => i === si ? { ...s, [field]: val } : s) : prev);
                                                            }} />
                                                        </td>
                                                      ))}
                                                      <td className="text-center py-2 px-2 bg-muted/20 font-medium">{totals}</td>
                                                      <td className="text-center py-2 px-2 text-blue-600">{stock.sales_qty}</td>
                                                      <td className="py-1 px-1 text-center">
                                                        <input type="number" min="0"
                                                          className="w-14 px-1 py-1 border rounded text-xs text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                          value={String(stock.closing_stock)}
                                                          onChange={e => {
                                                            const val = e.target.value;
                                                            setEditStockCounts(prev => prev ? prev.map((s, i) => i === si ? { ...s, closing_stock: val as any } : s) : prev);
                                                          }} />
                                                      </td>
                                                    </>
                                                  ) : (
                                                    <>
                                                      <td className="text-center py-2 px-2">{stock.opening_stock}</td>
                                                      <td className="text-center py-2 px-2 text-green-600">+{stock.additions}</td>
                                                      <td className="text-center py-2 px-2 text-orange-600">{stock.transfer}</td>
                                                      <td className="text-center py-2 px-2 text-red-600">{stock.spoilt}</td>
                                                      <td className="text-center py-2 px-2 bg-muted/20 font-medium">{totals}</td>
                                                      <td className="text-center py-2 px-2 text-blue-600">{stock.sales_qty}</td>
                                                      <td className="text-center py-2 px-2">{stock.closing_stock}</td>
                                                      <td className={`text-center py-2 px-2 bg-muted/20 font-medium ${variance! < 0 ? 'text-red-600' : variance! > 0 ? 'text-green-600' : ''}`}>
                                                        {variance}
                                                      </td>
                                                      <td className={`text-right py-2 px-2 bg-muted/20 font-medium ${stockAmount! < 0 ? 'text-red-600' : stockAmount! > 0 ? 'text-orange-600' : ''}`}>
                                                        {stockAmount !== 0 ? fmtKsh(Math.abs(stockAmount!)) : '—'}
                                                      </td>
                                                    </>
                                                  )}
                                                </tr>
                                              );
                                            })}
                                          </tbody>
                                        </table>
                                      </div>
                                    );
                                  })()}
                                </div>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
