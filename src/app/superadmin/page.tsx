'use client';

import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/auth-context';
import { useClerkSupabaseClient } from '@/lib/supabase/client';
import {
  DollarSignIcon,
  UsersIcon,
  TrendingUpIcon,
  BuildingIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  Loader2,
  RefreshCwIcon,
  CalendarIcon,
  CreditCardIcon,
  BanknoteIcon,
  CrownIcon,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardStats {
  totalRevenue: number;
  todayRevenue: number;
  totalOrders: number;
  todayOrders: number;
  totalEmployees: number;
  activeEmployees: number;
  totalBranches: number;
  activeBranches: number;
  cashRevenue: number;
  mpesaRevenue: number;
  totalExpenses: number;
  cashiers: number;
  managers: number;
  admins: number;
  superadmins: number;
}

interface DailySales {
  date: string;
  total: number;
  orders: number;
}

interface BranchSalesPoint {
  date: string;
  label: string;
  [branchName: string]: number | string;
}

interface Branch { id: string; name: string; code: string; }

// ─── Branch colours ───────────────────────────────────────────────────────────

const BRANCH_COLORS = [
  '#6366f1',
  '#f59e0b',
  '#10b981',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#f97316',
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

export default function SuperadminDashboard() {
  const { profile, loading: authLoading } = useAuth();
  const supabase = useClerkSupabaseClient();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [dailySales, setDailySales] = useState<DailySales[]>([]);

  // Chart state
  const [branches, setBranches] = useState<Branch[]>([]);
  const [chartData, setChartData] = useState<BranchSalesPoint[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [range, setRange] = useState<'7d' | '30d' | '90d'>('30d');

  const getDateRange = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    return { start: start.toISOString(), end: end.toISOString() };
  };

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const today = getKenyaDate();
      const { start: thirtyDaysAgo } = getDateRange(30);

      const [
        ordersResult,
        todayOrdersResult,
        profilesResult,
        branchesResult,
        expensesResult,
        dailySalesResult,
      ] = await Promise.all([
        supabase.from('orders').select('total_amount, payment_method').gte('created_at', thirtyDaysAgo),
        supabase.from('orders').select('total_amount, payment_method').gte('created_at', `${today}T00:00:00`),
        supabase.from('profiles').select('id, is_active, role').in('role', ['cashier', 'manager', 'admin', 'superadmin']),
        supabase.from('branches').select('id, is_active, name, code'),
        supabase.from('expenses').select('total').gte('created_at', thirtyDaysAgo),
        supabase.from('orders').select('created_at, total_amount').gte('created_at', getDateRange(7).start).order('created_at', { ascending: true }),
      ]);

      const orders = ordersResult.data || [];
      const todayOrders = todayOrdersResult.data || [];
      const profiles = profilesResult.data || [];
      const branchList = branchesResult.data || [];
      const expenses = expensesResult.data || [];

      setStats({
        totalRevenue:    orders.reduce((s, o) => s + (o.total_amount || 0), 0),
        todayRevenue:    todayOrders.reduce((s, o) => s + (o.total_amount || 0), 0),
        totalOrders:     orders.length,
        todayOrders:     todayOrders.length,
        totalEmployees:  profiles.length,
        activeEmployees: profiles.filter(p => p.is_active).length,
        totalBranches:   branchList.length,
        activeBranches:  branchList.filter(b => b.is_active).length,
        cashRevenue:     orders.filter(o => o.payment_method === 'cash').reduce((s, o) => s + (o.total_amount || 0), 0),
        mpesaRevenue:    orders.filter(o => o.payment_method === 'mpesa').reduce((s, o) => s + (o.total_amount || 0), 0),
        totalExpenses:   expenses.reduce((s, e) => s + (e.total || 0), 0),
        cashiers:        profiles.filter(p => p.role === 'cashier').length,
        managers:        profiles.filter(p => p.role === 'manager').length,
        admins:          profiles.filter(p => p.role === 'admin').length,
        superadmins:     profiles.filter(p => p.role === 'superadmin').length,
      });

      const salesByDay: Record<string, { total: number; orders: number }> = {};
      (dailySalesResult.data || []).forEach((order: any) => {
        const date = new Date(order.created_at).toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
        if (!salesByDay[date]) salesByDay[date] = { total: 0, orders: 0 };
        salesByDay[date].total += order.total_amount || 0;
        salesByDay[date].orders += 1;
      });
      setDailySales(Object.entries(salesByDay).map(([date, data]) => ({ date, ...data })).sort((a, b) => a.date.localeCompare(b.date)));

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchChartData = async (selectedRange: '7d' | '30d' | '90d') => {
    setChartLoading(true);
    const days = selectedRange === '7d' ? 7 : selectedRange === '30d' ? 30 : 90;
    const today = getKenyaDate();
    const from  = subtractDays(today, days - 1);

    const [branchRes, ordersRes] = await Promise.all([
      supabase.from('branches').select('id, name, code').eq('is_active', true).order('name'),
      supabase.from('orders').select('branch_id, total_amount, created_at')
        .gte('created_at', `${from}T00:00:00`)
        .lte('created_at', `${today}T23:59:59`),
    ]);

    const branchList = branchRes.data || [];
    const orders     = ordersRes.data || [];
    setBranches(branchList);

    const dateRange: string[] = [];
    const cur = new Date(from + 'T00:00:00');
    const end = new Date(today + 'T00:00:00');
    while (cur <= end) {
      dateRange.push(cur.toLocaleDateString('en-CA'));
      cur.setDate(cur.getDate() + 1);
    }

    const salesMap: Record<string, Record<string, number>> = {};
    orders.forEach((o: any) => {
      const date = new Date(o.created_at).toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
      const bid  = o.branch_id;
      if (!salesMap[date]) salesMap[date] = {};
      salesMap[date][bid] = (salesMap[date][bid] || 0) + (o.total_amount || 0);
    });

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
    await Promise.all([fetchDashboardData(), fetchChartData(range)]);
  };

  const handleRangeChange = (r: '7d' | '30d' | '90d') => {
    setRange(r);
    fetchChartData(r);
  };

  useEffect(() => {
    if (!authLoading) {
      fetchDashboardData();
      fetchChartData('30d');
    }
  }, [authLoading]);

  const formatCurrency = (amount: number) =>
    `Ksh ${amount.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  if (loading) {
    return (
      <DashboardLayout userName={profile?.full_name || 'Superadmin'} userRole="superadmin">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Loading dashboard...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const maxDailySale = Math.max(...dailySales.map(d => d.total), 1);

  return (
    <DashboardLayout userName={profile?.full_name || 'Superadmin'} userRole="superadmin">
      <div className="p-4 md:p-8">
        <div className="max-w-7xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-2">
              <CrownIcon className="h-8 w-8 text-amber-500" />
              <div>
                <h1 className="text-3xl font-bold">Superadmin Dashboard</h1>
              </div>
            </div>
            <Button onClick={handleRefresh} variant="outline" size="sm">
              <RefreshCwIcon className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>

          {/* Key Metrics */}
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Revenue</p>
                    <p className="text-2xl font-bold">{formatCurrency(stats?.totalRevenue || 0)}</p>
                    <p className="text-xs text-muted-foreground mt-1">Last 30 days</p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <DollarSignIcon className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Today&apos;s Sales</p>
                    <p className="text-2xl font-bold">{formatCurrency(stats?.todayRevenue || 0)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{stats?.todayOrders || 0} orders</p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <TrendingUpIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Users</p>
                    <p className="text-2xl font-bold">{stats?.activeEmployees || 0}</p>
                    <p className="text-xs text-muted-foreground mt-1">{stats?.totalEmployees || 0} total</p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                    <UsersIcon className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Branches</p>
                    <p className="text-2xl font-bold">{stats?.activeBranches || 0}</p>
                    <p className="text-xs text-muted-foreground mt-1">{stats?.totalBranches || 0} total</p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                    <BuildingIcon className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Secondary Metrics */}
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <Card className="bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-900/20 dark:to-green-800/10 border-green-200 dark:border-green-800">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <BanknoteIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <div>
                    <p className="text-xs text-green-700 dark:text-green-300">Cash Sales</p>
                    <p className="text-lg font-semibold text-green-800 dark:text-green-200">{formatCurrency(stats?.cashRevenue || 0)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-900/20 dark:to-blue-800/10 border-blue-200 dark:border-blue-800">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <CreditCardIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  <div>
                    <p className="text-xs text-blue-700 dark:text-blue-300">M-Pesa Sales</p>
                    <p className="text-lg font-semibold text-blue-800 dark:text-blue-200">{formatCurrency(stats?.mpesaRevenue || 0)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-900/20 dark:to-red-800/10 border-red-200 dark:border-red-800">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <ArrowDownIcon className="h-5 w-5 text-red-600 dark:text-red-400" />
                  <div>
                    <p className="text-xs text-red-700 dark:text-red-300">Total Expenses</p>
                    <p className="text-lg font-semibold text-red-800 dark:text-red-200">{formatCurrency(stats?.totalExpenses || 0)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-900/20 dark:to-emerald-800/10 border-emerald-200 dark:border-emerald-800">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <ArrowUpIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <div>
                    <p className="text-xs text-emerald-700 dark:text-emerald-300">Net Revenue</p>
                    <p className="text-lg font-semibold text-emerald-800 dark:text-emerald-200">{formatCurrency((stats?.totalRevenue || 0) - (stats?.totalExpenses || 0))}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts Row */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Daily Sales Chart */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-lg">Daily Sales (Last 7 Days)</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {dailySales.length === 0 ? (
                  <div className="flex items-center justify-center h-48 text-muted-foreground">
                    No sales data available
                  </div>
                ) : (
                  <div className="space-y-3">
                    {dailySales.map((day) => {
                      const percentage = (day.total / maxDailySale) * 100;
                      const date = new Date(day.date).toLocaleDateString('en-KE', {
                        timeZone: 'Africa/Nairobi', weekday: 'short', month: 'short', day: 'numeric',
                      });
                      return (
                        <div key={day.date} className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">{date}</span>
                            <span className="font-medium">{formatCurrency(day.total)}</span>
                          </div>
                          <div className="h-6 bg-secondary rounded-md overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all duration-500 rounded-md flex items-center justify-end pr-2"
                              style={{ width: `${Math.max(percentage, 5)}%` }}
                            >
                              <span className="text-xs text-primary-foreground font-medium">{day.orders} orders</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* User Distribution */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <UsersIcon className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-lg">User Distribution</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { role: 'Cashiers',   count: stats?.cashiers || 0,    color: 'bg-blue-500' },
                    { role: 'Managers',   count: stats?.managers || 0,    color: 'bg-green-500' },
                    { role: 'Admins',     count: stats?.admins || 0,      color: 'bg-amber-500' },
                    { role: 'Superadmins',count: stats?.superadmins || 0, color: 'bg-red-500' },
                  ].map((item) => {
                    const percentage = stats?.totalEmployees ? (item.count / stats.totalEmployees) * 100 : 0;
                    return (
                      <div key={item.role}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-muted-foreground">{item.role}</span>
                          <span className="font-medium">{item.count}</span>
                        </div>
                        <div className="w-full bg-secondary rounded-full h-2">
                          <div className={`${item.color} h-2 rounded-full transition-all duration-500`} style={{ width: `${percentage}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Branch Performance Line Chart */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <BuildingIcon className="h-5 w-5 text-muted-foreground" />
                    Branch Performance
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-0.5">Revenue per branch over time</p>
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
