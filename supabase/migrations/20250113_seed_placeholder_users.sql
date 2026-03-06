-- =====================================================
-- SEED PLACEHOLDER USERS FOR TESTING
-- =====================================================
-- This migration creates 4 test users (one for each role)
-- that can be used for database testing and development.
--
-- Users created:
-- 1. Cashier:    cashier@kfries.com / password123
-- 2. Manager:    manager@kfries.com / password123
-- 3. Admin:      admin@company.com / password123
-- 4. Superadmin: superadmin@company.com / password123
-- =====================================================

-- Enable pgcrypto for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Get the KFries branch ID (for cashier and manager)
DO $$
DECLARE
  v_kfries_branch_id UUID;
  v_cashier_id UUID := '00000000-0000-0000-0000-000000000001';
  v_manager_id UUID := '00000000-0000-0000-0000-000000000002';
  v_admin_id UUID := '00000000-0000-0000-0000-000000000003';
  v_superadmin_id UUID := '00000000-0000-0000-0000-000000000004';
BEGIN
  -- Get KFries branch ID
  SELECT id INTO v_kfries_branch_id FROM branches WHERE code = 'KFRIES';

  IF v_kfries_branch_id IS NULL THEN
    RAISE EXCEPTION 'KFries branch not found. Please run the branches migration first.';
  END IF;

  -- Insert Cashier user
  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_user_meta_data,
    created_at,
    updated_at,
    aud,
    role
  ) VALUES (
    v_cashier_id,
    '00000000-0000-0000-0000-000000000000',
    'cashier@kfries.com',
    crypt('password123', gen_salt('bf')),
    NOW(),
    jsonb_build_object(
      'full_name', 'John Cashier',
      'role', 'cashier',
      'branch_id', v_kfries_branch_id::text
    ),
    NOW(),
    NOW(),
    'authenticated',
    'authenticated'
  );

  -- Insert Manager user
  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_user_meta_data,
    created_at,
    updated_at,
    aud,
    role
  ) VALUES (
    v_manager_id,
    '00000000-0000-0000-0000-000000000000',
    'manager@kfries.com',
    crypt('password123', gen_salt('bf')),
    NOW(),
    jsonb_build_object(
      'full_name', 'Sarah Manager',
      'role', 'manager',
      'branch_id', v_kfries_branch_id::text
    ),
    NOW(),
    NOW(),
    'authenticated',
    'authenticated'
  );

  -- Insert Admin user (no branch required)
  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_user_meta_data,
    created_at,
    updated_at,
    aud,
    role
  ) VALUES (
    v_admin_id,
    '00000000-0000-0000-0000-000000000000',
    'admin@company.com',
    crypt('password123', gen_salt('bf')),
    NOW(),
    jsonb_build_object(
      'full_name', 'Admin User',
      'role', 'admin'
    ),
    NOW(),
    NOW(),
    'authenticated',
    'authenticated'
  );

  -- Insert Superadmin user (no branch required)
  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_user_meta_data,
    created_at,
    updated_at,
    aud,
    role
  ) VALUES (
    v_superadmin_id,
    '00000000-0000-0000-0000-000000000000',
    'superadmin@company.com',
    crypt('password123', gen_salt('bf')),
    NOW(),
    jsonb_build_object(
      'full_name', 'Super Admin',
      'role', 'superadmin'
    ),
    NOW(),
    NOW(),
    'authenticated',
    'authenticated'
  );

  RAISE NOTICE 'Successfully created 4 placeholder users';
  RAISE NOTICE 'Cashier ID: %', v_cashier_id;
  RAISE NOTICE 'Manager ID: %', v_manager_id;
  RAISE NOTICE 'Admin ID: %', v_admin_id;
  RAISE NOTICE 'Superadmin ID: %', v_superadmin_id;
END $$;

-- Verify users were created
DO $$
DECLARE
  user_count INTEGER;
  profile_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO user_count FROM auth.users WHERE email LIKE '%@kfries.com' OR email LIKE '%@company.com';
  SELECT COUNT(*) INTO profile_count FROM profiles WHERE email LIKE '%@kfries.com' OR email LIKE '%@company.com';

  RAISE NOTICE 'Auth users created: %', user_count;
  RAISE NOTICE 'Profiles created (via trigger): %', profile_count;

  IF user_count <> profile_count THEN
    RAISE WARNING 'Mismatch between auth.users and profiles count. Check trigger execution.';
  END IF;
END $$;

-- Display created users for verification
SELECT
  p.id,
  p.email,
  p.full_name,
  p.role,
  b.name as branch_name,
  p.is_active
FROM profiles p
LEFT JOIN branches b ON p.branch_id = b.id
WHERE p.email IN ('cashier@kfries.com', 'manager@kfries.com', 'admin@company.com', 'superadmin@company.com')
ORDER BY
  CASE p.role
    WHEN 'cashier' THEN 1
    WHEN 'manager' THEN 2
    WHEN 'admin' THEN 3
    WHEN 'superadmin' THEN 4
  END;
