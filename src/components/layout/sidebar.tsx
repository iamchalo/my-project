'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { UserRole } from '@/lib/types';
import {
  LayoutDashboardIcon,
  ShoppingCartIcon,
  DollarSignIcon,
  TrendingUpIcon,
  PackageIcon,
  SettingsIcon,
  BoxIcon,
  RefreshCwIcon,
  UsersIcon,
  ActivityIcon,
  ShieldIcon,
  PrinterIcon,
  BarChart2Icon,
} from 'lucide-react';
import { LucideIcon } from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

interface SidebarProps {
  isOpen: boolean;
  isExpanded: boolean;
  userRole: UserRole;
  onClose: () => void;
}

const navigationConfig: Record<UserRole, NavItem[]> = {
  cashier: [
    { label: 'Dashboard', href: '/cashier', icon: LayoutDashboardIcon },
    { label: 'Orders', href: '/cashier/orders', icon: ShoppingCartIcon },
    { label: 'Expenses', href: '/cashier/expenses', icon: DollarSignIcon },
    { label: 'Sales & Stock', href: '/cashier/sales-stock', icon: TrendingUpIcon },
    { label: 'Settings', href: '/cashier/settings', icon: SettingsIcon },
  ],
  manager: [
    { label: 'Dashboard', href: '/manager', icon: LayoutDashboardIcon },
    { label: 'Expenses', href: '/manager/expenses', icon: DollarSignIcon },
    { label: 'Transfers', href: '/manager/transfers', icon: RefreshCwIcon },
    { label: 'Settings', href: '/manager/settings', icon: SettingsIcon },
  ],
  admin: [
    { label: 'Dashboard', href: '/admin', icon: LayoutDashboardIcon },
    { label: 'Sales Report', href: '/admin/sales-report', icon: BarChart2Icon },
    { label: 'Products', href: '/admin/products', icon: BoxIcon },
    { label: 'Orders Sold', href: '/admin/orders', icon: ShoppingCartIcon },
    { label: 'Expenses', href: '/admin/expenses', icon: DollarSignIcon },
    { label: 'Employees', href: '/admin/employees', icon: UsersIcon },
    { label: 'Transfers', href: '/admin/transfers', icon: RefreshCwIcon },
    { label: 'Sales & Stock', href: '/admin/sales-stock', icon: TrendingUpIcon },
    { label: 'Inventory', href: '/admin/inventory', icon: PackageIcon },
    { label: 'Settings', href: '/admin/settings', icon: SettingsIcon },
  ],
  superadmin: [
    { label: 'Dashboard', href: '/superadmin', icon: LayoutDashboardIcon },
    { label: 'Sales Report', href: '/superadmin/sales-report', icon: BarChart2Icon },
    { label: 'Products', href: '/superadmin/products', icon: BoxIcon },
    { label: 'Orders Sold', href: '/superadmin/orders', icon: ShoppingCartIcon },
    { label: 'Expenses', href: '/superadmin/expenses', icon: DollarSignIcon },
    { label: 'Transfers', href: '/superadmin/transfers', icon: RefreshCwIcon },
    { label: 'Sales & Stock', href: '/superadmin/sales-stock', icon: TrendingUpIcon },
    { label: 'Employees', href: '/superadmin/employees', icon: UsersIcon },
    { label: 'Logs', href: '/superadmin/logs', icon: ActivityIcon },
    { label: 'Inventory', href: '/superadmin/inventory', icon: PackageIcon },
    { label: 'Printers', href: '/superadmin/printers', icon: PrinterIcon },
    { label: 'Settings', href: '/superadmin/settings', icon: SettingsIcon },
  ],
};

export function Sidebar({ isOpen, isExpanded, userRole, onClose }: SidebarProps) {
  const pathname = usePathname();
  const navItems = navigationConfig[userRole] || [];

  return (
    <>
      {/* Backdrop for mobile only - blurs page content below top bar */}
      <div
        className={cn(
          'fixed top-16 left-0 right-0 bottom-0 z-40 lg:hidden transition-all duration-300',
          isOpen
            ? 'bg-black/50 backdrop-blur-sm pointer-events-auto'
            : 'bg-transparent backdrop-blur-0 pointer-events-none'
        )}
        onClick={onClose}
      />

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-16 left-0 h-[calc(100vh-4rem)] z-50 transition-all duration-300 ease-in-out overflow-y-auto',
          // Seamless background that blends with app
          'bg-background/95 backdrop-blur-md border-r border-border/50',
          // Slide in/out on all devices
          isOpen ? 'translate-x-0' : '-translate-x-full',
          // Width changes based on expanded state (always expanded on mobile)
          'lg:w-64 w-72',
          !isExpanded && 'lg:w-20'
        )}
      >
        <nav className="p-3 space-y-1 pt-4">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => {
                  // Only close on mobile
                  if (window.innerWidth < 1024) {
                    onClose();
                  }
                }}
                className={cn(
                  'flex items-center rounded-xl transition-all duration-200',
                  // Always show expanded on mobile, respect isExpanded on desktop
                  'gap-3 px-4 py-3 lg:gap-3',
                  !isExpanded && 'lg:justify-center lg:px-0',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-md'
                    : 'hover:bg-accent/80 text-foreground hover:translate-x-1'
                )}
                title={!isExpanded ? item.label : undefined}
              >
                <Icon className={cn(
                  'h-5 w-5 shrink-0 transition-transform',
                  isActive && 'scale-110'
                )} />
                <span className={cn(
                  'font-medium lg:hidden',
                  isExpanded && 'lg:block'
                )}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
