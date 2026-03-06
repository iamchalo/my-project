-- =====================================================
-- CREATE PRODUCTS TABLE FOR INVENTORY
-- =====================================================
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('Meals', 'Drinks&Juices', 'Specials')),
  product_price DECIMAL(10, 2) NOT NULL CHECK (product_price >= 0),
  image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_products_branch_id ON products(branch_id);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_is_active ON products(is_active);
CREATE INDEX idx_products_created_by ON products(created_by);

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES FOR PRODUCTS
-- =====================================================

-- Enable RLS on products table
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Cashiers: Can only view active products in their branch
CREATE POLICY "cashiers_view_active_branch_products" ON products
  FOR SELECT
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'cashier'
      AND profiles.branch_id = products.branch_id
    )
  );

-- Managers: Can view and manage all products in their branch
CREATE POLICY "managers_view_branch_products" ON products
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'manager'
      AND profiles.branch_id = products.branch_id
    )
  );

CREATE POLICY "managers_insert_branch_products" ON products
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'manager'
      AND profiles.branch_id = products.branch_id
    )
  );

CREATE POLICY "managers_update_branch_products" ON products
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'manager'
      AND profiles.branch_id = products.branch_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'manager'
      AND profiles.branch_id = products.branch_id
    )
  );

CREATE POLICY "managers_delete_branch_products" ON products
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'manager'
      AND profiles.branch_id = products.branch_id
    )
  );

-- Admins: Can view and manage all products across all branches
CREATE POLICY "admins_view_all_products" ON products
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "admins_manage_all_products" ON products
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- =====================================================
-- TRIGGERS FOR PRODUCTS TABLE
-- =====================================================

-- Trigger to update updated_at timestamp
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- HELPER FUNCTIONS FOR PRODUCTS
-- =====================================================

-- Function to get active products by branch
CREATE OR REPLACE FUNCTION get_active_products_by_branch(target_branch_id UUID)
RETURNS TABLE (
  id UUID,
  product_name TEXT,
  category TEXT,
  product_price DECIMAL,
  image_url TEXT,
  is_active BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.product_name,
    p.category,
    p.product_price,
    p.image_url,
    p.is_active
  FROM products p
  WHERE p.branch_id = target_branch_id
    AND p.is_active = true
  ORDER BY p.category, p.product_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to toggle product active status
CREATE OR REPLACE FUNCTION toggle_product_status(product_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  new_status BOOLEAN;
BEGIN
  UPDATE products
  SET is_active = NOT is_active
  WHERE id = product_id
  RETURNING is_active INTO new_status;

  RETURN new_status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE products IS 'Stores inventory/menu items for each branch';
COMMENT ON COLUMN products.product_name IS 'Name of the product/menu item';
COMMENT ON COLUMN products.category IS 'Category of the product: Meals, Drinks&Juices, or Specials';
COMMENT ON COLUMN products.product_price IS 'Price of the product in currency';
COMMENT ON COLUMN products.image_url IS 'URL to product image';
COMMENT ON COLUMN products.is_active IS 'Whether product is available for ordering';
COMMENT ON COLUMN products.branch_id IS 'Branch this product belongs to';
