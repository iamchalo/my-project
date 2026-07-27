'use client';

import { useState, useEffect } from 'react';
import { TopBar } from './top-bar';
import { Sidebar } from './sidebar';
import { FullscreenClock } from './fullscreen-clock';
import { UserRole } from '@/lib/types';

interface DashboardLayoutProps {
  children: React.ReactNode;
  userName: string;
  userRole: UserRole;
  hasActiveShift?: boolean;
  onEndShiftAndLogout?: () => void;
  branchName?: string;
}

export function DashboardLayout({
  children,
  userName,
  userRole,
  hasActiveShift,
  onEndShiftAndLogout,
  branchName,
}: DashboardLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [isClockFullscreen, setIsClockFullscreen] = useState(false);

  // Initialize sidebar state - starts closed on all devices
  useEffect(() => {
    setIsSidebarOpen(false);
    setIsSidebarExpanded(false);
  }, []);

  // Single click: toggle expanded (with labels) or close
  const handleMenuClick = () => {
    if (!isSidebarOpen) {
      // Sidebar closed -> open expanded (with labels)
      setIsSidebarOpen(true);
      setIsSidebarExpanded(true);
    } else {
      // Sidebar open -> close it
      setIsSidebarOpen(false);
      setIsSidebarExpanded(false);
    }
  };

  // Double click: toggle icon-only or close
  const handleMenuDoubleClick = () => {
    if (!isSidebarOpen) {
      // Sidebar closed -> open collapsed (icons only)
      setIsSidebarOpen(true);
      setIsSidebarExpanded(false);
    } else {
      // Sidebar open -> close it
      setIsSidebarOpen(false);
      setIsSidebarExpanded(false);
    }
  };

  const closeSidebar = () => {
    setIsSidebarOpen(false);
    setIsSidebarExpanded(false);
  };

  const toggleClock = () => setIsClockFullscreen(!isClockFullscreen);

  const isCashier = userRole === 'cashier';

  return (
    <div className="min-h-screen bg-background">
      {/* Top Bar */}
      <TopBar
        userName={userName}
        userRole={userRole}
        onMenuClick={handleMenuClick}
        onMenuDoubleClick={handleMenuDoubleClick}
        showClock={isCashier}
        onClockClick={isCashier ? toggleClock : undefined}
        hasActiveShift={hasActiveShift}
        onEndShiftAndLogout={onEndShiftAndLogout}
        branchName={isCashier ? branchName : undefined}
      />

      {/* Sidebar */}
      <Sidebar
        isOpen={isSidebarOpen}
        isExpanded={isSidebarExpanded}
        userRole={userRole}
        onClose={closeSidebar}
      />

      {/* Main Content - Shifts based on sidebar state */}
      <main className={`min-h-[calc(100vh-4rem)] transition-all duration-300 ${
        isSidebarOpen
          ? isSidebarExpanded
            ? 'lg:ml-64'
            : 'lg:ml-20'
          : ''
      }`}>
        {children}
      </main>

      {/* Fullscreen Clock (Cashier only) */}
      {isCashier && (
        <FullscreenClock isOpen={isClockFullscreen} onClose={toggleClock} />
      )}
    </div>
  );
}
