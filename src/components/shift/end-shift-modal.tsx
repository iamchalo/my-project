'use client';

import { useState, useEffect } from 'react';
import { useShift } from '@/lib/shift/shift-context';
import { useAuth } from '@/lib/auth/auth-context';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { XIcon, Loader2Icon, LogOutIcon, ReceiptIcon } from 'lucide-react';

interface EndShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShiftEnded?: () => void;
}

export function EndShiftModal({ isOpen, onClose, onShiftEnded }: EndShiftModalProps) {
  const { activeShift, endShift } = useShift();
  const { profile } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [calculatingTotals, setCalculatingTotals] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [totalExpenses, setTotalExpenses] = useState(0);
  const [cashHandedOver, setCashHandedOver] = useState('');

  // Fetch totals when modal opens
  useEffect(() => {
    if (!isOpen || !activeShift || !profile?.branch_id) return;

    const fetchTotals = async () => {
      setCalculatingTotals(true);
      try {
        // Fetch expenses total
        const { data: expensesData, error: expensesError } = await supabase
          .from('expenses')
          .select('total')
          .eq('branch_id', profile.branch_id)
          .eq('expense_date', activeShift.shift_date)
          .eq('shift', activeShift.shift_type);

        if (expensesError) throw expensesError;

        const expensesTotal = expensesData?.reduce((sum, expense) => sum + Number(expense.total), 0) || 0;
        setTotalExpenses(expensesTotal);
      } catch (error) {
        console.error('Error fetching totals:', error);
      } finally {
        setCalculatingTotals(false);
      }
    };

    fetchTotals();
  }, [isOpen, activeShift, profile?.branch_id]);

  if (!isOpen || !activeShift) return null;

  const handleEndShift = async () => {
    try {
      setLoading(true);
      setError(null);

      const cashValue = parseFloat(cashHandedOver) || 0;
      await endShift(cashValue);

      // Call onShiftEnded if provided (e.g., for logout), otherwise just close
      if (onShiftEnded) {
        onShiftEnded();
      } else {
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to end shift');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('en-KE', {
      timeZone: 'Africa/Nairobi',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-lg w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold">End Shift</h2>
            <button onClick={onClose}>
              <XIcon className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-6">
            {/* Shift Summary */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
              <p className="text-sm text-muted-foreground">Shift Summary</p>
              <div className="flex justify-between">
                <span>Type:</span>
                <span className="font-medium capitalize">{activeShift.shift_type} Shift</span>
              </div>
              <div className="flex justify-between">
                <span>Started:</span>
                <span className="font-medium">{formatTime(activeShift.started_at)}</span>
              </div>
            </div>

            {/* Total Expenses */}
            {calculatingTotals ? (
              <div className="flex items-center justify-center py-8">
                <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">Calculating totals...</span>
              </div>
            ) : (
              <div className="flex justify-between items-center p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                <div className="flex items-center gap-2">
                  <ReceiptIcon className="h-5 w-5 text-red-600" />
                  <span className="font-medium">Total Expenses</span>
                </div>
                <span className="font-bold text-lg text-red-600">
                  Ksh {totalExpenses.toFixed(2)}
                </span>
              </div>
            )}

            {/* Cash Handed Over */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                Cash Handed Over (Ksh)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={cashHandedOver}
                onChange={(e) => setCashHandedOver(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg bg-background"
                placeholder="0.00"
              />
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-600 dark:text-red-400">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={onClose} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={handleEndShift}
                disabled={loading || calculatingTotals}
                className="flex-1 gap-2"
              >
                {loading ? (
                  <>
                    <Loader2Icon className="h-4 w-4 animate-spin" />
                    Ending...
                  </>
                ) : (
                  <>
                    <LogOutIcon className="h-4 w-4" />
                    End Shift
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
