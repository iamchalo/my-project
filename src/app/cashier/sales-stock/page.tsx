'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/auth-context';
import { createClient } from '@/lib/supabase/client';
import { Loader2 } from 'lucide-react';
import { useNotification } from '@/components/ui/notification';
import { getKenyaDateString } from '@/lib/date-utils';
import { useShift } from '@/lib/shift/shift-context';
import { EndShiftModal } from '@/components/shift';
import { Skeleton } from '@/components/ui/skeleton';

interface Product {
  id: string;
  product_name: string;
  product_price: number;
}

interface StockCount {
  product_id: string;
  opening_stock: string;
  additions: string;
  transfer: string;
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
  const [activeShiftId, setActiveShiftId] = useState<string | null>(null);

  const handleEndShiftAndLogout = () => setShowEndShiftForLogout(true);

  const handleShiftEndedAndLogout = async () => {
    setShowEndShiftForLogout(false);
    await signOut();
    router.push('/login');
  };

  const [stockCounts, setStockCounts] = useState<StockCount[]>([]);

  // Cash reconciliation state
  const [balanceBroughtDown, setBalanceBroughtDown] = useState(0);
  const [mpesaAmount, setMpesaAmount] = useState('');
  const [paybillAmount, setPaybillAmount] = useState('');
  const [expenseTotal, setExpenseTotal] = useState('');
  const [denominations, setDenominations] = useState<CashDenomination[]>(
    DENOMINATIONS.map(d => ({ denomination: d, quantity: 0, total: 0 }))
  );
  const [coinsAmount, setCoinsAmount] = useState('');

