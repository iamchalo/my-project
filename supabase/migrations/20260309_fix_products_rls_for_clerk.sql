-- =====================================================
-- FIX PRODUCTS & STORAGE RLS TO USE JWT CLAIMS (CLERK)
-- =====================================================
-- Products table RLS was using profiles.id = auth.uid()
-- With Clerk auth, auth.uid() returns the Clerk user ID (not the Supabase UUID)
-- Fix: use get_my_role() which reads role directly from JWT claims
-- (same approach already applied to profiles table)
-- =====================================================

-- Drop old products policies
DROP POLICY IF EXISTS "admins_insert_products" ON products;
DROP POLICY IF EXISTS "admins_update_products" ON products;
DROP POLICY IF EXISTS "admins_delete_products" ON products;

-- Recreate using JWT claim helper
CREATE POLICY "admins_insert_products" ON products
  FOR INSERT
  WITH CHECK (public.get_my_role() IN ('admin', 'superadmin'));

CREATE POLICY "admins_update_products" ON products
  FOR UPDATE
  USING (public.get_my_role() IN ('admin', 'superadmin'));

CREATE POLICY "admins_delete_products" ON products
  FOR DELETE
  USING (public.get_my_role() IN ('admin', 'superadmin'));

-- Drop old branch_products policies
DROP POLICY IF EXISTS "admins_insert_branch_products" ON branch_products;
DROP POLICY IF EXISTS "admins_update_branch_products" ON branch_products;
DROP POLICY IF EXISTS "admins_delete_branch_products" ON branch_products;
DROP POLICY IF EXISTS "admins_view_all_branch_products" ON branch_products;
DROP POLICY IF EXISTS "cashiers_view_active_branch_products" ON branch_products;
DROP POLICY IF EXISTS "managers_view_branch_products" ON branch_products;

-- Recreate branch_products policies using JWT claims
CREATE POLICY "cashiers_view_active_branch_products" ON branch_products
  FOR SELECT
  USING (
    is_active = true
    AND public.get_my_role() = 'cashier'
    AND branch_id = public.get_my_branch()
  );

CREATE POLICY "managers_view_branch_products" ON branch_products
  FOR SELECT
  USING (
    public.get_my_role() = 'manager'
    AND branch_id = public.get_my_branch()
  );

CREATE POLICY "admins_view_all_branch_products" ON branch_products
  FOR SELECT
  USING (public.get_my_role() IN ('admin', 'superadmin'));

CREATE POLICY "admins_insert_branch_products" ON branch_products
  FOR INSERT
  WITH CHECK (public.get_my_role() IN ('admin', 'superadmin'));

CREATE POLICY "admins_update_branch_products" ON branch_products
  FOR UPDATE
  USING (public.get_my_role() IN ('admin', 'superadmin'));

CREATE POLICY "admins_delete_branch_products" ON branch_products
  FOR DELETE
  USING (public.get_my_role() IN ('admin', 'superadmin'));

-- Drop old storage policies
DROP POLICY IF EXISTS "Admins can upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update product images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete product images" ON storage.objects;

-- Recreate storage policies using JWT claims
CREATE POLICY "Admins can upload product images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'product-images'
  AND auth.role() = 'authenticated'
  AND public.get_my_role() IN ('admin', 'superadmin')
);

CREATE POLICY "Admins can update product images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'product-images'
  AND public.get_my_role() IN ('admin', 'superadmin')
);

CREATE POLICY "Admins can delete product images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'product-images'
  AND public.get_my_role() IN ('admin', 'superadmin')
);
