'use client';

import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Notification, useNotification } from '@/components/ui/notification';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { useAuth } from '@/lib/auth/auth-context';
import { createClient } from '@/lib/supabase/client';
import { PlusIcon, Trash2Icon, EditIcon, Loader2 } from 'lucide-react';

interface ProductForm {
  id: string;
  product_name: string;
  category: string;
  product_price: string;
  image_url: string;
  image_file?: File | null;
}

interface Product {
  id: string;
  product_name: string;
  category: string;
  product_price: number;
  image_url: string | null;
  is_active: boolean;
  branch_id: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function ManagerInventoryPageContent() {
  const supabase = createClient();
  const { user, profile } = useAuth();
  const { notification, showNotification, hideNotification } = useNotification();

  const [formData, setFormData] = useState<ProductForm>({
    id: '',
    product_name: '',
    category: '',
    product_price: '',
    image_url: '',
    image_file: null,
  });

  const [imagePreview, setImagePreview] = useState<string>('');
  const [products, setProducts] = useState<Product[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Get branch info from profile
  const branchId = profile?.branch_id || null;
  const userId = user?.id || null;
  const userName = profile?.full_name || 'Manager';

  // Fetch products on mount
  useEffect(() => {
    const fetchProducts = async () => {
      if (!branchId) {
        showNotification('error', 'Branch not assigned to user');
        setIsLoading(false);
        return;
      }

      try {
        showNotification('loading', 'Loading products...');

        // Fetch products for this branch
        const { data: productsData, error: productsError } = await supabase
          .from('products')
          .select('id, product_name, category, product_price, image_url, is_active, branch_id, created_by, created_at, updated_at')
          .eq('branch_id', branchId)
          .order('created_at', { ascending: false });

        if (productsError) throw productsError;

        setProducts(productsData || []);
        hideNotification();
      } catch (error: any) {
        console.error('Error loading products:', error);
        showNotification('error', `Failed to load products: ${error.message}`);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProducts();
  }, [branchId]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file size (5MB max)
      if (file.size > 5 * 1024 * 1024) {
        showNotification('error', 'Image must be less than 5MB');
        return;
      }

      // Validate file type
      const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
      if (!validTypes.includes(file.type)) {
        showNotification('error', 'Please upload a valid image (JPEG, PNG, WEBP, or GIF)');
        return;
      }

      setFormData(prev => ({ ...prev, image_file: file }));

      // Create preview URL
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadImage = async (file: File): Promise<string | null> => {
    if (!branchId) return null;

    try {
      const fileExt = file.name.split('.').pop()?.toLowerCase();
      const fileName = `${branchId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { data, error } = await supabase.storage
        .from('product-images')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) throw error;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('product-images')
        .getPublicUrl(fileName);

      return publicUrl;
    } catch (error: any) {
      console.error('Error uploading image:', error);
      throw new Error(`Image upload failed: ${error.message}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!branchId) {
      showNotification('error', 'Branch not initialized. Please refresh the page.');
      return;
    }

    setIsSubmitting(true);
    showNotification('loading', editingId ? 'Updating product...' : 'Adding product...');

    try {
      let imageUrl = formData.image_url;

      // Upload new image if file is selected
      if (formData.image_file) {
        imageUrl = await uploadImage(formData.image_file) || '';
      }

      const productData = {
        product_name: formData.product_name,
        category: formData.category,
        product_price: parseFloat(formData.product_price),
        image_url: imageUrl || null,
        branch_id: branchId,
        created_by: userId,
      };

      if (editingId) {
        // Update existing product
        const { data, error } = await supabase
          .from('products')
          .update(productData)
          .eq('id', editingId)
          .select()
          .single();

        if (error) throw error;

        setProducts(prev =>
          prev.map(p => (p.id === editingId ? data : p))
        );
        showNotification('success', 'Product updated successfully');
        setEditingId(null);
      } else {
        // Insert new product
        const { data, error } = await supabase
          .from('products')
          .insert([productData])
          .select()
          .single();

        if (error) throw error;

        setProducts(prev => [data, ...prev]);
        showNotification('success', 'Product added successfully');
      }

      // Reset form
      setFormData({
        id: '',
        product_name: '',
        category: '',
        product_price: '',
        image_url: '',
        image_file: null,
      });
      setImagePreview('');
    } catch (error: any) {
      console.error('Error saving product:', error);
      showNotification('error', `Failed to save product: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (product: Product) => {
    setFormData({
      id: product.id,
      product_name: product.product_name,
      category: product.category,
      product_price: product.product_price.toString(),
      image_url: product.image_url || '',
      image_file: null,
    });
    setImagePreview(product.image_url || '');
    setEditingId(product.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return;

    showNotification('loading', 'Deleting product...');

    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setProducts(prev => prev.filter(p => p.id !== id));
      showNotification('success', 'Product deleted successfully');
    } catch (error: any) {
      console.error('Error deleting product:', error);
      showNotification('error', `Failed to delete product: ${error.message}`);
    }
  };

  const handleToggleActive = async (id: string) => {
    const product = products.find(p => p.id === id);
    if (!product) return;

    const newStatus = !product.is_active;

    try {
      const { error } = await supabase
        .from('products')
        .update({ is_active: newStatus })
        .eq('id', id);

      if (error) throw error;

      setProducts(prev =>
        prev.map(p => (p.id === id ? { ...p, is_active: newStatus } : p))
      );

      showNotification(
        'success',
        `Product ${newStatus ? 'activated' : 'deactivated'} successfully`
      );
    } catch (error: any) {
      console.error('Error toggling product status:', error);
      showNotification('error', `Failed to update product: ${error.message}`);
    }
  };

  const handleCancel = () => {
    setFormData({
      id: '',
      product_name: '',
      category: '',
      product_price: '',
      image_url: '',
      image_file: null,
    });
    setImagePreview('');
    setEditingId(null);
  };

  if (isLoading) {
    return (
      <DashboardLayout userName={userName} userRole="manager">
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Loading products...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userName={userName} userRole="manager">
      {notification && (
        <Notification
          type={notification.type}
          message={notification.message}
          onClose={hideNotification}
        />
      )}

      <div className="p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* Header */}
          <div>
            <h1 className="text-4xl font-bold">Inventory for Order Page</h1>
            <p className="text-muted-foreground">
              Manage products and menu items for your branch
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Side - Form */}
            <div className="lg:col-span-1">
              <Card>
                <CardHeader>
                  <CardTitle>
                    {editingId ? 'Edit Product' : 'Add New Product'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        Product ID
                      </label>
                      <input
                        type="text"
                        name="id"
                        value={formData.id || 'Auto-generated'}
                        className="w-full px-4 py-2 border rounded-lg bg-muted"
                        disabled
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        Product Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="product_name"
                        value={formData.product_name}
                        onChange={handleInputChange}
                        placeholder="e.g., Classic Burger"
                        required
                        disabled={isSubmitting}
                        className="w-full px-4 py-2 border rounded-lg disabled:opacity-50"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        Category <span className="text-red-500">*</span>
                      </label>
                      <select
                        name="category"
                        value={formData.category}
                        onChange={handleInputChange}
                        required
                        disabled={isSubmitting}
                        className="w-full px-4 py-2 border rounded-lg disabled:opacity-50"
                      >
                        <option value="">Select category...</option>
                        <option value="Meals">Meals</option>
                        <option value="Drinks&Juices">Drinks&Juices</option>
                        <option value="Specials">Specials</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        Product Price (Ksh) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        name="product_price"
                        value={formData.product_price}
                        onChange={handleInputChange}
                        placeholder="0.00"
                        step="0.01"
                        min="0"
                        required
                        disabled={isSubmitting}
                        className="w-full px-4 py-2 border rounded-lg disabled:opacity-50"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        Product Image
                      </label>
                      <div className="space-y-2">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleFileChange}
                          disabled={isSubmitting}
                          className="w-full px-4 py-2 border rounded-lg file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 disabled:opacity-50"
                        />
                        {imagePreview && (
                          <div className="relative w-full h-32 border rounded-lg overflow-hidden">
                            <img
                              src={imagePreview}
                              alt="Preview"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Max 5MB • JPEG, PNG, WEBP, or GIF
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-2 pt-4">
                      {editingId && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleCancel}
                          disabled={isSubmitting}
                          className="flex-1"
                        >
                          Cancel
                        </Button>
                      )}
                      <Button
                        type="submit"
                        disabled={isSubmitting}
                        className="flex-1 gap-2"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {editingId ? 'Updating...' : 'Adding...'}
                          </>
                        ) : (
                          <>
                            <PlusIcon className="h-4 w-4" />
                            {editingId ? 'Update Product' : 'Add Product'}
                          </>
                        )}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </div>

            {/* Right Side - Product List */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>Products List ({products.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {products.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        No products added yet. Use the form to add your first product.
                      </div>
                    ) : (
                      products.map((product) => (
                        <div
                          key={product.id}
                          className="flex items-center gap-4 p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                        >
                          {/* Product Image */}
                          {product.image_url ? (
                            <img
                              src={product.image_url}
                              alt={product.product_name}
                              className="w-16 h-16 rounded-lg object-cover"
                            />
                          ) : (
                            <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center text-muted-foreground text-xs">
                              No Image
                            </div>
                          )}

                          {/* Product Info */}
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-lg truncate">
                              {product.product_name}
                            </h3>
                            <div className="flex items-center gap-3 text-sm text-muted-foreground">
                              <span className="px-2 py-0.5 bg-primary/10 rounded text-primary">
                                {product.category}
                              </span>
                              <span className="font-semibold text-foreground">
                                Ksh {product.product_price.toFixed(2)}
                              </span>
                            </div>
                          </div>

                          {/* Active Switch */}
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">
                              {product.is_active ? 'Active' : 'Inactive'}
                            </span>
                            <Switch
                              checked={product.is_active}
                              onCheckedChange={() => handleToggleActive(product.id)}
                              disabled={isSubmitting}
                            />
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEdit(product)}
                              disabled={isSubmitting}
                            >
                              <EditIcon className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDelete(product.id)}
                              disabled={isSubmitting}
                            >
                              <Trash2Icon className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Summary Card */}
              <Card className="mt-4">
                <CardContent className="p-6">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-2xl font-bold">{products.length}</p>
                      <p className="text-sm text-muted-foreground">Total Products</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-green-600">
                        {products.filter(p => p.is_active).length}
                      </p>
                      <p className="text-sm text-muted-foreground">Active</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-red-600">
                        {products.filter(p => !p.is_active).length}
                      </p>
                      <p className="text-sm text-muted-foreground">Inactive</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default function ManagerInventoryPage() {
  return (
    <ProtectedRoute allowedRoles={['manager']}>
      <ManagerInventoryPageContent />
    </ProtectedRoute>
  );
}
