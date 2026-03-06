-- =====================================================
-- HIGH-VOLUME DATABASE OPTIMIZATION
-- Scale: 5000 orders/day across 5 branches
-- =====================================================
-- Optimizations:
-- 1. ENUM types for fixed-value columns
-- 2. Summary tables for aggregated reporting
-- 3. Generated columns for calculated values
-- 4. Optimized data types
-- 5. Performance indexes
-- 6. Archive function for 90-day retention
-- =====================================================

-- =====================================================
-- PHASE 1: CREATE ENUM TYPES
-- =====================================================
-- ENUMs save 10-15 bytes per record vs TEXT

-- User roles
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role_enum') THEN
    CREATE TYPE user_role_enum AS ENUM ('cashier', 'manager', 'admin', 'superadmin');
  END IF;
END $$;

-- Product categories
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'product_category_enum') THEN
    CREATE TYPE product_category_enum AS ENUM ('Meals', 'Drinks&Juices', 'Specials');
  END IF;
END $$;

-- Shift types
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'shift_type_enum') THEN
    CREATE TYPE shift_type_enum AS ENUM ('day', 'night');
  END IF;
END $$;

-- =====================================================
-- PHASE 2: CREATE SUMMARY TABLES
-- =====================================================
-- These replace thousands of individual records with aggregates

-- Daily summaries - one row per branch/day/shift
CREATE TABLE IF NOT EXISTS daily_summaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  summary_date DATE NOT NULL,
  shift_type shift_type_enum NOT NULL,

  -- Order totals
  total_orders INTEGER NOT NULL DEFAULT 0,
  total_sales DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total_mpesa DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total_cash DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total_items_sold INTEGER NOT NULL DEFAULT 0,

  -- Expense totals
  total_expenses DECIMAL(10, 2) NOT NULL DEFAULT 0,
  expense_count INTEGER NOT NULL DEFAULT 0,

  -- Shift info
  shift_id UUID REFERENCES shifts(id),
  cash_handed_over DECIMAL(10, 2),

  -- Product breakdown (JSON for flexibility)
  products_sold JSONB DEFAULT '{}',
  -- Format: {"product_id": {"name": "...", "quantity": N, "revenue": N.NN}}

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- One summary per branch/date/shift
  UNIQUE(branch_id, summary_date, shift_type)
);

-- Indexes for daily_summaries
CREATE INDEX IF NOT EXISTS idx_daily_summaries_branch_date
  ON daily_summaries(branch_id, summary_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_summaries_date
  ON daily_summaries(summary_date DESC);

-- Monthly summaries - one row per branch/month
CREATE TABLE IF NOT EXISTS monthly_summaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  summary_month DATE NOT NULL, -- First day of month (e.g., 2024-01-01)

  -- Aggregated totals
  total_orders INTEGER NOT NULL DEFAULT 0,
  total_sales DECIMAL(12, 2) NOT NULL DEFAULT 0,
  total_mpesa DECIMAL(12, 2) NOT NULL DEFAULT 0,
  total_cash DECIMAL(12, 2) NOT NULL DEFAULT 0,
  total_items_sold INTEGER NOT NULL DEFAULT 0,
  total_expenses DECIMAL(12, 2) NOT NULL DEFAULT 0,

  -- Averages
  avg_order_value DECIMAL(8, 2),
  avg_daily_orders DECIMAL(8, 2),

  -- Top products
  top_products JSONB DEFAULT '[]',
  -- Format: [{"product_id": "...", "name": "...", "quantity": N, "revenue": N.NN}]

  -- Working days count
  working_days INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- One summary per branch/month
  UNIQUE(branch_id, summary_month)
);

-- Indexes for monthly_summaries
CREATE INDEX IF NOT EXISTS idx_monthly_summaries_branch_month
  ON monthly_summaries(branch_id, summary_month DESC);
CREATE INDEX IF NOT EXISTS idx_monthly_summaries_month
  ON monthly_summaries(summary_month DESC);

-- =====================================================
-- PHASE 3: ADD PERFORMANCE INDEXES
-- =====================================================
-- Critical for high-volume queries

