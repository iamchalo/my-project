'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useClerkSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth/auth-context';

interface ActiveShift {
  id: string;
  cashier_id: string;
  cashier_name: string;
  shift_type: 'day' | 'night';
  shift_date: string;
  started_at: string;
}

interface ShiftContextType {
  activeShift: ActiveShift | null;
  loading: boolean;
  hasActiveShift: boolean;
  startShift: () => Promise<boolean>;
  endShift: (cashHandedOver: number, notes?: string) => Promise<boolean>;
  refreshShift: () => Promise<void>;
  getCurrentShiftType: () => 'day' | 'night';
}

const ShiftContext = createContext<ShiftContextType | undefined>(undefined);

export function ShiftProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const supabase = useClerkSupabaseClient();

  const [activeShift, setActiveShift] = useState<ActiveShift | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch active shift for the branch
  const fetchActiveShift = async () => {
    if (!profile?.branch_id) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .rpc('get_active_shift', {
          p_branch_id: profile.branch_id
        });

      if (error) throw error;

      if (data && data.length > 0) {
        setActiveShift(data[0]);
      } else {
        setActiveShift(null);
      }
    } catch (error) {
      console.error('Error fetching active shift:', error);
      setActiveShift(null);
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch and real-time subscription
  useEffect(() => {
    if (!profile?.branch_id) {
      setLoading(false);
      return;
    }

    let subscription: any = null;

    // Defer initial fetch slightly to prioritize UI rendering
    const timeoutId = setTimeout(() => {
      fetchActiveShift();
    }, 50);

    // Set up subscription after initial load
    const subscriptionTimeout = setTimeout(() => {
      subscription = supabase
        .channel('shift_changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'shifts',
            filter: `branch_id=eq.${profile.branch_id}`,
          },
          () => {
            fetchActiveShift();
          }
        )
        .subscribe();
    }, 200);

    return () => {
      clearTimeout(timeoutId);
      clearTimeout(subscriptionTimeout);
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, [profile?.branch_id]);

  // Get current shift type based on Kenya time
  const getCurrentShiftType = (): 'day' | 'night' => {
    const kenyaHour = parseInt(
      new Date().toLocaleString('en-US', {
        timeZone: 'Africa/Nairobi',
        hour: 'numeric',
        hour12: false
      })
    );
    return (kenyaHour >= 7 && kenyaHour < 19) ? 'day' : 'night';
  };

  // Start a new shift
  const startShift = async (): Promise<boolean> => {
    if (!profile?.branch_id || !profile?.id) {
      console.error('No profile loaded');
      return false;
    }

    try {
      const { data, error } = await supabase
        .rpc('start_shift', {
          p_branch_id: profile.branch_id,
          p_cashier_id: profile.id
        });

      if (error) throw error;

      await fetchActiveShift();
      return true;
    } catch (error: any) {
      console.error('Error starting shift:', error);
      throw error;
    }
  };

  // End current shift
  const endShift = async (cashHandedOver: number, notes?: string): Promise<boolean> => {
    if (!activeShift) {
      console.error('No active shift to end');
      return false;
    }

    try {
      const { data, error } = await supabase
        .rpc('end_shift', {
          p_shift_id: activeShift.id,
          p_cash_handed_over: cashHandedOver,
          p_notes: notes || null
        });

      if (error) throw error;

      setActiveShift(null);
      return true;
    } catch (error: any) {
      console.error('Error ending shift:', error);
      throw error;
    }
  };

  const refreshShift = async () => {
    await fetchActiveShift();
  };

  return (
    <ShiftContext.Provider
      value={{
        activeShift,
        loading,
        hasActiveShift: !!activeShift,
        startShift,
        endShift,
        refreshShift,
        getCurrentShiftType,
      }}
    >
      {children}
    </ShiftContext.Provider>
  );
}

export function useShift() {
  const context = useContext(ShiftContext);
  if (context === undefined) {
    throw new Error('useShift must be used within a ShiftProvider');
  }
  return context;
}
