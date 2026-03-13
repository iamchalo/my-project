'use client';

import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/dashboard/data-table';
import { StatCard } from '@/components/dashboard/stat-card';
import { DollarSignIcon, PencilIcon, XIcon, Loader2Icon, LockIcon } from 'lucide-react';
import { useClerkSupabaseClient } from '@/lib/supabase/client';
import { getKenyaDateString, getKenyaHour } from '@/lib/date-utils';

interface Expense {
  id: string;
  expense_number: number;
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

interface Profile {
  id: string;
  full_name: string;
  branch_id: string;
  role: string;
}

interface Cashier {
  id: string;
  full_name: string;
}

export default function ManagerExpensesPage() {
  const supabase = useClerkSupabaseClient();

  // User state
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Data state
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [cashiers, setCashiers] = useState<Cashier[]>([]);

  // Filter state — date is always today (daily view only)
  const selectedDate = getKenyaDateString();
  const [selectedShift, setSelectedShift] = useState<'all' | 'day' | 'night'>('all');
  const [selectedCashier, setSelectedCashier] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    category: '',
    description: '',
    price: '',
    quantity: '1',
    shift: 'day' as 'day' | 'night',
  });

  // Notification state
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
  };

  // Get current shift type based on Kenya time
  const getCurrentShiftType = (): 'day' | 'night' => {
    const kenyaHour = getKenyaHour();
    return (kenyaHour >= 7 && kenyaHour < 19) ? 'day' : 'night';
  };

  // Check if an expense can be edited (only current day + current shift)
  const canEditExpense = (expense: Expense): boolean => {
    const today = getKenyaDateString();
    const currentShift = getCurrentShiftType();

    // Can only edit if expense is from today AND from the current shift
    return expense.expense_date === today && expense.shift === currentShift;
  };

  // Fetch user profile
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, branch_id, role')
          .eq('id', user.id)
          .single();

        if (error) throw error;
        setProfile(data);
      } catch (error) {
        console.error('Error fetching profile:', error);
        showNotification('error', 'Failed to load profile');
      }
    };

    fetchProfile();
  }, []);

  // Fetch cashiers for dropdown
  useEffect(() => {
    const fetchCashiers = async () => {
      if (!profile?.branch_id) return;

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name')
          .eq('branch_id', profile.branch_id)
          .in('role', ['cashier', 'manager'])
          .order('full_name');

        if (error) throw error;
        setCashiers(data || []);
      } catch (error) {
        console.error('Error fetching cashiers:', error);
      }
    };

    fetchCashiers();
  }, [profile?.branch_id]);

  // Fetch expenses
  const fetchExpenses = async (showLoading: boolean = false) => {
    if (!profile?.branch_id) return;

    try {
      if (showLoading) setLoading(true);

      // Use the database function to get expenses with cashier names
      const { data, error } = await supabase
        .rpc('get_expenses_by_branch_date_shift', {
          p_branch_id: profile.branch_id,
          p_date: selectedDate,
          p_shift: selectedShift === 'all' ? null : selectedShift,
        });

      if (error) throw error;

      // Filter by cashier on client side if needed
      let filteredData = data || [];
      if (selectedCashier !== 'all') {
        filteredData = filteredData.filter(
          (exp: Expense) => exp.cashier_id === selectedCashier
        );
      }

      // Filter by category on client side if needed
      if (selectedCategory !== 'all') {
        filteredData = filteredData.filter(
          (exp: Expense) => exp.category === selectedCategory
        );
      }

      setExpenses(filteredData);
    } catch (error) {
      console.error('Error fetching expenses:', error);
      showNotification('error', 'Failed to load expenses');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  // Initial fetch and real-time subscription
  useEffect(() => {
    if (!profile?.branch_id) return;

    fetchExpenses(true);

    // Set up real-time subscription
    const subscription = supabase
      .channel('manager_expense_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'expenses',
          filter: `branch_id=eq.${profile.branch_id}`,
        },
        () => {
          fetchExpenses(false);
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [profile?.branch_id, selectedDate, selectedShift, selectedCashier, selectedCategory]);

  // Calculate stats from filtered data
  const totalAmount = expenses.reduce((sum, e) => sum + Number(e.total), 0);
  const expenseCount = expenses.length;

  // Handle edit expense
  const handleEdit = async () => {
    if (!editingExpense || !formData.category || !formData.description || !formData.price) {
      showNotification('error', 'Please fill in all required fields');
      return;
    }

    try {
      setSaving(true);

      const priceValue = parseFloat(formData.price);
      const quantityValue = parseInt(formData.quantity);

      if (priceValue <= 0 || quantityValue <= 0) {
        showNotification('error', 'Price and quantity must be greater than 0');
        return;
      }

      const { error } = await supabase
        .from('expenses')
        .update({
          category: formData.category,
          description: formData.description.trim(),
          price: priceValue,
          quantity: quantityValue,
          total: priceValue * quantityValue,
        })
        .eq('id', editingExpense.id);

      if (error) throw error;

      showNotification('success', 'Expense updated successfully');
      setEditingExpense(null);
      setFormData({ category: '', description: '', price: '', quantity: '1', shift: 'day' });
      setShowEditModal(false);
    } catch (error) {
      console.error('Error updating expense:', error);
      showNotification('error', 'Failed to update expense');
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = (expense: Expense) => {
    setEditingExpense(expense);
    setFormData({
      category: expense.category,
      description: expense.description,
      price: expense.price.toString(),
      quantity: expense.quantity.toString(),
      shift: expense.shift,
    });
    setShowEditModal(true);
  };

  const expenseColumns = [
    {
      key: 'index',
      label: '#',
      render: (_: any, __: any, index: number) => index + 1,
    },
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
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
          value === 'day'
            ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
            : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
        }`}>
          {value === 'day' ? 'Day' : 'Night'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_: any, row: Expense) => (
        canEditExpense(row) ? (
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={() => openEditModal(row)}
          >
            <PencilIcon className="h-3 w-3" />
            Edit
          </Button>
        ) : (
          <span className="flex items-center gap-1 text-xs text-muted-foreground" title="Cannot edit expenses from previous shifts">
            <LockIcon className="h-3 w-3" />
            Locked
          </span>
        )
      ),
    },
  ];

  if (loading && !profile) {
    return (
      <DashboardLayout userName="Loading..." userRole="manager">
        <div className="flex items-center justify-center h-96">
          <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userName={profile?.full_name || 'Manager'} userRole="manager">
      <div className="p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* Notification */}
          {notification && (
            <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 rounded-lg shadow-lg ${
              notification.type === 'success'
                ? 'bg-green-500 text-white'
                : 'bg-red-500 text-white'
            }`}>
              {notification.message}
            </div>
          )}

          {/* Header */}
          <div>
            <h1 className="text-4xl font-bold">Expenses</h1>
          </div>

          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle>Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Shift Filter */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Shift</label>
                  <select
                    value={selectedShift}
                    onChange={(e) => setSelectedShift(e.target.value as 'all' | 'day' | 'night')}
                    className="w-full px-4 py-2 border rounded-lg bg-background"
                  >
                    <option value="all">All Shifts</option>
                    <option value="day">Day Shift (7AM - 7PM)</option>
                    <option value="night">Night Shift (7PM - 7AM)</option>
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

                {/* Cashier Filter */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Cashier</label>
                  <select
                    value={selectedCashier}
                    onChange={(e) => setSelectedCashier(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg bg-background"
                  >
                    <option value="all">All Cashiers</option>
                    {cashiers.map(cashier => (
                      <option key={cashier.id} value={cashier.id}>{cashier.full_name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Stats */}
          <div className="grid gap-4 md:grid-cols-2">
            <StatCard
              title="Total Expenses"
              value={`Ksh ${totalAmount.toFixed(2)}`}
              description={`${expenseCount} expense${expenseCount !== 1 ? 's' : ''} found`}
              icon={DollarSignIcon}
            />
            <StatCard
              title="Filter Active"
              value={selectedShift === 'all' ? 'All Shifts' : `${selectedShift === 'day' ? 'Day' : 'Night'} Shift`}
              description={selectedCashier === 'all' ? 'All Cashiers' : cashiers.find(c => c.id === selectedCashier)?.full_name || ''}
              icon={DollarSignIcon}
            />
          </div>

          {/* Expenses Table */}
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <DataTable
              title="Expenses"
              columns={expenseColumns}
              data={expenses}
            />
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {showEditModal && editingExpense && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Edit Expense</h2>
              <button onClick={() => setShowEditModal(false)}>
                <XIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Category *</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg bg-background"
                  required
                >
                  <option value="">Select Category</option>
                  <option value="Production">Production</option>
                  <option value="Staff Foods">Staff Foods</option>
                  <option value="Home">Home</option>
                  <option value="Miscellaneous">Miscellaneous</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg bg-background"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Price</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg bg-background"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg bg-background"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Total</label>
                <input
                  type="text"
                  value={`Ksh ${(parseFloat(formData.price || '0') * parseInt(formData.quantity || '1')).toFixed(2)}`}
                  className="w-full px-4 py-2 border rounded-lg bg-gray-100 dark:bg-gray-800"
                  disabled
                />
              </div>
              <div className="flex gap-2 pt-4">
                <Button variant="outline" onClick={() => setShowEditModal(false)} className="flex-1">
                  Cancel
                </Button>
                <Button onClick={handleEdit} className="flex-1" disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2Icon className="h-4 w-4 animate-spin mr-2" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
