-- =====================================================
-- RESTRUCTURE PRODUCTS: CENTRALIZED MANAGEMENT
-- =====================================================
-- This migration converts products from branch-specific to centralized
-- Admin creates products once, then assigns to branches
-- =====================================================

-- =====================================================
-- BACKUP OLD DATA (OPTIONAL - COMMENT OUT IF NOT NEEDED)
-- =====================================================
-- CREATE TABLE products_backup AS SELECT * FROM products;

-- =====================================================
-- DROP OLD TABLES, FUNCTIONS AND DEPENDENCIES
-- =====================================================
DROP TABLE IF EXISTS branch_products CASCADE;
DROP TABLE IF EXISTS products CASCADE;

-- Drop old functions if they exist
DROP FUNCTION IF EXISTS get_branch_products(UUID);
DROP FUNCTION IF EXISTS get_products_with_branches();
DROP FUNCTION IF EXISTS assign_product_to_branch(UUID, UUID, DECIMAL, BOOLEAN);
DROP FUNCTION IF EXISTS toggle_branch_product(UUID, UUID);

-- =====================================================
-- RECREATE STORAGE BUCKET FOR PRODUCT IMAGES
-- =====================================================
-- Delete all objects in the bucket first (to avoid foreign key constraint violation)
DELETE FROM storage.objects WHERE bucket_id = 'product-images';

-- Delete old bucket policies if they exist
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update product images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete product images" ON storage.objects;

-- Delete old bucket if exists
DELETE FROM storage.buckets WHERE id = 'product-images';

-- Create new bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS Policies
-- Anyone can view images (public bucket)
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

-- Only admins can upload images
CREATE POLICY "Admins can upload product images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'product-images'
  AND auth.role() = 'authenticated'
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'superadmin')
  )
);

-- Only admins can update images
CREATE POLICY "Admins can update product images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'product-images'
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'superadmin')
  )
);

-- Only admins can delete images
CREATE POLICY "Admins can delete product images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'product-images'
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'superadmin')
  )
);

-- =====================================================
-- CREATE NEW PRODUCTS TABLE (CENTRALIZED)
-- =====================================================
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_name TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('Meals', 'Drinks&Juices', 'Specials')),
  base_price DECIMAL(10, 2) NOT NULL CHECK (base_price >= 0),
  image_url TEXT,
  description TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_name ON products(product_name);
CREATE INDEX idx_products_created_by ON products(created_by);

-- =====================================================
-- CREATE BRANCH_PRODUCTS JUNCTION TABLE
-- =====================================================
CREATE TABLE branch_products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  local_price DECIMAL(10, 2) CHECK (local_price IS NULL OR local_price >= 0),
  stock_quantity INTEGER DEFAULT 0 CHECK (stock_quantity >= 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(product_id, branch_id)
);

-- Create indexes for performance
CREATE INDEX idx_branch_products_product ON branch_products(product_id);
CREATE INDEX idx_branch_products_branch ON branch_products(branch_id);
CREATE INDEX idx_branch_products_active ON branch_products(is_active);

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES FOR PRODUCTS
-- =====================================================

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Everyone can view products (read-only for non-admins)
CREATE POLICY "users_view_products" ON products
  FOR SELECT
  USING (true);

-- Admins: Can create, update, delete products
CREATE POLICY "admins_insert_products" ON products
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "admins_update_products" ON products
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "admins_delete_products" ON products
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES FOR BRANCH_PRODUCTS
-- =====================================================

ALTER TABLE branch_products ENABLE ROW LEVEL SECURITY;

-- Cashiers: View only active products in their branch
CREATE POLICY "cashiers_view_active_branch_products" ON branch_products
  FOR SELECT
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'cashier'
      AND profiles.branch_id = branch_products.branch_id
    )
  );

-- Managers: View all products in their branch (active and inactive)
CREATE POLICY "managers_view_branch_products" ON branch_products
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'manager'
      AND profiles.branch_id = branch_products.branch_id
    )
  );

-- Admins: Full access to all branch_products
CREATE POLICY "admins_view_all_branch_products" ON branch_products
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "admins_insert_branch_products" ON branch_products
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "admins_update_branch_products" ON branch_products
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "admins_delete_branch_products" ON branch_products
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Update updated_at timestamp for products
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Update updated_at timestamp for branch_products
CREATE TRIGGER update_branch_products_updated_at
  BEFORE UPDATE ON branch_products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Get products available at a specific branch (for cashiers)
