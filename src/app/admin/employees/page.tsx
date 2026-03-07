'use client';

import { useState, useEffect, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  PlusIcon, UsersIcon, Loader2Icon, XIcon, PencilIcon,
  EyeIcon, EyeOffIcon, MonitorIcon, ChefHatIcon,
} from 'lucide-react';
import { createEmployee } from '@/lib/actions/create-employee';

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
  pos_role: 'cashier' as 'cashier' | 'manager',
  password: '',
  is_active: true,
};

const inputCls = 'w-full px-3 py-2 border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50';
const labelCls = 'text-xs font-medium text-muted-foreground mb-1 block';

export default function AdminEmployeesPage() {
  const { profile, loading: authLoading } = useAuth();
  const supabase = createClient();

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
  const [showPassword, setShowPassword] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showNotif = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const set = (field: string, value: any) => setFormData(prev => ({ ...prev, [field]: value }));

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
        .select('*, branches!branch_id(name), profiles!pos_profile_id(role)')
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
    setShowPassword(false);
  };

  const openEdit = (record: StaffRecord) => {
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
      pos_role: (record.pos_role as 'cashier' | 'manager') || 'cashier',
      password: '',
      is_active: record.is_active,
    });
    setShowEditModal(true);
  };

  const handleCreate = async () => {
    if (!formData.full_name.trim() || !formData.job_title.trim() || !formData.branch_id) {
      showNotif('error', 'Full name, job title, and branch are required');
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
      }

      const { error } = await supabase.from('employees').insert({
        full_name: formData.full_name.trim(),
        employee_id_number: formData.employee_id_number.trim() || null,
        kra_pin: formData.kra_pin.trim() || null,
        phone: formData.phone.trim() || null,
        email: formData.email.trim() || null,
        job_title: formData.job_title.trim(),
        date_of_reporting: formData.date_of_reporting || null,
        branch_id: formData.branch_id,
        next_of_kin_name: formData.next_of_kin_name.trim() || null,
        next_of_kin_phone: formData.next_of_kin_phone.trim() || null,
        has_pos_account: formData.has_pos_account,
        pos_profile_id: posProfileId,
        is_active: true,
      });

      if (error) throw error;

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
    if (!editingRecord || !formData.full_name.trim() || !formData.job_title.trim() || !formData.branch_id) {
      showNotif('error', 'Full name, job title, and branch are required');
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
        branch_id: formData.branch_id,
        next_of_kin_name: formData.next_of_kin_name.trim() || null,
        next_of_kin_phone: formData.next_of_kin_phone.trim() || null,
        is_active: formData.is_active,
      }).eq('id', editingRecord.id);

      if (error) throw error;

      // Sync POS profile if applicable
      if (editingRecord.has_pos_account && editingRecord.pos_profile_id) {
        await supabase.from('profiles').update({
          full_name: formData.full_name.trim(),
          phone: formData.phone.trim() || null,
          role: formData.pos_role,
          branch_id: formData.branch_id,
          is_active: formData.is_active,
        }).eq('id', editingRecord.pos_profile_id);
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

  const totalStaff = staff.length;
  const activeStaff = staff.filter(s => s.is_active).length;
  const posCount = staff.filter(s => s.has_pos_account).length;
  const nonPosCount = staff.filter(s => !s.has_pos_account).length;

  const userRole = (profile?.role === 'superadmin' ? 'superadmin' : 'admin') as 'admin' | 'superadmin';

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
                <option value="Cashier">Cashier</option>
                <option value="Manager">Manager</option>
                <option value="Chef">Chef</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Branch *</label>
              <select value={formData.branch_id} onChange={e => set('branch_id', e.target.value)} className={inputCls}>
                <option value="">Select Branch</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>
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

      {/* POS Account */}
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
                  <button type="button" onClick={() => setShowPassword(p => !p)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* POS Account edit — only role changeable */}
      {isEdit && editingRecord?.has_pos_account && (
        <div>
          <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">POS Account</h3>
          <div className="p-3 border rounded-lg bg-muted/30">
            <div className="w-1/2">
              <label className={labelCls}>POS Role</label>
              <select value={formData.pos_role} onChange={e => set('pos_role', e.target.value)} className={inputCls}>
                <option value="cashier">Cashier</option>
                <option value="manager">Manager</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout userName={profile?.full_name || 'Admin'} userRole={userRole}>
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
              <p className="text-muted-foreground">All staff: POS accounts and non-POS personnel</p>
            </div>
            <Button onClick={() => { resetForm(); setShowAddModal(true); }}>
              <PlusIcon className="h-4 w-4 mr-2" />
              Add Staff
            </Button>
          </div>

          {/* Stats */}
          <div className="grid gap-4 md:grid-cols-4">
            {[
              { label: 'Total Staff', value: totalStaff, icon: UsersIcon, color: 'bg-primary/10 text-primary' },
              { label: 'Active', value: activeStaff, icon: UsersIcon, color: 'bg-green-100 text-green-600 dark:bg-green-900/20' },
              { label: 'POS Accounts', value: posCount, icon: MonitorIcon, color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/20' },
              { label: 'Non-POS Staff', value: nonPosCount, icon: ChefHatIcon, color: 'bg-orange-100 text-orange-600 dark:bg-orange-900/20' },
            ].map(({ label, value, icon: Icon, color }) => (
              <Card key={label}>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-lg ${color}`}>
                      <Icon className="h-6 w-6" />
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
                      <td colSpan={7} className="text-center py-16 text-muted-foreground">
                        No staff records found
                      </td>
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
                            <PencilIcon className="h-3 w-3 mr-1" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant={record.is_active ? 'destructive' : 'default'}
                            onClick={() => handleToggleStatus(record)}
                          >
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
            <div className="overflow-y-auto p-6 flex-1">
              {renderFormFields(false)}
            </div>
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
            <div className="flex gap-3 p-6 border-t">
              <Button variant="outline" onClick={() => setShowEditModal(false)} className="flex-1">Cancel</Button>
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
