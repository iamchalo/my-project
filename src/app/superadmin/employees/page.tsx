'use client';

import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/dashboard/data-table';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth/auth-context';
import { createClient } from '@/lib/supabase/client';
import { PlusIcon, UsersIcon, Loader2Icon, XIcon, PencilIcon, EyeIcon, EyeOffIcon, Trash2Icon, AlertTriangleIcon } from 'lucide-react';
import { createEmployee } from '@/lib/actions/create-employee';

interface Employee {
  id: string;
  email: string;
  full_name: string;
  role: 'cashier' | 'manager' | 'admin' | 'superadmin';
  branch_id: string | null;
  branch_name: string;
  phone: string | null;
  is_active: boolean;
  created_at: string;
}

interface Branch {
  id: string;
  name: string;
}

export default function AdminEmployeesPage() {
  const { profile } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  // Filter state
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  // Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [saving, setSaving] = useState(false);

  // Delete state
  const [showDeleteSection, setShowDeleteSection] = useState(false);
  const [deleteNameInput, setDeleteNameInput] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    password: '',
    role: 'cashier' as 'cashier' | 'manager' | 'admin' | 'superadmin',
    branch_id: '',
    is_active: true,
  });
  const [showPassword, setShowPassword] = useState(false);

  // Notification state
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
  };

  // Fetch branches
  useEffect(() => {
    const fetchBranches = async () => {
      try {
        const { data, error } = await supabase
          .from('branches')
          .select('id, name')
          .eq('is_active', true)
          .order('name');

        if (error) throw error;
        setBranches(data || []);
      } catch (error) {
        console.error('Error fetching branches:', error);
      }
    };

    fetchBranches();
  }, []);

  // Fetch employees
  const fetchEmployees = async () => {
    try {
      setLoading(true);

      // Build query - superadmin can see all roles
      let query = supabase
        .from('profiles')
        .select('id, email, full_name, role, branch_id, phone, is_active, created_at')
        .in('role', ['cashier', 'manager', 'admin', 'superadmin'])
        .order('created_at', { ascending: false });

      // Filter by branch
      if (selectedBranch !== 'all') {
        query = query.eq('branch_id', selectedBranch);
      }

      // Filter by role
      if (selectedRole !== 'all') {
        query = query.eq('role', selectedRole);
      }

      // Filter by status
      if (selectedStatus !== 'all') {
        query = query.eq('is_active', selectedStatus === 'active');
      }

      const { data, error } = await query;

      if (error) throw error;

      // Get branch names
      const branchIds = [...new Set(data?.map(e => e.branch_id).filter(Boolean) || [])];
      let branchMap = new Map<string, string>();

      if (branchIds.length > 0) {
        const { data: branchData } = await supabase
          .from('branches')
          .select('id, name')
          .in('id', branchIds);
        branchData?.forEach(b => branchMap.set(b.id, b.name));
      }

      // Map employees with branch names
      const employeesWithBranches = data?.map(emp => ({
        ...emp,
        branch_name: emp.branch_id ? branchMap.get(emp.branch_id) || 'Unknown' : 'No Branch',
      })) || [];

      setEmployees(employeesWithBranches);
    } catch (error) {
      console.error('Error fetching employees:', error);
      showNotification('error', 'Failed to load employees');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, [selectedBranch, selectedRole, selectedStatus]);

  // Handle edit
  const openEditModal = (employee: Employee) => {
    setEditingEmployee(employee);
    setFormData({
      full_name: employee.full_name,
      email: employee.email,
      phone: employee.phone || '',
      password: '', // Not used for edit, but required by type
      role: employee.role,
      branch_id: employee.branch_id || '',
      is_active: employee.is_active,
    });
    setShowDeleteSection(false);
    setDeleteNameInput('');
    setShowEditModal(true);
  };

  // Handle permanent delete (superadmin only)
  const handleDelete = async () => {
    if (!editingEmployee) return;
    try {
      setDeleting(true);
      const res = await fetch('/api/superadmin/delete-user', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: editingEmployee.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        showNotification('error', data.error || 'Failed to delete user');
        return;
      }
      showNotification('success', `${editingEmployee.full_name} has been permanently deleted`);
      setShowEditModal(false);
      setEditingEmployee(null);
      setDeleteNameInput('');
      setShowDeleteSection(false);
      fetchEmployees();
    } catch {
      showNotification('error', 'Failed to delete user');
    } finally {
      setDeleting(false);
    }
  };

  const handleUpdate = async () => {
    // Branch is required for cashiers and managers, but not for admin/superadmin
    const requiresBranch = formData.role === 'cashier' || formData.role === 'manager';

    if (!editingEmployee || !formData.full_name) {
      showNotification('error', 'Please fill in all required fields');
      return;
    }

    if (requiresBranch && !formData.branch_id) {
      showNotification('error', 'Branch is required for cashiers and managers');
      return;
    }

    try {
      setSaving(true);

      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: formData.full_name.trim(),
          phone: formData.phone.trim() || null,
          role: formData.role,
          branch_id: formData.branch_id || null,
          is_active: formData.is_active,
        })
        .eq('id', editingEmployee.id);

      if (error) throw error;

      showNotification('success', 'Employee updated successfully');
      setShowEditModal(false);
      setEditingEmployee(null);
      fetchEmployees();
    } catch (error) {
      console.error('Error updating employee:', error);
      showNotification('error', 'Failed to update employee');
    } finally {
      setSaving(false);
    }
  };

  // Handle toggle active status
  const handleToggleStatus = async (employee: Employee) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: !employee.is_active })
        .eq('id', employee.id);

      if (error) throw error;

      showNotification('success', `Employee ${employee.is_active ? 'deactivated' : 'activated'}`);
      fetchEmployees();
    } catch (error) {
      console.error('Error toggling status:', error);
      showNotification('error', 'Failed to update status');
    }
  };

  const resetForm = () => {
    setFormData({
      full_name: '',
      email: '',
      phone: '',
      password: '',
      role: 'cashier',
      branch_id: '',
      is_active: true,
    });
    setShowPassword(false);
  };

  // Handle create new employee
  const handleCreate = async () => {
    // Branch is required for cashiers and managers, but not for admin/superadmin
    const requiresBranch = formData.role === 'cashier' || formData.role === 'manager';

    if (!formData.full_name || !formData.email || !formData.password) {
      showNotification('error', 'Please fill in all required fields');
      return;
    }

    if (requiresBranch && !formData.branch_id) {
      showNotification('error', 'Branch is required for cashiers and managers');
      return;
    }

    if (formData.password.length < 6) {
      showNotification('error', 'Password must be at least 6 characters');
      return;
    }

    try {
      setSaving(true);

      const result = await createEmployee({
        email: formData.email.trim(),
        password: formData.password,
        full_name: formData.full_name.trim(),
        role: formData.role,
        branch_id: formData.branch_id || null,
        phone: formData.phone.trim() || undefined,
      });

      if (!result.success) {
        showNotification('error', result.error || 'Failed to create employee');
        return;
      }

      showNotification('success', 'Employee created successfully');
      setShowAddModal(false);
      resetForm();
      fetchEmployees();
    } catch (error) {
      console.error('Error creating employee:', error);
      showNotification('error', 'Failed to create employee');
    } finally {
      setSaving(false);
    }
  };

  const employeeColumns = [
    { key: 'full_name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'branch_name', label: 'Branch' },
    {
      key: 'role',
      label: 'Role',
      render: (value: string) => (
        <Badge variant={value === 'cashier' ? 'secondary' : 'default'} className="capitalize">
          {value}
        </Badge>
      ),
    },
    {
      key: 'is_active',
      label: 'Status',
      render: (value: boolean) => (
        <Badge variant={value ? 'default' : 'destructive'}>
          {value ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'created_at',
      label: 'Joined',
      render: (value: string) => new Date(value).toLocaleDateString('en-KE', { timeZone: 'Africa/Nairobi' }),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_: any, row: Employee) => (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => openEditModal(row)}>
            <PencilIcon className="h-3 w-3 mr-1" />
            Edit
          </Button>
          <Button
            size="sm"
            variant={row.is_active ? 'destructive' : 'default'}
            onClick={() => handleToggleStatus(row)}
          >
            {row.is_active ? 'Deactivate' : 'Activate'}
          </Button>
        </div>
      ),
    },
  ];

  // Stats
  const totalEmployees = employees.length;
  const activeEmployees = employees.filter(e => e.is_active).length;
  const cashierCount = employees.filter(e => e.role === 'cashier').length;
  const managerCount = employees.filter(e => e.role === 'manager').length;
  const adminCount = employees.filter(e => e.role === 'admin').length;
  const superadminCount = employees.filter(e => e.role === 'superadmin').length;

  if (loading && employees.length === 0) {
    return (
      <DashboardLayout userName={profile?.full_name || 'Superadmin'} userRole="superadmin">
        <div className="flex items-center justify-center h-96">
          <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userName={profile?.full_name || 'Superadmin'} userRole="superadmin">
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
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold">Employee Management</h1>
              <p className="text-muted-foreground">
                Manage all employees: cashiers, managers, admins, and superadmins
              </p>
            </div>
            <Button onClick={() => { resetForm(); setShowAddModal(true); }}>
              <PlusIcon className="h-4 w-4 mr-2" />
              Add Employee
            </Button>
          </div>

          {/* Stats */}
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-primary/10 rounded-lg">
                    <UsersIcon className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{totalEmployees}</p>
                    <p className="text-sm text-muted-foreground">Total Employees</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-green-100 dark:bg-green-900/20 rounded-lg">
                    <UsersIcon className="h-6 w-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{activeEmployees}</p>
                    <p className="text-sm text-muted-foreground">Active</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                    <UsersIcon className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{cashierCount}</p>
                    <p className="text-sm text-muted-foreground">Cashiers</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
                    <UsersIcon className="h-6 w-6 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{managerCount}</p>
                    <p className="text-sm text-muted-foreground">Managers</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-orange-100 dark:bg-orange-900/20 rounded-lg">
                    <UsersIcon className="h-6 w-6 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{adminCount}</p>
                    <p className="text-sm text-muted-foreground">Admins</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-red-100 dark:bg-red-900/20 rounded-lg">
                    <UsersIcon className="h-6 w-6 text-red-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{superadminCount}</p>
                    <p className="text-sm text-muted-foreground">Superadmins</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle>Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Branch Filter */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Branch</label>
                  <select
                    value={selectedBranch}
                    onChange={(e) => setSelectedBranch(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg bg-background"
                  >
                    <option value="all">All Branches</option>
                    {branches.map(branch => (
                      <option key={branch.id} value={branch.id}>{branch.name}</option>
                    ))}
                  </select>
                </div>

                {/* Role Filter */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Role</label>
                  <select
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg bg-background"
                  >
                    <option value="all">All Roles</option>
                    <option value="cashier">Cashier</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                    <option value="superadmin">Superadmin</option>
                  </select>
                </div>

                {/* Status Filter */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Status</label>
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg bg-background"
                  >
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Employees Table */}
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <DataTable
              title="All Employees"
              columns={employeeColumns}
              data={employees}
            />
          )}
        </div>
      </div>

      {/* Add Employee Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Add New Employee</h2>
              <button onClick={() => setShowAddModal(false)}>
                <XIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Full Name *</label>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  placeholder="e.g., John Doe"
                  className="w-full px-4 py-2 border rounded-lg bg-background"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Email *</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="e.g., john@company.com"
                  className="w-full px-4 py-2 border rounded-lg bg-background"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Password *</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Min 6 characters"
                    className="w-full px-4 py-2 border rounded-lg bg-background pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Phone</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="e.g., 0712345678"
                  className="w-full px-4 py-2 border rounded-lg bg-background"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Role *</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as 'cashier' | 'manager' | 'admin' | 'superadmin' })}
                  className="w-full px-4 py-2 border rounded-lg bg-background"
                >
                  <option value="cashier">Cashier</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                  <option value="superadmin">Superadmin</option>
                </select>
              </div>
              {(formData.role === 'cashier' || formData.role === 'manager') && (
                <div>
                  <label className="text-sm font-medium mb-2 block">Branch *</label>
                  <select
                    value={formData.branch_id}
                    onChange={(e) => setFormData({ ...formData, branch_id: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg bg-background"
                  >
                    <option value="">Select Branch</option>
                    {branches.map(branch => (
                      <option key={branch.id} value={branch.id}>{branch.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex gap-2 pt-4">
                <Button variant="outline" onClick={() => setShowAddModal(false)} className="flex-1">
                  Cancel
                </Button>
                <Button onClick={handleCreate} className="flex-1" disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2Icon className="h-4 w-4 animate-spin mr-2" />
                      Creating...
                    </>
                  ) : (
                    'Create Employee'
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && editingEmployee && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Edit Employee</h2>
              <button onClick={() => setShowEditModal(false)}>
                <XIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Full Name *</label>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg bg-background"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  disabled
                  className="w-full px-4 py-2 border rounded-lg bg-gray-100 dark:bg-gray-800"
                />
                <p className="text-xs text-muted-foreground mt-1">Email cannot be changed</p>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Phone</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="e.g., 0712345678"
                  className="w-full px-4 py-2 border rounded-lg bg-background"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Role *</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as 'cashier' | 'manager' | 'admin' | 'superadmin' })}
                  className="w-full px-4 py-2 border rounded-lg bg-background"
                >
                  <option value="cashier">Cashier</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                  <option value="superadmin">Superadmin</option>
                </select>
              </div>
              {(formData.role === 'cashier' || formData.role === 'manager') && (
                <div>
                  <label className="text-sm font-medium mb-2 block">Branch *</label>
                  <select
                    value={formData.branch_id}
                    onChange={(e) => setFormData({ ...formData, branch_id: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg bg-background"
                  >
                    <option value="">Select Branch</option>
                    {branches.map(branch => (
                      <option key={branch.id} value={branch.id}>{branch.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="h-4 w-4"
                />
                <label htmlFor="is_active" className="text-sm font-medium">Active</label>
              </div>
              <div className="flex gap-2 pt-4">
                <Button variant="outline" onClick={() => setShowEditModal(false)} className="flex-1">
                  Cancel
                </Button>
                <Button onClick={handleUpdate} className="flex-1" disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2Icon className="h-4 w-4 animate-spin mr-2" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </Button>
              </div>

              {/* ── Danger Zone ─────────────────────────────────────────── */}
              <div className="border-t pt-4 mt-2">
                {!showDeleteSection ? (
                  <button
                    type="button"
                    onClick={() => setShowDeleteSection(true)}
                    className="flex items-center gap-2 text-sm text-destructive hover:underline"
                  >
                    <Trash2Icon className="h-4 w-4" />
                    Permanently delete this user
                  </button>
                ) : (
                  <div className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
                    <div className="flex items-start gap-2">
                      <AlertTriangleIcon className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-destructive">Danger Zone</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          This action permanently deletes the user from the system and cannot be undone.
                          All associated data will be removed.
                        </p>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-medium block mb-1">
                        Type <span className="font-bold">{editingEmployee.full_name}</span> to confirm
                      </label>
                      <input
                        type="text"
                        value={deleteNameInput}
                        onChange={e => setDeleteNameInput(e.target.value)}
                        placeholder="Enter exact name to confirm"
                        className="w-full px-3 py-2 text-sm border border-destructive/40 rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-destructive"
                        disabled={deleting}
                      />
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => { setShowDeleteSection(false); setDeleteNameInput(''); }}
                        disabled={deleting}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="flex-1 gap-2"
                        disabled={deleteNameInput !== editingEmployee.full_name || deleting}
                        onClick={handleDelete}
                      >
                        {deleting ? (
                          <><Loader2Icon className="h-4 w-4 animate-spin" />Deleting…</>
                        ) : (
                          <><Trash2Icon className="h-4 w-4" />Delete Permanently</>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
