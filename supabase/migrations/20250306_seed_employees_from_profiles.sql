-- =====================================================
-- SEED EMPLOYEES TABLE FROM EXISTING POS PROFILES
-- Migrates all cashier and manager profiles into the
-- employees table as POS-linked staff records.
-- Safe to run multiple times (uses ON CONFLICT DO NOTHING).
-- =====================================================

INSERT INTO employees (
  full_name,
  phone,
  email,
  job_title,
  branch_id,
  has_pos_account,
  pos_profile_id,
  is_active,
  created_at
)
SELECT
  p.full_name,
  p.phone,
  p.email,
  -- Map POS role to a human-readable job title
  CASE p.role
    WHEN 'cashier' THEN 'Cashier'
    WHEN 'manager' THEN 'Manager'
    ELSE initcap(p.role)
  END AS job_title,
  p.branch_id,
  true          AS has_pos_account,
  p.id          AS pos_profile_id,
  p.is_active,
  p.created_at
FROM profiles p
WHERE p.role IN ('cashier', 'manager')
  AND p.branch_id IS NOT NULL
  -- Skip if this profile is already linked in employees
  AND NOT EXISTS (
    SELECT 1 FROM employees e WHERE e.pos_profile_id = p.id
  );

-- Report what was inserted
DO $$
DECLARE
  inserted_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO inserted_count
  FROM employees
  WHERE has_pos_account = true;

  RAISE NOTICE 'employees table now has % POS-linked staff records', inserted_count;
END $$;
