'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Loader2, X } from 'lucide-react';

export type NotificationType = 'success' | 'error' | 'loading';

export interface NotificationProps {
  type: NotificationType;
  message: string;
  onClose?: () => void;
}

export function Notification({ type, message, onClose }: NotificationProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (type !== 'loading') {
      const timer = setTimeout(() => {
        setIsVisible(false);
        onClose?.();
      }, 4000);

      return () => clearTimeout(timer);
    }
  }, [type, onClose]);

  if (!isVisible) return null;

  const styles = {
    success: 'bg-green-50 border-green-200 text-green-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    loading: 'bg-blue-50 border-blue-200 text-blue-800',
  };

  const icons = {
    success: <CheckCircle2 className="h-5 w-5 text-green-600" />,
    error: <XCircle className="h-5 w-5 text-red-600" />,
    loading: <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />,
  };

  return (
    <div
      className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-50
        min-w-[320px] max-w-md px-4 py-3 rounded-lg border shadow-lg
        flex items-center gap-3 animate-in slide-in-from-top-2 duration-300
        ${styles[type]}`}
    >
      {icons[type]}
      <span className="flex-1 text-sm font-medium">{message}</span>
      {type !== 'loading' && (
        <button
          onClick={() => {
            setIsVisible(false);
            onClose?.();
          }}
          className="hover:opacity-70 transition-opacity"
          aria-label="Close notification"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// Hook for managing notifications
export function useNotification() {
  const [notification, setNotification] = useState<{
    type: NotificationType;
    message: string;
  } | null>(null);

  const showNotification = (type: NotificationType, message: string) => {
    setNotification({ type, message });
  };

  const hideNotification = () => {
    setNotification(null);
  };

  return {
    notification,
    showNotification,
    hideNotification,
  };
}
