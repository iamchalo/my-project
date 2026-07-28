'use client';

import { useState, useEffect, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth/auth-context';
import { useClerkSupabaseClient } from '@/lib/supabase/client';
import {
  PlusIcon, UsersIcon, Loader2Icon, XIcon, PencilIcon,
  MonitorIcon, ChefHatIcon,
  Trash2Icon, AlertTriangleIcon,
} from 'lucide-react';
import { createEmployee } from '@/lib/actions/create-employee';
import { PasswordToggleButton } from '@/components/ui/password-toggle-button';

interface StaffRecord {
  id: string;
  full_name: string;
  employee_id_number: string | null;
  kra_pin: string | null;
  phone: string | null;
  email: string | null;
  job_title: string;
  date_of_reporting: string | null;
  branch_id: string;
  branch_name: string;
  next_of_kin_name: string | null;
  next_of_kin_phone: string | null;
  has_pos_account: boolean;
  pos_profile_id: string | null;
  pos_role: string | null;
  pos_clerk_id: string | null;
  is_active: boolean;
  created_at: string;
}

interface Branch {
  id: string;
  name: string;
}

const emptyForm = {
  full_name: '',
  employee_id_number: '',
  kra_pin: '',
  phone: '',
  email: '',
  job_title: '',
  date_of_reporting: '',
  branch_id: '',
  next_of_kin_name: '',
  next_of_kin_phone: '',
  has_pos_account: false,
  pos_role: 'cashier' as 'cashier' | 'manager' | 'admin' | 'superadmin',
  password: '',
  is_active: true,
};

const inputCls = 'w-full px-3 py-2 border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50';
const labelCls = 'text-xs font-medium text-muted-foreground mb-1 block';

export default function SuperadminEmployeesPage() {
  const { profile, loading: authLoading } = useAuth();
  const supabase = useClerkSupabaseClient();

  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<StaffRecord[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  const [selectedBranch, setSelectedBranch] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<StaffRecord | null>(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({ ...emptyForm });
  const [additionalBranchIds, setAdditionalBranchIds] = useState<Set<string>>(new Set());
  const [showPassword, setShowPassword] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Delete state
  const [showDeleteSection, setShowDeleteSection] = useState(false);
  const [deleteNameInput, setDeleteNameInput] = useState('');
  const [deleting, setDeleting] = useState(false);

  const showNotif = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const set = (field: string, value: any) => setFormData(prev => ({ ...prev, [field]: value }));

  const renderAdditionalBranches = () => (
    <div className="mt-3 col-span-2">
      <label className={labelCls}>Additional Branches (optional)</label>
      <p className="text-xs text-muted-foreground mb-2">
        {formData.job_title === 'Chef'
          ? 'This chef will be available for shift assignment at these branches too.'
          : 'This cashier will pick their working branch at login when more than one is assigned.'}
      </p>
      <div className="border rounded-lg p-2 space-y-1 max-h-40 overflow-y-auto">
        {branches.filter(b => b.id !== formData.branch_id).map(b => (
          <label key={b.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer">
            <input
              type="checkbox"
              checked={additionalBranchIds.has(b.id)}
              onChange={() => toggleAdditionalBranch(b.id)}
              className="h-4 w-4 rounded"
            />
            <span className="text-sm">{b.name}</span>
          </label>
        ))}
      </div>
    </div>
  );

  useEffect(() => {
    if (authLoading) return;
    const fetchBranches = async () => {
      const { data } = await supabase.from('branches').select('id, name').eq('is_active', true).order('name');
      setBranches(data || []);
    };
    fetchBranches();
  }, [authLoading]);

  const fetchStaff = useCallback(async () => {
    if (authLoading) return;
    setLoading(true);
    try {
      let query = supabase
        .from('employees')
        .select('*, branches!branch_id(name), profiles!pos_profile_id(role, clerk_id)')
        .order('created_at', { ascending: false });

      if (selectedBranch !== 'all') query = query.eq('branch_id', selectedBranch);
      if (selectedType === 'pos') query = query.eq('has_pos_account', true);
      if (selectedType === 'non-pos') query = query.eq('has_pos_account', false);
      if (selectedStatus !== 'all') query = query.eq('is_active', selectedStatus === 'active');

      const { data, error } = await query;
      if (error) throw error;

      const mapped: StaffRecord[] = (data || []).map((r: any) => ({
        ...r,
        branch_name: r.branches?.name || 'Unknown',
        pos_role: r.profiles?.role || null,
        pos_clerk_id: r.profiles?.clerk_id || null,
      }));
      setStaff(mapped);
    } catch (err) {
      console.error(err);
      showNotif('error', 'Failed to load staff records');
    } finally {
      setLoading(false);
    }
  }, [authLoading, selectedBranch, selectedType, selectedStatus]);

  useEffect(() => { fetchStaff(); }, [fetchStaff]);

  const resetForm = () => {
    setFormData({ ...emptyForm });
    setAdditionalBranchIds(new Set());
    setShowPassword(false);
  };

  const toggleAdditionalBranch = (id: string) =>
    setAdditionalBranchIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const openEdit = async (record: StaffRecord) => {
    setEditingRecord(record);
    setFormData({
      full_name: record.full_name,
      employee_id_number: record.employee_id_number || '',
      kra_pin: record.kra_pin || '',
      phone: record.phone || '',
      email: record.email || '',
      job_title: record.job_title,
      date_of_reporting: record.date_of_reporting || '',
      branch_id: record.branch_id,
      next_of_kin_name: record.next_of_kin_name || '',
      next_of_kin_phone: record.next_of_kin_phone || '',
      has_pos_account: record.has_pos_account,
      pos_role: (record.pos_role as typeof emptyForm['pos_role']) || 'cashier',
      password: '',
      is_active: record.is_active,
    });

    if (record.has_pos_account && record.pos_profile_id) {
      const { data } = await supabase
        .from('cashier_branches')
        .select('branch_id')
        .eq('profile_id', record.pos_profile_id);
      setAdditionalBranchIds(new Set((data || []).map(r => r.branch_id)));
    } else if (record.job_title === 'Chef') {
      const { data } = await supabase
        .from('employee_branches')
        .select('branch_id')
        .eq('employee_id', record.id);
      setAdditionalBranchIds(new Set((data || []).map(r => r.branch_id)));
    } else {
      setAdditionalBranchIds(new Set());
    }

    setShowDeleteSection(false);
    setDeleteNameInput('');
    setShowEditModal(true);
  };

  const handleCreate = async () => {
    const isSuperAdmin = formData.job_title === 'Super Admin' || formData.job_title === 'Admin';
    if (!formData.full_name.trim() || !formData.job_title.trim() || (!isSuperAdmin && !formData.branch_id)) {
      showNotif('error', isSuperAdmin ? 'Full name and job title are required' : 'Full name, job title, and branch are required');
      return;
    }
    if (formData.has_pos_account) {
      if (!formData.email.trim()) { showNotif('error', 'Email is required for POS accounts'); return; }
      if (formData.password.length < 6) { showNotif('error', 'Password must be at least 6 characters'); return; }
    }

    setSaving(true);
    try {
      let posProfileId: string | null = null;

      if (formData.has_pos_account) {
        const result = await createEmployee({
          email: formData.email.trim(),
          password: formData.password,
          full_name: formData.full_name.trim(),
          role: formData.pos_role,
          branch_id: formData.branch_id,
          phone: formData.phone.trim() || undefined,
        });
        if (!result.success) {
          showNotif('error', result.error || 'Failed to create POS account');
          return;
        }
        posProfileId = result.userId || null;
        const newProfileId = posProfileId;

        if (newProfileId && formData.pos_role === 'cashier' && additionalBranchIds.size > 0) {
          await supabase.from('cashier_branches').insert(
            Array.from(additionalBranchIds)
              .filter(id => id !== formData.branch_id)
              .map(branchId => ({ profile_id: newProfileId, branch_id: branchId }))
          );
        }
      }

      const { data: newEmployee, error } = await supabase.from('employees').insert({
        full_name: formData.full_name.trim(),
        employee_id_number: formData.employee_id_number.trim() || null,
        kra_pin: formData.kra_pin.trim() || null,
        phone: formData.phone.trim() || null,
        email: formData.email.trim() || null,
        job_title: formData.job_title.trim(),
        date_of_reporting: formData.date_of_reporting || null,
        branch_id: formData.branch_id || null,
        next_of_kin_name: formData.next_of_kin_name.trim() || null,
        next_of_kin_phone: formData.next_of_kin_phone.trim() || null,
        has_pos_account: formData.has_pos_account,
        pos_profile_id: posProfileId,
        is_active: true,
      }).select('id').single();

      if (error) throw error;

      if (formData.job_title === 'Chef' && newEmployee?.id && additionalBranchIds.size > 0) {
        await supabase.from('employee_branches').insert(
          Array.from(additionalBranchIds)
            .filter(id => id !== formData.branch_id)
            .map(branchId => ({ employee_id: newEmployee.id, branch_id: branchId }))
        );
      }

      showNotif('success', 'Staff record created successfully');
      setShowAddModal(false);
      resetForm();
      fetchStaff();
    } catch (err: any) {
      console.error(err);
      showNotif('error', err.message || 'Failed to create record');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    const isSuperAdmin = formData.job_title === 'Super Admin' || formData.job_title === 'Admin';
    if (!editingRecord || !formData.full_name.trim() || !formData.job_title.trim() || (!isSuperAdmin && !formData.branch_id)) {
      showNotif('error', isSuperAdmin ? 'Full name and job title are required' : 'Full name, job title, and branch are required');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('employees').update({
        full_name: formData.full_name.trim(),
        employee_id_number: formData.employee_id_number.trim() || null,
        kra_pin: formData.kra_pin.trim() || null,
        phone: formData.phone.trim() || null,
        email: formData.email.trim() || null,
        job_title: formData.job_title.trim(),
        date_of_reporting: formData.date_of_reporting || null,
        branch_id: formData.branch_id || null,
        next_of_kin_name: formData.next_of_kin_name.trim() || null,
        next_of_kin_phone: formData.next_of_kin_phone.trim() || null,
        is_active: formData.is_active,
      }).eq('id', editingRecord.id);

      if (error) throw error;

      // Sync additional branch assignments for chefs (employee_branches)
      await supabase.from('employee_branches').delete().eq('employee_id', editingRecord.id);
      if (formData.job_title === 'Chef' && additionalBranchIds.size > 0) {
        await supabase.from('employee_branches').insert(
          Array.from(additionalBranchIds)
            .filter(id => id !== formData.branch_id)
            .map(branchId => ({ employee_id: editingRecord.id, branch_id: branchId }))
        );
      }

      // Sync POS profile if applicable
      if (editingRecord.has_pos_account && editingRecord.pos_profile_id) {
        const posProfileId = editingRecord.pos_profile_id;
        await supabase.from('profiles').update({
          full_name: formData.full_name.trim(),
          phone: formData.phone.trim() || null,
          role: formData.pos_role,
          branch_id: formData.branch_id,
          is_active: formData.is_active,
        }).eq('id', posProfileId);

        // Sync additional branch assignments (cashier_branches)
        await supabase.from('cashier_branches').delete().eq('profile_id', posProfileId);
        if (formData.pos_role === 'cashier' && additionalBranchIds.size > 0) {
          await supabase.from('cashier_branches').insert(
            Array.from(additionalBranchIds)
              .filter(id => id !== formData.branch_id)
              .map(branchId => ({ profile_id: posProfileId, branch_id: branchId }))
          );
        }
      }

      showNotif('success', 'Record updated successfully');
      setShowEditModal(false);
      setEditingRecord(null);
      fetchStaff();
    } catch (err: any) {
      console.error(err);
      showNotif('error', 'Failed to update record');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (record: StaffRecord) => {
    try {
      const newStatus = !record.is_active;
      const { error } = await supabase.from('employees').update({ is_active: newStatus }).eq('id', record.id);
      if (error) throw error;
      if (record.has_pos_account && record.pos_profile_id) {
        await supabase.from('profiles').update({ is_active: newStatus }).eq('id', record.pos_profile_id);
      }
      showNotif('success', `Staff member ${newStatus ? 'activated' : 'deactivated'}`);
      fetchStaff();
    } catch {
      showNotif('error', 'Failed to update status');
    }
  };

  // Permanent delete — superadmin only
  const handleDelete = async () => {
    if (!editingRecord) return;
    setDeleting(true);
    try {
      // If the employee has a POS account, delete from auth + profiles via API
      if (editingRecord.has_pos_account && editingRecord.pos_clerk_id) {
        const res = await fetch('/api/superadmin/delete-user', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: editingRecord.pos_clerk_id }),
        });
        const data = await res.json();
        if (!res.ok) { showNotif('error', data.error || 'Failed to delete POS account'); return; }
      }

      // Delete the employee record
      const { error } = await supabase.from('employees').delete().eq('id', editingRecord.id);
      if (error) throw error;

      showNotif('success', `${editingRecord.full_name} has been permanently deleted`);
      setShowEditModal(false);
      setEditingRecord(null);
      setDeleteNameInput('');
      setShowDeleteSection(false);
      fetchStaff();
    } catch (err: any) {
      showNotif('error', 'Failed to delete staff record');
    } finally {
      setDeleting(false);
    }
  };

  const totalStaff  = staff.length;
  const activeStaff = staff.filter(s => s.is_active).length;
  const posCount    = staff.filter(s => s.has_pos_account).length;
  const nonPosCount = staff.filter(s => !s.has_pos_account).length;

  // ── Shared form fields ──────────────────────────────────────────────────────
  const renderFormFields = (isEdit: boolean) => (
    <div className="space-y-5">
      {/* Basic Info */}
      <div>
        <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Basic Information</h3>
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className={labelCls}>Full Name *</label>
            <input type="text" value={formData.full_name} onChange={e => set('full_name', e.target.value)}
              placeholder="e.g., John Doe" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Job Title *</label>
              <select value={formData.job_title} onChange={e => set('job_title', e.target.value)} className={inputCls}>
                <option value="">Select title</option>
                <option value="Cashier">Cashier</option>
                <option value="Manager">Manager</option>
                <option value="Chef">Chef</option>
                <option value="Admin">Admin</option>
                <option value="Super Admin">Super Admin</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Branch {formData.job_title !== 'Super Admin' && formData.job_title !== 'Admin' && '*'}</label>
              <select value={formData.branch_id} onChange={e => set('branch_id', e.target.value)} className={inputCls}
                disabled={formData.job_title === 'Super Admin' || formData.job_title === 'Admin'}>
                <option value="">{(formData.job_title === 'Super Admin' || formData.job_title === 'Admin') ? 'N/A' : 'Select Branch'}</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>
          {formData.job_title === 'Chef' && formData.branch_id && renderAdditionalBranches()}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Date of Reporting</label>
              <input type="date" value={formData.date_of_reporting} onChange={e => set('date_of_reporting', e.target.value)}
                className={inputCls} />
            </div>
            {isEdit && (
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={formData.is_active} onChange={e => set('is_active', e.target.checked)}
                    className="h-4 w-4 rounded" />
                  <span className="text-sm font-medium">Active</span>
                </label>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Identity */}
      <div>
        <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Identity Documents</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>ID Number</label>
            <input type="text" value={formData.employee_id_number} onChange={e => set('employee_id_number', e.target.value)}
              placeholder="National ID" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>KRA PIN</label>
            <input type="text" value={formData.kra_pin} onChange={e => set('kra_pin', e.target.value)}
              placeholder="e.g., A012345678B" className={inputCls} />
          </div>
        </div>
      </div>

      {/* Contact */}
      <div>
        <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Contact Details</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Phone</label>
            <input type="tel" value={formData.phone} onChange={e => set('phone', e.target.value)}
              placeholder="e.g., 0712345678" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Email{formData.has_pos_account && !isEdit ? ' *' : ''}</label>
            <input type="email" value={formData.email} onChange={e => set('email', e.target.value)}
              placeholder="e.g., john@company.com"
              className={isEdit && editingRecord?.has_pos_account ? `${inputCls} bg-muted cursor-not-allowed` : inputCls}
              readOnly={isEdit && editingRecord?.has_pos_account} />
            {isEdit && editingRecord?.has_pos_account && (
              <p className="text-xs text-muted-foreground mt-1">Email cannot be changed for POS accounts</p>
            )}
          </div>
        </div>
      </div>

      {/* Next of Kin */}
      <div>
        <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Next of Kin</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Name</label>
            <input type="text" value={formData.next_of_kin_name} onChange={e => set('next_of_kin_name', e.target.value)}
              placeholder="Full name" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Phone</label>
            <input type="tel" value={formData.next_of_kin_phone} onChange={e => set('next_of_kin_phone', e.target.value)}
              placeholder="e.g., 0723456789" className={inputCls} />
          </div>
        </div>
      </div>

      {/* POS Account — create only */}
      {!isEdit && (
        <div>
          <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">POS Account</h3>
          <label className="flex items-center gap-2 cursor-pointer mb-3">
            <input type="checkbox" checked={formData.has_pos_account} onChange={e => set('has_pos_account', e.target.checked)}
              className="h-4 w-4 rounded" />
            <span className="text-sm font-medium">This staff member has a POS system account</span>
          </label>
          {formData.has_pos_account && (
            <div className="grid grid-cols-2 gap-3 mt-2 p-3 border rounded-lg bg-muted/30">
              <div>
                <label className={labelCls}>POS Role *</label>
                <select value={formData.pos_role} onChange={e => set('pos_role', e.target.value)} className={inputCls}>
                  <option value="cashier">Cashier</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                  <option value="superadmin">Superadmin</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Password *</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={e => set('password', e.target.value)}
                    placeholder="Min 6 characters"
                    className={`${inputCls} pr-9`}
                  />
                  <PasswordToggleButton
                    visible={showPassword}
                    onToggle={() => setShowPassword(p => !p)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  />
                </div>
              </div>
              {formData.pos_role === 'cashier' && renderAdditionalBranches()}
            </div>
          )}
        </div>
      )}

      {/* POS Account edit — role only */}
      {isEdit && editingRecord?.has_pos_account && (
        <div>
          <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">POS Account</h3>
          <div className="p-3 border rounded-lg bg-muted/30">
            <div className="w-1/2">
              <label className={labelCls}>POS Role</label>
              <select value={formData.pos_role} onChange={e => set('pos_role', e.target.value)} className={inputCls}>
                <option value="cashier">Cashier</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
                <option value="superadmin">Superadmin</option>
              </select>
            </div>
            {formData.pos_role === 'cashier' && renderAdditionalBranches()}
          </div>
        </div>
      )}
    </div>
  );

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout userName={profile?.full_name || 'Superadmin'} userRole="superadmin">
      <div className="p-8">
        <div className="max-w-7xl mx-auto space-y-8">

          {/* Notification */}
          {notification && (
            <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 rounded-lg shadow-lg text-white ${
              notification.type === 'success' ? 'bg-green-500' : 'bg-red-500'
            }`}>
              {notification.message}
            </div>
          )}

          {/* Header */}
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold">Employee Management</h1>
            </div>
            <Button onClick={() => { resetForm(); setShowAddModal(true); }}>
              <PlusIcon className="h-4 w-4 mr-2" />
              Add Staff
            </Button>
          </div>

          {/* Stats */}
          <div className="grid gap-4 md:grid-cols-4">
            {[
              { label: 'Total Staff',   value: totalStaff,  icon: UsersIcon,   color: 'bg-primary/10 text-primary' },
              { label: 'Active',        value: activeStaff, icon: UsersIcon,   color: 'bg-green-100 text-green-600 dark:bg-green-900/20' },
              { label: 'POS Accounts',  value: posCount,    icon: MonitorIcon, color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/20' },
              { label: 'Non-POS Staff', value: nonPosCount, icon: ChefHatIcon, color: 'bg-orange-100 text-orange-600 dark:bg-orange-900/20' },
            ].map(({ label, value, icon: Icon, color }) => (
              <Card key={label}>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-lg ${color}`}><Icon className="h-6 w-6" /></div>
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
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Branch</label>
              <select value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)}
                className="px-3 py-2 border rounded-lg bg-background text-sm">
                <option value="all">All Branches</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Type</label>
              <select value={selectedType} onChange={e => setSelectedType(e.target.value)}
                className="px-3 py-2 border rounded-lg bg-background text-sm">
                <option value="all">All Staff</option>
                <option value="pos">POS Accounts</option>
                <option value="non-pos">Non-POS Only</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
              <select value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)}
                className="px-3 py-2 border rounded-lg bg-background text-sm">
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-4 py-3 font-medium">Name / Title</th>
                    <th className="text-left px-4 py-3 font-medium">Branch</th>
                    <th className="text-left px-4 py-3 font-medium">Type</th>
                    <th className="text-left px-4 py-3 font-medium">Phone</th>
                    <th className="text-left px-4 py-3 font-medium">Reporting Date</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-left px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="text-center py-16">
                        <Loader2Icon className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                      </td>
                    </tr>
                  ) : staff.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-16 text-muted-foreground">No staff records found</td>
                    </tr>
                  ) : staff.map(record => (
                    <tr key={record.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium">{record.full_name}</div>
                        <div className="text-xs text-muted-foreground">{record.job_title}</div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{record.branch_name}</td>
                      <td className="px-4 py-3">
                        {record.has_pos_account ? (
                          <Badge variant="default" className="text-xs capitalize">
                            POS · {record.pos_role || 'Staff'}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">Non-POS</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{record.phone || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {record.date_of_reporting
                          ? new Date(record.date_of_reporting).toLocaleDateString('en-KE', { timeZone: 'Africa/Nairobi' })
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={record.is_active ? 'default' : 'destructive'}>
                          {record.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => openEdit(record)}>
                            <PencilIcon className="h-3 w-3 mr-1" />Edit
                          </Button>
                          <Button size="sm" variant={record.is_active ? 'destructive' : 'default'}
                            onClick={() => handleToggleStatus(record)}>
                            {record.is_active ? 'Deactivate' : 'Activate'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>

      {/* ── Add Staff Modal ── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-xl font-bold">Add New Staff Member</h2>
              <button onClick={() => setShowAddModal(false)} className="text-muted-foreground hover:text-foreground">
                <XIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-6 flex-1">{renderFormFields(false)}</div>
            <div className="flex gap-3 p-6 border-t">
              <Button variant="outline" onClick={() => setShowAddModal(false)} className="flex-1">Cancel</Button>
              <Button onClick={handleCreate} className="flex-1" disabled={saving}>
                {saving ? <><Loader2Icon className="h-4 w-4 animate-spin mr-2" />Creating...</> : 'Create Record'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Staff Modal ── */}
      {showEditModal && editingRecord && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl">
            <div className="flex justify-between items-center p-6 border-b">
              <div>
                <h2 className="text-xl font-bold">Edit Staff Record</h2>
                <p className="text-sm text-muted-foreground">{editingRecord.full_name}</p>
              </div>
              <button onClick={() => setShowEditModal(false)} className="text-muted-foreground hover:text-foreground">
                <XIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-6 flex-1">
              {renderFormFields(true)}
            </div>

            {/* ── Danger Zone (shown when delete is triggered) ── */}
            {showDeleteSection && (
              <div className="px-6 pb-4">
                <div className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangleIcon className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-destructive">Danger Zone</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        This action permanently deletes the staff record and cannot be undone.
                        {editingRecord.has_pos_account && ' The associated POS login account will also be removed.'}
                      </p>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium block mb-1">
                      Type <span className="font-bold">{editingRecord.full_name}</span> to confirm
                    </label>
                    <input
                      type="text"
                      value={deleteNameInput}
                      onChange={e => setDeleteNameInput(e.target.value)}
                      placeholder="Enter exact name to confirm"
                      className="w-full px-3 py-2 text-sm border border-destructive/40 rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-destructive"
                      disabled={deleting}
                      autoFocus
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" disabled={deleting}
                      onClick={() => { setShowDeleteSection(false); setDeleteNameInput(''); }}>
                      Cancel
                    </Button>
                    <Button variant="destructive" size="sm" className="flex-1 gap-2"
                      disabled={deleteNameInput !== editingRecord.full_name || deleting}
                      onClick={handleDelete}>
                      {deleting
                        ? <><Loader2Icon className="h-4 w-4 animate-spin" />Deleting…</>
                        : <><Trash2Icon className="h-4 w-4" />Delete Permanently</>}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Modal footer ── */}
            <div className="flex gap-3 p-6 border-t">
              <Button variant="outline" onClick={() => setShowEditModal(false)} className="flex-1">Cancel</Button>
              {!showDeleteSection && (
                <Button variant="ghost" className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setShowDeleteSection(true)} disabled={saving}>
                  <Trash2Icon className="h-4 w-4" />
                  Delete
                </Button>
              )}
              <Button onClick={handleUpdate} className="flex-1" disabled={saving}>
                {saving ? <><Loader2Icon className="h-4 w-4 animate-spin mr-2" />Saving...</> : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