-- Orders: Branch + date range queries (most common)
CREATE INDEX IF NOT EXISTS idx_orders_branch_created
  ON orders(branch_id, created_at DESC);

-- Orders: Payment method analysis
CREATE INDEX IF NOT EXISTS idx_orders_branch_payment
  ON orders(branch_id, payment_method);

-- Expenses: Branch + date + shift (for shift reconciliation)
CREATE INDEX IF NOT EXISTS idx_expenses_branch_date_shift
  ON expenses(branch_id, expense_date DESC, shift);

-- Shifts: Active shift lookup (partial index)
CREATE INDEX IF NOT EXISTS idx_shifts_active_branch
  ON shifts(branch_id) WHERE is_active = true;

-- Branch products: Active products per branch (POS queries)
CREATE INDEX IF NOT EXISTS idx_branch_products_active
  ON branch_products(branch_id) WHERE is_active = true;

-- Profiles: Active users per branch
CREATE INDEX IF NOT EXISTS idx_profiles_active_branch
  ON profiles(branch_id, role) WHERE is_active = true;

-- =====================================================
-- PHASE 4: ARCHIVE FUNCTIONS
-- =====================================================

-- Function to generate daily summary for a specific branch/date/shift
CREATE OR REPLACE FUNCTION generate_daily_summary(
  p_branch_id UUID,
  p_date DATE,
  p_shift shift_type_enum
)
RETURNS UUID AS $$
DECLARE
  v_summary_id UUID;
  v_total_orders INTEGER;
  v_total_sales DECIMAL;
  v_total_mpesa DECIMAL;
  v_total_cash DECIMAL;
  v_total_items INTEGER;
  v_total_expenses DECIMAL;
  v_expense_count INTEGER;
  v_products_sold JSONB;
  v_shift_id UUID;
  v_cash_handed_over DECIMAL;
