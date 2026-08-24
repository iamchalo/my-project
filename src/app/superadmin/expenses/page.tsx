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
import { useNotification } from '@/components/ui/notification';
import { DollarSignIcon, TrendingDownIcon, BuildingIcon, Loader2Icon, PencilIcon, LockIcon, XIcon, SaveIcon, Trash2Icon } from 'lucide-react';

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

function getMonthEndDate(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return `${yearMonth}-${String(lastDay).padStart(2, '0')}`;
}

export default function AdminExpensesPage() {
  const { profile, loading: authLoading } = useAuth();
  const supabase = useClerkSupabaseClient();
  const { showNotification } = useNotification();

  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  // Edit modal state
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editCategory, setEditCategory] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editQuantity, setEditQuantity] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete state
  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Filter state
  const [filterMode, setFilterMode] = useState<'day' | 'month'>('day');
  const [selectedDate, setSelectedDate] = useState<string>(getKenyaDateString());
  const [selectedMonth, setSelectedMonth] = useState<string>(getKenyaDateString().substring(0, 7));
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
        .order('created_at', { ascending: false });

      if (filterMode === 'month') {
        const monthStart = `${selectedMonth}-01`;
        const monthEnd = getMonthEndDate(selectedMonth);
        query = query.gte('expense_date', monthStart).lte('expense_date', monthEnd);
      } else {
        query = query.eq('expense_date', selectedDate);
      }

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

      // Fetch monthly total (all branches, all shifts/categories)
      if (filterMode === 'month') {
        setMonthlyExpenses(total);
      } else {
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
      }

    } catch (error) {
      console.error('Error fetching expenses:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) fetchExpenses();
  }, [authLoading, filterMode, selectedDate, selectedMonth, selectedBranch, selectedShift, selectedCategory]);

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
  }, [filterMode, selectedDate, selectedMonth, selectedBranch, selectedShift, selectedCategory]);

  const openEditModal = (expense: Expense) => {
    setEditingExpense(expense);
    setEditCategory(expense.category);
    setEditDescription(expense.description);
    setEditPrice(expense.price.toString());
    setEditQuantity(expense.quantity.toString());
  };

  const closeEditModal = () => {
    setEditingExpense(null);
  };

  const handleSaveEdit = async () => {
    if (!editingExpense) return;

    if (!editCategory) { showNotification('error', 'Please select a category'); return; }
    if (!editDescription.trim()) { showNotification('error', 'Please enter a description'); return; }
    const priceVal = parseFloat(editPrice);
    const qtyVal = parseInt(editQuantity);
    if (isNaN(priceVal) || priceVal <= 0) { showNotification('error', 'Please enter a valid price'); return; }
    if (isNaN(qtyVal) || qtyVal <= 0) { showNotification('error', 'Please enter a valid quantity'); return; }

    try {
      setSaving(true);
      const totalVal = priceVal * qtyVal;
      const { error } = await supabase
        .from('expenses')
        .update({
          category: editCategory,
          description: editDescription.trim(),
          price: priceVal,
          quantity: qtyVal,
          total: totalVal,
        })
        .eq('id', editingExpense.id);

      if (error) throw error;
      showNotification('success', 'Expense updated successfully');
      closeEditModal();
      await fetchExpenses();
    } catch (error: any) {
      showNotification('error', `Failed to update expense: ${error?.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteExpense = async () => {
    if (!deletingExpense) return;

    try {
      setDeleting(true);
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', deletingExpense.id);

      if (error) throw error;
      showNotification('success', 'Expense deleted successfully');
      setDeletingExpense(null);
      await fetchExpenses();
    } catch (error: any) {
      showNotification('error', `Failed to delete expense: ${error?.message || 'Unknown error'}`);
    } finally {
      setDeleting(false);
    }
  };

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
    {
      key: 'actions',
      label: 'Actions',
      render: (_: any, row: Expense) => (
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openEditModal(row)}
            className="gap-1"
          >
            <PencilIcon className="h-4 w-4" />
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDeletingExpense(row)}
            className="gap-1 text-destructive hover:text-destructive"
          >
            <Trash2Icon className="h-4 w-4" />
            Delete
          </Button>
        </div>
      ),
    },
  ];

  if (loading && expenses.length === 0) {
    return (
      <DashboardLayout userName={profile?.full_name || 'Superadmin'} userRole="superadmin">
        <div className="flex items-center justify-center h-96">
          <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userName={profile?.full_name || 'Superadmin'} userRole="superadmin">
      {/* Edit Expense Modal */}
      {editingExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-semibold">Edit Expense</h2>
              <Button variant="ghost" size="sm" onClick={closeEditModal} disabled={saving}>
                <XIcon className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-6 space-y-4">
              {/* Branch & Cashier (read-only info) */}
              <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                <div><span className="font-medium text-foreground">Branch:</span> {editingExpense.branch_name}</div>
                <div><span className="font-medium text-foreground">Cashier:</span> {editingExpense.cashier_name}</div>
                <div><span className="font-medium text-foreground">Date:</span> {editingExpense.expense_date}</div>
                <div><span className="font-medium text-foreground">Shift:</span> {editingExpense.shift === 'day' ? 'Day' : 'Night'}</div>
              </div>

              {/* Category */}
              <div>
                <label className="text-sm font-medium mb-2 block">Category *</label>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  disabled={saving}
                  className="w-full px-4 py-2 border rounded-lg bg-background disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Select Category</option>
                  <option value="Production">Production</option>
                  <option value="Staff Foods">Staff Foods</option>
                  <option value="Home">Home</option>
                  <option value="Miscellaneous">Miscellaneous</option>
                </select>
              </div>

              {/* Description */}
              <div>
                <label className="text-sm font-medium mb-2 block">Description *</label>
                <input
                  type="text"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  disabled={saving}
                  className="w-full px-4 py-2 border rounded-lg disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* Price & Quantity */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Price (per unit)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    disabled={saving}
                    className="w-full px-4 py-2 border rounded-lg disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={editQuantity}
                    onChange={(e) => setEditQuantity(e.target.value)}
                    disabled={saving}
                    className="w-full px-4 py-2 border rounded-lg disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Calculated total preview */}
              {editPrice && editQuantity && (
                <div className="flex justify-between items-center bg-muted/50 px-4 py-3 rounded-lg text-sm">
                  <span className="text-muted-foreground">New Total:</span>
                  <span className="font-semibold">
                    Ksh {(parseFloat(editPrice || '0') * parseInt(editQuantity || '0')).toFixed(2)}
                  </span>
                </div>
              )}
            </div>
            <div className="flex gap-3 p-6 border-t">
              <Button variant="outline" onClick={closeEditModal} disabled={saving} className="flex-1">
                Cancel
              </Button>
              <Button onClick={handleSaveEdit} disabled={saving} className="flex-1 gap-2">
                {saving ? (
                  <><Loader2Icon className="h-4 w-4 animate-spin" />Saving...</>
                ) : (
                  <><SaveIcon className="h-4 w-4" />Save Changes</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Expense Confirmation Modal */}
      {deletingExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg shadow-xl w-full max-w-sm mx-4 p-6 space-y-4">
            <h2 className="text-xl font-semibold text-destructive">Delete Expense?</h2>
            <p className="text-sm text-muted-foreground">
              This will permanently delete the <strong>{deletingExpense.description}</strong> expense
              (Ksh {Number(deletingExpense.total).toFixed(2)}) for {deletingExpense.branch_name}. This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setDeletingExpense(null)} disabled={deleting}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeleteExpense} disabled={deleting} className="gap-2">
                {deleting ? (
                  <><Loader2Icon className="h-4 w-4 animate-spin" />Deleting...</>
                ) : (
                  <><Trash2Icon className="h-4 w-4" />Delete</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* Header */}
          <div>
            <h1 className="text-4xl font-bold">Expenses</h1>
          </div>

          {/* Stats */}
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard
              title={filterMode === 'month' ? 'Selected Month' : "Today's Expenses"}
              value={`Ksh ${totalExpenses.toLocaleString()}`}
              description={`${expenses.length} expense${expenses.length !== 1 ? 's' : ''} recorded`}
              icon={DollarSignIcon}
            />
            <StatCard
              title="This Month"
              value={`Ksh ${monthlyExpenses.toLocaleString()}`}
              description={filterMode === 'month' ? 'All branches' : 'Month to date'}
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
            <CardContent className="space-y-4">
              {/* Day / Month toggle */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={filterMode === 'day' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilterMode('day')}
                >
                  By Day
                </Button>
                <Button
                  type="button"
                  variant={filterMode === 'month' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilterMode('month')}
                >
                  By Month
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Date / Month Filter */}
                {filterMode === 'day' ? (
                  <div>
                    <label className="text-sm font-medium mb-2 block">Date</label>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="w-full px-4 py-2 border rounded-lg bg-background"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="text-sm font-medium mb-2 block">Month</label>
                    <input
                      type="month"
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="w-full px-4 py-2 border rounded-lg bg-background"
                    />
                  </div>
                )}

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
