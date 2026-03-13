'use client';

import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/dashboard/data-table';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth/auth-context';
import { useClerkSupabaseClient } from '@/lib/supabase/client';
import { BuildingIcon, AlertTriangleIcon, Loader2 } from 'lucide-react';

interface Branch {
  id: string;
  name: string;
  code: string;
}

interface ProductInventory {
  product_id: string;
  product_name: string;
  total_stock: number;
  branches: {
    [branchId: string]: number;
  };
  status: 'balanced' | 'unbalanced' | 'low-stock';
}

export default function SuperadminProductsPerBranchPage() {
  const { profile } = useAuth();
  const supabase = useClerkSupabaseClient();

  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [inventory, setInventory] = useState<ProductInventory[]>([]);
  const [branchTotals, setBranchTotals] = useState<{ [branchId: string]: number }>({});

  useEffect(() => {
    fetchInventoryData();
  }, []);

  const fetchInventoryData = async () => {
    try {
      setLoading(true);

      // Fetch branches
      const { data: branchesData, error: branchesError } = await supabase
        .from('branches')
        .select('id, name, code')
        .eq('is_active', true)
        .order('name');

      if (branchesError) throw branchesError;
      setBranches(branchesData || []);

      // Fetch all products with their branch assignments
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select(`
          product_id,
          product_name,
          branch_products (
            branch_id,
            stock_quantity,
            is_active
          )
        `)
        .order('product_name');

      if (productsError) throw productsError;

      // Process inventory data
      const inventoryMap = new Map<string, ProductInventory>();
      const branchTotalsMap: { [branchId: string]: number } = {};

      // Initialize branch totals
      branchesData?.forEach(branch => {
        branchTotalsMap[branch.id] = 0;
      });

      productsData?.forEach((product: any) => {
        const branches: { [branchId: string]: number } = {};
        let totalStock = 0;

        // Process each branch assignment
        if (product.branch_products && Array.isArray(product.branch_products)) {
          product.branch_products.forEach((bp: any) => {
            if (bp.is_active) {
              const stock = bp.stock_quantity || 0;
              branches[bp.branch_id] = stock;
              totalStock += stock;
              branchTotalsMap[bp.branch_id] += stock;
            }
          });
        }

        // Determine status
        let status: 'balanced' | 'unbalanced' | 'low-stock' = 'balanced';

        // Check for low stock (less than 10 total)
        if (totalStock < 10 && totalStock > 0) {
          status = 'low-stock';
        }

        // Check for unbalanced distribution (one branch has > 70% of total)
        const branchStocks = Object.values(branches);
        if (branchStocks.length > 1 && totalStock > 0) {
          const maxStock = Math.max(...branchStocks);
          if (maxStock / totalStock > 0.7) {
            status = 'unbalanced';
          }
        }

        inventoryMap.set(product.product_id, {
          product_id: product.product_id,
          product_name: product.product_name,
          total_stock: totalStock,
          branches,
          status,
        });
      });

      setInventory(Array.from(inventoryMap.values()));
      setBranchTotals(branchTotalsMap);

    } catch (error) {
      console.error('Error fetching inventory data:', error);
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

  // Count discrepancies
  const unbalancedCount = inventory.filter(p => p.status === 'unbalanced').length;
  const lowStockCount = inventory.filter(p => p.status === 'low-stock').length;
  const totalDiscrepancies = unbalancedCount + lowStockCount;

  // Prepare columns for DataTable
  const inventoryColumns = [
    { key: 'product_name', label: 'Product' },
    ...branches.map(branch => ({
      key: `branch_${branch.id}`,
      label: branch.code,
      render: (_: any, row: ProductInventory) => row.branches[branch.id] || 0,
    })),
    {
      key: 'total_stock',
      label: 'Total Stock',
      render: (value: number) => <span className="font-semibold">{value}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (value: string) => {
        let variant: 'default' | 'secondary' | 'destructive' = 'default';
        let displayText = value;

        if (value === 'balanced') {
          variant = 'default';
          displayText = 'Balanced';
        } else if (value === 'unbalanced') {
          variant = 'secondary';
          displayText = 'Unbalanced';
        } else if (value === 'low-stock') {
          variant = 'destructive';
          displayText = 'Low Stock';
        }

        return <Badge variant={variant}>{displayText}</Badge>;
      },
    },
  ];

  // Calculate max for branch comparison
  const maxBranchTotal = Math.max(...Object.values(branchTotals), 1);

  return (
    <DashboardLayout userName={profile?.full_name || 'Superadmin'} userRole="superadmin">
      <div className="p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* Header */}
          <div>
            <h1 className="text-4xl font-bold">Products per Branch</h1>
          </div>

          {/* Branch Totals */}
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
            {branches.map(branch => (
              <Card key={branch.id}>
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-primary/10 rounded-lg">
                      <BuildingIcon className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{branch.name}</p>
                      <p className="text-2xl font-bold">{branchTotals[branch.id] || 0} items</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Discrepancies Alert */}
          {totalDiscrepancies > 0 && (
            <Card className="p-6 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200">
              <div className="flex items-start gap-3">
                <AlertTriangleIcon className="h-5 w-5 text-yellow-600 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-yellow-900 dark:text-yellow-100">
                    Stock Discrepancies Detected
                  </h3>
                  <p className="text-sm text-yellow-800 dark:text-yellow-200 mt-1">
                    {unbalancedCount > 0 && `${unbalancedCount} product${unbalancedCount !== 1 ? 's have' : ' has'} unbalanced distribution`}
                    {unbalancedCount > 0 && lowStockCount > 0 && ', '}
                    {lowStockCount > 0 && `${lowStockCount} product${lowStockCount !== 1 ? 's are' : ' is'} low on stock`}
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* Inventory Table */}
          {inventory.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center text-muted-foreground">
                No inventory data available. Products need to be assigned to branches.
              </CardContent>
            </Card>
          ) : (
            <DataTable
              title="Inventory by Branch"
              columns={inventoryColumns}
              data={inventory}
            />
          )}

          {/* Branch Comparison */}
          {branches.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Branch Comparison</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {branches.map((branch) => {
                    const total = branchTotals[branch.id] || 0;
                    const percentage = maxBranchTotal > 0 ? (total / maxBranchTotal) * 100 : 0;

                    return (
                      <div key={branch.id}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium">{branch.name} ({branch.code})</span>
                          <span className="text-muted-foreground">{total} items</span>
                        </div>
                        <div className="w-full bg-secondary rounded-full h-2">
                          <div
                            className="bg-primary h-2 rounded-full transition-all"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
