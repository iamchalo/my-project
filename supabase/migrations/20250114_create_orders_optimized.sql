-- =====================================================
-- OPTIMIZED ORDERS SCHEMA - MINIMAL STORAGE
-- =====================================================
-- Optimization strategy:
-- 1. Removed 'status' field (pay-first policy = all orders completed)
-- 2. Removed 'updated_at' (orders never update after creation)
-- 3. Use ENUMs for payment_method (saves ~10 bytes vs TEXT)
-- 4. Use BIGINT for order_number (saves ~17 bytes vs TEXT like 'ORD-20250114-001234')
-- 5. Use SMALLINT for quantity (saves 2 bytes vs INTEGER)
-- 6. Composite primary key for order_items (saves 16 bytes per item)
-- 7. Remove stored subtotal (calculate on the fly: price * quantity)
-- Total savings: ~35 bytes per order + ~18 bytes per order item
-- =====================================================

-- =====================================================
-- DROP OLD TABLES IF THEY EXIST
-- =====================================================
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP SEQUENCE IF EXISTS order_number_seq CASCADE;
DROP FUNCTION IF EXISTS generate_order_number() CASCADE;
DROP FUNCTION IF EXISTS get_orders_by_branch(UUID, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE) CASCADE;
DROP FUNCTION IF EXISTS get_order_details(UUID) CASCADE;

-- Drop old enum/type if it exists
DROP TYPE IF EXISTS payment_method_enum CASCADE;

-- =====================================================
-- CREATE ENUM TYPE FOR PAYMENT METHODS
-- =====================================================
CREATE TYPE payment_method_enum AS ENUM ('cash', 'mpesa');

-- =====================================================
-- CREATE ORDERS TABLE (OPTIMIZED)
-- =====================================================
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number BIGINT UNIQUE NOT NULL,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  cashier_id UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  payment_method payment_method_enum NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL CHECK (total_amount >= 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- CREATE ORDER_ITEMS TABLE (OPTIMIZED)
-- =====================================================
CREATE TABLE order_items (
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  product_price DECIMAL(10, 2) NOT NULL CHECK (product_price >= 0),
  quantity SMALLINT NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (order_id, product_id)
);

-- Create indexes for performance
CREATE INDEX idx_orders_branch_id ON orders(branch_id);
CREATE INDEX idx_orders_cashier_id ON orders(cashier_id);
CREATE INDEX idx_orders_payment_method ON orders(payment_method);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX idx_order_items_product_id ON order_items(product_id);

-- Create sequence for order numbers
CREATE SEQUENCE order_number_seq START 1000;

-- Function to generate sequential order number
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS BIGINT AS $$
BEGIN
  RETURN nextval('order_number_seq');
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES FOR ORDERS
-- =====================================================

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Cashiers: View orders from their branch
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

-- Cashiers: Insert their own orders
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

-- Managers: View and manage all orders in their branch
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

-- Admins: Full access to all orders
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

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- View order items if you can view the parent order
CREATE POLICY "view_order_items_via_order" ON order_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_items.order_id
      AND (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role = 'cashier'
          AND profiles.branch_id = orders.branch_id
        )
        OR
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role = 'manager'
          AND profiles.branch_id = orders.branch_id
        )
        OR
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role IN ('admin', 'superadmin')
        )
      )
    )
  );

-- Cashiers can insert order items for their orders
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
-- ARCHIVAL TABLES AND FUNCTIONS
-- =====================================================