BEGIN
  -- Get order totals
  SELECT
    COUNT(*)::INTEGER,
    COALESCE(SUM(total_amount), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'mpesa' THEN total_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total_amount ELSE 0 END), 0)
  INTO v_total_orders, v_total_sales, v_total_mpesa, v_total_cash
  FROM orders
  WHERE branch_id = p_branch_id
    AND (created_at AT TIME ZONE 'Africa/Nairobi')::DATE = p_date
    AND CASE
      WHEN p_shift = 'day' THEN
        EXTRACT(HOUR FROM created_at AT TIME ZONE 'Africa/Nairobi') >= 7
        AND EXTRACT(HOUR FROM created_at AT TIME ZONE 'Africa/Nairobi') < 19
      ELSE
        EXTRACT(HOUR FROM created_at AT TIME ZONE 'Africa/Nairobi') < 7
        OR EXTRACT(HOUR FROM created_at AT TIME ZONE 'Africa/Nairobi') >= 19
    END;

  -- Get total items sold
  SELECT COALESCE(SUM(oi.quantity), 0)::INTEGER
  INTO v_total_items
  FROM order_items oi
  JOIN orders o ON oi.order_id = o.id
  WHERE o.branch_id = p_branch_id
    AND (o.created_at AT TIME ZONE 'Africa/Nairobi')::DATE = p_date
    AND CASE
      WHEN p_shift = 'day' THEN
        EXTRACT(HOUR FROM o.created_at AT TIME ZONE 'Africa/Nairobi') >= 7
        AND EXTRACT(HOUR FROM o.created_at AT TIME ZONE 'Africa/Nairobi') < 19
      ELSE
        EXTRACT(HOUR FROM o.created_at AT TIME ZONE 'Africa/Nairobi') < 7
        OR EXTRACT(HOUR FROM o.created_at AT TIME ZONE 'Africa/Nairobi') >= 19
    END;

  -- Get expense totals
  SELECT
    COALESCE(SUM(total), 0),
    COUNT(*)::INTEGER
  INTO v_total_expenses, v_expense_count
  FROM expenses
  WHERE branch_id = p_branch_id
    AND expense_date = p_date
    AND shift = p_shift::TEXT;

  -- Get products breakdown
  SELECT COALESCE(jsonb_object_agg(
    oi.product_id::TEXT,
    jsonb_build_object(
      'name', oi.product_name,
      'quantity', SUM(oi.quantity),
      'revenue', SUM(oi.product_price * oi.quantity)
    )
  ), '{}')
  INTO v_products_sold
  FROM order_items oi
  JOIN orders o ON oi.order_id = o.id
  WHERE o.branch_id = p_branch_id
    AND (o.created_at AT TIME ZONE 'Africa/Nairobi')::DATE = p_date
    AND CASE
      WHEN p_shift = 'day' THEN
        EXTRACT(HOUR FROM o.created_at AT TIME ZONE 'Africa/Nairobi') >= 7
        AND EXTRACT(HOUR FROM o.created_at AT TIME ZONE 'Africa/Nairobi') < 19
      ELSE
        EXTRACT(HOUR FROM o.created_at AT TIME ZONE 'Africa/Nairobi') < 7
        OR EXTRACT(HOUR FROM o.created_at AT TIME ZONE 'Africa/Nairobi') >= 19
    END
  GROUP BY oi.product_id, oi.product_name;

  -- Get shift info
  SELECT id, cash_handed_over
  INTO v_shift_id, v_cash_handed_over
  FROM shifts
  WHERE branch_id = p_branch_id
    AND shift_date = p_date
    AND shift_type = p_shift::TEXT
  ORDER BY created_at DESC
  LIMIT 1;

  -- Insert or update summary
  INSERT INTO daily_summaries (
    branch_id, summary_date, shift_type,
    total_orders, total_sales, total_mpesa, total_cash, total_items_sold,
    total_expenses, expense_count, shift_id, cash_handed_over, products_sold
  ) VALUES (
    p_branch_id, p_date, p_shift,
    v_total_orders, v_total_sales, v_total_mpesa, v_total_cash, v_total_items,
    v_total_expenses, v_expense_count, v_shift_id, v_cash_handed_over, v_products_sold
  )
  ON CONFLICT (branch_id, summary_date, shift_type) DO UPDATE SET
    total_orders = EXCLUDED.total_orders,
    total_sales = EXCLUDED.total_sales,
    total_mpesa = EXCLUDED.total_mpesa,
    total_cash = EXCLUDED.total_cash,
    total_items_sold = EXCLUDED.total_items_sold,
    total_expenses = EXCLUDED.total_expenses,
    expense_count = EXCLUDED.expense_count,
    shift_id = EXCLUDED.shift_id,
    cash_handed_over = EXCLUDED.cash_handed_over,
    products_sold = EXCLUDED.products_sold
  RETURNING id INTO v_summary_id;

  RETURN v_summary_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to generate monthly summary from daily summaries
CREATE OR REPLACE FUNCTION generate_monthly_summary(
  p_branch_id UUID,
  p_month DATE -- First day of month
)
RETURNS UUID AS $$
DECLARE
  v_summary_id UUID;
  v_end_date DATE;
