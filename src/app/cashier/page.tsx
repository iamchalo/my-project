'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { NavigationCard } from '@/components/dashboard/navigation-card';
import { NavigationCardSkeleton } from '@/components/dashboard/skeletons';
import { useAuth } from '@/lib/auth/auth-context';
import { useShift } from '@/lib/shift/shift-context';
import { useClerkSupabaseClient } from '@/lib/supabase/client';
import { StartShiftModal, EndShiftModal } from '@/components/shift';
import { Button } from '@/components/ui/button';
import {
  ShoppingCartIcon, ReceiptIcon, ClipboardListIcon,
  ChefHatIcon, CheckIcon, Loader2Icon, XIcon,
} from 'lucide-react';

interface Chef {
  id: string;
  full_name: string;
  busyAtBranch: string | null;
}

interface AssignedChef {
  id: string;            // assignment id
  employee_id: string;
  full_name: string;
}

export default function CashierDashboard() {
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const { hasActiveShift, activeShift, loading: shiftLoading } = useShift();
  const supabase = useClerkSupabaseClient();

  const [showStartShiftModal, setShowStartShiftModal] = useState(false);
  const [showEndShiftForLogout, setShowEndShiftForLogout] = useState(false);

  // Chef management state
  const [assignedChefs, setAssignedChefs] = useState<AssignedChef[]>([]);
  const [chefsLoading, setChefsLoading] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  const [allChefs, setAllChefs] = useState<Chef[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [modalLoading, setModalLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const formatTime = (timestamp: string) =>
    new Date(timestamp).toLocaleTimeString('en-KE', {
      timeZone: 'Africa/Nairobi',
      hour: '2-digit',
      minute: '2-digit',
    });

  const handleEndShiftAndLogout = () => setShowEndShiftForLogout(true);

  const handleShiftEndedAndLogout = async () => {
    setShowEndShiftForLogout(false);
    await signOut();
    router.push('/login');
  };

  useEffect(() => {
    if (!shiftLoading && !hasActiveShift && profile) {
      setShowStartShiftModal(true);
    }
  }, [shiftLoading, hasActiveShift, profile]);

  // Fetch assigned chefs for the active shift
  const fetchAssignedChefs = useCallback(async () => {
    if (!activeShift?.id) { setAssignedChefs([]); return; }
    setChefsLoading(true);
    try {
      const { data } = await supabase
        .from('shift_chef_assignments')
        .select('id, employee_id, employees!employee_id(full_name)')
        .eq('shift_id', activeShift.id)
        .order('created_at');

      setAssignedChefs(
        (data || []).map((r: any) => ({
          id: r.id,
          employee_id: r.employee_id,
          full_name: r.employees?.full_name || 'Unknown',
        }))
      );
    } catch (err) {
      console.error(err);
    } finally {
      setChefsLoading(false);
    }
  }, [activeShift?.id]);

  useEffect(() => { fetchAssignedChefs(); }, [fetchAssignedChefs]);

  // Open manage modal — load all branch chefs and pre-select assigned ones
  const openManageModal = async () => {
    if (!profile?.branch_id) return;
    setModalLoading(true);
    setShowManageModal(true);
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
          // Only count as busy if it's NOT the current shift
          if (row.shifts?.is_active && row.branches?.name) {
            busyMap[row.employee_id] = row.branches.name;
          }
        });
      }

      setAllChefs((chefData || []).map(c => ({
        id: c.id,
        full_name: c.full_name,
        busyAtBranch: busyMap[c.id] || null,
      })));

      // Pre-select already assigned chefs
      setSelectedIds(new Set(assignedChefs.map(a => a.employee_id)));
    } catch (err) {
      console.error(err);
    } finally {
      setModalLoading(false);
    }
  };

  const toggleChef = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSaveChefs = async () => {
    if (!activeShift?.id || !profile?.id || !profile?.branch_id) return;
    setSaving(true);
    try {
      // Remove deselected assignments
      const toRemove = assignedChefs.filter(a => !selectedIds.has(a.employee_id));
      if (toRemove.length > 0) {
        await supabase
          .from('shift_chef_assignments')
          .delete()
          .in('id', toRemove.map(a => a.id));
      }

      // Add newly selected
      const existingIds = new Set(assignedChefs.map(a => a.employee_id));
      const toAdd = Array.from(selectedIds).filter(id => !existingIds.has(id));
      if (toAdd.length > 0) {
        await supabase.from('shift_chef_assignments').insert(
          toAdd.map(empId => ({
            shift_id: activeShift.id,
            employee_id: empId,
            branch_id: profile.branch_id,
            assigned_by: profile.id,
          }))
        );
      }

      setShowManageModal(false);
      fetchAssignedChefs();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout
      userName={profile?.full_name || 'Cashier'}
      userRole="cashier"
      hasActiveShift={hasActiveShift}
      onEndShiftAndLogout={handleEndShiftAndLogout}
    >
      <div className="h-full flex flex-col">
        <StartShiftModal
          isOpen={showStartShiftModal && !hasActiveShift}
          onSuccess={() => { setShowStartShiftModal(false); fetchAssignedChefs(); }}
        />

        <EndShiftModal
          isOpen={showEndShiftForLogout}
          onClose={() => setShowEndShiftForLogout(false)}
          onShiftEnded={handleShiftEndedAndLogout}
        />

        {/* Shift Start Bar */}
        {hasActiveShift && activeShift && (
          <div className="px-8 py-3 bg-green-50 dark:bg-green-900/20 border-b">
            <p className="text-sm text-green-700 dark:text-green-400">
              <span className="font-medium capitalize">{activeShift.shift_type} shift</span> started at {formatTime(activeShift.started_at)}
            </p>
          </div>
        )}

        <div className="p-8 flex-1">
          <div className="max-w-7xl mx-auto space-y-8">
            {/* Welcome */}
            <div className="space-y-1">
              <h1 className="text-4xl font-bold">
                Welcome back, {profile?.full_name || 'Cashier'}!
              </h1>
              {hasActiveShift && (
                <p className="text-sm text-muted-foreground">
                  {chefsLoading
                    ? 'Loading chefs...'
                    : assignedChefs.length > 0
                      ? `Chefs on duty: ${assignedChefs.map(c => c.full_name).join(', ')}`
                      : 'No chefs assigned for this shift'
                  }
                </p>
              )}
            </div>

            {/* Navigation Cards */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {shiftLoading ? (
                <><NavigationCardSkeleton /><NavigationCardSkeleton /><NavigationCardSkeleton /></>
              ) : (
                <>
                  <NavigationCard title="Orders" description="Create new orders and process payments" href="/cashier/orders" icon={ShoppingCartIcon} />
                  <NavigationCard title="Expenses" description="Log daily expenses" href="/cashier/expenses" icon={ReceiptIcon} />
                  <NavigationCard title="Sales & Stock" description="End-of-shift reconciliation" href="/cashier/sales-stock" icon={ClipboardListIcon} />
                </>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* Manage Chefs Modal */}
      {showManageModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-xl w-full max-w-sm shadow-xl">
            <div className="flex justify-between items-center p-5 border-b">
              <div className="flex items-center gap-2">
                <ChefHatIcon className="h-5 w-5 text-orange-500" />
                <h2 className="font-bold text-lg">Manage Chefs</h2>
              </div>
              <button onClick={() => setShowManageModal(false)} className="text-muted-foreground hover:text-foreground">
                <XIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5">
              {modalLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : allChefs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <ChefHatIcon className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No chefs found for this branch.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {allChefs.map(chef => {
                    const isBusy = !!chef.busyAtBranch;
                    const isSelected = selectedIds.has(chef.id);
                    return (
                      <button
                        key={chef.id}
                        onClick={() => !isBusy && toggleChef(chef.id)}
                        disabled={isBusy}
                        className={`w-full flex items-center justify-between p-3 rounded-lg border text-left transition-colors
                          ${isBusy
                            ? 'opacity-40 cursor-not-allowed bg-muted'
                            : isSelected
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:bg-muted/50'
                          }`}
                      >
                        <div>
                          <p className="font-medium text-sm">{chef.full_name}</p>
                          {isBusy && <p className="text-xs text-muted-foreground">At {chef.busyAtBranch}</p>}
                        </div>
                        {isSelected && !isBusy && <CheckIcon className="h-4 w-4 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex gap-3 mt-5">
                <Button variant="outline" onClick={() => setShowManageModal(false)} className="flex-1">
                  Cancel
                </Button>
                <Button onClick={handleSaveChefs} disabled={saving} className="flex-1">
                  {saving ? <><Loader2Icon className="h-4 w-4 animate-spin mr-1" />Saving...</> : 'Save'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
