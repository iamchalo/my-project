'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/auth-context';
import { useClerkSupabaseClient } from '@/lib/supabase/client';
import { Loader2, PlusIcon } from 'lucide-react';
import { useNotification } from '@/components/ui/notification';
import { getKenyaDateString, getTodayFormatted } from '@/lib/date-utils';
import { useShift } from '@/lib/shift/shift-context';
import { EndShiftModal } from '@/components/shift';
import { Skeleton } from '@/components/ui/skeleton';

interface Expense {
  id: string;
  expense_number: number;
  category: string;
  description: string;
  price: number;
  quantity: number;
  total: number;
  expense_date: string;
  created_at: string;
}

export default function CashierExpensesPage() {
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const supabase = useClerkSupabaseClient();
  const { showNotification } = useNotification();
  const { hasActiveShift, loading: shiftLoading, activeShift } = useShift();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showEndShiftForLogout, setShowEndShiftForLogout] = useState(false);

  // Form state
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('1');

  // Handle end shift and logout
  const handleEndShiftAndLogout = () => {
    setShowEndShiftForLogout(true);
  };

  const handleShiftEndedAndLogout = async () => {
    setShowEndShiftForLogout(false);
    await signOut();
    router.push('/login');
  };

  const today = getTodayFormatted();

  // Fetch today's expenses
  useEffect(() => {
    fetchExpenses(true);

    // Set up real-time subscription for expense changes
    if (profile?.branch_id) {
      const currentDate = new Date().toISOString().split('T')[0];

      const subscription = supabase
        .channel('expense_changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'expenses',
            filter: `branch_id=eq.${profile.branch_id}`,
          },
          () => {
            // Refetch expenses when any change occurs
            fetchExpenses(false);
          }
        )
        .subscribe();

      return () => {
        subscription.unsubscribe();
      };
    }
  }, [profile?.branch_id, profile?.id]);

  const fetchExpenses = async (showLoading: boolean = false) => {
    if (!profile?.branch_id || !profile?.id) {
      if (showLoading) setLoading(false);
      return;
    }

    try {
      if (showLoading) setLoading(true);
      const currentDate = getKenyaDateString();

      // Determine current shift from Kenya time
      const kenyaHour = parseInt(
        new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi', hour: 'numeric', hour12: false })
      );
      const currentShift = kenyaHour >= 7 && kenyaHour < 19 ? 'day' : 'night';

      const { data, error } = await supabase
        .from('expenses')
        .select('id, expense_number, category, description, price, quantity, total, expense_date, created_at')
        .eq('branch_id', profile.branch_id)
        .eq('cashier_id', profile.id)
        .eq('expense_date', currentDate)
        .eq('shift', currentShift)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setExpenses(data || []);
    } catch (error: any) {
      console.error('Error fetching expenses:', error);
      console.error('Error details:', {
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
      });
      showNotification('error', `Failed to load expenses: ${error?.message || 'Unknown error'}`);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!category) {
      showNotification('error', 'Please select a category');
      return;
    }

    if (!description.trim()) {
      showNotification('error', 'Please enter a description');
      return;
    }

    if (!price || parseFloat(price) <= 0) {
      showNotification('error', 'Please enter a valid price');
      return;
    }

    if (!quantity || parseInt(quantity) <= 0) {
      showNotification('error', 'Please enter a valid quantity');
      return;
    }

    if (!profile?.id || !profile?.branch_id) {
      showNotification('error', 'User profile not loaded');
      return;
    }

    try {
      setSubmitting(true);

      const priceValue = parseFloat(price);
      const quantityValue = parseInt(quantity);
      const totalValue = priceValue * quantityValue;

      // Determine current shift based on Kenya time
      const kenyaHour = new Date().toLocaleString('en-US', {
        timeZone: 'Africa/Nairobi',
        hour: 'numeric',
        hour12: false,
      });
      const currentShift = (parseInt(kenyaHour) >= 7 && parseInt(kenyaHour) < 19) ? 'day' : 'night';

      // Create expense — expense_number auto-generated by DB sequence default
      const { error: expenseError } = await supabase
        .from('expenses')
        .insert({
          branch_id: profile.branch_id,
          cashier_id: profile.id,
          category: category,
          description: description.trim(),
          price: priceValue,
          quantity: quantityValue,
          total: totalValue,
          shift: currentShift,
          expense_date: getKenyaDateString(),
        });

      if (expenseError) throw expenseError;

      // Clear form
      setCategory('');
      setDescription('');
      setPrice('');
      setQuantity('1');

      // Refresh expenses (without loading spinner)
      await fetchExpenses(false);

      showNotification('success', `Expense logged successfully! Total: KSh ${totalValue.toFixed(2)}`);
    } catch (error: any) {
      console.error('Error saving expense:', error);
      console.error('Error details:', {
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
      });
      showNotification('error', `Failed to save expense: ${error?.message || 'Unknown error'}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Calculate total
  const dailyTotal = expenses.reduce((sum, expense) => sum + parseFloat(expense.total.toString()), 0);

  if (loading || shiftLoading) {
    return (
      <DashboardLayout
        userName={profile?.full_name || 'Cashier'}
        userRole="cashier"
        hasActiveShift={hasActiveShift}
        onEndShiftAndLogout={handleEndShiftAndLogout}
      >
        <div className="h-full flex flex-col">
          {/* Header Skeleton */}
          <div className="px-8 pt-6 pb-4 border-b">
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>

          {/* Content Skeleton */}
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
            {/* Left Side - Form Skeleton */}
            <div className="lg:col-span-1">
              <Card className="h-full">
                <CardHeader>
                  <Skeleton className="h-6 w-32" />
                </CardHeader>
                <CardContent className="space-y-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-12 w-full" />
                </CardContent>
              </Card>
            </div>

            {/* Right Side - Table Skeleton */}
            <div className="lg:col-span-2">
              <Card className="h-full">
                <CardHeader>
                  <Skeleton className="h-6 w-40" />
                </CardHeader>
                <CardContent className="space-y-3">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-16 w-full" />
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      userName={profile?.full_name || 'Cashier'}
      userRole="cashier"
      hasActiveShift={hasActiveShift}
      onEndShiftAndLogout={handleEndShiftAndLogout}
    >
      {/* End Shift Modal for Logout */}
      <EndShiftModal
        isOpen={showEndShiftForLogout}
        onClose={() => setShowEndShiftForLogout(false)}
        onShiftEnded={handleShiftEndedAndLogout}
      />

      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="px-8 pt-6 pb-4 border-b">
          <h1 className="text-3xl font-bold">Daily Expenses</h1>
        </div>

        {/* Main Content - Two Column Layout */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 overflow-hidden">
          {/* Left Side - Expense Form (1/3 width) */}
          <div className="lg:col-span-1">
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PlusIcon className="h-5 w-5" />
                  Log New Expense
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!hasActiveShift ? (
                  <div className="text-center py-8 space-y-4">
                    <p className="text-muted-foreground">
                      You must start a shift before logging expenses
                    </p>
                    <Button onClick={() => window.location.href = '/cashier'}>
                      Go to Dashboard
                    </Button>
                  </div>
                ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Category */}
                  <div>
                    <label htmlFor="category" className="text-sm font-medium mb-2 block">
                      Category *
                    </label>
                    <select
                      id="category"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      disabled={submitting}
                      className="w-full px-4 py-2 border rounded-lg disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary bg-background"
                      required
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
                    <label htmlFor="description" className="text-sm font-medium mb-2 block">
                      Description
                    </label>
                    <input
                      id="description"
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="e.g., Office supplies, Cleaning materials"
                      disabled={submitting}
                      className="w-full px-4 py-2 border rounded-lg disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary"
                      required
                    />
                  </div>

                  {/* Price */}
                  <div>
                    <label htmlFor="price" className="text-sm font-medium mb-2 block">
                      Price (per unit)
                    </label>
                    <input
                      id="price"
                      type="number"
                      step="0.01"
                      min="0"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="0.00"
                      disabled={submitting}
                      className="w-full px-4 py-2 border rounded-lg disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary"
                      required
                    />
                  </div>

                  {/* Quantity */}
                  <div>
                    <label htmlFor="quantity" className="text-sm font-medium mb-2 block">
                      Quantity
                    </label>
                    <input
                      id="quantity"
                      type="number"
                      min="1"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      placeholder="1"
                      disabled={submitting}
                      className="w-full px-4 py-2 border rounded-lg disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary"
                      required
                    />
                  </div>

                  {/* Date (Greyed Out) */}
                  <div>
                    <label htmlFor="date" className="text-sm font-medium mb-2 block">
                      Date
                    </label>
                    <input
                      id="date"
                      type="text"
                      value={today}
                      disabled
                      className="w-full px-4 py-2 border rounded-lg bg-gray-100 text-gray-600 cursor-not-allowed"
                      readOnly
                    />
                  </div>

                  {/* Submit Button */}
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="w-full gap-2"
                    size="lg"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <PlusIcon className="h-4 w-4" />
                        Add Expense
                      </>
                    )}
                  </Button>
                </form>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Side - Expense History (2/3 width) */}
          <div className="lg:col-span-2 flex flex-col">
            <Card className="flex-1 flex flex-col overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle>Today's Expense History</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col overflow-hidden pt-2">
                {/* Table */}
                <div className="flex-1 overflow-auto border rounded-lg mb-4">
                  <table className="w-full">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          #
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Category
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Description
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Price
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Quantity
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {expenses.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                            No expenses logged today
                          </td>
                        </tr>
                      ) : (
                        expenses.map((expense, index) => (
                          <tr key={expense.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {index + 1}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                {expense.category}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {expense.description}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 text-right">
                              KSh {parseFloat(expense.price.toString()).toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 text-right">
                              {expense.quantity}
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">
                              KSh {parseFloat(expense.total.toString()).toFixed(2)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Total Summation */}
                <div className="border-t pt-4">
                  <div className="flex justify-between items-center bg-blue-50 px-6 py-4 rounded-lg">
                    <span className="text-lg font-semibold text-gray-900">
                      Total Daily Expenses
                    </span>
                    <span className="text-2xl font-bold text-blue-600">
                      KSh {dailyTotal.toFixed(2)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