CREATE OR REPLACE FUNCTION get_branch_products(target_branch_id UUID)
RETURNS TABLE (
  id UUID,
  product_name TEXT,
  category TEXT,
  product_price DECIMAL,
  image_url TEXT,
  is_active BOOLEAN,
  stock_quantity INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.product_name,
    p.category,
    COALESCE(bp.local_price, p.base_price) as product_price,
    p.image_url,
    bp.is_active,
    bp.stock_quantity
  FROM products p
  JOIN branch_products bp ON bp.product_id = p.id
  WHERE bp.branch_id = target_branch_id
    AND bp.is_active = true
  ORDER BY p.category, p.product_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get all products with branch availability (for admin)
CREATE OR REPLACE FUNCTION get_products_with_branches()
RETURNS TABLE (
  product_id UUID,
  product_name TEXT,
  category TEXT,
  base_price DECIMAL,
  image_url TEXT,
  description TEXT,
  branches JSON
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id as product_id,
    p.product_name,
    p.category,
    p.base_price,
    p.image_url,
    p.description,
    COALESCE(
      json_agg(
        json_build_object(
          'branch_id', b.id,
          'branch_name', b.name,
          'branch_code', b.code,
          'is_active', COALESCE(bp.is_active, false),
          'local_price', bp.local_price,
          'stock_quantity', COALESCE(bp.stock_quantity, 0),
          'has_assignment', (bp.id IS NOT NULL)
        )
        ORDER BY b.name
      ) FILTER (WHERE b.id IS NOT NULL),
      '[]'::json
    ) as branches
  FROM products p
  CROSS JOIN branches b
  LEFT JOIN branch_products bp ON bp.product_id = p.id AND bp.branch_id = b.id
  GROUP BY p.id, p.product_name, p.category, p.base_price, p.image_url, p.description
  ORDER BY p.category, p.product_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Assign product to branch
CREATE OR REPLACE FUNCTION assign_product_to_branch(
  target_product_id UUID,
  target_branch_id UUID,
  price DECIMAL DEFAULT NULL,
  active BOOLEAN DEFAULT true
)
RETURNS UUID AS $$
DECLARE
  assignment_id UUID;
  product_base_price DECIMAL;
BEGIN
  -- Get base price if no local price provided
  IF price IS NULL THEN
    SELECT base_price INTO product_base_price
    FROM products
    WHERE id = target_product_id;
    price := product_base_price;
  END IF;

  -- Insert or update branch_products
  INSERT INTO branch_products (product_id, branch_id, is_active, local_price)
  VALUES (target_product_id, target_branch_id, active, price)
  ON CONFLICT (product_id, branch_id)
  DO UPDATE SET
    is_active = active,
    local_price = price,
    updated_at = NOW()
  RETURNING id INTO assignment_id;

  RETURN assignment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Toggle product activation at branch
CREATE OR REPLACE FUNCTION toggle_branch_product(
  target_product_id UUID,
  target_branch_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  new_status BOOLEAN;
BEGIN
  UPDATE branch_products
  SET is_active = NOT is_active,
      updated_at = NOW()
  WHERE product_id = target_product_id
    AND branch_id = target_branch_id
  RETURNING is_active INTO new_status;

  RETURN new_status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE products IS 'Global product catalog - admin creates products here';
COMMENT ON COLUMN products.product_name IS 'Unique product name across all branches';
COMMENT ON COLUMN products.base_price IS 'Default price - can be overridden per branch';
COMMENT ON COLUMN products.description IS 'Product description or notes';

COMMENT ON TABLE branch_products IS 'Junction table - which products are available at which branches';
COMMENT ON COLUMN branch_products.is_active IS 'Whether product is available at this branch';
COMMENT ON COLUMN branch_products.local_price IS 'Branch-specific price override (NULL = use base_price)';
COMMENT ON COLUMN branch_products.stock_quantity IS 'Current stock at this branch';

COMMENT ON FUNCTION get_branch_products IS 'Get all active products for a specific branch (cashier view)';
COMMENT ON FUNCTION get_products_with_branches IS 'Get all products with their branch availability (admin view)';
COMMENT ON FUNCTION assign_product_to_branch IS 'Assign a product to a branch or update existing assignment';
COMMENT ON FUNCTION toggle_branch_product IS 'Toggle active/inactive status of product at a branch';
