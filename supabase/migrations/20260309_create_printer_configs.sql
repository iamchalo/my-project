-- =====================================================
-- CREATE PRINTER CONFIGS TABLE
-- =====================================================
-- Stores the active receipt printer name per branch
-- Used by QZ Tray to auto-print receipts on order save
-- =====================================================

CREATE TABLE IF NOT EXISTS printer_configs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id   UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  printer_name TEXT NOT NULL,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (branch_id)
);

CREATE INDEX idx_printer_configs_branch ON printer_configs(branch_id);

ALTER TABLE printer_configs ENABLE ROW LEVEL SECURITY;

-- Cashiers and managers can read their own branch printer config
CREATE POLICY "branch_users_view_printer_config" ON printer_configs
  FOR SELECT
  USING (branch_id = public.get_my_branch());

-- Admins and superadmins can read all
CREATE POLICY "admins_view_printer_configs" ON printer_configs
  FOR SELECT
  USING (public.get_my_role() IN ('admin', 'superadmin'));

-- Cashiers and managers can upsert their own branch config
CREATE POLICY "branch_users_manage_printer_config" ON printer_configs
  FOR ALL
  USING (
    branch_id = public.get_my_branch()
    AND public.get_my_role() IN ('cashier', 'manager', 'admin', 'superadmin')
  )
  WITH CHECK (
    branch_id = public.get_my_branch()
    AND public.get_my_role() IN ('cashier', 'manager', 'admin', 'superadmin')
  );

CREATE TRIGGER update_printer_configs_updated_at
  BEFORE UPDATE ON printer_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
