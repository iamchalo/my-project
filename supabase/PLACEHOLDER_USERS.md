# Placeholder Users Documentation

This document describes the test users created by the `20250113_seed_placeholder_users.sql` migration.

## Running the Migration

### Option 1: Via Supabase CLI (Recommended)
```bash
# Make sure you're linked to your Supabase project
supabase db push

# Or run the specific migration
supabase db push --include-all
```

### Option 2: Via Supabase Dashboard
1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Copy and paste the contents of `supabase/migrations/20250113_seed_placeholder_users.sql`
4. Click "Run" to execute the migration

## Created Users

### 1. Cashier
- **Email:** `cashier@kfries.com`
- **Password:** `password123`
- **Full Name:** John Cashier
- **Role:** cashier
- **Branch:** KFries
- **User ID:** `00000000-0000-0000-0000-000000000001`

### 2. Manager
- **Email:** `manager@kfries.com`
- **Password:** `password123`
- **Full Name:** Sarah Manager
- **Role:** manager
- **Branch:** KFries
- **User ID:** `00000000-0000-0000-0000-000000000002`

### 3. Admin
- **Email:** `admin@company.com`
- **Password:** `password123`
- **Full Name:** Admin User
- **Role:** admin
- **Branch:** None (access to all branches)
- **User ID:** `00000000-0000-0000-0000-000000000003`

### 4. Superadmin
- **Email:** `superadmin@company.com`
- **Password:** `password123`
- **Full Name:** Super Admin
- **Role:** superadmin
- **Branch:** None (access to all branches)
- **User ID:** `00000000-0000-0000-0000-000000000004`

## Using Placeholder Users

### Creating Products
When creating products in the database, you can use the Manager's ID as the `created_by` field:

```sql
INSERT INTO products (product_name, category, product_price, branch_id, created_by)
VALUES (
  'Chicken Burger',
  'Meals',
  450.00,
  (SELECT id FROM branches WHERE code = 'KFRIES'),
  '00000000-0000-0000-0000-000000000002'  -- Manager ID
);
```

### Querying as a Specific User
To test Row Level Security (RLS) policies, you can simulate being a specific user:

```sql
-- Set the current user context
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001"}', true);

-- Now queries will be executed as the Cashier user
SELECT * FROM products;
```

### Testing Branch Restrictions
```sql
-- Cashier can only see products from their branch (KFries)
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001","role":"cashier"}';
SELECT * FROM products;  -- Will only return KFries products

-- Admin can see all products
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000003","role":"admin"}';
SELECT * FROM products;  -- Will return all products
```

## Important Notes

⚠️ **For Database Testing Only**
- These users are created directly in the database for testing purposes
- They will NOT work with actual Supabase Auth login flow until you implement authentication
- Passwords are hashed using bcrypt for security even in testing

🔐 **Security Reminders**
- Change these passwords before going to production
- Delete or disable these test users in production environment
- Use proper Supabase Auth signup when implementing user registration

📝 **Next Steps**
When you're ready to add authentication:
1. Create a login page using Supabase Auth
2. Implement session management
3. Add protected routes
4. These test users can log in with their credentials once auth is implemented

## Verification

After running the migration, verify users were created:

```sql
-- Check auth.users
SELECT id, email, email_confirmed_at, raw_user_meta_data->>'role' as role
FROM auth.users
WHERE email LIKE '%@kfries.com' OR email LIKE '%@company.com';

-- Check profiles (should be auto-created by trigger)
SELECT id, email, full_name, role, branch_id, is_active
FROM profiles
WHERE email LIKE '%@kfries.com' OR email LIKE '%@company.com';

-- Check with branch names
SELECT
  p.id,
  p.email,
  p.full_name,
  p.role,
  COALESCE(b.name, 'No Branch') as branch_name
FROM profiles p
LEFT JOIN branches b ON p.branch_id = b.id
WHERE p.email IN ('cashier@kfries.com', 'manager@kfries.com', 'admin@company.com', 'superadmin@company.com')
ORDER BY p.role;
```

## Troubleshooting

### Users not created
- Ensure the branches migration ran first
- Check that the KFries branch exists: `SELECT * FROM branches WHERE code = 'KFRIES';`
- Verify the trigger exists: `SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';`

### Profile not created automatically
- The `handle_new_user()` trigger should auto-create profiles
- If profiles are missing, check trigger is enabled
- Manually verify: `SELECT * FROM profiles WHERE id = '00000000-0000-0000-0000-000000000001';`

### Branch constraint errors for cashier/manager
- Cashiers and managers REQUIRE a branch_id
- Ensure branch_id is included in raw_user_meta_data
- Verify branch exists before assigning