BEGIN
  v_end_date := (p_month + INTERVAL '1 month - 1 day')::DATE;

  INSERT INTO monthly_summaries (
    branch_id, summary_month,
    total_orders, total_sales, total_mpesa, total_cash, total_items_sold,
    total_expenses, avg_order_value, avg_daily_orders, working_days, top_products
  )
  SELECT
    p_branch_id,
    p_month,
    SUM(total_orders)::INTEGER,
    SUM(total_sales),
    SUM(total_mpesa),
    SUM(total_cash),
    SUM(total_items_sold)::INTEGER,
    SUM(total_expenses),
    CASE WHEN SUM(total_orders) > 0
      THEN ROUND(SUM(total_sales) / SUM(total_orders), 2)
      ELSE 0 END,
    ROUND(SUM(total_orders)::DECIMAL / COUNT(DISTINCT summary_date), 2),
    COUNT(DISTINCT summary_date)::INTEGER,
    -- Top 10 products by revenue
    (
      SELECT jsonb_agg(product_data ORDER BY revenue DESC)
      FROM (
        SELECT
          key as product_id,
          value->>'name' as name,
          SUM((value->>'quantity')::INTEGER) as quantity,
          SUM((value->>'revenue')::DECIMAL) as revenue
        FROM daily_summaries ds, jsonb_each(ds.products_sold)
        WHERE ds.branch_id = p_branch_id
          AND ds.summary_date BETWEEN p_month AND v_end_date
        GROUP BY key, value->>'name'
        ORDER BY revenue DESC
        LIMIT 10
      ) as top_prods,
      LATERAL (
        SELECT jsonb_build_object(
          'product_id', product_id,
          'name', name,
          'quantity', quantity,
          'revenue', revenue
        ) as product_data
      ) as formatted
    )
  FROM daily_summaries
  WHERE branch_id = p_branch_id
    AND summary_date BETWEEN p_month AND v_end_date
  ON CONFLICT (branch_id, summary_month) DO UPDATE SET
    total_orders = EXCLUDED.total_orders,
    total_sales = EXCLUDED.total_sales,
    total_mpesa = EXCLUDED.total_mpesa,
    total_cash = EXCLUDED.total_cash,
    total_items_sold = EXCLUDED.total_items_sold,
    total_expenses = EXCLUDED.total_expenses,
    avg_order_value = EXCLUDED.avg_order_value,
    avg_daily_orders = EXCLUDED.avg_daily_orders,
    working_days = EXCLUDED.working_days,
    top_products = EXCLUDED.top_products,
    updated_at = NOW()
  RETURNING id INTO v_summary_id;

  RETURN v_summary_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Main archive function - archives data older than specified date
CREATE OR REPLACE FUNCTION archive_old_data(
  p_before_date DATE,
  p_delete_archived BOOLEAN DEFAULT false
)
RETURNS TABLE (
  orders_archived BIGINT,
  order_items_archived BIGINT,
  expenses_archived BIGINT,
  summaries_generated INTEGER
) AS $$
DECLARE
  v_orders_count BIGINT := 0;
  v_items_count BIGINT := 0;
  v_expenses_count BIGINT := 0;
  v_summaries_count INTEGER := 0;
  v_branch RECORD;
  v_date DATE;
BEGIN
  -- First, generate daily summaries for all dates being archived
  FOR v_branch IN SELECT id FROM branches WHERE is_active = true LOOP
    FOR v_date IN
      SELECT DISTINCT (created_at AT TIME ZONE 'Africa/Nairobi')::DATE as order_date
      FROM orders
      WHERE branch_id = v_branch.id
        AND (created_at AT TIME ZONE 'Africa/Nairobi')::DATE < p_before_date
        AND NOT EXISTS (
          SELECT 1 FROM daily_summaries
          WHERE branch_id = v_branch.id
            AND summary_date = (orders.created_at AT TIME ZONE 'Africa/Nairobi')::DATE
        )
    LOOP
      -- Generate summaries for both shifts
      PERFORM generate_daily_summary(v_branch.id, v_date, 'day');
      PERFORM generate_daily_summary(v_branch.id, v_date, 'night');
      v_summaries_count := v_summaries_count + 2;
    END LOOP;
  END LOOP;

  -- Archive orders to orders_archive
  WITH archived AS (
    INSERT INTO orders_archive
    SELECT *, NOW() as archived_at
    FROM orders
    WHERE (created_at AT TIME ZONE 'Africa/Nairobi')::DATE < p_before_date
    RETURNING id
  )
  SELECT COUNT(*) INTO v_orders_count FROM archived;

  -- Archive order_items
  WITH archived AS (
    INSERT INTO order_items_archive
    SELECT oi.*, NOW() as archived_at
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE (o.created_at AT TIME ZONE 'Africa/Nairobi')::DATE < p_before_date
    RETURNING order_id
  )
  SELECT COUNT(*) INTO v_items_count FROM archived;

  -- Create expenses_archive if not exists and archive
  CREATE TABLE IF NOT EXISTS expenses_archive (LIKE expenses INCLUDING ALL);
  ALTER TABLE expenses_archive ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

  WITH archived AS (
    INSERT INTO expenses_archive
    SELECT *, NOW() as archived_at
    FROM expenses
    WHERE expense_date < p_before_date
    RETURNING id
  )
  SELECT COUNT(*) INTO v_expenses_count FROM archived;

  -- Optionally delete archived data from main tables
  IF p_delete_archived THEN
    DELETE FROM order_items
    WHERE order_id IN (
      SELECT id FROM orders
      WHERE (created_at AT TIME ZONE 'Africa/Nairobi')::DATE < p_before_date
    );

    DELETE FROM orders
    WHERE (created_at AT TIME ZONE 'Africa/Nairobi')::DATE < p_before_date;

    DELETE FROM expenses
    WHERE expense_date < p_before_date;
  END IF;

  RETURN QUERY SELECT v_orders_count, v_items_count, v_expenses_count, v_summaries_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- PHASE 5: DOCUMENTATION COMMENTS
