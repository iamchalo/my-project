'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface FullscreenClockProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FullscreenClock({ isOpen, onClose }: FullscreenClockProps) {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

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

  const formatDayOfWeek = (date: Date) => {
    return date.toLocaleDateString('en-KE', {
      weekday: 'long',
      timeZone: 'Africa/Nairobi',
    });
  };

  const formatFullDate = (date: Date) => {
    return date.toLocaleDateString('en-KE', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'Africa/Nairobi',
    });
  };

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 bg-background flex items-center justify-center cursor-pointer',
        'animate-in fade-in duration-200'
      )}
      onClick={onClose}
    >
      <div className="text-center space-y-8">
        {/* Time */}
        <div className="text-9xl md:text-[12rem] lg:text-[16rem] font-bold tabular-nums tracking-tight">
          {formatTime(currentTime)}
        </div>

        {/* Date */}
        <div className="space-y-2">
          <div className="text-4xl md:text-6xl font-semibold text-muted-foreground">
            {formatDayOfWeek(currentTime)}
          </div>
          <div className="text-3xl md:text-5xl text-muted-foreground">
            {formatFullDate(currentTime)}
          </div>
        </div>

        {/* Hint */}
        <div className="text-sm text-muted-foreground/60 absolute bottom-8 left-1/2 -translate-x-1/2">
          Click anywhere to close
        </div>
      </div>
    </div>
  );
}