-- Create archive tables (same structure, no RLS for faster access)
CREATE TABLE orders_archive (
  id UUID PRIMARY KEY,
  order_number BIGINT UNIQUE NOT NULL,
  branch_id UUID NOT NULL,
  cashier_id UUID,
  payment_method payment_method_enum NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE,
  archived_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE order_items_archive (
  order_id UUID NOT NULL,
  product_id UUID,
  product_name TEXT NOT NULL,
  product_price DECIMAL(10, 2) NOT NULL,
  quantity SMALLINT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE,
  archived_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (order_id, product_id)
);

-- Create indexes on archive tables
CREATE INDEX idx_orders_archive_branch ON orders_archive(branch_id);
CREATE INDEX idx_orders_archive_created_at ON orders_archive(created_at DESC);

-- Function to archive old orders (default: 12 months)
CREATE OR REPLACE FUNCTION archive_old_orders(months_old INTEGER DEFAULT 12)
RETURNS JSON AS $$
DECLARE
  cutoff_date TIMESTAMP WITH TIME ZONE;
  orders_moved INTEGER;
  items_moved INTEGER;
BEGIN
  cutoff_date := NOW() - (months_old || ' months')::INTERVAL;

  -- Move old orders to archive
  WITH moved_orders AS (
    DELETE FROM orders
    WHERE created_at < cutoff_date
    RETURNING *
  )
  INSERT INTO orders_archive (id, order_number, branch_id, cashier_id, payment_method, total_amount, created_at)
  SELECT id, order_number, branch_id, cashier_id, payment_method, total_amount, created_at
  FROM moved_orders;

  GET DIAGNOSTICS orders_moved = ROW_COUNT;

  -- Move associated order items to archive
  WITH moved_items AS (
    DELETE FROM order_items
    WHERE order_id IN (SELECT id FROM orders_archive)
    AND order_id NOT IN (SELECT id FROM orders)
    RETURNING *
  )
  INSERT INTO order_items_archive (order_id, product_id, product_name, product_price, quantity, created_at)
  SELECT order_id, product_id, product_name, product_price, quantity, created_at
  FROM moved_items;

  GET DIAGNOSTICS items_moved = ROW_COUNT;

  RETURN json_build_object(
    'orders_archived', orders_moved,
    'items_archived', items_moved,
    'cutoff_date', cutoff_date
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Get orders by branch with date filtering
CREATE OR REPLACE FUNCTION get_orders_by_branch(
  target_branch_id UUID,
  start_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  end_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  order_number BIGINT,
  cashier_name TEXT,
  payment_method payment_method_enum,
  total_amount DECIMAL,
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
    o.created_at
  FROM orders o
  JOIN profiles p ON o.cashier_id = p.id
  WHERE o.branch_id = target_branch_id
    AND (start_date IS NULL OR o.created_at >= start_date)
    AND (end_date IS NULL OR o.created_at <= end_date)
  ORDER BY o.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get order details with items (subtotals calculated on the fly)
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
        'created_at', o.created_at
      )
      FROM orders o
      JOIN profiles p ON o.cashier_id = p.id
      WHERE o.id = target_order_id
    ),
    'items', (
      SELECT json_agg(
        json_build_object(
          'product_name', oi.product_name,
          'product_price', oi.product_price,
          'quantity', oi.quantity,
          'subtotal', oi.product_price * oi.quantity
        )
      )
      FROM order_items oi
      WHERE oi.order_id = target_order_id
    )
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get storage statistics
CREATE OR REPLACE FUNCTION get_orders_storage_stats()
RETURNS JSON AS $$
BEGIN
  RETURN json_build_object(
    'active_orders', (SELECT COUNT(*) FROM orders),
    'active_items', (SELECT COUNT(*) FROM order_items),
    'archived_orders', (SELECT COUNT(*) FROM orders_archive),
    'archived_items', (SELECT COUNT(*) FROM order_items_archive),
    'orders_table_size', pg_size_pretty(pg_total_relation_size('orders')),
    'order_items_table_size', pg_size_pretty(pg_total_relation_size('order_items')),
    'archive_size', pg_size_pretty(
      pg_total_relation_size('orders_archive') +
      pg_total_relation_size('order_items_archive')
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- SCHEDULED ARCHIVAL (OPTIONAL - REQUIRES pg_cron)
-- =====================================================
-- Uncomment if you have pg_cron extension enabled:
--
-- SELECT cron.schedule(
--   'archive-old-orders',
--   '0 2 1 * *',  -- Run at 2 AM on the 1st of every month
--   $$ SELECT archive_old_orders(12); $$
-- );

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE orders IS 'Active orders - optimized for fast-food pay-first model (no status needed)';
COMMENT ON COLUMN orders.order_number IS 'Sequential order number (BIGINT) for efficiency';
COMMENT ON COLUMN orders.payment_method IS 'ENUM: cash or mpesa';
COMMENT ON TABLE order_items IS 'Order line items - subtotals calculated on demand to save storage';
COMMENT ON TABLE orders_archive IS 'Archived orders older than 12 months';
COMMENT ON FUNCTION archive_old_orders IS 'Move orders older than X months to archive tables';
COMMENT ON FUNCTION get_orders_storage_stats IS 'Get database size and record counts for monitoring';

-- =====================================================
-- OPTIMIZATION SUMMARY
-- =====================================================
-- Storage saved per order: ~35 bytes
--   - BIGINT order_number vs TEXT: ~17 bytes
--   - ENUM payment_method vs TEXT: ~10 bytes
--   - No status field: ~8 bytes
--   - No updated_at field: ~8 bytes (if it existed)
--
-- Storage saved per order item: ~18 bytes
--   - No UUID id (composite key): ~16 bytes
--   - SMALLINT quantity vs INTEGER: ~2 bytes
--   - No stored subtotal (calculated): ~8 bytes (if it existed)
--
-- Expected data growth:
--   - 100 orders/day = 36,500 orders/year
--   - Average 3 items/order = 109,500 items/year
--   - Active table size (1 year): ~15 MB
--   - With archival: keeps active tables under 20 MB
