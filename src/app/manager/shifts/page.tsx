'use client';

import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/dashboard/data-table';
import { StatCard } from '@/components/dashboard/stat-card';
import { ClockIcon, UsersIcon, SunIcon, MoonIcon, Loader2Icon, DollarSignIcon } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { getKenyaDateString } from '@/lib/date-utils';

interface Shift {
  id: string;
  cashier_id: string;
  cashier_name: string;
  shift_type: 'day' | 'night';
  shift_date: string;
  started_at: string;
  ended_at: string | null;
  total_sales: number;
  total_expenses: number;
  cash_handed_over: number | null;
  is_active: boolean;
  notes: string | null;
}

interface Profile {
  id: string;
  full_name: string;
  branch_id: string;
  role: string;
}

interface Cashier {
  id: string;
  full_name: string;
}

export default function ManagerShiftsPage() {
  const supabase = createClient();

  // User state
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Data state
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [cashiers, setCashiers] = useState<Cashier[]>([]);

  // Filter state
  const [startDate, setStartDate] = useState<string>(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState<string>(getKenyaDateString());
  const [selectedCashier, setSelectedCashier] = useState<string>('all');

  // Notification state
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
  };

  // Fetch user profile
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, branch_id, role')
          .eq('id', user.id)
          .single();

        if (error) throw error;
        setProfile(data);
      } catch (error) {
        console.error('Error fetching profile:', error);
        showNotification('error', 'Failed to load profile');
      }
    };

    fetchProfile();
  }, []);

  // Fetch cashiers for dropdown
  useEffect(() => {
    const fetchCashiers = async () => {
      if (!profile?.branch_id) return;

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name')
          .eq('branch_id', profile.branch_id)
          .in('role', ['cashier', 'manager'])
          .order('full_name');

        if (error) throw error;
        setCashiers(data || []);
      } catch (error) {
        console.error('Error fetching cashiers:', error);
      }
    };

    fetchCashiers();
  }, [profile?.branch_id]);

  // Fetch shifts
  const fetchShifts = async (showLoading: boolean = false) => {
    if (!profile?.branch_id) return;

    try {
      if (showLoading) setLoading(true);

      const { data, error } = await supabase
        .rpc('get_shift_history', {
          p_branch_id: profile.branch_id,
          p_start_date: startDate,
          p_end_date: endDate,
          p_limit: 100,
        });

      if (error) throw error;

      // Filter by cashier on client side if needed
      let filteredData = data || [];
      if (selectedCashier !== 'all') {
        filteredData = filteredData.filter(
          (shift: Shift) => shift.cashier_id === selectedCashier
        );
      }

      setShifts(filteredData);
    } catch (error) {
      console.error('Error fetching shifts:', error);
      showNotification('error', 'Failed to load shifts');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    if (!profile?.branch_id) return;

    fetchShifts(true);
  }, [profile?.branch_id, startDate, endDate, selectedCashier]);

  // Calculate stats
  const totalShifts = shifts.length;
  const activeShifts = shifts.filter(s => s.is_active).length;
  const totalSales = shifts.reduce((sum, s) => sum + Number(s.total_sales || 0), 0);
  const totalExpenses = shifts.reduce((sum, s) => sum + Number(s.total_expenses || 0), 0);

  const formatDateTime = (timestamp: string | null) => {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleString('en-KE', {
      timeZone: 'Africa/Nairobi',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-KE', {
      timeZone: 'Africa/Nairobi',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const shiftColumns = [
    {
      key: 'shift_date',
      label: 'Date',
      render: (value: string) => formatDate(value),
    },
    { key: 'cashier_name', label: 'Cashier' },
    {
      key: 'shift_type',
      label: 'Shift',
      render: (value: string) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium inline-flex items-center gap-1 ${
          value === 'day'
            ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
            : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
        }`}>
          {value === 'day' ? (
            <SunIcon className="h-3 w-3" />
          ) : (
            <MoonIcon className="h-3 w-3" />
          )}
          {value === 'day' ? 'Day' : 'Night'}
        </span>
      ),
    },
    {
      key: 'started_at',
      label: 'Started',
      render: (value: string) => formatDateTime(value),
    },
    {
      key: 'ended_at',
      label: 'Ended',
      render: (value: string | null, row: Shift) => (
        row.is_active ? (
          <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
            Active
          </span>
        ) : (
          formatDateTime(value)
        )
      ),
    },
    {
      key: 'total_sales',
      label: 'Sales',
      render: (value: number) => `Ksh ${Number(value || 0).toFixed(2)}`,
    },
    {
      key: 'total_expenses',
      label: 'Expenses',
      render: (value: number) => `Ksh ${Number(value || 0).toFixed(2)}`,
    },
    {
      key: 'cash_handed_over',
      label: 'Cash Handed',
      render: (value: number | null) => value ? `Ksh ${Number(value).toFixed(2)}` : '-',
    },
  ];

  if (loading && !profile) {
    return (
      <DashboardLayout userName="Loading..." userRole="manager">
        <div className="flex items-center justify-center h-96">
          <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userName={profile?.full_name || 'Manager'} userRole="manager">
      <div className="p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* Notification */}
          {notification && (
            <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 rounded-lg shadow-lg ${
              notification.type === 'success'
                ? 'bg-green-500 text-white'
                : 'bg-red-500 text-white'
            }`}>
              {notification.message}
            </div>
          )}

          {/* Header */}
          <div>
            <h1 className="text-4xl font-bold">Shift History</h1>
            <p className="text-muted-foreground">
              View cashier shifts and handover records
            </p>
          </div>

          {/* Stats */}
          <div className="grid gap-4 md:grid-cols-4">
            <StatCard
              title="Total Shifts"
              value={totalShifts}
              description={`${activeShifts} currently active`}
              icon={ClockIcon}
            />
            <StatCard
              title="Cashiers"
              value={cashiers.length}
              icon={UsersIcon}
            />
            <StatCard
              title="Total Sales"
              value={`Ksh ${totalSales.toFixed(2)}`}
              icon={DollarSignIcon}
            />
            <StatCard
              title="Total Expenses"
              value={`Ksh ${totalExpenses.toFixed(2)}`}
              icon={DollarSignIcon}
            />
          </div>

          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle>Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Start Date Filter */}
                <div>
                  <label className="text-sm font-medium mb-2 block">From Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg bg-background"
                  />
                </div>

                {/* End Date Filter */}
                <div>
                  <label className="text-sm font-medium mb-2 block">To Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg bg-background"
                  />
                </div>

                {/* Cashier Filter */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Cashier</label>
                  <select
                    value={selectedCashier}
                    onChange={(e) => setSelectedCashier(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg bg-background"
                  >
                    <option value="all">All Cashiers</option>
                    {cashiers.map(cashier => (
                      <option key={cashier.id} value={cashier.id}>{cashier.full_name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Shifts Table */}
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <DataTable
              title="Shifts"
              columns={shiftColumns}
              data={shifts}
            />
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
