'use client';

import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/auth-context';
import { useClerkSupabaseClient } from '@/lib/supabase/client';
import { Loader2, PlusIcon, Edit, Check, X } from 'lucide-react';
import { useNotification } from '@/components/ui/notification';
import { uploadProductImage } from '@/lib/actions/upload-product-image';

interface Product {
  product_id: string;
  product_name: string;
  category: string;
  base_price: number;
  image_url: string | null;
  description: string | null;
  branches: BranchAvailability[];
}

interface BranchAvailability {
  branch_id: string;
  branch_name: string;
  branch_code: string;
  is_active: boolean;
  local_price: number | null;
  stock_quantity: number;
  has_assignment: boolean;
}

export default function AdminProductsPage() {
  const { profile } = useAuth();
  const supabase = useClerkSupabaseClient();
  const { showNotification } = useNotification();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Form state
  const [productName, setProductName] = useState('');
  const [category, setCategory] = useState('Meals');
  const [basePrice, setBasePrice] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_products_with_branches');

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
      showNotification('error', 'Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('file', file);
      const result = await uploadProductImage(formData);
      if ('error' in result) throw new Error(result.error);
      return result.url;
    } catch (error) {
      console.error('Error uploading image:', error);
      showNotification('error', 'Failed to upload image');
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!productName.trim() || !basePrice) {
      showNotification('error', 'Please fill in all required fields');
      return;
    }

    try {
      setSubmitting(true);

      // Upload image if provided
      let uploadedImageUrl: string | null = null;
      if (imageFile) {
        uploadedImageUrl = await uploadImage(imageFile);
        if (!uploadedImageUrl) {
          // Upload failed, don't proceed
          return;
        }
      }

      const { error } = await supabase.from('products').insert({
        product_name: productName.trim(),
        category,
        base_price: parseFloat(basePrice),
        image_url: uploadedImageUrl,
        created_by: profile?.id,
      });

      if (error) throw error;

      showNotification('success', 'Product created successfully!');
      setShowAddModal(false);
      resetForm();
      await fetchProducts();
    } catch (error: any) {
      console.error('Error creating product:', error);
      if (error.code === '23505') {
        showNotification('error', 'A product with this name already exists');
      } else {
        showNotification('error', 'Failed to create product');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleBranch = async (productId: string, branchId: string, currentStatus: boolean, hasAssignment: boolean) => {
    try {
      if (!hasAssignment) {
        // Create new assignment
        const { error } = await supabase.rpc('assign_product_to_branch', {
          target_product_id: productId,
          target_branch_id: branchId,
          price: null, // Use base price
          active: true,
        });

        if (error) throw error;
        showNotification('success', 'Product activated at branch');
      } else {
        // Toggle existing assignment
        const { error } = await supabase.rpc('toggle_branch_product', {
          target_product_id: productId,
          target_branch_id: branchId,
        });

        if (error) throw error;
        showNotification('success', currentStatus ? 'Product deactivated' : 'Product activated');
      }

      await fetchProducts();
    } catch (error) {
      console.error('Error toggling branch product:', error);
      showNotification('error', 'Failed to update product status');
    }
  };

  const handleEditProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct || !productName.trim() || !basePrice) {
      showNotification('error', 'Please fill in all required fields');
      return;
    }

    try {
      setSubmitting(true);

      let uploadedImageUrl: string | null = editingProduct.image_url;
      if (imageFile) {
        uploadedImageUrl = await uploadImage(imageFile);
        if (!uploadedImageUrl) return;
      }

      const { error } = await supabase
        .from('products')
        .update({
          product_name: productName.trim(),
          category,
          base_price: parseFloat(basePrice),
          image_url: uploadedImageUrl,
        })
        .eq('id', editingProduct.product_id);

      if (error) throw error;

      showNotification('success', 'Product updated successfully!');
      setShowEditModal(false);
      resetForm();
      await fetchProducts();
    } catch (error: any) {
      console.error('Error updating product:', error);
      if (error.code === '23505') {
        showNotification('error', 'A product with this name already exists');
      } else {
        showNotification('error', 'Failed to update product');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setProductName(product.product_name);
    setCategory(product.category);
    setBasePrice(product.base_price.toString());
    setImagePreview(product.image_url);
    setImageFile(null);
    setShowEditModal(true);
  };

  const resetForm = () => {
    setProductName('');
    setCategory('Meals');
    setBasePrice('');
    setImageFile(null);
    setImagePreview(null);
    setEditingProduct(null);
  };

  if (loading) {
    return (
      <DashboardLayout userName={profile?.full_name || 'Admin'} userRole="admin">
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userName={profile?.full_name || 'Admin'} userRole="admin">
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="px-8 pt-6 pb-4 border-b">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold">Products Management</h1>
            </div>
            <Button onClick={() => setShowAddModal(true)} className="gap-2">
              <PlusIcon className="h-4 w-4" />
              Add Product
            </Button>
          </div>
        </div>

        {/* Products List */}
        <div className="flex-1 p-6 overflow-auto">
          <div className="space-y-4">
            {products.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center text-gray-500">
                  No products yet. Click "Add Product" to create your first product.
                </CardContent>
              </Card>
            ) : (
              products.map((product) => (
                <Card key={product.product_id}>
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <div className="flex gap-4">
                        {product.image_url && (
                          <img
                            src={product.image_url}
                            alt={product.product_name}
                            className="w-16 h-16 object-cover rounded"
                          />
                        )}
                        <div>
                          <CardTitle className="text-xl">{product.product_name}</CardTitle>
                          <div className="flex gap-4 mt-1 text-sm text-muted-foreground">
                            <span className="font-medium">{product.category}</span>
                            <span>Base Price: KSh {product.base_price.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" className="gap-2" onClick={() => openEditModal(product)}>
                        <Edit className="h-4 w-4" />
                        Edit
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-gray-700">Branch Availability:</p>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                        {product.branches.map((branch) => (
                          <button
                            key={branch.branch_id}
                            onClick={() =>
                              handleToggleBranch(
                                product.product_id,
                                branch.branch_id,
                                branch.is_active,
                                branch.has_assignment
                              )
                            }
                            className={`p-3 rounded-lg border-2 transition-all ${
                              branch.is_active
                                ? 'border-green-500 bg-green-50 text-green-900'
                                : branch.has_assignment
                                ? 'border-gray-300 bg-gray-50 text-gray-500'
                                : 'border-dashed border-gray-300 bg-white text-gray-400 hover:border-green-300 hover:bg-green-50'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-bold">{branch.branch_code}</span>
                              {branch.is_active ? (
                                <Check className="h-4 w-4 text-green-600" />
                              ) : branch.has_assignment ? (
                                <X className="h-4 w-4 text-gray-400" />
                              ) : (
                                <PlusIcon className="h-4 w-4 text-gray-400" />
                              )}
                            </div>
                            <div className="text-xs">{branch.branch_name}</div>
                            {branch.local_price && (
                              <div className="text-xs font-medium mt-1">
                                KSh {branch.local_price.toFixed(2)}
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Add Product Modal */}
      {showAddModal && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-50"
            onClick={() => {
              setShowAddModal(false);
              resetForm();
            }}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
              <CardHeader>
                <CardTitle>Add New Product</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAddProduct} className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Product Name *</label>
                    <input
                      type="text"
                      value={productName}
                      onChange={(e) => setProductName(e.target.value)}
                      className="w-full px-4 py-2 border rounded-lg"
                      placeholder="e.g., Chicken Burger"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">Category *</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full px-4 py-2 border rounded-lg"
                    >
                      <option value="Meals">Meals</option>
                      <option value="Drinks&Juices">Drinks & Juices</option>
                      <option value="Specials">Specials</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">Base Price (KSh) *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={basePrice}
                      onChange={(e) => setBasePrice(e.target.value)}
                      className="w-full px-4 py-2 border rounded-lg"
                      placeholder="0.00"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">Product Image</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="w-full px-4 py-2 border rounded-lg"
                      disabled={uploading}
                    />
                    {imagePreview && (
                      <div className="mt-2">
                        <img
                          src={imagePreview}
                          alt="Preview"
                          className="w-32 h-32 object-cover rounded-lg border"
                        />
                      </div>
                    )}
                    {uploading && (
                      <p className="text-sm text-blue-600 mt-2">Uploading image...</p>
                    )}
                  </div>

                  <div className="flex gap-2 justify-end pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setShowAddModal(false);
                        resetForm();
                      }}
                      disabled={submitting}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={submitting} className="gap-2">
                      {submitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        <>
                          <PlusIcon className="h-4 w-4" />
                          Create Product
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </>
      )}
      {/* Edit Product Modal */}
      {showEditModal && editingProduct && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-50"
            onClick={() => {
              setShowEditModal(false);
              resetForm();
            }}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
              <CardHeader>
                <CardTitle>Edit Product</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleEditProduct} className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Product Name *</label>
                    <input
                      type="text"
                      value={productName}
                      onChange={(e) => setProductName(e.target.value)}
                      className="w-full px-4 py-2 border rounded-lg"
                      placeholder="e.g., Chicken Burger"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">Category *</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full px-4 py-2 border rounded-lg"
                    >
                      <option value="Meals">Meals</option>
                      <option value="Drinks&Juices">Drinks & Juices</option>
                      <option value="Specials">Specials</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">Base Price (KSh) *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={basePrice}
                      onChange={(e) => setBasePrice(e.target.value)}
                      className="w-full px-4 py-2 border rounded-lg"
                      placeholder="0.00"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">Product Image</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="w-full px-4 py-2 border rounded-lg"
                      disabled={uploading}
                    />
                    {imagePreview && (
                      <div className="mt-2">
                        <img
                          src={imagePreview}
                          alt="Preview"
                          className="w-32 h-32 object-cover rounded-lg border"
                        />
                      </div>
                    )}
                    {uploading && (
                      <p className="text-sm text-blue-600 mt-2">Uploading image...</p>
                    )}
                  </div>

                  <div className="flex gap-2 justify-end pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setShowEditModal(false);
                        resetForm();
                      }}
                      disabled={submitting}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={submitting} className="gap-2">
                      {submitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Edit className="h-4 w-4" />
                          Save Changes
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </DashboardLayout>
  );
}
