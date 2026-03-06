-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. CREATE BRANCHES TABLE
-- =====================================================
CREATE TABLE branches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,
  code TEXT UNIQUE NOT NULL,
  address TEXT,
  phone TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert the 5 branches
INSERT INTO branches (name, code) VALUES
  ('KFries', 'KFRIES'),
  ('BeFries', 'BEFRIES'),
  ('StageBeFries', 'STAGEBEFRIES'),
  ('MigFries', 'MIGFRIES'),
  ('LFries', 'LFRIES');

-- =====================================================
-- 2. CREATE USERS/PROFILES TABLE
-- =====================================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('cashier', 'manager', 'admin', 'superadmin')),
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  avatar_url TEXT,
  phone TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Constraint: cashiers and managers MUST have a branch
  CONSTRAINT role_branch_constraint CHECK (
    (role IN ('cashier', 'manager') AND branch_id IS NOT NULL) OR
    (role IN ('admin', 'superadmin'))
  )
);

-- Create indexes for performance
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_branch_id ON profiles(branch_id);
CREATE INDEX idx_profiles_email ON profiles(email);

-- =====================================================
-- 3. ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on branches table
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

-- Enable RLS on profiles table
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- BRANCHES TABLE POLICIES
-- =====================================================

-- Cashiers and Managers: Can only view their own branch
CREATE POLICY "cashiers_managers_view_own_branch" ON branches
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.branch_id = branches.id
      AND profiles.role IN ('cashier', 'manager')
    )
  );

-- Admins and Superadmins: Can view all branches
CREATE POLICY "admins_view_all_branches" ON branches
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- Only Superadmins can insert/update/delete branches
CREATE POLICY "superadmins_manage_branches" ON branches
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'superadmin'
    )
  );

-- =====================================================
-- PROFILES TABLE POLICIES
-- =====================================================

-- Cashiers: Can only view their own profile and other cashiers in their branch
CREATE POLICY "cashiers_view_own_and_branch_cashiers" ON profiles
  FOR SELECT
  USING (
    auth.uid() = id OR
    (
      EXISTS (
        SELECT 1 FROM profiles AS p
        WHERE p.id = auth.uid()
        AND p.role = 'cashier'
        AND p.branch_id = profiles.branch_id
        AND profiles.role = 'cashier'
      )
    )
  );

-- Managers: Can view all users in their branch
CREATE POLICY "managers_view_branch_users" ON profiles
  FOR SELECT
  USING (
    auth.uid() = id OR
    (
      EXISTS (
        SELECT 1 FROM profiles AS p
        WHERE p.id = auth.uid()
        AND p.role = 'manager'
        AND p.branch_id = profiles.branch_id
      )
    )
  );

-- Admins: Can view all users except superadmins
CREATE POLICY "admins_view_all_non_superadmins" ON profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles AS p
      WHERE p.id = auth.uid()
      AND p.role = 'admin'
    )
    AND profiles.role != 'superadmin'
  );

-- Superadmins: Can view all users
CREATE POLICY "superadmins_view_all_users" ON profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'superadmin'
    )
  );

-- Cashiers: Can only update their own profile (limited fields)
CREATE POLICY "cashiers_update_own_profile" ON profiles
  FOR UPDATE
  USING (auth.uid() = id AND role = 'cashier')
  WITH CHECK (
    auth.uid() = id
    AND role = 'cashier'
    AND branch_id = (SELECT branch_id FROM profiles WHERE id = auth.uid())
  );

-- Managers: Can update their own profile and cashiers in their branch
CREATE POLICY "managers_update_branch_cashiers" ON profiles
  FOR UPDATE
  USING (
    auth.uid() = id OR
    (
      EXISTS (
        SELECT 1 FROM profiles AS p
        WHERE p.id = auth.uid()
        AND p.role = 'manager'
        AND p.branch_id = profiles.branch_id
      )
      AND profiles.role = 'cashier'
    )
  )
  WITH CHECK (
    (auth.uid() = id) OR
    (
      EXISTS (
        SELECT 1 FROM profiles AS p
        WHERE p.id = auth.uid()
        AND p.role = 'manager'
        AND p.branch_id = profiles.branch_id
      )
      AND profiles.role = 'cashier'
      AND profiles.branch_id = (SELECT branch_id FROM profiles WHERE id = auth.uid())
    )
  );

-- Admins: Can insert/update/delete cashiers and managers (including changing branches)
CREATE POLICY "admins_manage_cashiers_managers" ON profiles
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles AS p
      WHERE p.id = auth.uid()
      AND p.role = 'admin'
    )
    AND profiles.role IN ('cashier', 'manager')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles AS p
      WHERE p.id = auth.uid()
      AND p.role = 'admin'
    )
    AND profiles.role IN ('cashier', 'manager')
  );

-- Superadmins: Full access to all profiles
CREATE POLICY "superadmins_manage_all_users" ON profiles
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'superadmin'
    )
  );

-- =====================================================
-- 4. FUNCTIONS AND TRIGGERS
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for branches table
CREATE TRIGGER update_branches_updated_at
  BEFORE UPDATE ON branches
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for profiles table
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically create profile when user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, branch_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'cashier'),
    (NEW.raw_user_meta_data->>'branch_id')::UUID
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- =====================================================
-- 5. HELPER FUNCTIONS
-- =====================================================

-- Function to get user's role
CREATE OR REPLACE FUNCTION get_user_role(user_id UUID)
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = user_id;
$$ LANGUAGE sql SECURITY DEFINER;

-- Function to get user's branch
CREATE OR REPLACE FUNCTION get_user_branch(user_id UUID)
RETURNS UUID AS $$
  SELECT branch_id FROM profiles WHERE id = user_id;
$$ LANGUAGE sql SECURITY DEFINER;

-- Function to check if user can access branch
CREATE OR REPLACE FUNCTION can_access_branch(user_id UUID, target_branch_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
  user_branch UUID;
BEGIN
  SELECT role, branch_id INTO user_role, user_branch
  FROM profiles WHERE id = user_id;

  -- Admins and superadmins can access all branches
  IF user_role IN ('admin', 'superadmin') THEN
    RETURN TRUE;
  END IF;

  -- Cashiers and managers can only access their own branch
  IF user_role IN ('cashier', 'manager') THEN
    RETURN user_branch = target_branch_id;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE branches IS 'Stores all branch locations';
COMMENT ON TABLE profiles IS 'User profiles with roles and branch assignments';
COMMENT ON COLUMN profiles.role IS 'User role: cashier, manager, admin, or superadmin';
COMMENT ON COLUMN profiles.branch_id IS 'Required for cashiers and managers, NULL for admins/superadmins';
