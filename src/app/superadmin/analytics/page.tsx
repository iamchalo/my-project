'use client';

import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { StatCard } from '@/components/dashboard/stat-card';
import { useAuth } from '@/lib/auth/auth-context';
import { createClient } from '@/lib/supabase/client';
import { getKenyaDateString } from '@/lib/date-utils';
import { BarChartIcon, TrendingUpIcon, ClockIcon, PackageIcon, Loader2 } from 'lucide-react';

interface TopProduct {
  product_name: string;
  total_quantity: number;
  total_revenue: number;
}

interface PeakHour {
  hour: string;
  order_count: number;
}

export default function SuperadminAnalyticsPage() {
  const { profile } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [peakHours, setPeakHours] = useState<PeakHour[]>([]);
  const [avgBasketSize, setAvgBasketSize] = useState(0);
  const [itemsPerOrder, setItemsPerOrder] = useState(0);
  const [bestSeller, setBestSeller] = useState({ name: 'N/A', quantity: 0 });
  const [peakHourData, setPeakHourData] = useState({ hour: 'N/A', orders: 0 });

  // Filter state
  const [selectedPeriod, setSelectedPeriod] = useState<'7' | '30' | '90'>('30');

  useEffect(() => {
    fetchAnalytics();
  }, [selectedPeriod]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const today = new Date();
      const daysAgo = new Date();
      daysAgo.setDate(today.getDate() - parseInt(selectedPeriod));

      // Fetch orders with items for the selected period
      // Note: No 'status' field - orders are complete at creation (pay-first model)
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select(`
          id,
          total_amount,
          created_at,
          order_items (
            product_id,
            product_name,
            quantity,
            price
          )
        `)
        .gte('created_at', daysAgo.toISOString());

      if (ordersError) throw ordersError;

      if (!orders || orders.length === 0) {
        setLoading(false);
        return;
      }

      // Calculate top products
      const productMap = new Map<string, { quantity: number; revenue: number }>();
      let totalItems = 0;

      orders.forEach(order => {
        if (order.order_items && Array.isArray(order.order_items)) {
          order.order_items.forEach((item: any) => {
            const current = productMap.get(item.product_name) || { quantity: 0, revenue: 0 };
            productMap.set(item.product_name, {
              quantity: current.quantity + item.quantity,
              revenue: current.revenue + (item.quantity * item.price),
            });
            totalItems += item.quantity;
          });
        }
      });

      const productsArray = Array.from(productMap.entries())
        .map(([name, data]) => ({
          product_name: name,
          total_quantity: data.quantity,
          total_revenue: data.revenue,
        }))
        .sort((a, b) => b.total_quantity - a.total_quantity)
        .slice(0, 5);

      setTopProducts(productsArray);

      // Best seller
      if (productsArray.length > 0) {
        setBestSeller({
          name: productsArray[0].product_name,
          quantity: productsArray[0].total_quantity,
        });
      }

      // Calculate peak hours
      const hourMap = new Map<string, number>();
      orders.forEach(order => {
        const date = new Date(order.created_at);
        const hour = date.getHours();
        const period = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
        const hourLabel = `${displayHour}:00 ${period}`;

        hourMap.set(hourLabel, (hourMap.get(hourLabel) || 0) + 1);
      });

      const hoursArray = Array.from(hourMap.entries())
        .map(([hour, count]) => ({ hour, order_count: count }))
        .sort((a, b) => b.order_count - a.order_count)
        .slice(0, 5);

      setPeakHours(hoursArray);

      // Peak hour
      if (hoursArray.length > 0) {
        setPeakHourData({
          hour: hoursArray[0].hour,
          orders: hoursArray[0].order_count,
        });
      }

      // Calculate average basket size
      const totalRevenue = orders.reduce((sum, order) => sum + Number(order.total_amount), 0);
      const avgBasket = orders.length > 0 ? totalRevenue / orders.length : 0;
      setAvgBasketSize(avgBasket);

      // Calculate items per order
      const avgItems = orders.length > 0 ? totalItems / orders.length : 0;
      setItemsPerOrder(avgItems);

    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout userName={profile?.full_name || 'Superadmin'} userRole="superadmin">
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  const maxProductQuantity = topProducts.length > 0 ? topProducts[0].total_quantity : 1;
  const maxHourOrders = peakHours.length > 0 ? peakHours[0].order_count : 1;

  return (
    <DashboardLayout userName={profile?.full_name || 'Superadmin'} userRole="superadmin">
      <div className="p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* Header */}
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-4xl font-bold">Deep Analytics</h1>
              <p className="text-muted-foreground">
                Advanced insights - top products, peak hours, and trends
              </p>
            </div>
            <div>
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value as '7' | '30' | '90')}
                className="px-4 py-2 border rounded-lg bg-background"
              >
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
              </select>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid gap-4 md:grid-cols-4">
            <StatCard
              title="Best Seller"
              value={bestSeller.name}
              description={`${bestSeller.quantity} units sold`}
              icon={PackageIcon}
            />
            <StatCard
              title="Peak Hour"
              value={peakHourData.hour}
              description={`${peakHourData.orders} orders`}
              icon={ClockIcon}
            />
            <StatCard
              title="Avg Basket Size"
              value={`Ksh ${avgBasketSize.toFixed(2)}`}
              description="Per order"
              icon={TrendingUpIcon}
            />
            <StatCard
              title="Items per Order"
              value={itemsPerOrder.toFixed(1)}
              description="Average items"
              icon={BarChartIcon}
            />
          </div>

          {/* Charts Grid */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Top Selling Products */}
            <Card>
              <CardHeader>
                <CardTitle>Top Selling Products</CardTitle>
              </CardHeader>
              <CardContent>
                {topProducts.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No product data available for this period
                  </p>
                ) : (
                  <div className="space-y-4">
                    {topProducts.map((product, idx) => (
                      <div key={idx} className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">{product.product_name}</span>
                          <div className="text-right">
                            <div className="font-semibold">
                              Ksh {product.total_revenue.toLocaleString()}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {product.total_quantity} units
                            </div>
                          </div>
                        </div>
                        <div className="w-full bg-secondary rounded-full h-2">
                          <div
                            className="bg-primary h-2 rounded-full transition-all"
                            style={{
                              width: `${(product.total_quantity / maxProductQuantity) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Peak Hours Analysis */}
            <Card>
              <CardHeader>
                <CardTitle>Peak Hours Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                {peakHours.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No peak hour data available for this period
                  </p>
                ) : (
                  <div className="space-y-4">
                    {peakHours.map((hour, idx) => (
                      <div key={idx} className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">{hour.hour}</span>
                          <span className="text-muted-foreground">
                            {hour.order_count} orders
                          </span>
                        </div>
                        <div className="w-full bg-secondary rounded-full h-2">
                          <div
                            className="bg-primary h-2 rounded-full transition-all"
                            style={{
                              width: `${(hour.order_count / maxHourOrders) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Customer Insights - keeping simplified version since we don't track these metrics yet */}
          <Card>
            <CardHeader>
              <CardTitle>Order Insights</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <p className="text-sm text-muted-foreground">Avg Basket Size</p>
                  <p className="text-2xl font-bold">Ksh {avgBasketSize.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">Per completed order</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Items per Order</p>
                  <p className="text-2xl font-bold">{itemsPerOrder.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground">Average items</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Best Seller</p>
                  <p className="text-2xl font-bold">{bestSeller.quantity}</p>
                  <p className="text-xs text-muted-foreground">{bestSeller.name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Peak Orders</p>
                  <p className="text-2xl font-bold">{peakHourData.orders}</p>
                  <p className="text-xs text-muted-foreground">At {peakHourData.hour}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