  useEffect(() => {
    const savedData = localStorage.getItem('salesStockForm');
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        if (parsed.mpesaAmount) setMpesaAmount(parsed.mpesaAmount);
        if (parsed.paybillAmount) setPaybillAmount(parsed.paybillAmount);
        if (parsed.denominations) setDenominations(parsed.denominations);
        if (parsed.coinsAmount) setCoinsAmount(parsed.coinsAmount);
      } catch (e) {
        console.error('Error loading saved form data:', e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('salesStockForm', JSON.stringify({
      mpesaAmount, paybillAmount, denominations, coinsAmount,
    }));
  }, [mpesaAmount, paybillAmount, denominations, coinsAmount]);

  const fetchExpenseTotal = useCallback(async () => {
    if (!profile?.branch_id || !profile?.id) return;
    try {
      const currentDate = getKenyaDateString();
      const kenyaHour = parseInt(
        new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi', hour: 'numeric', hour12: false })
      );
      const currentShift = kenyaHour >= 7 && kenyaHour < 19 ? 'day' : 'night';

      const { data: expensesData, error } = await supabase
        .from('expenses')
        .select('total')
        .eq('branch_id', profile.branch_id)
        .eq('cashier_id', profile.id)
        .eq('expense_date', currentDate)
        .eq('shift', currentShift);

      if (error) throw error;
      const total = (expensesData || []).reduce((sum, e) => sum + parseFloat(e.total.toString()), 0);
      setExpenseTotal(String(total));
    } catch (error) {
      console.error('Error fetching expense total:', error);
    }
  }, [profile?.branch_id, profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchInitialData = async (showPageLoader = true) => {
    try {
      if (showPageLoader) setLoading(true);

      // Fetch active products for branch
      const { data: productsData, error: productsError } = await supabase
        .rpc('get_branch_products', { target_branch_id: profile?.branch_id });
      if (productsError) throw productsError;

      const formattedProducts: Product[] = productsData.map((p: any) => ({
        id: p.id,
        product_name: p.product_name,
        product_price: p.product_price,
      }));
      setProducts(formattedProducts);

      setStockCounts(formattedProducts.map((p: Product) => ({
        product_id: p.id,
        opening_stock: '',
        additions: '',
        transfer: '',
        spoilt: '',
        closing_stock: '',
      })));

      // Fetch last shift cash (balance brought down) — non-fatal if RPC missing
      const { data: lastCash, error: lastCashError } = await supabase
        .rpc('get_last_shift_cash', { target_branch_id: profile?.branch_id });
      if (lastCashError) {
        console.warn('get_last_shift_cash error (using 0):', lastCashError.message);
      }
      setBalanceBroughtDown(lastCash || 0);

      // Fetch active shift ID — non-fatal if missing
      try {
        const { data: activeShift } = await supabase
          .from('shifts')
          .select('id')
          .eq('branch_id', profile?.branch_id)
          .eq('is_active', true)
          .maybeSingle();
        if (activeShift) setActiveShiftId(activeShift.id);
      } catch (shiftErr) {
        console.warn('Could not fetch active shift ID:', shiftErr);
      }
    } catch (error) {
      console.error('Error fetching initial data:', error);
      showNotification('error', 'Failed to load data');
    } finally {
      if (showPageLoader) setLoading(false);
    }
  };

  useEffect(() => {
    if (!profile?.branch_id) {
      setLoading(false);
      return;
    }

    fetchInitialData();
    fetchExpenseTotal();

    const expenseSubscription = supabase
      .channel('sales_stock_expense_changes')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'expenses',
        filter: `branch_id=eq.${profile.branch_id}`,
      }, () => fetchExpenseTotal())
      .subscribe();

    return () => { expenseSubscription.unsubscribe(); };
  }, [profile?.branch_id, fetchExpenseTotal]);

  const updateStockCount = (index: number, field: keyof StockCount, value: string) => {
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

  const handleNumericKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const allowedKeys = ['Backspace','Delete','Tab','Enter','Escape','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'];
    const isNumberKey = e.key >= '0' && e.key <= '9';
    const isDecimalKey = e.key === '.' || e.key === ',';
    const isCtrlA = (e.ctrlKey || e.metaKey) && e.key === 'a';
    if (!isNumberKey && !isDecimalKey && !allowedKeys.includes(e.key) && !isCtrlA) e.preventDefault();
    if (isDecimalKey && e.currentTarget.value.includes('.')) e.preventDefault();
  };

const cashInHand = denominations.reduce((sum, d) => sum + d.total, 0) + parseFloat(coinsAmount || '0');
  const grandTotal =
    cashInHand
    + parseFloat(mpesaAmount || '0')
    + parseFloat(paybillAmount || '0')
    + parseFloat(expenseTotal || '0')
    - (balanceBroughtDown || 0);

  const fmtAmount = (n: number) =>
    n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (stockCounts.length === 0) {
      showNotification('error', 'No products found for stock count');
      return;
    }

    try {
      setSubmitting(true);

      const { data: shiftNumberData, error: shiftNumberError } = await supabase
        .rpc('generate_shift_number');
      if (shiftNumberError) throw shiftNumberError;
      const shiftNumber = shiftNumberData as number;

      const kenyaHour = parseInt(
        new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi', hour: 'numeric', hour12: false })
      );
      const shiftType = kenyaHour >= 7 && kenyaHour < 19 ? 'day' : 'night';

      const { data: shiftData, error: shiftError } = await supabase
        .from('shifts')
        .insert({
          shift_number: shiftNumber,
          branch_id: profile?.branch_id,
          cashier_id: profile?.id,
          shift_type: shiftType,
          shift_date: new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' }),
          is_active: false,
          active_shift_id: activeShiftId,
          balance_brought_down: balanceBroughtDown,
          mpesa_amount: parseFloat(mpesaAmount || '0'),
          paybill_amount: parseFloat(paybillAmount || '0'),
          expense_total: parseFloat(expenseTotal || '0'),
          cash_in_hand: cashInHand,
          grand_total: grandTotal,
          denom_1000_qty:   denominations.find(d => d.denomination === 1000)?.quantity || 0,
          denom_1000_total: denominations.find(d => d.denomination === 1000)?.total || 0,
          denom_500_qty:    denominations.find(d => d.denomination === 500)?.quantity || 0,
          denom_500_total:  denominations.find(d => d.denomination === 500)?.total || 0,
          denom_200_qty:    denominations.find(d => d.denomination === 200)?.quantity || 0,
          denom_200_total:  denominations.find(d => d.denomination === 200)?.total || 0,
          denom_100_qty:    denominations.find(d => d.denomination === 100)?.quantity || 0,
          denom_100_total:  denominations.find(d => d.denomination === 100)?.total || 0,
          denom_50_qty:     denominations.find(d => d.denomination === 50)?.quantity || 0,
          denom_50_total:   denominations.find(d => d.denomination === 50)?.total || 0,
          coins_amount: parseFloat(coinsAmount || '0'),
        })
        .select()
        .single();

      if (shiftError) throw shiftError;

      const stockCountsData = stockCounts.map(sc => ({
        shift_id: shiftData.id,
        product_id: sc.product_id,
        opening_stock: parseInt(sc.opening_stock) || 0,
        additions: parseInt(sc.additions) || 0,
        transfer: parseInt(sc.transfer) || 0,
        spoilt: parseInt(sc.spoilt) || 0,
        closing_stock: parseInt(sc.closing_stock) || 0,
      }));

      const { error: stockCountsError } = await supabase
        .from('stock_counts')
        .insert(stockCountsData);
      if (stockCountsError) throw stockCountsError;

      showNotification('success', `Shift #${shiftNumber} reconciled successfully!`);

      const nextBalance = cashInHand;
      resetForm();
      setBalanceBroughtDown(nextBalance);
      await fetchExpenseTotal();
    } catch (error: any) {
      console.error('Error submitting shift reconciliation:', error);
      showNotification('error', `Failed to submit: ${error?.message || 'Unknown error'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setStockCounts(products.map(p => ({
      product_id: p.id,
      opening_stock: '',
      additions: '',
      transfer: '',
      spoilt: '',
      closing_stock: '',
    })));
    setMpesaAmount('');
    setPaybillAmount('');
    setDenominations(DENOMINATIONS.map(d => ({ denomination: d, quantity: 0, total: 0 })));
    setCoinsAmount('');
    localStorage.removeItem('salesStockForm');
  };

  const inputCls = 'w-full px-1.5 py-1 border rounded text-xs text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

  if (loading) {
    return (
      <DashboardLayout userName={profile?.full_name || 'Cashier'} userRole="cashier" hasActiveShift={hasActiveShift} onEndShiftAndLogout={handleEndShiftAndLogout}>
        <div className="h-full flex flex-col">
          <div className="px-8 pt-6 pb-4 border-b">
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-96" />
          </div>
          <div className="flex-1 p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1,2,3].map(i => (
                <Card key={i}><CardContent className="pt-6">
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-8 w-32" />
                </CardContent></Card>
              ))}
            </div>
            <Card>
              <CardHeader><Skeleton className="h-6 w-40" /></CardHeader>
              <CardContent className="space-y-3">
                {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </CardContent>
            </Card>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userName={profile?.full_name || 'Cashier'} userRole="cashier" hasActiveShift={hasActiveShift} onEndShiftAndLogout={handleEndShiftAndLogout}>
      <EndShiftModal
        isOpen={showEndShiftForLogout}
        onClose={() => setShowEndShiftForLogout(false)}
        onShiftEnded={handleShiftEndedAndLogout}
      />

      <div className="h-full flex flex-col">
        <div className="px-8 pt-6 pb-4 border-b">
          <h1 className="text-3xl font-bold">Sales & Stock</h1>
          <p className="text-muted-foreground">End-of-shift stock counting and cash reconciliation</p>
        </div>

        <div className="flex-1 p-6 overflow-auto">
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 lg:grid-cols-[2fr_1.4fr] gap-4">
              {/* Stock Count Table */}
              <Card>
                <CardHeader>
                  <CardTitle>Stock Count</CardTitle>
                </CardHeader>
                <CardContent className="px-3">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <colgroup>
                        <col className="w-6" />
                        <col className="w-px" />
                        <col className="w-[68px]" />
                        <col className="w-[68px]" />
                        <col className="w-[68px]" />
                        <col className="w-[68px]" />
                        <col className="w-[68px]" />
                      </colgroup>
                      <thead>
                        <tr className="border-b">
                          <th className="py-2 px-1 font-semibold text-left">#</th>
                          <th className="py-2 px-2 font-semibold text-left whitespace-nowrap">Product</th>
                          <th className="py-2 px-1 font-semibold text-center">Opening</th>
                          <th className="py-2 px-1 font-semibold text-center">Addition</th>
                          <th className="py-2 px-1 font-semibold text-center">Transfer</th>
                          <th className="py-2 px-1 font-semibold text-center">Spoilt</th>
                          <th className="py-2 px-1 font-semibold text-center">Closing</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stockCounts.map((stock, index) => {
                          const product = products.find(p => p.id === stock.product_id);
                          return (
                            <tr key={stock.product_id} className="border-b hover:bg-muted/20">
                              <td className="py-1.5 px-1 text-muted-foreground">{index + 1}</td>
                              <td className="py-1.5 px-2 font-medium whitespace-nowrap">{product?.product_name ?? '—'}</td>
                              <td className="py-1.5 px-1 text-center">
                                <input type="number" min="0" value={stock.opening_stock}
                                  onChange={e => updateStockCount(index, 'opening_stock', e.target.value)}
                                  onKeyDown={handleNumericKeyDown} onFocus={e => e.target.select()}
                                  className={inputCls} placeholder="0" />
                              </td>
                              <td className="py-1.5 px-1 text-center">
                                <input type="number" min="0" value={stock.additions}
                                  onChange={e => updateStockCount(index, 'additions', e.target.value)}
                                  onKeyDown={handleNumericKeyDown} onFocus={e => e.target.select()}
                                  className={inputCls} placeholder="0" />
                              </td>
                              <td className="py-1.5 px-1 text-center">
                                <input type="number" min="0" value={stock.transfer}
                                  onChange={e => updateStockCount(index, 'transfer', e.target.value)}
                                  onKeyDown={handleNumericKeyDown} onFocus={e => e.target.select()}
                                  className={inputCls} placeholder="0" />
                              </td>
                              <td className="py-1.5 px-1 text-center">
                                <input type="number" min="0" value={stock.spoilt}
                                  onChange={e => updateStockCount(index, 'spoilt', e.target.value)}
                                  onKeyDown={handleNumericKeyDown} onFocus={e => e.target.select()}
                                  className={inputCls} placeholder="0" />
                              </td>
                              <td className="py-1.5 px-1 text-center">
                                <input type="number" min="0" value={stock.closing_stock}
                                  onChange={e => updateStockCount(index, 'closing_stock', e.target.value)}
                                  onKeyDown={handleNumericKeyDown} onFocus={e => e.target.select()}
                                  className={inputCls} placeholder="0" />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Cash Reconciliation */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle>Cash Sale</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  {([
                    { label: 'Balance B/D', value: balanceBroughtDown || '', onChange: (v: string) => setBalanceBroughtDown(parseFloat(v || '0')), step: '0.01', placeholder: '0.00' },
                    { label: 'M-Pesa', value: mpesaAmount, onChange: setMpesaAmount, step: '0.01', placeholder: '0.00', required: true },
                    { label: 'Paybill', value: paybillAmount, onChange: setPaybillAmount, step: '0.01', placeholder: '0.00', required: true },
                  ] as const).map(field => (
                    <div key={field.label} className="flex items-center gap-2">
                      <label className="text-xs font-medium w-24 shrink-0">{field.label}</label>
                      <input type="number" step={field.step} min="0" value={field.value}
                        onChange={e => (field.onChange as (v: string) => void)(e.target.value)}
                        onKeyDown={handleNumericKeyDown} onFocus={e => e.target.select()}
                        className="flex-1 px-2 py-1.5 border rounded text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        placeholder={field.placeholder} />
                    </div>
                  ))}

                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium w-24 shrink-0">Expenses</label>
                    <input type="text" value={fmtAmount(parseFloat(expenseTotal || '0'))}
                      className="flex-1 px-2 py-1.5 border rounded text-sm bg-muted/50 cursor-not-allowed"
                      readOnly disabled tabIndex={-1} />
                  </div>

                  <div>
                    <label className="text-xs font-medium mb-1.5 block">Cash Denominations (KSh)</label>
                    <div className="border rounded p-2 space-y-1">
                      {denominations.map((denom, index) => (
                        <div key={denom.denomination} className="grid grid-cols-3 gap-1.5 items-center">
                          <span className="text-xs font-medium">KSh {denom.denomination}</span>
                          <input type="number" min="0" value={denom.quantity || ''}
                            onChange={e => updateDenomination(index, parseInt(e.target.value || '0'))}
                            onKeyDown={handleNumericKeyDown} onFocus={e => e.target.select()}
                            className="px-2 py-1 border rounded text-xs text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            placeholder="Qty" />
                          <span className="text-xs text-right text-muted-foreground">
                            {denom.total > 0 ? fmtAmount(denom.total) : ''}
                          </span>
                        </div>
                      ))}
                      <div className="grid grid-cols-3 gap-1.5 items-center">
                        <span className="text-xs font-medium">Coins</span>
                        <input type="number" step="0.01" min="0" value={coinsAmount}
                          onChange={e => setCoinsAmount(e.target.value)}
                          onKeyDown={handleNumericKeyDown} onFocus={e => e.target.select()}
                          className="px-2 py-1 border rounded text-xs text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          placeholder="0.00" />
                        <span className="text-xs text-right text-muted-foreground">
                          {coinsAmount && parseFloat(coinsAmount) > 0 ? fmtAmount(parseFloat(coinsAmount)) : ''}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <label className="text-xs font-medium w-24 shrink-0">Cash in Hand</label>
                    <input type="text" value={fmtAmount(cashInHand)}
                      className="flex-1 px-2 py-1.5 border rounded text-sm bg-muted/30 font-semibold"
                      readOnly tabIndex={-1} />
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t">
                    <label className="text-xs font-medium w-24 shrink-0">Grand Total</label>
                    <input type="text" value={fmtAmount(grandTotal)}
                      className="flex-1 px-2 py-2 border-2 border-green-500 rounded bg-green-50 font-bold text-sm text-green-900"
                      readOnly tabIndex={-1} />
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="mt-6 flex justify-end">
              <Button type="submit" disabled={submitting} size="lg" className="gap-2">
                {submitting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Submitting...</>
                ) : 'Submit Forms'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </DashboardLayout>
  );
}
