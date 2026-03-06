'use client';

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { NavigationCard } from '@/components/dashboard/navigation-card';
import { useAuth } from '@/lib/auth/auth-context';
import {
  DollarSignIcon,
  ArrowLeftRightIcon,
  PackageIcon,
  CalendarClockIcon,
  SettingsIcon,
} from 'lucide-react';

export default function ManagerDashboard() {
  const { profile } = useAuth();

  return (
    <DashboardLayout userName={profile?.full_name || 'Manager'} userRole="manager">
      <div className="p-8 flex-1">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* Header */}
          <div className="space-y-2">
            <h1 className="text-4xl font-bold">
              Welcome back, {profile?.full_name || 'Manager'}!
            </h1>
          </div>

          {/* Navigation Cards */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <NavigationCard
              title="Expenses"
              description="View and manage today's branch expenses"
              href="/manager/expenses"
              icon={DollarSignIcon}
            />
            <NavigationCard
              title="Transfers"
              description="Manage stock transfers between branches"
              href="/manager/transfers"
              icon={ArrowLeftRightIcon}
            />
            <NavigationCard
              title="Inventory"
              description="View product inventory for this branch"
              href="/manager/inventory"
              icon={PackageIcon}
            />
            <NavigationCard
              title="Shifts"
              description="View shift history and cashier activity"
              href="/manager/shifts"
              icon={CalendarClockIcon}
            />
            <NavigationCard
              title="Settings"
              description="Manage your account and preferences"
              href="/manager/settings"
              icon={SettingsIcon}
            />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
