'use client';

import { useEffect } from 'react';
import { CheckCircle2, Banknote, Smartphone } from 'lucide-react';

interface OrderConfirmationProps {
  isOpen: boolean;
  orderNumber: number;
  paymentMethod: 'cash' | 'mpesa';
  totalAmount: number;
  onClose: () => void;
}

export function OrderConfirmationDialog({
  isOpen,
  orderNumber,
  paymentMethod,
  totalAmount,
  onClose,
}: OrderConfirmationProps) {
  useEffect(() => {
    if (isOpen) {
      // Auto-close after 5 seconds
      const timer = setTimeout(() => {
        onClose();
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const PaymentIcon = paymentMethod === 'cash' ? Banknote : Smartphone;
  const paymentLabel = paymentMethod === 'cash' ? 'Cash' : 'M-Pesa';

  return (
    <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 animate-in slide-in-from-top-5 duration-300">
      <div className="bg-green-50 border-2 border-green-200 rounded-lg shadow-lg px-6 py-3 flex items-center gap-4 min-w-[500px]">
        {/* Success Icon */}
        <div className="shrink-0">
          <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
            <CheckCircle2 className="h-6 w-6 text-green-600" />
          </div>
        </div>

        {/* Order Details */}
        <div className="flex-1 flex items-center gap-6">
          {/* Order Number */}
          <div>
            <p className="text-xs text-green-700 font-medium">Order</p>
            <p className="text-lg font-bold text-green-900">#{orderNumber}</p>
          </div>

          {/* Divider */}
          <div className="h-10 w-px bg-green-200"></div>

          {/* Payment Method */}
          <div className="flex items-center gap-2">
            <PaymentIcon className="h-5 w-5 text-green-700" />
            <div>
              <p className="text-xs text-green-700 font-medium">Payment</p>
              <p className="text-sm font-bold text-green-900">{paymentLabel}</p>
            </div>
          </div>

          {/* Divider */}
          <div className="h-10 w-px bg-green-200"></div>

          {/* Total Amount */}
          <div>
            <p className="text-xs text-green-700 font-medium">Total</p>
            <p className="text-lg font-bold text-green-900">
              KSh {totalAmount.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Success Message */}
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold text-green-900">Completed!</p>
          <p className="text-xs text-green-700">Payment received</p>
        </div>
      </div>
    </div>
  );
}
