'use client';

import { useState, useEffect } from 'react';
import { useShift } from '@/lib/shift/shift-context';
import { useAuth } from '@/lib/auth/auth-context';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SunIcon, MoonIcon, Loader2Icon, PlayIcon, ChefHatIcon, CheckIcon } from 'lucide-react';

interface Chef {
  id: string;
  full_name: string;
  busyAtBranch: string | null;
}

interface StartShiftModalProps {
  isOpen: boolean;
  onSuccess?: () => void;
}

export function StartShiftModal({ isOpen, onSuccess }: StartShiftModalProps) {
  const { startShift, getCurrentShiftType } = useShift();
  const { profile } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [chefs, setChefs] = useState<Chef[]>([]);
  const [chefsLoading, setChefsLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const shiftType = getCurrentShiftType();
  const isDay = shiftType === 'day';

  // Fetch chefs whenever modal opens
  useEffect(() => {
    if (!isOpen || !profile?.branch_id) return;
    setSelectedIds(new Set());
    setError(null);

    const fetchChefs = async () => {
      setChefsLoading(true);
      try {
        const { data: chefData } = await supabase
          .from('employees')
          .select('id, full_name')
          .eq('branch_id', profile.branch_id)
          .eq('job_title', 'Chef')
          .eq('is_active', true)
          .order('full_name');

        const chefIds = (chefData || []).map(c => c.id);
        let busyMap: Record<string, string> = {};

        if (chefIds.length > 0) {
          const { data: busyData } = await supabase
            .from('shift_chef_assignments')
            .select('employee_id, branches!branch_id(name), shifts!shift_id(is_active)')
            .in('employee_id', chefIds);

          (busyData || []).forEach((row: any) => {
            if (row.shifts?.is_active && row.branches?.name) {
              busyMap[row.employee_id] = row.branches.name;
            }
          });
        }

        setChefs((chefData || []).map(c => ({
          id: c.id,
          full_name: c.full_name,
          busyAtBranch: busyMap[c.id] || null,
        })));
      } catch (err) {
        console.error('Error fetching chefs:', err);
      } finally {
        setChefsLoading(false);
      }
    };

    fetchChefs();
  }, [isOpen, profile?.branch_id]);

  const toggleChef = (id: string) =>
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleStartShift = async () => {
    setLoading(true);
    setError(null);
    try {
      await startShift();

      // Save chef assignments if any selected
      if (selectedIds.size > 0 && profile?.id && profile?.branch_id) {
        // Get the shift that was just created
        const { data: shiftData } = await supabase
          .from('shifts')
          .select('id')
          .eq('branch_id', profile.branch_id)
          .eq('is_active', true)
          .single();

        if (shiftData?.id) {
          await supabase.from('shift_chef_assignments').insert(
            Array.from(selectedIds).map(empId => ({
              shift_id: shiftData.id,
              employee_id: empId,
              branch_id: profile.branch_id,
              assigned_by: profile.id,
            }))
          );
        }
      }

      onSuccess?.();
    } catch (err: any) {
      setError(err.message || 'Failed to start shift');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const currentTime = new Date().toLocaleTimeString('en-KE', {
    timeZone: 'Africa/Nairobi',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md mx-4 max-h-[90vh] flex flex-col">
        <CardHeader className="text-center shrink-0">
          <div className={`mx-auto p-4 rounded-full mb-4 ${
            isDay ? 'bg-yellow-100 dark:bg-yellow-900' : 'bg-blue-100 dark:bg-blue-900'
          }`}>
            {isDay
              ? <SunIcon className="h-12 w-12 text-yellow-600 dark:text-yellow-300" />
              : <MoonIcon className="h-12 w-12 text-blue-600 dark:text-blue-300" />
            }
          </div>
          <CardTitle className="text-2xl">Start Your Shift</CardTitle>
        </CardHeader>

        <CardContent className="space-y-5 overflow-y-auto flex-1">
          {/* Shift Info */}
          <div className="text-center space-y-1">
            <p className="text-muted-foreground">You are about to start a</p>
            <p className={`text-xl font-bold ${isDay ? 'text-yellow-600' : 'text-blue-600'}`}>
              {isDay ? 'Day Shift' : 'Night Shift'}
            </p>
            <p className="text-sm text-muted-foreground">
              {isDay ? '(7:00 AM – 7:00 PM)' : '(7:00 PM – 7:00 AM)'}
            </p>
          </div>

          <div className="bg-muted rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground">Current Time</p>
            <p className="text-2xl font-mono font-bold">{currentTime}</p>
          </div>

          {/* Chef Assignment */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <ChefHatIcon className="h-4 w-4 text-orange-500" />
              <span className="text-sm font-semibold">Assign Chefs On Duty</span>
              {selectedIds.size > 0 && (
                <span className="ml-auto text-xs text-muted-foreground">
                  {selectedIds.size} selected
                </span>
              )}
            </div>

            {chefsLoading ? (
              <div className="flex justify-center py-4">
                <Loader2Icon className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : chefs.length === 0 ? (
              <p className="text-xs text-center text-muted-foreground py-3">
                No chefs found for this branch
              </p>
            ) : (
              <div className="space-y-2">
                {chefs.map(chef => {
                  const isBusy = !!chef.busyAtBranch;
                  const isSelected = selectedIds.has(chef.id);
                  return (
                    <button
                      key={chef.id}
                      onClick={() => !isBusy && toggleChef(chef.id)}
                      disabled={isBusy}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-left transition-colors
                        ${isBusy
                          ? 'opacity-40 cursor-not-allowed bg-muted'
                          : isSelected
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:bg-muted/50'
                        }`}
                    >
                      <div>
                        <p className="text-sm font-medium">{chef.full_name}</p>
                        {isBusy && (
                          <p className="text-xs text-muted-foreground">Busy at {chef.busyAtBranch}</p>
                        )}
                      </div>
                      {isSelected && !isBusy && (
                        <CheckIcon className="h-4 w-4 text-primary shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          <Button
            onClick={handleStartShift}
            disabled={loading || (chefs.length > 0 && selectedIds.size === 0)}
            className="w-full gap-2"
            size="lg"
          >
            {loading
              ? <><Loader2Icon className="h-5 w-5 animate-spin" />Starting...</>
              : <><PlayIcon className="h-5 w-5" />Start Shift</>
            }
          </Button>

          {chefs.length > 0 && selectedIds.size === 0 && !chefsLoading && (
            <p className="text-xs text-center text-red-500">
              Please select at least one chef to start the shift
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
