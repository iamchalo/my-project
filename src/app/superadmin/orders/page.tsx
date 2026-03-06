'use client';

import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  ShoppingCartIcon,
  DollarSignIcon,
  TrendingUpIcon,
  Loader2,
  RefreshCwIcon,
  SearchIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  FilterIcon,
} from 'lucide-react';

interface Order {
  id: string;
  order_number: string;
  branch_id: string;
  branch_name: string;
  cashier_id: string;
  cashier_name: string;
  payment_method: string;
  total_amount: number;
  created_at: string;
  items?: OrderItem[];
}

interface OrderItem {
  id: string;
  product_name: string;
  product_price: number;
  quantity: number;
  subtotal: number;
}

interface Branch {
  id: string;
  name: string;
  code: string;
}

interface Stats {
  totalOrders: number;
  totalRevenue: number;
  averageOrder: number;
  cashOrders: number;
  mpesaOrders: number;
}

export default function AdminOrdersPage() {
  const { profile } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [orderItems, setOrderItems] = useState<Record<string, OrderItem[]>>({});

  // Filters
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [selectedPayment, setSelectedPayment] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Get Kenya timezone date
  const getKenyaDate = () => {
    const now = new Date();
    return now.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  };

  // Initialize with today's date
  useEffect(() => {
    const today = getKenyaDate();
    setFromDate(today);
    setToDate(today);
  }, []);

  const fetchBranches = async () => {
    const { data } = await supabase
      .from('branches')
      .select('id, name, code')
      .eq('is_active', true)
      .order('name');
    setBranches(data || []);
  };

  const fetchOrders = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('orders')
        .select(`
          id,
          order_number,
          branch_id,
          cashier_id,
          payment_method,
          total_amount,
          created_at,
          branches!inner(name),
          profiles!inner(full_name)
        `)
        .order('created_at', { ascending: false });

      // Apply filters
      if (fromDate) {
        query = query.gte('created_at', `${fromDate}T00:00:00`);
      }
      if (toDate) {
        query = query.lte('created_at', `${toDate}T23:59:59`);
      }
      if (selectedBranch !== 'all') {
        query = query.eq('branch_id', selectedBranch);
      }
      if (selectedPayment !== 'all') {
        query = query.eq('payment_method', selectedPayment);
      }

      const { data, error } = await query.limit(500);

      if (error) {
        console.error('Error fetching orders:', error);
        return;
      }

      // Process orders
      let processedOrders = (data || []).map((order: any) => ({
        id: order.id,
        order_number: order.order_number,
        branch_id: order.branch_id,
        branch_name: order.branches?.name || 'Unknown',
        cashier_id: order.cashier_id,
        cashier_name: order.profiles?.full_name || 'Unknown',
        payment_method: order.payment_method,
        total_amount: order.total_amount,
        created_at: order.created_at,
      }));

      // Apply search filter client-side
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        processedOrders = processedOrders.filter(
          (order) =>
            order.order_number.toLowerCase().includes(query) ||
            order.cashier_name.toLowerCase().includes(query) ||
            order.branch_name.toLowerCase().includes(query)
        );
      }

      setOrders(processedOrders);

      // Calculate stats
      const totalRevenue = processedOrders.reduce((sum, o) => sum + o.total_amount, 0);
      const cashOrders = processedOrders.filter((o) => o.payment_method === 'cash').length;
      const mpesaOrders = processedOrders.filter((o) => o.payment_method === 'mpesa').length;

      setStats({
        totalOrders: processedOrders.length,
        totalRevenue,
        averageOrder: processedOrders.length > 0 ? totalRevenue / processedOrders.length : 0,
        cashOrders,
        mpesaOrders,
      });
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrderItems = async (orderId: string) => {
    if (orderItems[orderId]) return; // Already fetched

    const { data, error } = await supabase
      .from('order_items')
      .select('id, product_name, product_price, quantity, subtotal')
      .eq('order_id', orderId);

    if (!error && data) {
      setOrderItems((prev) => ({ ...prev, [orderId]: data }));
    }
  };

  const toggleOrderExpand = async (orderId: string) => {
    if (expandedOrder === orderId) {
      setExpandedOrder(null);
    } else {
      setExpandedOrder(orderId);
      await fetchOrderItems(orderId);
    }
  };

  useEffect(() => {
    fetchBranches();
  }, []);

  useEffect(() => {
    if (fromDate && toDate) {
      fetchOrders();
    }
  }, [fromDate, toDate, selectedBranch, selectedPayment]);

  const handleSearch = () => {
    fetchOrders();
  };

  const formatCurrency = (amount: number) => {
    return `Ksh ${amount.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-KE', {
      timeZone: 'Africa/Nairobi',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };


  return (
    <DashboardLayout userName={profile?.full_name || 'Superadmin'} userRole="superadmin">
      <div className="p-4 md:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">Orders Sold</h1>
              <p className="text-muted-foreground">
                View and filter all orders across the system
              </p>
            </div>
            <Button onClick={fetchOrders} variant="outline" size="sm">
              <RefreshCwIcon className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>

          {/* Stats */}
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <ShoppingCartIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Orders</p>
                    <p className="text-xl font-bold">{stats?.totalOrders || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <DollarSignIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Revenue</p>
                    <p className="text-xl font-bold">{formatCurrency(stats?.totalRevenue || 0)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                    <TrendingUpIcon className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Avg. Order</p>
                    <p className="text-xl font-bold">{formatCurrency(stats?.averageOrder || 0)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold text-sm">C</span>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Cash Orders</p>
                    <p className="text-xl font-bold">{stats?.cashOrders || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                    <span className="text-orange-600 dark:text-orange-400 font-bold text-sm">M</span>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">M-Pesa Orders</p>
                    <p className="text-xl font-bold">{stats?.mpesaOrders || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <FilterIcon className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-lg">Filter Orders</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">From Date</label>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-background"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">To Date</label>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-background"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Branch</label>
                  <select
                    value={selectedBranch}
                    onChange={(e) => setSelectedBranch(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-background"
                  >
                    <option value="all">All Branches</option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Payment</label>
                  <select
                    value={selectedPayment}
                    onChange={(e) => setSelectedPayment(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-background"
                  >
                    <option value="all">All Payments</option>
                    <option value="cash">Cash</option>
                    <option value="mpesa">M-Pesa</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Search</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      placeholder="Order #, cashier..."
                      className="flex-1 px-3 py-2 border rounded-lg text-sm bg-background"
                    />
                    <Button size="sm" onClick={handleSearch} className="px-3">
                      <SearchIcon className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Orders Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">All Orders</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : orders.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <ShoppingCartIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No orders found for the selected filters</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-2 font-medium text-muted-foreground">Order ID</th>
                        <th className="text-left py-3 px-2 font-medium text-muted-foreground hidden md:table-cell">Branch</th>
                        <th className="text-left py-3 px-2 font-medium text-muted-foreground hidden sm:table-cell">Cashier</th>
                        <th className="text-left py-3 px-2 font-medium text-muted-foreground">Payment</th>
                        <th className="text-right py-3 px-2 font-medium text-muted-foreground">Amount</th>
                        <th className="text-left py-3 px-2 font-medium text-muted-foreground hidden lg:table-cell">Date & Time</th>
                        <th className="text-center py-3 px-2 font-medium text-muted-foreground w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((order) => (
                        <>
                          <tr
                            key={order.id}
                            className="border-b hover:bg-muted/50 cursor-pointer"
                            onClick={() => toggleOrderExpand(order.id)}
                          >
                            <td className="py-3 px-2">
                              <p className="font-medium">{order.order_number}</p>
                              <p className="text-xs text-muted-foreground md:hidden">{order.branch_name}</p>
                            </td>
                            <td className="py-3 px-2 hidden md:table-cell">{order.branch_name}</td>
                            <td className="py-3 px-2 hidden sm:table-cell">{order.cashier_name}</td>
                            <td className="py-3 px-2">
                              <Badge variant={order.payment_method === 'mpesa' ? 'default' : 'secondary'}>
                                {order.payment_method === 'mpesa' ? 'M-Pesa' : 'Cash'}
                              </Badge>
                            </td>
                            <td className="py-3 px-2 text-right font-semibold">{formatCurrency(order.total_amount)}</td>
                            <td className="py-3 px-2 hidden lg:table-cell text-muted-foreground">
                              {formatDateTime(order.created_at)}
                            </td>
                            <td className="py-3 px-2 text-center">
                              {expandedOrder === order.id ? (
                                <ChevronUpIcon className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
                              )}
                            </td>
                          </tr>
                          {expandedOrder === order.id && (
                            <tr key={`${order.id}-details`}>
                              <td colSpan={7} className="bg-muted/30 p-4">
                                <div className="space-y-3">
                                  <div className="flex flex-wrap gap-4 text-sm">
                                    <div className="sm:hidden">
                                      <span className="text-muted-foreground">Cashier: </span>
                                      <span className="font-medium">{order.cashier_name}</span>
                                    </div>
                                    <div className="lg:hidden">
                                      <span className="text-muted-foreground">Date: </span>
                                      <span>{formatDateTime(order.created_at)}</span>
                                    </div>
                                  </div>
                                  <div>
                                    <p className="font-medium mb-2">Order Items</p>
                                    {orderItems[order.id] ? (
                                      <div className="bg-background rounded-lg border overflow-hidden">
                                        <table className="w-full text-sm">
                                          <thead>
                                            <tr className="border-b bg-muted/50">
                                              <th className="text-left py-2 px-3 font-medium">Product</th>
                                              <th className="text-right py-2 px-3 font-medium">Price</th>
                                              <th className="text-right py-2 px-3 font-medium">Qty</th>
                                              <th className="text-right py-2 px-3 font-medium">Subtotal</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {orderItems[order.id].map((item) => (
                                              <tr key={item.id} className="border-b last:border-0">
                                                <td className="py-2 px-3">{item.product_name}</td>
                                                <td className="py-2 px-3 text-right">{formatCurrency(item.product_price)}</td>
                                                <td className="py-2 px-3 text-right">{item.quantity}</td>
                                                <td className="py-2 px-3 text-right font-medium">{formatCurrency(item.subtotal)}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-2 text-muted-foreground">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Loading items...
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
