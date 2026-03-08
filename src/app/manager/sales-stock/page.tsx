'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/auth-context';
import { useClerkSupabaseClient } from '@/lib/supabase/client';
import { Loader2, ChevronDownIcon, ChevronUpIcon, CalendarIcon } from 'lucide-react';
import { useNotification } from '@/components/ui/notification';
import { getKenyaDateString } from '@/lib/date-utils';

interface ShiftRecord {
  id: string;
  shift_number: number;
  shift_date: string;
  shift_type: 'day' | 'night';
  cashier_id: string;
  balance_brought_down: number;
  mpesa_amount: number;
  paybill_amount: number;
  expense_total: number;
  cash_in_hand: number;
  grand_total: number;
  denom_1000_qty: number;
  denom_1000_total: number;
  denom_500_qty: number;
  denom_500_total: number;
  denom_200_qty: number;
  denom_200_total: number;
  denom_100_qty: number;
  denom_100_total: number;
  denom_50_qty: number;
  denom_50_total: number;
  coins_amount: number;
  created_at: string;
  started_at: string;
  ended_at: string | null;
  profiles: {
    full_name: string;
  };
}

interface StockCount {
  id: string;
  product_id: string;
  opening_stock: number;
  additions: number;
  spoilt: number;
  closing_stock: number;
  products: {
    product_name: string;
  };
}

