'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/auth-context';
import { createClient } from '@/lib/supabase/client';
import { Loader2, PlusIcon, Trash2 } from 'lucide-react';
import { useNotification } from '@/components/ui/notification';
import { getKenyaDateString } from '@/lib/date-utils';
import { useShift } from '@/lib/shift/shift-context';
import { EndShiftModal } from '@/components/shift';

interface Product {
  id: string;
  product_name: string;
  product_price: number;
}

interface StockCount {
  product_id: string;
  opening_stock: string;
  additions: string;
  spoilt: string;
  closing_stock: string;
}

interface CashDenomination {
  denomination: number;
  quantity: number;
  total: number;
}

const DENOMINATIONS = [1000, 500, 200, 100, 50];

export default function CashierSalesPage() {
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const supabase = createClient();
  const { showNotification } = useNotification();
  const { hasActiveShift, loading: shiftLoading } = useShift();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [showEndShiftForLogout, setShowEndShiftForLogout] = useState(false);

  // Handle end shift and logout
  const handleEndShiftAndLogout = () => {
    setShowEndShiftForLogout(true);
  };

  const handleShiftEndedAndLogout = async () => {
    setShowEndShiftForLogout(false);
    await signOut();
    router.push('/login');
  };

  // Stock count state
  const [stockCounts, setStockCounts] = useState<StockCount[]>([{
    product_id: '',
    opening_stock: '',
    additions: '',
    spoilt: '',
    closing_stock: '',
  }]);

  // Cash reconciliation state
  const [balanceBroughtDown, setBalanceBroughtDown] = useState(0);
  const [mpesaAmount, setMpesaAmount] = useState('');
  const [paybillAmount, setPaybillAmount] = useState('');
  const [expenseTotal, setExpenseTotal] = useState('');
  const [denominations, setDenominations] = useState<CashDenomination[]>(
    DENOMINATIONS.map(d => ({ denomination: d, quantity: 0, total: 0 }))
  );
  const [coinsAmount, setCoinsAmount] = useState('');

  // Load saved form data from localStorage on mount
  useEffect(() => {
    const savedData = localStorage.getItem('salesStockForm');
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        if (parsed.stockCounts) setStockCounts(parsed.stockCounts);
        if (parsed.mpesaAmount) setMpesaAmount(parsed.mpesaAmount);
        if (parsed.paybillAmount) setPaybillAmount(parsed.paybillAmount);
        if (parsed.denominations) setDenominations(parsed.denominations);
        if (parsed.coinsAmount) setCoinsAmount(parsed.coinsAmount);
      } catch (e) {
        console.error('Error loading saved form data:', e);
      }
    }
  }, []);

  // Save form data to localStorage whenever it changes
  useEffect(() => {
    const formData = {
      stockCounts,
      mpesaAmount,
      paybillAmount,
      denominations,
      coinsAmount,
    };
    localStorage.setItem('salesStockForm', JSON.stringify(formData));
  }, [stockCounts, mpesaAmount, paybillAmount, denominations, coinsAmount]);

  const fetchExpenseTotal = useCallback(async () => {
    if (!profile?.branch_id) return;
    try {
      // Use Kenya timezone date
      const currentDate = getKenyaDateString();

      const { data: expensesData, error: expensesError } = await supabase
        .from('expenses')
        .select('total')
        .eq('branch_id', profile.branch_id)
        .eq('expense_date', currentDate);

      if (expensesError) throw expensesError;

      // Calculate total same way as expense page
      const total = (expensesData || []).reduce((sum, expense) => sum + parseFloat(expense.total.toString()), 0);
      setExpenseTotal(String(total));
    } catch (error) {
      console.error('Error fetching expense total:', error);
    }
  }, [profile?.branch_id, supabase]);

  const fetchInitialData = async () => {
    try {
      setLoading(true);

      // Fetch available products in branch
      const { data: productsData, error: productsError } = await supabase
        .rpc('get_branch_products', { target_branch_id: profile?.branch_id });

      if (productsError) throw productsError;

      const formattedProducts = productsData.map((p: any) => ({
        id: p.id,
        product_name: p.product_name,
        product_price: p.product_price,
      }));
      setProducts(formattedProducts);

      // Fetch last shift cash (balance brought down)
      const { data: lastCash, error: lastCashError } = await supabase
        .rpc('get_last_shift_cash', { target_branch_id: profile?.branch_id });

      if (lastCashError) throw lastCashError;
      setBalanceBroughtDown(lastCash || 0);

      // Fetch today's expense total directly from expenses table
      await fetchExpenseTotal();
    } catch (error) {
      console.error('Error fetching initial data:', error);
      showNotification('error', 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!profile?.branch_id) return;

    fetchInitialData();

    // Set up real-time subscription for expense changes
    const expenseSubscription = supabase
      .channel('sales_stock_expense_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'expenses',
          filter: `branch_id=eq.${profile.branch_id}`,
        },
        () => {
          // Refetch expense total when expenses change
          fetchExpenseTotal();
        }
      )
      .subscribe();

    return () => {
      expenseSubscription.unsubscribe();
    };
  }, [profile?.branch_id, fetchExpenseTotal]);

  const addStockRow = () => {
    setStockCounts([...stockCounts, {
      product_id: '',
      opening_stock: '',
      additions: '',
      spoilt: '',
      closing_stock: '',
    }]);
  };

  const removeStockRow = (index: number) => {
    if (stockCounts.length > 1) {
      setStockCounts(stockCounts.filter((_, i) => i !== index));
    }
  };

  const updateStockCount = (index: number, field: keyof StockCount, value: string | number) => {
    const updated = [...stockCounts];
    updated[index] = { ...updated[index], [field]: value };
    setStockCounts(updated);
  };

  const updateDenomination = (index: number, quantity: number) => {
    const updated = [...denominations];
    updated[index].quantity = quantity;
    updated[index].total = updated[index].denomination * quantity;
    setDenominations(updated);
  };

  // Block non-numeric keys (allow only numbers, decimal, backspace, delete, arrows, tab)
  const handleNumericKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const allowedKeys = [
      'Backspace', 'Delete', 'Tab', 'Enter', 'Escape',
      'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
      'Home', 'End'
    ];

    const isNumberKey = (e.key >= '0' && e.key <= '9');
    const isDecimalKey = e.key === '.' || e.key === ',';
    const isAllowedKey = allowedKeys.includes(e.key);
    const isCtrlA = (e.ctrlKey || e.metaKey) && e.key === 'a'; // Allow Ctrl+A

    if (!isNumberKey && !isDecimalKey && !isAllowedKey && !isCtrlA) {
      e.preventDefault();
    }

    // Prevent multiple decimal points
    if (isDecimalKey && e.currentTarget.value.includes('.')) {
      e.preventDefault();
    }
  };

  const cashInHand = denominations.reduce((sum, d) => sum + d.total, 0) + parseFloat(coinsAmount || '0');
  const grandTotal = parseFloat(mpesaAmount || '0') + parseFloat(paybillAmount || '0') + cashInHand + parseFloat(expenseTotal || '0');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate stock counts
    const validStockCounts = stockCounts.filter(sc => sc.product_id !== '');
    if (validStockCounts.length === 0) {
      showNotification('error', 'Please add at least one product stock count');
      return;
    }

    try {
      setSubmitting(true);

      // Generate shift number
      const { data: shiftNumberData, error: shiftNumberError } = await supabase
        .rpc('generate_shift_number');

      if (shiftNumberError) throw shiftNumberError;
      const shiftNumber = shiftNumberData as number;

      // Determine current shift type based on Kenya time
      const kenyaHour = parseInt(
        new Date().toLocaleString('en-US', {
          timeZone: 'Africa/Nairobi',
          hour: 'numeric',
          hour12: false
        })
      );
      const shiftType = (kenyaHour >= 7 && kenyaHour < 19) ? 'day' : 'night';

      // Create shift reconciliation record (not an active shift)
      // Denominations are stored as columns directly in the shifts table
      const { data: shiftData, error: shiftError } = await supabase
        .from('shifts')
        .insert({
          shift_number: shiftNumber,
          branch_id: profile?.branch_id,
          cashier_id: profile?.id,
          shift_type: shiftType,
          shift_date: new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' }),
          is_active: false,
          balance_brought_down: balanceBroughtDown,
          mpesa_amount: parseFloat(mpesaAmount || '0'),
          paybill_amount: parseFloat(paybillAmount || '0'),
          expense_total: parseFloat(expenseTotal || '0'),
          cash_in_hand: cashInHand,
          grand_total: grandTotal,
          // Denomination columns
          denom_1000_qty: denominations.find(d => d.denomination === 1000)?.quantity || 0,
          denom_1000_total: denominations.find(d => d.denomination === 1000)?.total || 0,
          denom_500_qty: denominations.find(d => d.denomination === 500)?.quantity || 0,
          denom_500_total: denominations.find(d => d.denomination === 500)?.total || 0,
          denom_200_qty: denominations.find(d => d.denomination === 200)?.quantity || 0,
          denom_200_total: denominations.find(d => d.denomination === 200)?.total || 0,
          denom_100_qty: denominations.find(d => d.denomination === 100)?.quantity || 0,
          denom_100_total: denominations.find(d => d.denomination === 100)?.total || 0,
          denom_50_qty: denominations.find(d => d.denomination === 50)?.quantity || 0,
          denom_50_total: denominations.find(d => d.denomination === 50)?.total || 0,
          coins_amount: parseFloat(coinsAmount || '0'),
        })
        .select()
        .single();

      if (shiftError) throw shiftError;

      // Insert stock counts
      const stockCountsData = validStockCounts.map(sc => ({
        shift_id: shiftData.id,
        product_id: sc.product_id,
        opening_stock: parseInt(sc.opening_stock) || 0,
        additions: parseInt(sc.additions) || 0,
        spoilt: parseInt(sc.spoilt) || 0,
        closing_stock: parseInt(sc.closing_stock) || 0,
      }));

      const { error: stockCountsError } = await supabase
        .from('stock_counts')
        .insert(stockCountsData);

      if (stockCountsError) throw stockCountsError;

      showNotification('success', `Shift #${shiftNumber} reconciled successfully!`);

      // Reset form
      resetForm();
      await fetchInitialData();
    } catch (error: any) {
      console.error('Error submitting shift reconciliation:', error);
      showNotification('error', 'Failed to submit shift reconciliation');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setStockCounts([{
      product_id: '',
      opening_stock: '',
      additions: '',
      spoilt: '',
      closing_stock: '',
    }]);
    setMpesaAmount('');
    setPaybillAmount('');
    setDenominations(DENOMINATIONS.map(d => ({ denomination: d, quantity: 0, total: 0 })));
    setCoinsAmount('');
    // Clear localStorage after successful submission
    localStorage.removeItem('salesStockForm');
    // Don't reset expenseTotal - it's dynamic and will update automatically
  };

  if (loading || shiftLoading) {
    return (
      <DashboardLayout
        userName={profile?.full_name || 'Cashier'}
        userRole="cashier"
        hasActiveShift={hasActiveShift}
        onEndShiftAndLogout={handleEndShiftAndLogout}
      >
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-8 w-8 animate-spin" />
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
          <h1 className="text-3xl font-bold">Sales & Stock</h1>
          <p className="text-muted-foreground">
            End-of-shift stock counting and cash reconciliation
          </p>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-6 overflow-auto">
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* LEFT SIDE - Stock Count */}
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle>Stock Count</CardTitle>
                    <Button type="button" onClick={addStockRow} size="sm" className="gap-2">
                      <PlusIcon className="h-4 w-4" />
                      Add Product
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-2 text-sm font-medium">#</th>
                          <th className="text-left py-2 px-2 text-sm font-medium">Product</th>
                          <th className="text-left py-2 px-2 text-sm font-medium">Opening</th>
                          <th className="text-left py-2 px-2 text-sm font-medium">Addition</th>
                          <th className="text-left py-2 px-2 text-sm font-medium">Spoilt</th>
                          <th className="text-left py-2 px-2 text-sm font-medium">Closing</th>
                          <th className="text-left py-2 px-2 text-sm font-medium"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {stockCounts.map((stock, index) => (
                          <tr key={index} className="border-b">
                            <td className="py-2 px-2 text-sm">{index + 1}</td>
                            <td className="py-2 px-2">
                              <select
                                value={stock.product_id}
                                onChange={(e) => updateStockCount(index, 'product_id', e.target.value)}
                                className="w-full px-2 py-1 border rounded text-sm"
                                required
                              >
                                <option value="">Select...</option>
                                {products
                                  .filter((product) => {
                                    // Show product if it's not selected in any other row
                                    // OR if it's the currently selected product in this row
                                    const selectedInOtherRow = stockCounts.some(
                                      (sc, idx) => idx !== index && sc.product_id === product.id
                                    );
                                    return !selectedInOtherRow || stock.product_id === product.id;
                                  })
                                  .map((product) => (
                                    <option key={product.id} value={product.id}>
                                      {product.product_name}
                                    </option>
                                  ))}
                              </select>
                            </td>
                            <td className="py-2 px-2">
                              <input
                                type="number"
                                min="0"
                                value={stock.opening_stock}
                                onChange={(e) => updateStockCount(index, 'opening_stock', e.target.value)}
                                onKeyDown={handleNumericKeyDown}
                                className="w-20 px-2 py-1 border rounded text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                placeholder="0"
                              />
                            </td>
                            <td className="py-2 px-2">
                              <input
                                type="number"
                                min="0"
                                value={stock.additions}
                                onChange={(e) => updateStockCount(index, 'additions', e.target.value)}
                                onKeyDown={handleNumericKeyDown}
                                className="w-20 px-2 py-1 border rounded text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                placeholder="0"
                              />
                            </td>
                            <td className="py-2 px-2">
                              <input
                                type="number"
                                min="0"
                                value={stock.spoilt}
                                onChange={(e) => updateStockCount(index, 'spoilt', e.target.value)}
                                onKeyDown={handleNumericKeyDown}
                                className="w-20 px-2 py-1 border rounded text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                placeholder="0"
                              />
                            </td>
                            <td className="py-2 px-2">
                              <input
                                type="number"
                                min="0"
                                value={stock.closing_stock}
                                onChange={(e) => updateStockCount(index, 'closing_stock', e.target.value)}
                                onKeyDown={handleNumericKeyDown}
                                className="w-20 px-2 py-1 border rounded text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                placeholder="0"
                              />
                            </td>
                            <td className="py-2 px-2">
                              {stockCounts.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeStockRow(index)}
                                  className="text-red-500 hover:text-red-700"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* RIGHT SIDE - Cash Sale */}
              <Card>
                <CardHeader>
                  <CardTitle>Cash Sale</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Balance Brought Down */}
                  <div className="flex items-center gap-4">
                    <label className="text-sm font-medium w-48">Balance Brought Down</label>
                    <input
                      type="number"
                      value={balanceBroughtDown}
                      className="flex-1 px-4 py-2 border rounded-lg bg-gray-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none pointer-events-none"
                      readOnly
                      tabIndex={-1}
                    />
                  </div>

                  {/* M-Pesa */}
                  <div className="flex items-center gap-4">
                    <label className="text-sm font-medium w-48">M-Pesa Amount</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={mpesaAmount}
                      onChange={(e) => setMpesaAmount(e.target.value)}
                      onKeyDown={handleNumericKeyDown}
                      className="flex-1 px-4 py-2 border rounded-lg [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      placeholder="0.00"
                      required
                    />
                  </div>

                  {/* Paybill */}
                  <div className="flex items-center gap-4">
                    <label className="text-sm font-medium w-48">Paybill Amount</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={paybillAmount}
                      onChange={(e) => setPaybillAmount(e.target.value)}
                      onKeyDown={handleNumericKeyDown}
                      className="flex-1 px-4 py-2 border rounded-lg [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      placeholder="0.00"
                      required
                    />
                  </div>

                  {/* Expense Total */}
                  <div className="flex items-center gap-4">
                    <label className="text-sm font-medium w-48">Expense Total</label>
                    <input
                      type="text"
                      value={parseFloat(expenseTotal || '0').toFixed(2)}
                      className="flex-1 px-4 py-2 border rounded-lg bg-gray-100 dark:bg-gray-800 cursor-not-allowed"
                      readOnly
                      disabled
                      tabIndex={-1}
                    />
                  </div>

                  {/* Cash Denominations */}
                  <div>
                    <label className="text-sm font-medium mb-2 block">Cash Denominations (KSh)</label>
                    <div className="border rounded-lg p-4 space-y-2">
                      {denominations.map((denom, index) => (
                        <div key={denom.denomination} className="grid grid-cols-3 gap-2 items-center">
                          <span className="text-sm font-medium">KSh {denom.denomination}</span>
                          <input
                            type="number"
                            min="0"
                            value={denom.quantity || ''}
                            onChange={(e) => updateDenomination(index, parseInt(e.target.value || '0'))}
                            onKeyDown={handleNumericKeyDown}
                            className="px-2 py-1 border rounded text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            placeholder="Qty"
                          />
                          <span className="text-sm text-right">
                            {denom.total > 0 ? `KSh ${denom.total.toFixed(2)}` : ''}
                          </span>
                        </div>
                      ))}
                      {/* Coins Row */}
                      <div className="grid grid-cols-3 gap-2 items-center">
                        <span className="text-sm font-medium">Coins</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={coinsAmount}
                          onChange={(e) => setCoinsAmount(e.target.value)}
                          onKeyDown={handleNumericKeyDown}
                          className="px-2 py-1 border rounded text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          placeholder="Amount"
                        />
                        <span className="text-sm text-right">
                          {coinsAmount && parseFloat(coinsAmount) > 0 ? `KSh ${parseFloat(coinsAmount).toFixed(2)}` : ''}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Cash in Hand */}
                  <div className="flex items-center gap-4">
                    <label className="text-sm font-medium w-48">Cash in Hand</label>
                    <input
                      type="number"
                      value={cashInHand.toFixed(2)}
                      className="flex-1 px-4 py-2 border rounded-lg bg-gray-50 font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      readOnly
                    />
                  </div>

                  {/* Grand Total */}
                  <div className="pt-4 border-t">
                    <div className="flex items-center gap-4">
                      <label className="text-sm font-medium w-48">Grand Total</label>
                      <input
                        type="number"
                        value={grandTotal.toFixed(2)}
                        className="flex-1 px-4 py-2 border-2 border-green-500 rounded-lg bg-green-50 font-bold text-lg text-green-900 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        readOnly
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Submit Button */}
            <div className="mt-6 flex justify-end">
              <Button type="submit" disabled={submitting} size="lg" className="gap-2">
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit Forms'
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </DashboardLayout>
  );
}
