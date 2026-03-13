'use client';

import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/dashboard/data-table';
import { StatCard } from '@/components/dashboard/stat-card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth/auth-context';
import { useClerkSupabaseClient } from '@/lib/supabase/client';
import { getKenyaDateString } from '@/lib/date-utils';
import { DollarSignIcon, TrendingDownIcon, BuildingIcon, Loader2Icon, PencilIcon, LockIcon } from 'lucide-react';

interface Expense {
  id: string;
  expense_number: number;
  branch_id: string;
  branch_name: string;
  cashier_id: string;
  cashier_name: string;
  category: string;
  description: string;
  price: number;
  quantity: number;
  total: number;
  shift: 'day' | 'night';
  expense_date: string;
  created_at: string;
}

interface Branch {
  id: string;
  name: string;
}

export default function AdminExpensesPage() {
  const { profile, loading: authLoading } = useAuth();
  const supabase = useClerkSupabaseClient();

  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  // Filter state
  const [selectedDate, setSelectedDate] = useState<string>(getKenyaDateString());
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [selectedShift, setSelectedShift] = useState<'all' | 'day' | 'night'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Stats
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [monthlyExpenses, setMonthlyExpenses] = useState(0);

  // Fetch branches
  useEffect(() => {
    if (authLoading) return;
    const fetchBranches = async () => {
      try {
        const { data, error } = await supabase
          .from('branches')
          .select('id, name')
          .eq('is_active', true)
          .order('name');

        if (error) throw error;
        setBranches(data || []);
      } catch (error) {
        console.error('Error fetching branches:', error);
      }
    };

    fetchBranches();
  }, [authLoading]);

  // Fetch expenses
  const fetchExpenses = async () => {
    try {
      setLoading(true);

      // Build query for expenses with branch and cashier info
      let query = supabase
        .from('expenses')
        .select(`
          id,
          expense_number,
          branch_id,
          cashier_id,
          category,
          description,
          price,
          quantity,
          total,
          shift,
          expense_date,
          created_at
        `)
        .eq('expense_date', selectedDate)
        .order('created_at', { ascending: false });

      // Filter by branch if selected
      if (selectedBranch !== 'all') {
        query = query.eq('branch_id', selectedBranch);
      }

      // Filter by shift if selected
      if (selectedShift !== 'all') {
        query = query.eq('shift', selectedShift);
      }

      // Filter by category if selected
      if (selectedCategory !== 'all') {
        query = query.eq('category', selectedCategory);
      }

      const { data: expensesData, error: expensesError } = await query;

      if (expensesError) throw expensesError;

      // Get unique branch and cashier IDs
      const branchIds = [...new Set(expensesData?.map(e => e.branch_id) || [])];
      const cashierIds = [...new Set(expensesData?.map(e => e.cashier_id) || [])];

      // Fetch branch and cashier names in parallel
      const [branchResult, cashierResult] = await Promise.all([
        branchIds.length > 0
          ? supabase.from('branches').select('id, name').in('id', branchIds)
          : Promise.resolve({ data: [] }),
        cashierIds.length > 0
          ? supabase.from('profiles').select('id, full_name').in('id', cashierIds)
          : Promise.resolve({ data: [] }),
      ]);
      const branchMap = new Map<string, string>(
        (branchResult.data || []).map((b: any) => [b.id, b.name])
      );
      const cashierMap = new Map<string, string>(
        (cashierResult.data || []).map((c: any) => [c.id, c.full_name])
      );

      // Map expenses with names
      const expensesWithNames = expensesData?.map(exp => ({
        ...exp,
        branch_name: branchMap.get(exp.branch_id) || 'Unknown Branch',
        cashier_name: cashierMap.get(exp.cashier_id) || 'Unknown',
      })) || [];

      setExpenses(expensesWithNames);

      // Calculate stats
      const total = expensesWithNames.reduce((sum, e) => sum + Number(e.total), 0);
      setTotalExpenses(total);

      // Fetch monthly total (all branches)
      const startOfMonth = selectedDate.substring(0, 7) + '-01';
      const { data: monthlyData, error: monthlyError } = await supabase
        .from('expenses')
        .select('total')
        .gte('expense_date', startOfMonth)
        .lte('expense_date', selectedDate);

      if (!monthlyError && monthlyData) {
        const monthTotal = monthlyData.reduce((sum, e) => sum + Number(e.total), 0);
        setMonthlyExpenses(monthTotal);
      }

    } catch (error) {
      console.error('Error fetching expenses:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) fetchExpenses();
  }, [authLoading, selectedDate, selectedBranch, selectedShift, selectedCategory]);

  // Set up real-time subscription
  useEffect(() => {
    const subscription = supabase
      .channel('admin_expense_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'expenses',
        },
        () => {
          fetchExpenses();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [selectedDate, selectedBranch, selectedShift, selectedCategory]);

  const expenseColumns = [
    {
      key: 'index',
      label: '#',
      render: (_: any, __: any, index: number) => index + 1,
    },
    { key: 'branch_name', label: 'Branch' },
    { key: 'cashier_name', label: 'Cashier' },
    {
      key: 'category',
      label: 'Category',
      render: (value: string) => (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          {value}
        </span>
      ),
    },
    { key: 'description', label: 'Description' },
    {
      key: 'price',
      label: 'Price',
      render: (value: number) => `Ksh ${Number(value).toFixed(2)}`,
    },
    { key: 'quantity', label: 'Qty' },
    {
      key: 'total',
      label: 'Total',
      render: (value: number) => `Ksh ${Number(value).toFixed(2)}`,
    },
    {
      key: 'shift',
      label: 'Shift',
      render: (value: string) => (
        <Badge variant={value === 'day' ? 'secondary' : 'default'}>
          {value === 'day' ? 'Day' : 'Night'}
        </Badge>
      ),
    },
  ];

  if (loading && expenses.length === 0) {
    return (
      <DashboardLayout userName={profile?.full_name || 'Admin'} userRole="admin">
        <div className="flex items-center justify-center h-96">
          <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userName={profile?.full_name || 'Admin'} userRole="admin">
      <div className="p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* Header */}
          <div>
            <h1 className="text-4xl font-bold">Expenses</h1>
          </div>

          {/* Stats */}
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard
              title="Today's Expenses"
              value={`Ksh ${totalExpenses.toLocaleString()}`}
              description={`${expenses.length} expense${expenses.length !== 1 ? 's' : ''} recorded`}
              icon={DollarSignIcon}
            />
            <StatCard
              title="This Month"
              value={`Ksh ${monthlyExpenses.toLocaleString()}`}
              description="Month to date"
              icon={TrendingDownIcon}
            />
            <StatCard
              title="Branches"
              value={branches.length.toString()}
              description="Active branches"
              icon={BuildingIcon}
            />
          </div>

          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle>Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Date Filter */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Date</label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg bg-background"
                  />
                </div>

                {/* Branch Filter */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Branch</label>
                  <select
                    value={selectedBranch}
                    onChange={(e) => setSelectedBranch(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg bg-background"
                  >
                    <option value="all">All Branches</option>
                    {branches.map(branch => (
                      <option key={branch.id} value={branch.id}>{branch.name}</option>
                    ))}
                  </select>
                </div>

                {/* Shift Filter */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Shift</label>
                  <select
                    value={selectedShift}
                    onChange={(e) => setSelectedShift(e.target.value as 'all' | 'day' | 'night')}
                    className="w-full px-4 py-2 border rounded-lg bg-background"
                  >
                    <option value="all">All Shifts</option>
                    <option value="day">Day Shift</option>
                    <option value="night">Night Shift</option>
                  </select>
                </div>

                {/* Category Filter */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Category</label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg bg-background"
                  >
                    <option value="all">All Categories</option>
                    <option value="Production">Production</option>
                    <option value="Staff Foods">Staff Foods</option>
                    <option value="Home">Home</option>
                    <option value="Miscellaneous">Miscellaneous</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Expenses Table */}
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <DataTable
              title="All Expenses"
              columns={expenseColumns}
              data={expenses}
            />
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
