'use client';

import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/dashboard/stat-card';
import { useAuth } from '@/lib/auth/auth-context';
import { RefreshCwIcon, TrendingUpIcon, CheckIcon, InfoIcon } from 'lucide-react';

export default function SuperadminTransfersPage() {
  const { profile } = useAuth();

  return (
    <DashboardLayout userName={profile?.full_name || 'Superadmin'} userRole="superadmin">
      <div className="p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* Header */}
          <div>
            <h1 className="text-4xl font-bold">Transfers Between Branches</h1>
            <p className="text-muted-foreground">
              Track product transfers and movements between branches
            </p>
          </div>

          {/* Info Banner */}
          <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200">
            <CardContent className="p-6">
              <div className="flex items-start gap-3">
                <InfoIcon className="h-5 w-5 text-blue-600 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-blue-900 dark:text-blue-100">
                    Transfer Tracking System
                  </h3>
                  <p className="text-sm text-blue-800 dark:text-blue-200 mt-1">
                    The dedicated transfer tracking system is currently being set up. Once implemented, you'll be able to:
                  </p>
                  <ul className="list-disc list-inside text-sm text-blue-800 dark:text-blue-200 mt-2 space-y-1">
                    <li>Create and approve transfer requests between branches</li>
                    <li>Track transfer status (pending, in transit, completed, cancelled)</li>
                    <li>View full transfer history with detailed logs</li>
                    <li>Generate transfer reports and analytics</li>
                    <li>Monitor most active transfer routes</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Placeholder Stats */}
          <div className="grid gap-4 md:grid-cols-4">
            <StatCard
              title="Total Transfers"
              value="Coming Soon"
              description="All time transfers"
              icon={RefreshCwIcon}
            />
            <StatCard
              title="In Transit"
              value="Coming Soon"
              description="Currently moving"
              icon={TrendingUpIcon}
            />
            <StatCard
              title="Completed This Month"
              value="Coming Soon"
              description="Successfully completed"
              icon={CheckIcon}
            />
            <StatCard
              title="Average per Day"
              value="Coming Soon"
              description="Daily average"
              icon={RefreshCwIcon}
            />
          </div>

          {/* Transfer System Overview */}
          <Card>
            <CardHeader>
              <CardTitle>How Transfer Management Will Work</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <h4 className="font-semibold text-lg">Transfer Request Process</h4>
                    <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                      <li>Manager identifies need for product transfer</li>
                      <li>Creates transfer request with product, quantity, and destination</li>
                      <li>System checks source branch stock availability</li>
                      <li>Superadmin or authorized personnel approves request</li>
                      <li>Transfer status updates: Pending → In Transit → Completed</li>
                    </ol>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-semibold text-lg">Features to Be Implemented</h4>
                    <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
                      <li>Real-time transfer status tracking</li>
                      <li>Automatic stock adjustment on completion</li>
                      <li>Transfer approval workflow</li>
                      <li>Notification system for transfer updates</li>
                      <li>Transfer history and audit trail</li>
                      <li>Analytics on transfer patterns</li>
                    </ul>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <h4 className="font-semibold mb-3">Database Schema (To Be Created)</h4>
                  <div className="bg-muted p-4 rounded-lg font-mono text-sm">
                    <p className="text-muted-foreground">transfers table:</p>
                    <ul className="ml-4 mt-2 space-y-1 text-xs">
                      <li>• transfer_id (UUID, primary key)</li>
                      <li>• product_id (references products)</li>
                      <li>• from_branch_id (references branches)</li>
                      <li>• to_branch_id (references branches)</li>
                      <li>• quantity (integer)</li>
                      <li>• status (pending/approved/in_transit/completed/cancelled)</li>
                      <li>• requested_by (references profiles)</li>
                      <li>• approved_by (references profiles, nullable)</li>
                      <li>• created_at, updated_at, completed_at (timestamps)</li>
                      <li>• notes (text, optional)</li>
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Temporary Alternative */}
          <Card>
            <CardHeader>
              <CardTitle>Current Inventory Management</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                While the transfer system is being implemented, you can:
              </p>
              <div className="space-y-2">
                <div className="flex items-center gap-2 p-3 bg-accent rounded-lg">
                  <CheckIcon className="h-5 w-5 text-green-600" />
                  <span className="text-sm">View product availability per branch in <strong>Products per Branch</strong></span>
                </div>
                <div className="flex items-center gap-2 p-3 bg-accent rounded-lg">
                  <CheckIcon className="h-5 w-5 text-green-600" />
                  <span className="text-sm">Manage stock quantities in <strong>Products</strong> page</span>
                </div>
                <div className="flex items-center gap-2 p-3 bg-accent rounded-lg">
                  <CheckIcon className="h-5 w-5 text-green-600" />
                  <span className="text-sm">Track stock changes in <strong>System Logs</strong></span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
