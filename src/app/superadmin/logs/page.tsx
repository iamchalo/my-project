'use client';

import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/dashboard/data-table';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth/auth-context';
import { createClient } from '@/lib/supabase/client';
import { getKenyaDateString } from '@/lib/date-utils';
import { ActivityIcon, ShieldIcon, AlertTriangleIcon, Loader2 } from 'lucide-react';

interface ActivityLog {
  id: string;
  type: string;
  user: string;
  action: string;
  timestamp: string;
  severity: 'info' | 'warning' | 'error';
  branch?: string;
}

export default function SuperadminLogsPage() {
  const { profile } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<string>(getKenyaDateString());

  // Stats
  const [totalLogs, setTotalLogs] = useState(0);
  const [warningCount, setWarningCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);

  useEffect(() => {
    fetchLogs();
  }, [selectedDate]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const activityLogs: ActivityLog[] = [];

      // Fetch orders as activity (completed today)
      const { data: ordersData } = await supabase
        .from('orders')
        .select(`
          order_number,
          created_at,
          total_amount,
          status,
          profiles:cashier_id (full_name),
          branches:branch_id (name)
        `)
        .gte('created_at', `${selectedDate}T00:00:00`)
        .lte('created_at', `${selectedDate}T23:59:59`)
        .order('created_at', { ascending: false })
        .limit(50);

      ordersData?.forEach((order: any) => {
        activityLogs.push({
          id: `ORDER-${order.order_number}`,
          type: 'order',
          user: order.profiles?.full_name || 'Unknown',
          action: `Created order #${order.order_number} - Ksh ${Number(order.total_amount).toFixed(2)} (${order.status})`,
          timestamp: order.created_at,
          severity: 'info',
          branch: order.branches?.name,
        });
      });

      // Fetch expenses as activity
      const { data: expensesData } = await supabase
        .from('expenses')
        .select(`
          expense_number,
          created_at,
          total,
          description,
          profiles:cashier_id (full_name),
          branches:branch_id (name)
        `)
        .eq('expense_date', selectedDate)
        .order('created_at', { ascending: false })
        .limit(20);

      expensesData?.forEach((expense: any) => {
        activityLogs.push({
          id: `EXPENSE-${expense.expense_number}`,
          type: 'expense',
          user: expense.profiles?.full_name || 'Unknown',
          action: `Recorded expense - ${expense.description} (Ksh ${Number(expense.total).toFixed(2)})`,
          timestamp: expense.created_at,
          severity: 'warning',
          branch: expense.branches?.name,
        });
      });

      // Fetch stock updates (recent updates to branch_products)
      const { data: stockUpdates } = await supabase
        .from('branch_products')
        .select(`
          product_id,
          stock_quantity,
          updated_at,
          products:product_id (product_name),
          branches:branch_id (name)
        `)
        .gte('updated_at', `${selectedDate}T00:00:00`)
        .lte('updated_at', `${selectedDate}T23:59:59`)
        .order('updated_at', { ascending: false })
        .limit(30);

      stockUpdates?.forEach((stock: any) => {
        activityLogs.push({
          id: `STOCK-${stock.product_id}-${new Date(stock.updated_at).getTime()}`,
          type: 'stock',
          user: 'System',
          action: `Stock updated for ${stock.products?.product_name} - Quantity: ${stock.stock_quantity}`,
          timestamp: stock.updated_at,
          severity: stock.stock_quantity < 10 ? 'warning' : 'info',
          branch: stock.branches?.name,
        });
      });

      // Sort all logs by timestamp
      activityLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      setLogs(activityLogs);
      setTotalLogs(activityLogs.length);
      setWarningCount(activityLogs.filter(log => log.severity === 'warning').length);
      setErrorCount(activityLogs.filter(log => log.severity === 'error').length);

    } catch (error) {
      console.error('Error fetching logs:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filter logs
  const filteredLogs = logs.filter(log => {
    if (selectedType !== 'all' && log.type !== selectedType) return false;
    if (selectedSeverity !== 'all' && log.severity !== selectedSeverity) return false;
    return true;
  });

  const logColumns = [
    { key: 'id', label: 'ID' },
    {
      key: 'type',
      label: 'Type',
      render: (value: string) => {
        const typeColors: Record<string, string> = {
          order: 'bg-blue-100 text-blue-800',
          expense: 'bg-yellow-100 text-yellow-800',
          stock: 'bg-green-100 text-green-800',
          security: 'bg-red-100 text-red-800',
        };
        return (
          <span className={`px-2 py-1 rounded text-xs font-medium ${typeColors[value] || 'bg-gray-100 text-gray-800'}`}>
            {value.toUpperCase()}
          </span>
        );
      },
    },
    { key: 'user', label: 'User' },
    { key: 'action', label: 'Action' },
    {
      key: 'branch',
      label: 'Branch',
      render: (value: string) => value || 'N/A',
    },
    {
      key: 'timestamp',
      label: 'Timestamp',
      render: (value: string) => new Date(value).toLocaleString('en-KE', {
        dateStyle: 'short',
        timeStyle: 'medium'
      }),
    },
    {
      key: 'severity',
      label: 'Severity',
      render: (value: string) => {
        const colors: Record<string, 'default' | 'secondary' | 'destructive'> = {
          info: 'secondary',
          warning: 'default',
          error: 'destructive',
        };
        return <Badge variant={colors[value]}>{value.toUpperCase()}</Badge>;
      },
    },
  ];

  if (loading) {
    return (
      <DashboardLayout userName={profile?.full_name || 'Superadmin'} userRole="superadmin">
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userName={profile?.full_name || 'Superadmin'} userRole="superadmin">
      <div className="p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* Header */}
          <div>
            <h1 className="text-4xl font-bold">System Logs</h1>
            <p className="text-muted-foreground">
              System and user activity logs
            </p>
          </div>

          {/* Stats */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-blue-100 rounded-lg">
                    <ActivityIcon className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Logs</p>
                    <p className="text-2xl font-bold">{totalLogs}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-yellow-100 rounded-lg">
                    <AlertTriangleIcon className="h-6 w-6 text-yellow-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Warnings</p>
                    <p className="text-2xl font-bold">{warningCount}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-red-100 rounded-lg">
                    <ShieldIcon className="h-6 w-6 text-red-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Errors</p>
                    <p className="text-2xl font-bold">{errorCount}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle>Filter Logs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Type</label>
                  <select
                    className="w-full px-4 py-2 border rounded-lg bg-background"
                    value={selectedType}
                    onChange={(e) => setSelectedType(e.target.value)}
                  >
                    <option value="all">All Types</option>
                    <option value="order">Orders</option>
                    <option value="expense">Expenses</option>
                    <option value="stock">Stock Updates</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Severity</label>
                  <select
                    className="w-full px-4 py-2 border rounded-lg bg-background"
                    value={selectedSeverity}
                    onChange={(e) => setSelectedSeverity(e.target.value)}
                  >
                    <option value="all">All Severity</option>
                    <option value="info">Info</option>
                    <option value="warning">Warning</option>
                    <option value="error">Error</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Date</label>
                  <input
                    type="date"
                    className="w-full px-4 py-2 border rounded-lg bg-background"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Logs Table */}
          {filteredLogs.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center text-muted-foreground">
                No activity logs found for this date.
              </CardContent>
            </Card>
          ) : (
            <DataTable
              title="Activity Logs"
              columns={logColumns}
              data={filteredLogs}
            />
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