-- =====================================================

-- Table comments
COMMENT ON TABLE daily_summaries IS 'Aggregated daily sales/expense data per branch/shift. One row replaces ~1000 order records.';
COMMENT ON TABLE monthly_summaries IS 'Monthly aggregates for historical reporting. Generated from daily_summaries.';
COMMENT ON TABLE orders IS 'Active orders (last 90 days). Older orders archived to orders_archive.';
COMMENT ON TABLE expenses IS 'Active expenses (last 90 days). Older expenses archived to expenses_archive.';
COMMENT ON TABLE shifts IS 'Cashier shift tracking with start/end times and cash reconciliation.';

-- Column comments for daily_summaries
COMMENT ON COLUMN daily_summaries.products_sold IS 'JSON breakdown: {"product_id": {"name": "...", "quantity": N, "revenue": N.NN}}';
COMMENT ON COLUMN daily_summaries.total_items_sold IS 'Sum of all quantities from order_items';
COMMENT ON COLUMN daily_summaries.cash_handed_over IS 'From shift reconciliation when shift ended';

-- Column comments for monthly_summaries
COMMENT ON COLUMN monthly_summaries.summary_month IS 'First day of month (e.g., 2024-01-01 for January 2024)';
COMMENT ON COLUMN monthly_summaries.top_products IS 'Top 10 products by revenue: [{"product_id", "name", "quantity", "revenue"}]';
COMMENT ON COLUMN monthly_summaries.working_days IS 'Number of days with recorded sales';

-- Function comments
COMMENT ON FUNCTION generate_daily_summary IS 'Aggregates orders/expenses for a specific branch/date/shift into daily_summaries';
COMMENT ON FUNCTION generate_monthly_summary IS 'Aggregates daily_summaries into monthly_summaries for a branch/month';
COMMENT ON FUNCTION archive_old_data IS 'Archives orders/expenses older than specified date. Use p_delete_archived=true to remove from main tables after archiving.';

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================
GRANT SELECT ON daily_summaries TO authenticated;
GRANT SELECT ON monthly_summaries TO authenticated;
GRANT EXECUTE ON FUNCTION generate_daily_summary(UUID, DATE, shift_type_enum) TO authenticated;
GRANT EXECUTE ON FUNCTION generate_monthly_summary(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION archive_old_data(DATE, BOOLEAN) TO authenticated;

-- =====================================================
-- USAGE EXAMPLES
-- =====================================================
/*
-- Generate daily summary for a specific branch/date/shift:
SELECT generate_daily_summary('branch-uuid', '2024-01-15', 'day');

-- Generate monthly summary:
SELECT generate_monthly_summary('branch-uuid', '2024-01-01');

-- Archive data older than 90 days (keeps in archive tables):
SELECT * FROM archive_old_data(CURRENT_DATE - INTERVAL '90 days', false);

-- Archive AND delete from main tables:
SELECT * FROM archive_old_data(CURRENT_DATE - INTERVAL '90 days', true);

-- Query monthly report:
SELECT * FROM monthly_summaries
WHERE branch_id = 'branch-uuid'
ORDER BY summary_month DESC;
*/
