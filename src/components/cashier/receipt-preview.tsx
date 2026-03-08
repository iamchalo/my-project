'use client';

import { OrderItem } from '@/components/cashier/order-cart';
import { Banknote, Smartphone } from 'lucide-react';

interface ReceiptPreviewProps {
  items: OrderItem[];
  total: number;
  paymentMethod: 'cash' | 'mpesa';
  branchName?: string;
  cashierName?: string;
}

const BRANCH_PHONES: Record<string, string> = {
  KFries: '0755640640',
  BeFries: '0783797979',
  StageBeFries: '0796797979',
  MigFries: '07',
  LFries: '0738797979',
};

const Divider = ({ dashed = false }: { dashed?: boolean }) => (
  <div className={`border-t my-2 ${dashed ? 'border-dashed border-gray-400' : 'border-gray-300'}`} />
);

export function ReceiptPreview({
  items,
  total,
  paymentMethod,
  branchName = 'KFries',
  cashierName,
}: ReceiptPreviewProps) {
  const branchPhone = branchName ? BRANCH_PHONES[branchName] : undefined;
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-KE', {
    timeZone: 'Africa/Nairobi',
    day: '2-digit', month: 'short', year: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('en-KE', {
    timeZone: 'Africa/Nairobi',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  return (
    <div className="w-full max-w-[340px] mx-auto bg-white text-black rounded-lg border border-gray-200 shadow-md font-mono text-xs leading-5 overflow-hidden">

      {/* Header */}
      <div className="bg-gray-900 text-white text-center py-3 px-4 space-y-0.5">
        <p className="text-base font-bold tracking-widest uppercase">{branchName}</p>
        {branchPhone && <p className="text-sm font-bold text-white tracking-widest">{branchPhone}</p>}
      </div>

      <div className="px-4 py-3 space-y-1">

        {/* Meta */}
        <div className="flex justify-between text-gray-500">
          <span>Date:</span>
          <span className="text-black font-medium">{dateStr}</span>
        </div>
        <div className="flex justify-between text-gray-500">
          <span>Time:</span>
          <span className="text-black font-medium">{timeStr}</span>
        </div>
        {cashierName && (
          <div className="flex justify-between text-gray-500">
            <span>Cashier:</span>
            <span className="text-black font-medium">{cashierName}</span>
          </div>
        )}

        <Divider dashed />

        {/* Column headers */}
        <div className="flex text-[10px] uppercase text-gray-400 font-semibold pb-0.5">
          <span className="flex-1">Item</span>
          <span className="w-8 text-center">Qty</span>
          <span className="w-16 text-right">Price</span>
          <span className="w-20 text-right">Total</span>
        </div>

        <Divider />

        {/* Items */}
        <div className="space-y-1">
          {items.map((item) => {
            const lineTotal = item.product_price * item.quantity;
            return (
              <div key={item.id} className="flex">
                <span className="flex-1 truncate pr-1 text-black">{item.product_name}</span>
                <span className="w-8 text-center text-gray-600">{item.quantity}</span>
                <span className="w-16 text-right text-gray-600">
                  {item.product_price.toLocaleString()}
                </span>
                <span className="w-20 text-right font-medium text-black">
                  {lineTotal.toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>

        <Divider dashed />

        {/* Totals */}
        <div className="space-y-1">
          <div className="flex justify-between text-gray-500">
            <span>Subtotal</span>
            <span className="text-black">Ksh {total.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-gray-500">
            <span>Tax (16%)</span>
            <span className="text-black">Ksh {Math.round(total * 0.16).toLocaleString()}</span>
          </div>
        </div>

        <Divider />

        {/* Grand Total */}
        <div className="flex justify-between text-sm font-bold">
          <span>TOTAL</span>
          <span>Ksh {total.toLocaleString()}</span>
        </div>

        <Divider dashed />

        {/* Payment method */}
        <div className="flex items-center justify-between">
          <span className="text-gray-500">Payment</span>
          <span className={`flex items-center gap-1.5 font-semibold text-xs px-2 py-0.5 rounded-full ${
            paymentMethod === 'mpesa'
              ? 'bg-red-100 text-red-700'
              : 'bg-green-100 text-green-700'
          }`}>
            {paymentMethod === 'mpesa'
              ? <><Smartphone className="h-3 w-3" /> M-Pesa</>
              : <><Banknote className="h-3 w-3" /> Cash</>
            }
          </span>
        </div>

        <Divider dashed />

        {/* Footer */}
        <div className="text-center text-gray-500 text-[10px] space-y-0.5 pt-1 pb-2">
          <p className="font-semibold text-black">Thank you for your order!</p>
          <p>Please come again</p>
        </div>
      </div>
    </div>
  );
}
