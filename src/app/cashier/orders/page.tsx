'use client';

import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ProductGrid } from '@/components/cashier/product-grid';
import { OrderCart, OrderItem } from '@/components/cashier/order-cart';
import { useAuth } from '@/lib/auth/auth-context';
import { useClerkSupabaseClient } from '@/lib/supabase/client';
import { Loader2, Banknote, Smartphone } from 'lucide-react';
import { Notification, useNotification } from '@/components/ui/notification';
import { Skeleton } from '@/components/ui/skeleton';
import { connect as connectQZ, printReceipt } from '@/lib/printing/qz-tray';
import { buildReceiptLines } from '@/lib/printing/receipt-builder';

interface Product {
  id: string;
  product_name: string;
  category: 'Meals' | 'Drinks&Juices' | 'Specials';
  product_price: number;
  image_url: string | null;
  is_active: boolean;
  branch_id: string;
}

export default function CashierOrdersPage() {
  const { profile } = useAuth();
  const supabase = useClerkSupabaseClient();
  const { notification, showNotification, hideNotification } = useNotification();

  const [products, setProducts] = useState<Product[]>([]);
  const [cartItems, setCartItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [branchName, setBranchName] = useState<string | undefined>(undefined);

  // Fetch products from the database (using new centralized schema)
  useEffect(() => {
    if (!profile?.branch_id) {
      setLoading(false);
      return;
    }

    const fetchProducts = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase.rpc('get_branch_products', {
          target_branch_id: profile.branch_id,
        });

        if (error) throw error;

        // Transform data to match expected Product interface
        const transformedProducts = (data || []).map((item: any) => ({
          id: item.id,
          product_name: item.product_name,
          category: item.category,
          product_price: parseFloat(item.product_price),
          image_url: item.image_url,
          is_active: item.is_active,
          branch_id: profile.branch_id,
        }));

        setProducts(transformedProducts);
      } catch (error) {
        console.error('Error fetching products:', error);
        showNotification('error', 'Failed to load products');
      } finally {
        setLoading(false);
      }
    };

    const fetchBranchName = async () => {
      const { data } = await supabase
        .from('branches')
        .select('name')
        .eq('id', profile.branch_id)
        .single();
      if (data?.name) setBranchName(data.name);
    };

    fetchProducts();
    fetchBranchName();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.branch_id]);

  // Add product to cart
  const handleAddToOrder = (product: Product) => {
    setCartItems((prevItems) => {
      const existingItem = prevItems.find((item) => item.id === product.id);

      if (existingItem) {
        return prevItems.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      } else {
        return [
          ...prevItems,
          {
            id: product.id,
            product_name: product.product_name,
            product_price: product.product_price,
            image_url: product.image_url,
            quantity: 1,
            category: product.category,
          },
        ];
      }
    });
    showNotification('success', `${product.product_name} added to order`);
  };

  // Update item quantity
  const handleUpdateQuantity = (productId: string, newQuantity: number) => {
    setCartItems((prevItems) =>
      prevItems.map((item) =>
        item.id === productId ? { ...item, quantity: newQuantity } : item
      )
    );
  };

  // Remove item from cart
  const handleRemoveItem = (productId: string) => {
    setCartItems((prevItems) => prevItems.filter((item) => item.id !== productId));
    showNotification('success', 'Item removed from order');
  };

  // Clear entire cart
  const handleClearCart = () => {
    setCartItems([]);
    showNotification('success', 'Order cleared');
  };

  // Calculate total
  const total = cartItems.reduce(
    (sum, item) => sum + item.product_price * item.quantity,
    0
  );

  // Auto-print receipt via QZ Tray (fire-and-forget)
  const autoPrint = async (orderData: {
    orderNumber: number;
    items: OrderItem[];
    total: number;
    paymentMethod: 'cash' | 'mpesa';
  }) => {
    try {
      // Check for a printer config first — skip QZ entirely if none configured
      const { data: config } = await supabase
        .from('printer_configs')
        .select('printer_name')
        .eq('branch_id', profile!.branch_id)
        .eq('is_active', true)
        .maybeSingle();

      if (!config?.printer_name) return; // no printer configured, nothing to do

      const connected = await connectQZ();
      if (!connected) {
        showNotification('error', 'Printer not connected');
        return;
      }

      // Fetch branch name + phone fresh at print time to avoid stale closure
      let resolvedBranchName = branchName;
      let resolvedBranchPhone: string | undefined;
      if (profile?.branch_id) {
        const { data: branchData } = await supabase
          .from('branches')
          .select('name, phone')
          .eq('id', profile.branch_id)
          .single();
        resolvedBranchName = branchData?.name || resolvedBranchName;
        resolvedBranchPhone = branchData?.phone || undefined;
      }

      const now = new Date();
      const lines = buildReceiptLines({
        branchName: resolvedBranchName || 'Branch',
        branchPhone: resolvedBranchPhone,
        cashierName: profile?.full_name || 'Staff',
        orderNumber: orderData.orderNumber,
        items: orderData.items.map((i) => ({
          product_name: i.product_name,
          quantity: i.quantity,
          product_price: i.product_price,
        })),
        total: orderData.total,
        paymentMethod: orderData.paymentMethod,
        date: now.toLocaleDateString('en-KE'),
        time: now.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' }),
      });

      await printReceipt(config.printer_name, lines);
    } catch {
      // Silent — printing is best-effort
    }
  };

  // Save order to database
  const saveOrder = async (paymentMethod: 'cash' | 'mpesa') => {
    if (!profile?.id || !profile?.branch_id) {
      showNotification('error', 'User profile not loaded');
      return;
    }

    try {
      setProcessing(true);

      // Generate order number
      const { data: orderNumberData, error: orderNumberError } = await supabase
        .rpc('generate_order_number');

      if (orderNumberError) throw orderNumberError;

      const orderNumber = orderNumberData as number;

      // Create order (no status field - all orders are completed on payment)
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .insert({
          order_number: orderNumber,
          branch_id: profile.branch_id,
          cashier_id: profile.id,
          payment_method: paymentMethod,
          total_amount: total,
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Create order items (no subtotal - calculated on the fly)
      const orderItems = cartItems.map((item) => ({
        order_id: orderData.id,
        product_id: item.id,
        product_name: item.product_name,
        product_price: item.product_price,
        quantity: item.quantity,
      }));

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems);

      if (itemsError) throw itemsError;

      const savedItems = [...cartItems];
      const savedTotal = total;

      // Clear cart immediately
      setCartItems([]);
      showNotification('success', `Order completed - ${paymentMethod === 'mpesa' ? 'M-Pesa' : 'Cash'} payment`);

      // Fire-and-forget print
      autoPrint({ orderNumber, items: savedItems, total: savedTotal, paymentMethod });
    } catch (error) {
      console.error('Error saving order:', error);
      showNotification('error', 'Failed to save order. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout userName={profile?.full_name || 'Cashier'} userRole="cashier">
        <div className="h-full flex">
          {/* Products Grid Skeleton */}
          <div className="flex-1 p-6">
            <div className="mb-4">
              <Skeleton className="h-10 w-64 mb-2" />
              <Skeleton className="h-4 w-96" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <Skeleton className="h-32 w-full mb-3 rounded-lg" />
                    <Skeleton className="h-5 w-full mb-2" />
                    <Skeleton className="h-4 w-20" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Cart Skeleton */}
          <div className="w-96 border-l bg-gray-50 p-6">
            <Skeleton className="h-8 w-32 mb-6" />
            <div className="space-y-4 mb-6">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
            <Skeleton className="h-12 w-full mb-4" />
            <Skeleton className="h-12 w-full" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userName={profile?.full_name || 'Cashier'} userRole="cashier">
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="px-8 pt-6 pb-4 border-b">
          <h1 className="text-3xl font-bold">New Order</h1>
          <p className="text-muted-foreground">
            Select products to create a customer order
          </p>
        </div>

        {/* Main Content Grid - Full height */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-6 p-6 overflow-hidden">
          {/* Products Grid (Left Side - 3/4 width) */}
          <div className="lg:col-span-3 overflow-y-auto">
            <ProductGrid products={products} onAddToOrder={handleAddToOrder} />
          </div>

          {/* Right Side - Cart + Payment */}
          <div className="flex flex-col gap-4 overflow-y-auto">
            <OrderCart
              items={cartItems}
              onUpdateQuantity={handleUpdateQuantity}
              onRemoveItem={handleRemoveItem}
              onClearCart={handleClearCart}
            />

            {/* Payment buttons — click to save order immediately */}
            {cartItems.length > 0 && (
              <Card>
                <CardContent className="p-4 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                    Select Payment Method
                  </p>
                  <Button
                    className="w-full gap-2 bg-yellow-100 hover:bg-yellow-200 text-yellow-900 border border-yellow-300"
                    onClick={() => saveOrder('cash')}
                    disabled={processing}
                  >
                    {processing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Banknote className="h-4 w-4" />
                    )}
                    Cash
                  </Button>
                  <Button
                    className="w-full gap-2 bg-red-100 hover:bg-red-200 text-red-900 border border-red-300"
                    onClick={() => saveOrder('mpesa')}
                    disabled={processing}
                  >
                    {processing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Smartphone className="h-4 w-4" />
                    )}
                    M-Pesa
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Notification */}
      {notification && (
        <Notification
          type={notification.type}
          message={notification.message}
          onClose={hideNotification}
        />
      )}
    </DashboardLayout>
  );
}
