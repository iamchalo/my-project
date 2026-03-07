'use client';

import { useState, useEffect, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  DollarSignIcon, TrendingUpIcon, ShoppingCartIcon,
  BuildingIcon, RefreshCwIcon, ArrowDownIcon, ArrowUpIcon,
  BanknoteIcon, CreditCardIcon,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { AdminDashboardSkeleton } from '@/components/admin/admin-dashboard-skeleton';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BranchSalesPoint {
  date: string;              // 'YYYY-MM-DD'
  label: string;             // formatted for display
  [branchName: string]: number | string;
}

interface Branch { id: string; name: string; code: string; }

// ─── Branch colours ───────────────────────────────────────────────────────────

const BRANCH_COLORS = [
  '#6366f1', // indigo
  '#f59e0b', // amber
  '#10b981', // emerald
  '#ef4444', // red
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#f97316', // orange
];

// ─── Date helpers ─────────────────────────────────────────────────────────────

const getKenyaDate = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });

const subtractDays = (date: string, days: number) => {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() - days);
  return d.toLocaleDateString('en-CA');
};

const formatLabel = (date: string, range: string) => {
  const d = new Date(date + 'T00:00:00');
  if (range === '7d' || range === '30d') {
    return d.toLocaleDateString('en-KE', { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString('en-KE', { month: 'short', year: '2-digit' });
};

const RANGES = [
  { key: '7d',  label: '7 Days' },
  { key: '30d', label: '30 Days' },
  { key: '90d', label: '90 Days' },
];

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background border rounded-xl shadow-lg p-3 text-sm min-w-[160px]">
      <p className="font-semibold mb-2 text-foreground">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: entry.color }} />
            <span className="text-muted-foreground">{entry.dataKey}</span>
          </span>
          <span className="font-medium text-foreground">
            KSh {Number(entry.value).toLocaleString('en-US', { minimumFractionDigits: 0 })}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { profile, loading: authLoading } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);

  // Stat state
  const [totalRevenue, setTotalRevenue]   = useState(0);
  const [todayRevenue, setTodayRevenue]   = useState(0);
  const [todayOrders, setTodayOrders]     = useState(0);
  const [totalOrders, setTotalOrders]     = useState(0);
  const [cashRevenue, setCashRevenue]     = useState(0);
  const [mpesaRevenue, setMpesaRevenue]   = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [activeBranches, setActiveBranches]   = useState(0);

  // Chart state
  const [branches, setBranches] = useState<Branch[]>([]);
  const [chartData, setChartData] = useState<BranchSalesPoint[]>([]);
  const [range, setRange] = useState<'7d' | '30d' | '90d'>('30d');

  const userRole = (profile?.role === 'superadmin' ? 'superadmin' : 'admin') as 'admin' | 'superadmin';

  const fmt = (n: number) =>
    `KSh ${n.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  // ─── Fetch summary stats ──────────────────────────────────────────────────

  const fetchStats = async () => {
    const today = getKenyaDate();
    const thirtyDaysAgo = subtractDays(today, 30);

    const [ordersRes, todayRes, expensesRes, branchRes] = await Promise.all([
      supabase.from('orders').select('total_amount, payment_method').gte('created_at', thirtyDaysAgo),
      supabase.from('orders').select('total_amount').gte('created_at', `${today}T00:00:00`),
      supabase.from('expenses').select('total').gte('created_at', thirtyDaysAgo),
      supabase.from('branches').select('id, is_active'),
    ]);

    const orders     = ordersRes.data || [];
    const todayOrd   = todayRes.data || [];
    const expenses   = expensesRes.data || [];
    const branchList = branchRes.data || [];

    setTotalRevenue(orders.reduce((s, o) => s + (o.total_amount || 0), 0));
    setTodayRevenue(todayOrd.reduce((s, o) => s + (o.total_amount || 0), 0));
    setTodayOrders(todayOrd.length);
    setTotalOrders(orders.length);
    setCashRevenue(orders.filter(o => o.payment_method === 'cash').reduce((s, o) => s + (o.total_amount || 0), 0));
    setMpesaRevenue(orders.filter(o => o.payment_method === 'mpesa').reduce((s, o) => s + (o.total_amount || 0), 0));
    setTotalExpenses(expenses.reduce((s, e) => s + (e.total || 0), 0));
    setActiveBranches(branchList.filter(b => b.is_active).length);
  };

  // ─── Fetch branch sales for chart ─────────────────────────────────────────

  const fetchChartData = async (selectedRange: '7d' | '30d' | '90d') => {
    setChartLoading(true);
    const days = selectedRange === '7d' ? 7 : selectedRange === '30d' ? 30 : 90;
    const today = getKenyaDate();
    const from  = subtractDays(today, days - 1);

    const [branchRes, ordersRes] = await Promise.all([
      supabase.from('branches').select('id, name, code').eq('is_active', true).order('name'),
      supabase
        .from('orders')
        .select('branch_id, total_amount, created_at')
        .gte('created_at', `${from}T00:00:00`)
        .lte('created_at', `${today}T23:59:59`),
    ]);

    const branchList = branchRes.data || [];
    const orders     = ordersRes.data || [];
    setBranches(branchList);

    // Build a date range array
    const dateRange: string[] = [];
    const cur = new Date(from + 'T00:00:00');
    const end = new Date(today + 'T00:00:00');
    while (cur <= end) {
      dateRange.push(cur.toLocaleDateString('en-CA'));
      cur.setDate(cur.getDate() + 1);
    }

    // Group orders by date + branch
    const salesMap: Record<string, Record<string, number>> = {};
    orders.forEach((o: any) => {
      const date = new Date(o.created_at).toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
      const bid  = o.branch_id;
      if (!salesMap[date]) salesMap[date] = {};
      salesMap[date][bid] = (salesMap[date][bid] || 0) + (o.total_amount || 0);
    });

    // For 90d: aggregate weekly to reduce clutter
    let points: BranchSalesPoint[];
    if (selectedRange === '90d') {
      const weeks: Record<string, Record<string, number>> = {};
      dateRange.forEach(date => {
        const d   = new Date(date + 'T00:00:00');
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const mon = new Date(d.setDate(diff));
        const weekKey = mon.toLocaleDateString('en-CA');
        if (!weeks[weekKey]) weeks[weekKey] = {};
        branchList.forEach(b => {
          weeks[weekKey][b.id] = (weeks[weekKey][b.id] || 0) + (salesMap[date]?.[b.id] || 0);
        });
      });
      points = Object.entries(weeks)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, byBranch]) => {
          const point: BranchSalesPoint = { date, label: formatLabel(date, selectedRange) };
          branchList.forEach(b => { point[b.name] = byBranch[b.id] || 0; });
          return point;
        });
    } else {
      points = dateRange.map(date => {
        const point: BranchSalesPoint = { date, label: formatLabel(date, selectedRange) };
        branchList.forEach(b => { point[b.name] = salesMap[date]?.[b.id] || 0; });
        return point;
      });
    }

    setChartData(points);
    setChartLoading(false);
  };

  const handleRefresh = async () => {
    setLoading(true);
    await Promise.all([fetchStats(), fetchChartData(range)]);
    setLoading(false);
  };

  useEffect(() => { if (!authLoading) handleRefresh(); }, [authLoading]);

  const handleRangeChange = (r: '7d' | '30d' | '90d') => {
    setRange(r);
    fetchChartData(r);
  };

  // Net revenue
  const netRevenue = totalRevenue - totalExpenses;

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <DashboardLayout userName={profile?.full_name || 'Admin'} userRole={userRole}>
        <AdminDashboardSkeleton />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userName={profile?.full_name || 'Admin'} userRole={userRole}>
      <div className="p-4 md:p-8">
        <div className="max-w-7xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">Admin Dashboard</h1>
              <p className="text-muted-foreground">
                Welcome back, {profile?.full_name}!
              </p>
            </div>
            <Button onClick={handleRefresh} variant="outline" size="sm" disabled={loading}>
              <RefreshCwIcon className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Loading...' : 'Refresh'}
            </Button>
          </div>

          {/* Key Metrics */}
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Total Revenue', sub: 'Last 30 days', value: fmt(totalRevenue), Icon: DollarSignIcon, ring: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' },
              { label: "Today's Sales",  sub: `${todayOrders} orders`,       value: fmt(todayRevenue),  Icon: TrendingUpIcon, ring: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' },
              { label: 'Total Orders',  sub: 'Last 30 days', value: totalOrders.toLocaleString(), Icon: ShoppingCartIcon, ring: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' },
              { label: 'Active Branches', sub: 'Currently open', value: activeBranches.toString(), Icon: BuildingIcon, ring: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400' },
            ].map(({ label, sub, value, Icon, ring }) => (
              <Card key={label}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{label}</p>
                      <p className="text-2xl font-bold">{value}</p>
                      <p className="text-xs text-muted-foreground mt-1">{sub}</p>
                    </div>
                    <div className={`h-12 w-12 rounded-full flex items-center justify-center ${ring}`}>
                      <Icon className="h-6 w-6" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Secondary Metrics */}
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Cash Sales',    value: fmt(cashRevenue),  Icon: BanknoteIcon,   cls: 'from-green-50 to-green-100/50 dark:from-green-900/20 dark:to-green-800/10 border-green-200 dark:border-green-800', txt: 'text-green-800 dark:text-green-200', sub: 'text-green-700 dark:text-green-300' },
              { label: 'M-Pesa Sales',  value: fmt(mpesaRevenue), Icon: CreditCardIcon, cls: 'from-blue-50 to-blue-100/50 dark:from-blue-900/20 dark:to-blue-800/10 border-blue-200 dark:border-blue-800', txt: 'text-blue-800 dark:text-blue-200', sub: 'text-blue-700 dark:text-blue-300' },
              { label: 'Total Expenses',value: fmt(totalExpenses),Icon: ArrowDownIcon,  cls: 'from-red-50 to-red-100/50 dark:from-red-900/20 dark:to-red-800/10 border-red-200 dark:border-red-800', txt: 'text-red-800 dark:text-red-200', sub: 'text-red-700 dark:text-red-300' },
              { label: 'Net Revenue',   value: fmt(netRevenue),   Icon: ArrowUpIcon,    cls: 'from-emerald-50 to-emerald-100/50 dark:from-emerald-900/20 dark:to-emerald-800/10 border-emerald-200 dark:border-emerald-800', txt: 'text-emerald-800 dark:text-emerald-200', sub: 'text-emerald-700 dark:text-emerald-300' },
            ].map(({ label, value, Icon, cls, txt, sub }) => (
              <Card key={label} className={`bg-gradient-to-br ${cls}`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Icon className={`h-5 w-5 ${sub}`} />
                    <div>
                      <p className={`text-xs ${sub}`}>{label}</p>
                      <p className={`text-lg font-semibold ${txt}`}>{value}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Branch Sales Line Chart */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <BuildingIcon className="h-5 w-5 text-muted-foreground" />
                    Branch Sales Comparison
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Revenue per branch over time
                  </p>
                </div>
                {/* Range selector */}
                <div className="flex gap-1 p-1 bg-muted rounded-lg self-start sm:self-auto">
                  {RANGES.map(r => (
                    <button
                      key={r.key}
                      onClick={() => handleRangeChange(r.key as any)}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        range === r.key
                          ? 'bg-background shadow text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {chartLoading ? (
                <div className="relative h-80 w-full overflow-hidden rounded-md bg-muted/50 animate-pulse" />
              ) : chartData.length === 0 || branches.length === 0 ? (
                <div className="h-80 flex items-center justify-center text-muted-foreground">
                  No sales data for this period
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={340}>
                  <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" stroke="currentColor" opacity={0.2} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                      className="text-muted-foreground"
                    />
                    <YAxis
                      tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      width={50}
                      className="text-muted-foreground"
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ fontSize: '12px', paddingTop: '16px' }}
                    />
                    {branches.map((b, i) => (
                      <Line
                        key={b.id}
                        type="monotone"
                        dataKey={b.name}
                        stroke={BRANCH_COLORS[i % BRANCH_COLORS.length]}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 5, strokeWidth: 0 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

        </div>
      </div>
    </DashboardLayout>
  );
}
