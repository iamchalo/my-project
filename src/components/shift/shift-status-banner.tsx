'use client';

import { useState } from 'react';
import { useShift } from '@/lib/shift/shift-context';
import { Button } from '@/components/ui/button';
import { ClockIcon, SunIcon, MoonIcon, LogOutIcon, Loader2Icon } from 'lucide-react';
import { EndShiftModal } from './end-shift-modal';

export function ShiftStatusBanner() {
  const { activeShift, loading, hasActiveShift } = useShift();
  const [showEndModal, setShowEndModal] = useState(false);

  if (loading) {
    return null;
  }

  if (!hasActiveShift || !activeShift) {
    return null;
  }

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('en-KE', {
      timeZone: 'Africa/Nairobi',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const shiftTypeLabel = activeShift.shift_type === 'day' ? 'Day Shift' : 'Night Shift';
  const ShiftIcon = activeShift.shift_type === 'day' ? SunIcon : MoonIcon;

  return (
    <>
      <div className={`px-4 py-2 flex items-center justify-between ${
        activeShift.shift_type === 'day'
          ? 'bg-yellow-50 border-b border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800'
          : 'bg-blue-50 border-b border-blue-200 dark:bg-blue-900/20 dark:border-blue-800'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`p-1.5 rounded-full ${
            activeShift.shift_type === 'day'
              ? 'bg-yellow-100 dark:bg-yellow-800'
              : 'bg-blue-100 dark:bg-blue-800'
          }`}>
            <ShiftIcon className={`h-4 w-4 ${
              activeShift.shift_type === 'day'
                ? 'text-yellow-600 dark:text-yellow-300'
                : 'text-blue-600 dark:text-blue-300'
            }`} />
          </div>
          <div>
            <p className="text-sm font-medium">
              {shiftTypeLabel}
            </p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <ClockIcon className="h-3 w-3" />
              Started at {formatTime(activeShift.started_at)}
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1"
          onClick={() => setShowEndModal(true)}
        >
          <LogOutIcon className="h-3 w-3" />
          End Shift
        </Button>
      </div>

      <EndShiftModal
        isOpen={showEndModal}
        onClose={() => setShowEndModal(false)}
      />
    </>
  );
}
