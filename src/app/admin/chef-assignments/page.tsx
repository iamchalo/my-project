'use client';

import { useState, useEffect, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth/auth-context';
import { useClerkSupabaseClient } from '@/lib/supabase/client';
import { ChefHatIcon, Loader2Icon, SunIcon, MoonIcon } from 'lucide-react';

interface Assignment {
  id: string;
  chef_name: string;
  branch_name: string;
  shift_type: 'day' | 'night';
  shift_date: string;
  shift_active: boolean;
  assigned_by_name: string;
  created_at: string;
}

interface Branch {
  id: string;
  name: string;
}

function getKenyaDateString() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
}

export default function AdminChefAssignmentsPage() {
  const { profile } = useAuth();
  const supabase = useClerkSupabaseClient();

  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  const [selectedDate, setSelectedDate] = useState(getKenyaDateString());
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [selectedShift, setSelectedShift] = useState('all');

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('branches').select('id, name').eq('is_active', true).order('name');
      setBranches(data || []);
    };
    fetch();
  }, []);

  const fetchAssignments = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('shift_chef_assignments')
        .select(`
          id,
          created_at,
          employees!employee_id(full_name),
          branches!branch_id(name),
          profiles!assigned_by(full_name),
          shifts!shift_id(shift_type, shift_date, is_active)
        `)
        .order('created_at', { ascending: false });

      if (selectedBranch !== 'all') query = query.eq('branch_id', selectedBranch);

      const { data, error } = await query;
      if (error) throw error;

      let mapped: Assignment[] = (data || []).map((r: any) => ({
        id: r.id,
        chef_name: r.employees?.full_name || 'Unknown',
        branch_name: r.branches?.name || 'Unknown',
        shift_type: r.shifts?.shift_type || 'day',
        shift_date: r.shifts?.shift_date || '',
        shift_active: r.shifts?.is_active ?? false,
        assigned_by_name: r.profiles?.full_name || 'Unknown',
        created_at: r.created_at,
      }));

      // Date filter (client-side since shift_date is nested)
      if (selectedDate) {
        mapped = mapped.filter(a => a.shift_date === selectedDate);
      }
      if (selectedShift !== 'all') {
        mapped = mapped.filter(a => a.shift_type === selectedShift);
      }

      setAssignments(mapped);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedBranch, selectedDate, selectedShift]);

  useEffect(() => { fetchAssignments(); }, [fetchAssignments]);

  const userRole = (profile?.role === 'superadmin' ? 'superadmin' : 'admin') as 'admin' | 'superadmin';

  const totalToday = assignments.length;
  const activeNow = assignments.filter(a => a.shift_active).length;
  const uniqueChefs = new Set(assignments.map(a => a.chef_name)).size;

  return (
    <DashboardLayout userName={profile?.full_name || 'Admin'} userRole={userRole}>
      <div className="p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* Header */}
          <div>
            <h1 className="text-4xl font-bold">Chef Assignments</h1>
            <p className="text-muted-foreground">Track which chefs are on duty per branch and shift</p>
          </div>

          {/* Stats */}
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { label: 'Assignments', value: totalToday, color: 'bg-primary/10 text-primary' },
              { label: 'Currently On Duty', value: activeNow, color: 'bg-green-100 text-green-600 dark:bg-green-900/20' },
              { label: 'Unique Chefs', value: uniqueChefs, color: 'bg-orange-100 text-orange-600 dark:bg-orange-900/20' },
            ].map(({ label, value, color }) => (
              <Card key={label}>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-lg ${color}`}>
                      <ChefHatIcon className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{value}</p>
                      <p className="text-sm text-muted-foreground">{label}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Date</label>
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="px-3 py-2 border rounded-lg bg-background text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Branch</label>
              <select value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)}
                className="px-3 py-2 border rounded-lg bg-background text-sm">
                <option value="all">All Branches</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Shift</label>
              <select value={selectedShift} onChange={e => setSelectedShift(e.target.value)}
                className="px-3 py-2 border rounded-lg bg-background text-sm">
                <option value="all">All Shifts</option>
                <option value="day">Day</option>
                <option value="night">Night</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Assignment Records</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-4 py-3 font-medium">Chef</th>
                    <th className="text-left px-4 py-3 font-medium">Branch</th>
                    <th className="text-left px-4 py-3 font-medium">Shift</th>
                    <th className="text-left px-4 py-3 font-medium">Date</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-left px-4 py-3 font-medium">Assigned By</th>
                    <th className="text-left px-4 py-3 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="text-center py-16">
                        <Loader2Icon className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                      </td>
                    </tr>
                  ) : assignments.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-16 text-muted-foreground">
                        No chef assignments found for the selected filters
                      </td>
                    </tr>
                  ) : assignments.map(a => (
                    <tr key={a.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <ChefHatIcon className="h-4 w-4 text-orange-500 shrink-0" />
                          <span className="font-medium">{a.chef_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{a.branch_name}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {a.shift_type === 'day'
                            ? <SunIcon className="h-4 w-4 text-yellow-500" />
                            : <MoonIcon className="h-4 w-4 text-blue-500" />
                          }
                          <span className="capitalize">{a.shift_type}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {a.shift_date
                          ? new Date(a.shift_date).toLocaleDateString('en-KE', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', year: 'numeric' })
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={a.shift_active ? 'default' : 'secondary'}>
                          {a.shift_active ? 'Active' : 'Ended'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{a.assigned_by_name}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {new Date(a.created_at).toLocaleTimeString('en-KE', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
