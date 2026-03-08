-- Allow employees without a branch (e.g. Super Admin, Admin roles)
ALTER TABLE employees ALTER COLUMN branch_id DROP NOT NULL;