export default function ManagerSalesStockPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const supabase = useClerkSupabaseClient();
  const { showNotification } = useNotification();

  // Block manager role — redirect to dashboard immediately
  useEffect(() => {
    if (profile && profile.role === 'manager') {
      router.replace('/manager');
    }
  }, [profile?.role]);

  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<ShiftRecord[]>([]);
  const [stockCounts, setStockCounts] = useState<{ [shiftId: string]: StockCount[] }>({});
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [selectedDate, setSelectedDate] = useState(getKenyaDateString());

  const fetchRecords = async () => {
    if (!profile?.branch_id) return;

    try {
      setLoading(true);

      // Fetch shift reconciliation records for the selected date
      const { data: shiftsData, error: shiftsError } = await supabase
        .from('shifts')
        .select('id, shift_number, shift_date, shift_type, cashier_id, balance_brought_down, mpesa_amount, paybill_amount, expense_total, cash_in_hand, grand_total, denom_1000_qty, denom_1000_total, denom_500_qty, denom_500_total, denom_200_qty, denom_200_total, denom_100_qty, denom_100_total, denom_50_qty, denom_50_total, coins_amount, created_at, started_at, ended_at')
        .eq('branch_id', profile.branch_id)
        .eq('shift_date', selectedDate)
        .eq('is_active', false)
        .order('created_at', { ascending: false });

      if (shiftsError) throw shiftsError;

      // Fetch cashier names for all shifts
      if (shiftsData && shiftsData.length > 0) {
        const cashierIds = [...new Set(shiftsData.map(s => s.cashier_id))];

        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', cashierIds);

        if (profilesError) throw profilesError;

        // Map profiles to shifts
        const profilesMap = new Map(profilesData?.map(p => [p.id, p.full_name]) || []);

        const recordsWithNames = shiftsData.map(shift => ({
          ...shift,
          profiles: {
            full_name: profilesMap.get(shift.cashier_id) || 'Unknown Cashier'
          }
        }));

        setRecords(recordsWithNames);
      } else {
        setRecords([]);
      }
    } catch (error) {
      console.error('Error fetching records:', error);
      showNotification('error', 'Failed to load records');
    } finally {
      setLoading(false);
    }
  };

  const fetchStockCounts = async (shiftId: string) => {
    if (stockCounts[shiftId] !== undefined) return; // Already loaded

    try {
      const { data, error } = await supabase
        .from('stock_counts')
        .select(`
          *,
          products:product_id (product_name)
        `)
        .eq('shift_id', shiftId);

      if (error) throw error;

      setStockCounts(prev => ({
        ...prev,
        [shiftId]: data || []
      }));
    } catch (error) {
      console.error('Error fetching stock counts:', error);
      setStockCounts(prev => ({ ...prev, [shiftId]: [] }));
    }
  };

  useEffect(() => {
    fetchRecords();
  }, [profile?.branch_id, selectedDate]);

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

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('en-KE', {
      timeZone: 'Africa/Nairobi',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <DashboardLayout userName={profile?.full_name || 'Manager'} userRole="manager">
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userName={profile?.full_name || 'Manager'} userRole="manager">
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="px-8 pt-6 pb-4 border-b">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold">Sales & Stock Reports</h1>
              <p className="text-muted-foreground">
                View shift reconciliation records submitted by cashiers
              </p>
            </div>
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-muted-foreground" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-3 py-2 border rounded-lg"
              />
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-6 overflow-auto">
          {records.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">
                  No records found for {selectedDate}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {records.map((record) => (
                <Card key={record.id}>
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-4">
                        <CardTitle className="text-lg">
                          {record.profiles?.full_name || 'Unknown Cashier'}
                        </CardTitle>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          record.shift_type === 'day'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          {record.shift_type === 'day' ? 'Day Shift' : 'Night Shift'}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <span className="text-green-600">{formatTime(record.started_at)}</span>
                        <span className="mx-1">→</span>
                        <span className="text-red-600">{record.ended_at ? formatTime(record.ended_at) : 'Active'}</span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {/* Summary Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-4">
                      <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                        <p className="text-xs text-muted-foreground">Balance B/D</p>
                        <p className="font-semibold">KSh {record.balance_brought_down?.toFixed(2) || '0.00'}</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                        <p className="text-xs text-muted-foreground">M-Pesa</p>
                        <p className="font-semibold">KSh {record.mpesa_amount?.toFixed(2) || '0.00'}</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                        <p className="text-xs text-muted-foreground">Paybill</p>
                        <p className="font-semibold">KSh {record.paybill_amount?.toFixed(2) || '0.00'}</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                        <p className="text-xs text-muted-foreground">Cash in Hand</p>
                        <p className="font-semibold">KSh {record.cash_in_hand?.toFixed(2) || '0.00'}</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                        <p className="text-xs text-muted-foreground">Expenses</p>
                        <p className="font-semibold text-red-600">KSh {record.expense_total?.toFixed(2) || '0.00'}</p>
                      </div>
                      <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
                        <p className="text-xs text-muted-foreground">Grand Total</p>
                        <p className="font-bold text-green-600">KSh {record.grand_total?.toFixed(2) || '0.00'}</p>
                      </div>
                    </div>

                    {/* Expand/Collapse Button */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleRow(record.id)}
                      className="w-full"
                    >
                      {expandedRows.has(record.id) ? (
                        <>
                          <ChevronUpIcon className="h-4 w-4 mr-2" />
                          Hide Details
                        </>
                      ) : (
                        <>
                          <ChevronDownIcon className="h-4 w-4 mr-2" />
                          Show Details
                        </>
                      )}
                    </Button>

                    {/* Expanded Details */}
                    {expandedRows.has(record.id) && (
                      <div className="mt-4 space-y-4">
                        {/* Cash Denominations */}
                        <div>
                          <h4 className="font-medium mb-2">Cash Denominations</h4>
                          <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-sm">
                            {record.denom_1000_qty > 0 && (
                              <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded">
                                <p className="text-xs text-muted-foreground">KSh 1000</p>
                                <p>{record.denom_1000_qty} x = KSh {record.denom_1000_total}</p>
                              </div>
                            )}
                            {record.denom_500_qty > 0 && (
                              <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded">
                                <p className="text-xs text-muted-foreground">KSh 500</p>
                                <p>{record.denom_500_qty} x = KSh {record.denom_500_total}</p>
                              </div>
                            )}
                            {record.denom_200_qty > 0 && (
                              <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded">
                                <p className="text-xs text-muted-foreground">KSh 200</p>
                                <p>{record.denom_200_qty} x = KSh {record.denom_200_total}</p>
                              </div>
                            )}
                            {record.denom_100_qty > 0 && (
                              <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded">
                                <p className="text-xs text-muted-foreground">KSh 100</p>
                                <p>{record.denom_100_qty} x = KSh {record.denom_100_total}</p>
                              </div>
                            )}
                            {record.denom_50_qty > 0 && (
                              <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded">
                                <p className="text-xs text-muted-foreground">KSh 50</p>
                                <p>{record.denom_50_qty} x = KSh {record.denom_50_total}</p>
                              </div>
                            )}
                            {record.coins_amount > 0 && (
                              <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded">
                                <p className="text-xs text-muted-foreground">Coins</p>
                                <p>KSh {record.coins_amount}</p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Stock Counts */}
                        <div>
                          <h4 className="font-medium mb-2">Stock Counts</h4>
                          {stockCounts[record.id] !== undefined ? (
                            stockCounts[record.id].length > 0 ? (
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b">
                                      <th className="text-left py-2 px-2">Product</th>
                                      <th className="text-right py-2 px-2">Opening</th>
                                      <th className="text-right py-2 px-2">Additions</th>
                                      <th className="text-right py-2 px-2">Spoilt</th>
                                      <th className="text-right py-2 px-2">Closing</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {stockCounts[record.id].map((stock) => (
                                      <tr key={stock.id} className="border-b">
                                        <td className="py-2 px-2">{stock.products?.product_name || 'Unknown'}</td>
                                        <td className="text-right py-2 px-2">{stock.opening_stock}</td>
                                        <td className="text-right py-2 px-2">{stock.additions}</td>
                                        <td className="text-right py-2 px-2 text-red-600">{stock.spoilt}</td>
                                        <td className="text-right py-2 px-2">{stock.closing_stock}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">No stock counts recorded</p>
                            )
                          ) : (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Loading...
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
