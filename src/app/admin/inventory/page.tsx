'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth/auth-context';
import { useClerkSupabaseClient } from '@/lib/supabase/client';
import {
  PlusIcon, PencilIcon, Loader2Icon, XIcon,
  PackageIcon, HashIcon, BoxIcon, SearchIcon, TrashIcon,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type ItemType = 'countable' | 'stocked';

interface InventoryItem {
  id: string;
  branch_id: string;
  branch_name: string;
  item_name: string;
  category: string;
  item_type: ItemType;
  count: number | null;
  quantity: number | null;
  price: number | null;
  notes: string | null;
  is_active: boolean;
  updated_at: string;
}

interface Branch { id: string; name: string; }

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = ['Equipment', 'Furniture', 'Consumables', 'Appliances', 'General'];

const CATEGORY_COLORS: Record<string, string> = {
  Equipment:    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  Furniture:    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  Consumables:  'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  Appliances:   'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  General:      'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
};

const inputCls = 'w-full px-3 py-2 border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50';
const labelCls = 'text-xs font-medium text-muted-foreground mb-1 block';

const emptyForm = {
  branch_id:  '',
  item_name:  '',
  category:   'General',
  item_type:  'stocked' as ItemType,
  count:      '',
  quantity:   '',
  price:      '',
  notes:      '',
  is_active:  true,
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminInventoryPage() {
  const { profile } = useAuth();
  const supabase = useClerkSupabaseClient();

  const [loading, setLoading]     = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [saving, setSaving]       = useState(false);
  const [items, setItems]         = useState<InventoryItem[]>([]);
  const [branches, setBranches]   = useState<Branch[]>([]);

  // Modals
  const [showAdd, setShowAdd]       = useState(false);
  const [showEdit, setShowEdit]     = useState(false);
  const [editItem, setEditItem]     = useState<InventoryItem | null>(null);
  const [formData, setFormData]     = useState({ ...emptyForm });

  // Filters
  const [filterBranch,   setFilterBranch]   = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterType,     setFilterType]     = useState('all');
  const [search,         setSearch]         = useState('');

  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const userRole = (profile?.role === 'superadmin' ? 'superadmin' : 'admin') as 'admin' | 'superadmin';

  const showNotif = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const set = (field: string, value: any) => setFormData(prev => ({ ...prev, [field]: value }));

  // ─── Fetch ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!profile?.id) return;
    supabase
      .from('branches')
      .select('id, name')
      .order('name')
      .then(({ data, error }) => {
        if (error) console.error('Branches fetch error:', error);
        setBranches(data || []);
      });
  }, [profile?.id]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const { data, error } = await supabase
        .from('branch_inventory')
        .select('*, branches!branch_id(name)')
        .eq('is_active', true)
        .order('item_name');

      console.log('[inventory] fetch result:', { data, error });

      if (error) throw error;

      setItems((data || []).map((r: any) => ({
        ...r,
        branch_name: r.branches?.name || '—',
      })));
    } catch (err: any) {
      console.error('[inventory] fetch failed:', err);
      setFetchError(err?.message || 'Failed to load inventory. The branch_inventory table may not exist — run the migration in Supabase.');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // ─── Filtered list ─────────────────────────────────────────────────────────

  const filtered = useMemo(() => items.filter(it => {
    if (filterBranch !== 'all' && it.branch_id !== filterBranch) return false;
    if (filterCategory !== 'all' && it.category !== filterCategory) return false;
    if (filterType !== 'all' && it.item_type !== filterType) return false;
    if (search && !it.item_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [items, filterBranch, filterCategory, filterType, search]);

  // ─── Stats ─────────────────────────────────────────────────────────────────

  const totalItems   = items.length;
  const stockedItems = items.filter(i => i.item_type === 'stocked').length;
  const countables   = items.filter(i => i.item_type === 'countable').length;
  const totalValue   = items
    .filter(i => i.item_type === 'stocked' && i.quantity != null && i.price != null)
    .reduce((s, i) => s + (i.quantity! * i.price!), 0);

  // ─── Create ────────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!formData.branch_id || !formData.item_name.trim()) {
      showNotif('error', 'Branch and item name are required');
      return;
    }
    if (formData.item_type === 'countable' && !formData.count) {
      showNotif('error', 'Count is required for countable items');
      return;
    }
    if (formData.item_type === 'stocked' && (!formData.quantity || !formData.price)) {
      showNotif('error', 'Quantity and price are required for stocked items');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('branch_inventory').insert({
        branch_id:  formData.branch_id,
        item_name:  formData.item_name.trim(),
        category:   formData.category,
        item_type:  formData.item_type,
        count:      formData.item_type === 'countable' ? parseInt(formData.count) : null,
        quantity:   formData.item_type === 'stocked'   ? parseFloat(formData.quantity) : null,
        price:      formData.item_type === 'stocked'   ? parseFloat(formData.price) : null,
        notes:      formData.notes.trim() || null,
        created_by: profile!.id,
        updated_by: profile!.id,
      });
      if (error) throw error;
      showNotif('success', 'Item added successfully');
      setShowAdd(false);
      setFormData({ ...emptyForm });
      fetchItems();
    } catch (err: any) {
      showNotif('error', err.message || 'Failed to add item');
    } finally {
      setSaving(false);
    }
  };

  // ─── Edit ──────────────────────────────────────────────────────────────────

  const openEdit = (item: InventoryItem) => {
    setEditItem(item);
    setFormData({
      branch_id:  item.branch_id,
      item_name:  item.item_name,
      category:   item.category,
      item_type:  item.item_type,
      count:      item.count?.toString() || '',
      quantity:   item.quantity?.toString() || '',
      price:      item.price?.toString() || '',
      notes:      item.notes || '',
      is_active:  item.is_active,
    });
    setShowEdit(true);
  };

  const handleUpdate = async () => {
    if (!editItem || !formData.item_name.trim()) {
      showNotif('error', 'Item name is required');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('branch_inventory').update({
        branch_id:  formData.branch_id,
        item_name:  formData.item_name.trim(),
        category:   formData.category,
        item_type:  formData.item_type,
        count:      formData.item_type === 'countable' ? parseInt(formData.count) : null,
        quantity:   formData.item_type === 'stocked'   ? parseFloat(formData.quantity) : null,
        price:      formData.item_type === 'stocked'   ? parseFloat(formData.price) : null,
        notes:      formData.notes.trim() || null,
        is_active:  formData.is_active,
        updated_by: profile!.id,
      }).eq('id', editItem.id);
      if (error) throw error;
      showNotif('success', 'Item updated successfully');
      setShowEdit(false);
      setEditItem(null);
      fetchItems();
    } catch (err: any) {
      showNotif('error', 'Failed to update item');
    } finally {
      setSaving(false);
    }
  };

  // ─── Delete (soft) ─────────────────────────────────────────────────────────

  const handleDelete = async (item: InventoryItem) => {
    if (!confirm(`Remove "${item.item_name}" from inventory?`)) return;
    try {
      const { error } = await supabase.from('branch_inventory')
        .update({ is_active: false }).eq('id', item.id);
      if (error) throw error;
      showNotif('success', 'Item removed');
      fetchItems();
    } catch {
      showNotif('error', 'Failed to remove item');
    }
  };

  const fmtCurrency = (n: number) =>
    `KSh ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const hasFilters = filterCategory !== 'all' || filterType !== 'all' || !!search;

  // ─── Shared form ───────────────────────────────────────────────────────────

  const renderForm = (isEdit: boolean) => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className={labelCls}>Item Name *</label>
          <input type="text" value={formData.item_name} onChange={e => set('item_name', e.target.value)}
            placeholder="e.g., Rotisserie Oven" className={inputCls} />
        </div>

        <div>
          <label className={labelCls}>Branch *</label>
          <select value={formData.branch_id} onChange={e => set('branch_id', e.target.value)} className={inputCls}>
            <option value="">Select Branch</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>

        <div>
          <label className={labelCls}>Category</label>
          <select value={formData.category} onChange={e => set('category', e.target.value)} className={inputCls}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="col-span-2">
          <label className={labelCls}>Item Type *</label>
          <div className="flex gap-3">
            {(['stocked', 'countable'] as ItemType[]).map(type => (
              <button
                key={type}
                type="button"
                onClick={() => set('item_type', type)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-colors
                  ${formData.item_type === type ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:bg-muted/50'}`}
              >
                {type === 'stocked' ? <BoxIcon className="h-4 w-4" /> : <HashIcon className="h-4 w-4" />}
                {type === 'stocked' ? 'Stocked (qty + price)' : 'Countable (count only)'}
              </button>
            ))}
          </div>
        </div>

        {formData.item_type === 'countable' ? (
          <div className="col-span-2">
            <label className={labelCls}>Count *</label>
            <input type="number" min="0" value={formData.count} onChange={e => set('count', e.target.value)}
              placeholder="e.g., 24" className={inputCls} />
          </div>
        ) : (
          <>
            <div>
              <label className={labelCls}>Quantity *</label>
              <input type="number" min="0" step="0.01" value={formData.quantity} onChange={e => set('quantity', e.target.value)}
                placeholder="0" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Unit Price (KSh) *</label>
              <input type="number" min="0" step="0.01" value={formData.price} onChange={e => set('price', e.target.value)}
                placeholder="0.00" className={inputCls} />
            </div>
            {formData.quantity && formData.price && (
              <div className="col-span-2 px-3 py-2 bg-muted rounded-lg text-sm flex justify-between">
                <span className="text-muted-foreground">Total Amount</span>
                <span className="font-semibold">{fmtCurrency(parseFloat(formData.quantity) * parseFloat(formData.price))}</span>
              </div>
            )}
          </>
        )}

        <div className="col-span-2">
          <label className={labelCls}>Notes</label>
          <input type="text" value={formData.notes} onChange={e => set('notes', e.target.value)}
            placeholder="Any remarks..." className={inputCls} />
        </div>

        {isEdit && (
          <div className="col-span-2 flex items-center gap-2">
            <input type="checkbox" id="is_active_inv" checked={formData.is_active}
              onChange={e => set('is_active', e.target.checked)} className="h-4 w-4 rounded" />
            <label htmlFor="is_active_inv" className="text-sm font-medium">Active</label>
          </div>
        )}
      </div>
    </div>
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout userName={profile?.full_name || 'Admin'} userRole={userRole}>
      {notification && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-lg shadow-lg text-white ${
          notification.type === 'success' ? 'bg-green-500' : 'bg-red-500'
        }`}>
          {notification.message}
        </div>
      )}

      <div className="p-8">
        <div className="max-w-7xl mx-auto space-y-8">

          {/* Header */}
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-4xl font-bold">Branch Inventory</h1>
            </div>
            <Button onClick={() => { setFormData({ ...emptyForm }); setShowAdd(true); }} className="gap-2">
              <PlusIcon className="h-4 w-4" />
              Add Item
            </Button>
          </div>

          {/* Stats */}
          <div className="grid gap-4 md:grid-cols-4">
            {[
              { label: 'Total Items',   value: totalItems,                       icon: PackageIcon, color: 'bg-primary/10 text-primary' },
              { label: 'Stocked Items', value: stockedItems,                     icon: BoxIcon,     color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/20' },
              { label: 'Countable',     value: countables,                       icon: HashIcon,    color: 'bg-amber-100 text-amber-600 dark:bg-amber-900/20' },
              { label: 'Total Value',   value: fmtCurrency(totalValue), isText: true, icon: PackageIcon, color: 'bg-green-100 text-green-600 dark:bg-green-900/20' },
            ].map(({ label, value, icon: Icon, color, isText }) => (
              <Card key={label}>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-lg ${color}`}><Icon className="h-5 w-5" /></div>
                    <div>
                      <p className={`font-bold ${isText ? 'text-lg' : 'text-2xl'}`}>{value}</p>
                      <p className="text-sm text-muted-foreground">{label}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Branch Tabs */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilterBranch('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                filterBranch === 'all'
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                  : 'bg-background border-border text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              All Branches
            </button>
            {branches.map(b => (
              <button
                key={b.id}
                onClick={() => setFilterBranch(b.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                  filterBranch === b.id
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                    : 'bg-background border-border text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                {b.name}
              </button>
            ))}
          </div>

          {/* Secondary Filters */}
          <div className="flex flex-wrap gap-3 items-end">
            <div className="relative">
              <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input type="text" placeholder="Search items..." value={search} onChange={e => setSearch(e.target.value)}
                className="pl-8 pr-3 py-2 border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 w-44" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Category</label>
              <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
                className="px-3 py-2 border rounded-lg bg-background text-sm">
                <option value="all">All Categories</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Type</label>
              <select value={filterType} onChange={e => setFilterType(e.target.value)}
                className="px-3 py-2 border rounded-lg bg-background text-sm">
                <option value="all">All Types</option>
                <option value="stocked">Stocked</option>
                <option value="countable">Countable</option>
              </select>
            </div>
            {(filterCategory !== 'all' || filterType !== 'all' || search) && (
              <Button variant="ghost" size="sm" onClick={() => { setFilterCategory('all'); setFilterType('all'); setSearch(''); }}>
                Clear
              </Button>
            )}
          </div>

          {/* Table grouped by branch */}
          {loading ? (
            <div className="flex justify-center py-16"><Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : fetchError ? (
            <Card className="border-destructive/50">
              <CardContent className="py-12 text-center space-y-3">
                <p className="text-destructive font-semibold">Failed to load inventory data</p>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">{fetchError}</p>
                <Button variant="outline" size="sm" onClick={fetchItems} className="mt-2">
                  Retry
                </Button>
              </CardContent>
            </Card>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center text-muted-foreground">
                {items.length === 0
                  ? 'No inventory items yet. Click "Add Item" to get started.'
                  : 'No items match the current filters.'}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-4 py-3 font-medium text-xs uppercase text-muted-foreground">Item</th>
                      <th className="text-left px-4 py-3 font-medium text-xs uppercase text-muted-foreground">Branch</th>
                      <th className="text-left px-4 py-3 font-medium text-xs uppercase text-muted-foreground">Category</th>
                      <th className="text-left px-4 py-3 font-medium text-xs uppercase text-muted-foreground">Type</th>
                      <th className="text-right px-4 py-3 font-medium text-xs uppercase text-muted-foreground">Count / Qty</th>
                      <th className="text-right px-4 py-3 font-medium text-xs uppercase text-muted-foreground">Unit Price</th>
                      <th className="text-right px-4 py-3 font-medium text-xs uppercase text-muted-foreground">Total</th>
                      <th className="text-left px-4 py-3 font-medium text-xs uppercase text-muted-foreground">Notes</th>
                      <th className="text-left px-4 py-3 font-medium text-xs uppercase text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(item => {
                      const total = item.item_type === 'stocked' && item.quantity != null && item.price != null
                        ? item.quantity * item.price : null;
                      return (
                        <tr key={item.id} className="border-b hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 font-medium">{item.item_name}</td>
                          <td className="px-4 py-3 text-muted-foreground">{item.branch_name}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[item.category] || CATEGORY_COLORS.General}`}>
                              {item.category}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={item.item_type === 'stocked' ? 'default' : 'secondary'} className="text-xs capitalize">
                              {item.item_type === 'stocked' ? <BoxIcon className="h-3 w-3 mr-1 inline" /> : <HashIcon className="h-3 w-3 mr-1 inline" />}
                              {item.item_type}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {item.item_type === 'countable' ? item.count ?? '—' : item.quantity ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                            {item.item_type === 'stocked' && item.price != null ? fmtCurrency(item.price) : '—'}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-medium">
                            {total != null ? fmtCurrency(total) : '—'}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground text-xs max-w-[160px] truncate">
                            {item.notes || '—'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1.5">
                              <Button size="sm" variant="outline" onClick={() => openEdit(item)} className="h-7 px-2">
                                <PencilIcon className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => handleDelete(item)} className="h-7 px-2 text-destructive hover:text-destructive">
                                <TrashIcon className="h-3 w-3" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {/* Totals footer */}
                  {filtered.some(i => i.item_type === 'stocked') && (
                    <tfoot>
                      <tr className="border-t bg-muted/30">
                        <td colSpan={6} className="px-4 py-3 text-sm font-semibold text-right">
                          Filtered Total Value
                        </td>
                        <td className="px-4 py-3 text-right font-bold">
                          {fmtCurrency(
                            filtered
                              .filter(i => i.item_type === 'stocked' && i.quantity != null && i.price != null)
                              .reduce((s, i) => s + i.quantity! * i.price!, 0)
                          )}
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              <div className="px-4 py-3 border-t text-xs text-muted-foreground">
                Showing {filtered.length} of {items.length} item{items.length !== 1 ? 's' : ''}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* ── Add Modal ── */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-xl">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-xl font-bold">Add Inventory Item</h2>
              <button onClick={() => setShowAdd(false)} className="text-muted-foreground hover:text-foreground"><XIcon className="h-5 w-5" /></button>
            </div>
            <div className="overflow-y-auto p-6 flex-1">{renderForm(false)}</div>
            <div className="flex gap-3 p-6 border-t">
              <Button variant="outline" onClick={() => setShowAdd(false)} className="flex-1">Cancel</Button>
              <Button onClick={handleCreate} disabled={saving} className="flex-1">
                {saving ? <><Loader2Icon className="h-4 w-4 animate-spin mr-2" />Adding...</> : 'Add Item'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Modal ── */}
      {showEdit && editItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-xl">
            <div className="flex justify-between items-center p-6 border-b">
              <div>
                <h2 className="text-xl font-bold">Edit Item</h2>
                <p className="text-sm text-muted-foreground">{editItem.item_name}</p>
              </div>
              <button onClick={() => setShowEdit(false)} className="text-muted-foreground hover:text-foreground"><XIcon className="h-5 w-5" /></button>
            </div>
            <div className="overflow-y-auto p-6 flex-1">{renderForm(true)}</div>
            <div className="flex gap-3 p-6 border-t">
              <Button variant="outline" onClick={() => setShowEdit(false)} className="flex-1">Cancel</Button>
              <Button onClick={handleUpdate} disabled={saving} className="flex-1">
                {saving ? <><Loader2Icon className="h-4 w-4 animate-spin mr-2" />Saving...</> : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
