-- =====================================================
-- FIX NULL VALUES IN AUTH.USERS
-- =====================================================
-- Supabase Auth's Go code cannot handle NULL values
-- in string columns. This migration converts all NULL
-- string fields to empty strings for test users.
--
-- Error was: "sql: Scan error on column index 3,
-- name \"confirmation_token\": converting NULL to
-- string is unsupported"
-- =====================================================

-- Update all NULL string fields to empty strings
UPDATE auth.users
SET
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  phone_change_token = COALESCE(phone_change_token, ''),
  reauthentication_token = COALESCE(reauthentication_token, ''),
  email_change = COALESCE(email_change, ''),
  phone_change = COALESCE(phone_change, '')
WHERE email IN (
  'cashier@kfries.com',
  'manager@kfries.com',
  'admin@company.com',
  'superadmin@company.com'
);

-- Verify the fix
SELECT
  'Fixed auth.users NULL values' as status,
  COUNT(*) as users_updated
FROM auth.users
WHERE email IN (
  'cashier@kfries.com',
  'manager@kfries.com',
  'admin@company.com',
  'superadmin@company.com'
)
AND confirmation_token = '';
