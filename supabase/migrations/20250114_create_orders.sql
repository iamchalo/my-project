-- =====================================================
-- CREATE ORDERS TABLE
-- =====================================================
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number TEXT UNIQUE NOT NULL,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  cashier_id UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'mpesa')),
  total_amount DECIMAL(10, 2) NOT NULL CHECK (total_amount >= 0),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- CREATE ORDER_ITEMS TABLE (JUNCTION TABLE)
-- =====================================================
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  product_price DECIMAL(10, 2) NOT NULL CHECK (product_price >= 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  subtotal DECIMAL(10, 2) NOT NULL CHECK (subtotal >= 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_orders_branch_id ON orders(branch_id);
CREATE INDEX idx_orders_cashier_id ON orders(cashier_id);
CREATE INDEX idx_orders_payment_method ON orders(payment_method);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_product_id ON order_items(product_id);

-- Create sequence for order numbers
CREATE SEQUENCE order_number_seq START 1000;

-- Function to generate order number
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TEXT AS $$
DECLARE
  next_val INTEGER;
  order_num TEXT;
BEGIN
  next_val := nextval('order_number_seq');
  order_num := 'ORD-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(next_val::TEXT, 6, '0');
  RETURN order_num;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES FOR ORDERS
-- =====================================================

-- Enable RLS on orders table
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Cashiers: Can view orders from their branch and insert their own orders
CREATE POLICY "cashiers_view_branch_orders" ON orders
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'cashier'
      AND profiles.branch_id = orders.branch_id
    )
  );

CREATE POLICY "cashiers_insert_own_orders" ON orders
  FOR INSERT
  WITH CHECK (
    cashier_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'cashier'
      AND profiles.branch_id = orders.branch_id
    )
  );

-- Managers: Can view and manage all orders in their branch
CREATE POLICY "managers_view_branch_orders" ON orders
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'manager'
      AND profiles.branch_id = orders.branch_id
    )
  );

CREATE POLICY "managers_update_branch_orders" ON orders
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'manager'
      AND profiles.branch_id = orders.branch_id
    )
  );

-- Admins: Can view and manage all orders across all branches
CREATE POLICY "admins_view_all_orders" ON orders
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "admins_manage_all_orders" ON orders
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES FOR ORDER_ITEMS
-- =====================================================

-- Enable RLS on order_items table
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- Users can view order items if they can view the parent order
CREATE POLICY "view_order_items_via_order" ON order_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_items.order_id
      AND (
        -- Cashiers can see their branch orders
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role = 'cashier'
          AND profiles.branch_id = orders.branch_id
        )
        OR
        -- Managers can see their branch orders
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role = 'manager'
          AND profiles.branch_id = orders.branch_id
        )
        OR
        -- Admins can see all orders
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role IN ('admin', 'superadmin')
        )
      )
    )
  );

-- Cashiers can insert order items for orders they created
CREATE POLICY "cashiers_insert_order_items" ON order_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_items.order_id
      AND orders.cashier_id = auth.uid()
    )
  );

-- Admins can manage all order items
CREATE POLICY "admins_manage_all_order_items" ON order_items
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- =====================================================
-- TRIGGERS FOR ORDERS TABLE
-- =====================================================

-- Trigger to update updated_at timestamp
CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- HELPER FUNCTIONS FOR ORDERS
-- =====================================================

-- Function to get orders by branch with statistics
CREATE OR REPLACE FUNCTION get_orders_by_branch(
  target_branch_id UUID,
  start_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  end_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  order_number TEXT,
  cashier_name TEXT,
  payment_method TEXT,
  total_amount DECIMAL,
  status TEXT,
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.order_number,
    p.full_name as cashier_name,
    o.payment_method,
    o.total_amount,
    o.status,
    o.created_at
  FROM orders o
  JOIN profiles p ON o.cashier_id = p.id
  WHERE o.branch_id = target_branch_id
    AND (start_date IS NULL OR o.created_at >= start_date)
    AND (end_date IS NULL OR o.created_at <= end_date)
  ORDER BY o.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get order details with items
CREATE OR REPLACE FUNCTION get_order_details(target_order_id UUID)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'order', (
      SELECT json_build_object(
        'id', o.id,
        'order_number', o.order_number,
        'branch_id', o.branch_id,
        'cashier_id', o.cashier_id,
        'cashier_name', p.full_name,
        'payment_method', o.payment_method,
        'total_amount', o.total_amount,
        'status', o.status,
        'created_at', o.created_at
      )
      FROM orders o
      JOIN profiles p ON o.cashier_id = p.id
      WHERE o.id = target_order_id
    ),
    'items', (
      SELECT json_agg(
        json_build_object(
          'id', oi.id,
          'product_name', oi.product_name,
          'product_price', oi.product_price,
          'quantity', oi.quantity,
          'subtotal', oi.subtotal
        )
      )
      FROM order_items oi
      WHERE oi.order_id = target_order_id
    )
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE orders IS 'Stores all orders placed at branches';
COMMENT ON COLUMN orders.order_number IS 'Unique order number for tracking';
COMMENT ON COLUMN orders.branch_id IS 'Branch where order was placed';
COMMENT ON COLUMN orders.cashier_id IS 'Cashier who processed the order';
COMMENT ON COLUMN orders.payment_method IS 'Payment method used: cash or mpesa';
COMMENT ON COLUMN orders.total_amount IS 'Total amount of the order';
COMMENT ON COLUMN orders.status IS 'Order status: pending, completed, or cancelled';

COMMENT ON TABLE order_items IS 'Stores individual items in each order';
COMMENT ON COLUMN order_items.order_id IS 'Reference to parent order';
COMMENT ON COLUMN order_items.product_id IS 'Reference to product (nullable for historical data)';
COMMENT ON COLUMN order_items.product_name IS 'Product name at time of order';
COMMENT ON COLUMN order_items.product_price IS 'Product price at time of order';
COMMENT ON COLUMN order_items.quantity IS 'Quantity ordered';
COMMENT ON COLUMN order_items.subtotal IS 'Subtotal for this item (price * quantity)';
