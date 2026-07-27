'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MenuIcon, LogOut, ClockIcon, StoreIcon } from 'lucide-react';
import { UserRole } from '@/lib/types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuth } from '@/lib/auth/auth-context';

interface TopBarProps {
  userName: string;
  userRole: UserRole;
  onMenuClick: () => void;
  onMenuDoubleClick: () => void;
  showClock?: boolean;
  onClockClick?: () => void;
  hasActiveShift?: boolean;
  onEndShiftAndLogout?: () => void;
  branchName?: string;
}

export function TopBar({
  userName,
  userRole,
  onMenuClick,
  onMenuDoubleClick,
  showClock = false,
  onClockClick,
  hasActiveShift = false,
  onEndShiftAndLogout,
  branchName,
}: TopBarProps) {
  const router = useRouter();
  const { signOut } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showDropdown, setShowDropdown] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [clickTimeout, setClickTimeout] = useState<NodeJS.Timeout | null>(null);

  // Only render time after client-side mount to prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.user-dropdown')) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('click', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showDropdown]);

  const handleLogout = async () => {
    await signOut();
    router.push('/login');
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-KE', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'Africa/Nairobi',
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-KE', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'Africa/Nairobi',
    });
  };

  const handleMenuButtonClick = () => {
    if (clickTimeout) {
      // This is a double click
      clearTimeout(clickTimeout);
      setClickTimeout(null);
      onMenuDoubleClick();
    } else {
      // This might be a single click, wait to see
      const timeout = setTimeout(() => {
        onMenuClick();
        setClickTimeout(null);
      }, 250); // 250ms to detect double click
      setClickTimeout(timeout);
    }
  };

  const getUserInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="h-16 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
      <div className="h-full px-4 flex items-center justify-between">
        {/* Left: Logo/Menu Button */}
        <button
          onClick={handleMenuButtonClick}
          className="p-2 hover:bg-accent rounded-lg transition-colors"
          aria-label="Toggle menu"
        >
          <MenuIcon className="h-6 w-6" />
        </button>

        {/* Center: Time and Date (Cashier only) */}
        <div className="flex items-center gap-3">
          {branchName && (
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
              <StoreIcon className="h-3.5 w-3.5" />
              Working at: {branchName}
            </div>
          )}
          {showClock && onClockClick && (
            <button
              onClick={onClockClick}
              className="flex flex-col items-center px-4 py-2 hover:bg-accent rounded-lg transition-colors"
            >
              <div className="text-2xl font-bold tabular-nums" suppressHydrationWarning>
                {mounted ? formatTime(currentTime) : '--:--:--'}
              </div>
              <div className="text-xs text-muted-foreground" suppressHydrationWarning>
                {mounted ? formatDate(currentTime) : 'Loading...'}
              </div>
            </button>
          )}
        </div>

        {/* Right: User Info with Dropdown */}
        <div className="relative user-dropdown">
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-3 hover:bg-accent rounded-lg px-2 py-1 transition-colors"
          >
            <div className="text-right hidden sm:block">
              <div className="text-sm font-medium">{userName}</div>
              <div className="text-xs text-muted-foreground capitalize">
                {userRole}
              </div>
            </div>
            <Avatar>
              <AvatarFallback className="bg-primary text-primary-foreground">
                {getUserInitials(userName)}
              </AvatarFallback>
            </Avatar>
          </button>

          {/* Dropdown Menu */}
          {showDropdown && (
            <div className="absolute right-0 mt-2 w-56 bg-background border rounded-lg shadow-lg py-2 z-50">
              <div className="px-4 py-2 border-b">
                <p className="text-sm font-medium">{userName}</p>
                <p className="text-xs text-muted-foreground capitalize">{userRole}</p>
              </div>
              {userRole === 'cashier' ? (
                <button
                  onClick={() => {
                    setShowDropdown(false);
                    if (hasActiveShift && onEndShiftAndLogout) {
                      onEndShiftAndLogout();
                    } else {
                      handleLogout();
                    }
                  }}
                  className="w-full px-4 py-2 text-sm text-left hover:bg-accent transition-colors flex items-center gap-2 text-orange-600"
                >
                  <ClockIcon className="h-4 w-4" />
                  Close Shift & Logout
                </button>
              ) : (
                <button
                  onClick={handleLogout}
                  className="w-full px-4 py-2 text-sm text-left hover:bg-accent transition-colors flex items-center gap-2"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
