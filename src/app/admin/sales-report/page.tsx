'use client';

import { useState, useEffect, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/auth-context';
import { useClerkSupabaseClient } from '@/lib/supabase/client';
import { BarChart2Icon, Loader2, FilterIcon, XIcon } from 'lucide-react';

interface Branch {
  id: string;
  name: string;
  code: string;
}

interface Cashier {
  id: string;
  full_name: string;
  branch_id: string;
}

interface SalesRow {
  product_name: string;
  unit_price: number;
  qty: number;
  total: number;
}

const getKenyaDate = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });

const getKenyaHour = (isoString: string): number => {
  const d = new Date(isoString);
  return parseInt(
    d.toLocaleString('en-KE', { timeZone: 'Africa/Nairobi', hour: 'numeric', hour12: false }),
    10
  );
};

const isInShift = (isoString: string, shift: 'all' | 'day' | 'night'): boolean => {
  if (shift === 'all') return true;
  const hour = getKenyaHour(isoString);
  if (shift === 'day') return hour >= 7 && hour < 19;
  // night: 19:00–06:59
  return hour >= 19 || hour < 7;
};

const formatCurrency = (amount: number) =>
  `Ksh ${amount.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export default function AdminSalesReportPage() {
  const { profile, loading: authLoading } = useAuth();
  const supabase = useClerkSupabaseClient();

  const [viewMode, setViewMode] = useState<'day' | 'range' | 'month'>('day');
  const [date, setDate] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [shiftFilter, setShiftFilter] = useState<'all' | 'day' | 'night'>('all');
  const [branchFilter, setBranchFilter] = useState<string>('');
  const [cashierFilter, setCashierFilter] = useState<string>('');

  const [branches, setBranches] = useState<Branch[]>([]);
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [rows, setRows] = useState<SalesRow[]>([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  // Init date to today (Kenya)
  useEffect(() => {
    const today = getKenyaDate();
    setDate(today);
    setDateFrom(today);
    setDateTo(today);
    setMonthFilter(today.slice(0, 7));
  }, []);

  // Load branches
  useEffect(() => {
    if (authLoading) return;
    supabase
      .from('branches')
      .select('id, name, code')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setBranches(data || []));
  }, [authLoading]);

  // Load cashiers (filtered by branch when selected)
  useEffect(() => {
    if (authLoading) return;
    let query = supabase
      .from('profiles')
      .select('id, full_name, branch_id')
      .eq('role', 'cashier')
      .eq('is_active', true)
      .order('full_name');
    if (branchFilter) {
      query = query.eq('branch_id', branchFilter);
    }
    query.then(({ data }) => {
      setCashiers(data || []);
      // Reset cashier selection if it no longer belongs to this branch
      if (cashierFilter && branchFilter) {
        const still = (data || []).find((c) => c.id === cashierFilter);
        if (!still) setCashierFilter('');
      }
    });
  }, [authLoading, branchFilter]);

  const fetchData = useCallback(async () => {
    let startDate: string;
    let endDate: string;

    if (viewMode === 'day') {
      if (!date) return;
      startDate = `${date}T00:00:00+03:00`;
      endDate = `${date}T23:59:59+03:00`;
    } else if (viewMode === 'range') {
      if (!dateFrom || !dateTo) return;
      startDate = `${dateFrom}T00:00:00+03:00`;
      endDate = `${dateTo}T23:59:59+03:00`;
    } else {
      if (!monthFilter) return;
      const [year, month] = monthFilter.split('-').map(Number);
      const lastDay = new Date(year, month, 0).getDate();
      startDate = `${monthFilter}-01T00:00:00+03:00`;
      endDate = `${monthFilter}-${lastDay.toString().padStart(2, '0')}T23:59:59+03:00`;
    }

    setLoading(true);
    try {
      // 1. Query orders for the selected range
      let ordersQuery = supabase
        .from('orders')
        .select('id, cashier_id, branch_id, created_at')
        .gte('created_at', startDate)
        .lte('created_at', endDate);

      if (branchFilter) ordersQuery = ordersQuery.eq('branch_id', branchFilter);
      if (cashierFilter) ordersQuery = ordersQuery.eq('cashier_id', cashierFilter);

      const { data: ordersData, error: ordersError } = await ordersQuery;
      if (ordersError) {
        console.error('Error fetching orders:', ordersError);
        setRows([]);
        setGrandTotal(0);
        return;
      }

      // 2. Apply shift filter client-side
      const filteredOrders = (ordersData || []).filter((o) =>
        isInShift(o.created_at, shiftFilter)
      );

      if (filteredOrders.length === 0) {
        setRows([]);
        setGrandTotal(0);
        return;
      }

      const orderIds = filteredOrders.map((o) => o.id);

      // 3. Fetch order_items for matched orders
      const { data: itemsData, error: itemsError } = await supabase
        .from('order_items')
        .select('order_id, product_name, product_price, quantity')
        .in('order_id', orderIds);

      if (itemsError) {
        console.error('Error fetching order items:', itemsError);
        setRows([]);
        setGrandTotal(0);
        return;
      }

      // 4. Aggregate by product_name
      const agg: Record<string, { unit_price: number; qty: number }> = {};
      for (const item of itemsData || []) {
        if (!agg[item.product_name]) {
          agg[item.product_name] = { unit_price: item.product_price, qty: 0 };
        }
        agg[item.product_name].qty += item.quantity;
      }

      const aggregated: SalesRow[] = Object.entries(agg)
        .map(([product_name, { unit_price, qty }]) => ({
          product_name,
          unit_price,
          qty,
          total: unit_price * qty,
        }))
        .sort((a, b) => b.total - a.total);

      const gt = aggregated.reduce((s, r) => s + r.total, 0);
      setRows(aggregated);
      setGrandTotal(gt);
    } finally {
      setLoading(false);
    }
  }, [viewMode, date, dateFrom, dateTo, monthFilter, shiftFilter, branchFilter, cashierFilter, supabase]);

  useEffect(() => {
    if (authLoading) return;
    const hasDate = viewMode === 'day' ? !!date : viewMode === 'range' ? !!dateFrom && !!dateTo : !!monthFilter;
    if (hasDate) fetchData();
  }, [authLoading, viewMode, date, dateFrom, dateTo, monthFilter, shiftFilter, branchFilter, cashierFilter]);

  const handleClear = () => {
    const today = getKenyaDate();
    setDate(today);
    setDateFrom(today);
    setDateTo(today);
    setMonthFilter(today.slice(0, 7));
    setShiftFilter('all');
    setBranchFilter('');
    setCashierFilter('');
  };

  return (
    <DashboardLayout userName={profile?.full_name || 'Admin'} userRole="admin">
      <div className="p-4 md:p-8">
        <div className="max-w-5xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <BarChart2Icon className="h-7 w-7 text-primary" />
              <div>
                <h1 className="text-3xl font-bold">Sales Report</h1>
              </div>
            </div>
            <Button onClick={fetchData} variant="outline" size="sm" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Refresh
            </Button>
          </div>

          {/* Filter Bar */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <FilterIcon className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base">Filters</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* View mode toggle */}
              <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
                {(['day', 'range', 'month'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      viewMode === mode
                        ? 'bg-background shadow-sm text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {mode === 'day' ? 'Single Day' : mode === 'range' ? 'Date Range' : 'Month'}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap gap-4 items-end">
                {/* Date input(s) */}
                {viewMode === 'day' && (
                  <div className="flex-1 min-w-[140px]">
                    <label className="text-xs text-muted-foreground mb-1 block">Date</label>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm bg-background"
                    />
                  </div>
                )}

                {viewMode === 'range' && (
                  <>
                    <div className="flex-1 min-w-[140px]">
                      <label className="text-xs text-muted-foreground mb-1 block">From</label>
                      <input
                        type="date"
                        value={dateFrom}
                        max={dateTo || undefined}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg text-sm bg-background"
                      />
                    </div>
                    <div className="flex-1 min-w-[140px]">
                      <label className="text-xs text-muted-foreground mb-1 block">To</label>
                      <input
                        type="date"
                        value={dateTo}
                        min={dateFrom || undefined}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg text-sm bg-background"
                      />
                    </div>
                  </>
                )}

                {viewMode === 'month' && (
                  <div className="flex-1 min-w-[160px]">
                    <label className="text-xs text-muted-foreground mb-1 block">Month</label>
                    <input
                      type="month"
                      value={monthFilter}
                      onChange={(e) => setMonthFilter(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm bg-background"
                    />
                  </div>
                )}

                {viewMode === 'day' && (
                  <div className="flex-1 min-w-[130px]">
                    <label className="text-xs text-muted-foreground mb-1 block">Shift</label>
                    <select
                      value={shiftFilter}
                      onChange={(e) => setShiftFilter(e.target.value as 'all' | 'day' | 'night')}
                      className="w-full px-3 py-2 border rounded-lg text-sm bg-background"
                    >
                      <option value="all">All Shifts</option>
                      <option value="day">Day (07:00–18:59)</option>
                      <option value="night">Night (19:00–06:59)</option>
                    </select>
                  </div>
                )}

                <div className="flex-1 min-w-[150px]">
                  <label className="text-xs text-muted-foreground mb-1 block">Branch</label>
                  <select
                    value={branchFilter}
                    onChange={(e) => setBranchFilter(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-background"
                  >
                    <option value="">All Branches</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex-1 min-w-[150px]">
                  <label className="text-xs text-muted-foreground mb-1 block">Cashier</label>
                  <select
                    value={cashierFilter}
                    onChange={(e) => setCashierFilter(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-background"
                  >
                    <option value="">All Cashiers</option>
                    {cashiers.map((c) => (
                      <option key={c.id} value={c.id}>{c.full_name}</option>
                    ))}
                  </select>
                </div>

                <Button variant="ghost" size="sm" onClick={handleClear} className="flex items-center gap-1">
                  <XIcon className="h-4 w-4" />
                  Clear
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Results Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Product Sales Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : rows.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <BarChart2Icon className="h-12 w-12 mx-auto mb-4 opacity-30" />
                  <p>No sales found for the selected filters.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground">#</th>
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground">Product</th>
                        <th className="text-right py-3 px-4 font-medium text-muted-foreground">Qty Sold</th>
                        <th className="text-right py-3 px-4 font-medium text-muted-foreground">Unit Price</th>
                        <th className="text-right py-3 px-4 font-medium text-muted-foreground">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, idx) => (
                        <tr
                          key={row.product_name}
                          className={`border-b ${idx % 2 === 0 ? '' : 'bg-muted/20'} hover:bg-muted/40 transition-colors`}
                        >
                          <td className="py-3 px-4 text-muted-foreground">{idx + 1}</td>
                          <td className="py-3 px-4 font-medium">{row.product_name}</td>
                          <td className="py-3 px-4 text-right">{row.qty}</td>
                          <td className="py-3 px-4 text-right">{formatCurrency(row.unit_price)}</td>
                          <td className="py-3 px-4 text-right font-semibold">{formatCurrency(row.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border bg-muted/30">
                        <td colSpan={4} className="py-3 px-4 text-right font-bold text-base">
                          Grand Total
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-base text-primary">
                          {formatCurrency(grandTotal)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

        </div>
      </div>
    </DashboardLayout>
  );
}
