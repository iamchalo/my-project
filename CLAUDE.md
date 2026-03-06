# CLAUDE.md - Project Overview

## Project Summary

A multi-branch fast-food restaurant POS (Point of Sale) system built with Next.js and Supabase. Manages orders, products, employees, expenses, and transfers across 5 branches.

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript 5
- **Styling:** Tailwind CSS v4
- **Backend/DB:** Supabase (PostgreSQL + Auth + Storage + RLS)
- **UI Components:** Radix UI, Lucide React
- **Utilities:** class-variance-authority, clsx, tailwind-merge

## Dev Commands

```bash
npm run dev      # Start development server (http://localhost:3000)
npm run build    # Production build
npm run lint     # Run ESLint
```

## Project Structure

```
src/
  app/
    login/               # Login page
    reset-password/      # Password reset page
    cashier/             # Cashier role pages (orders, expenses, sales-stock, settings)
    manager/             # Manager role pages (inventory, expenses, transfers, shifts, sales-stock, settings)
    admin/               # Admin role pages (products, orders, employees, expenses, transfers, reports, settings)
    superadmin/          # Superadmin role pages (all + analytics, logs, products-per-branch)
  components/
    layout/sidebar.tsx   # Navigation sidebar (role-specific)
    ui/                  # Reusable UI components (switch, etc.)
  lib/
    supabase/
      client.ts          # Browser-side Supabase client
      server.ts          # Server-side Supabase client
    types.ts             # TypeScript interfaces (Branch, Profile, Product, etc.)

supabase/
  migrations/            # SQL migration files (run in order)
```

## User Roles & Access

| Role       | Access                                                              |
|------------|---------------------------------------------------------------------|
| cashier    | Orders (create), expenses, sales-stock, settings - branch-scoped   |
| manager    | Inventory view, expenses, transfers, shifts, sales-stock, settings  |
| admin      | Products (CRUD), orders, employees, expenses, transfers, reports    |
| superadmin | Full access to everything including analytics and logs              |

## Database Schema

### Tables
- **branches** - 5 branches: KFries, BeFries, StageBeFries, MigFries, LFries
- **profiles** - User profiles linked to Supabase Auth (role, branch_id, etc.)
- **products** - Global products (admin creates once, unique by name)
- **branch_products** - Junction table: product <-> branch (is_active, local_price override)
- **orders** - BIGINT order_number as PK (no status field - pay-first model)
- **order_items** - Composite PK (order_id, product_id), no subtotal stored
- **orders_archive / order_items_archive** - Archival tables for old orders
- **password_change_logs** - Audit log for password resets

### Key Design Decisions
- Products are centrally managed by admins (one product, many branches via `branch_products`)
- Orders use sequential BIGINT order numbers (not UUIDs) for simplicity - RLS handles security
- No `status` field on orders (pay-first policy - all orders complete at creation)
- `subtotal` in order_items is calculated (`price * quantity`), not stored
- Branch isolation enforced via RLS at the database level

### Helper Functions (Supabase RPC)
- `get_branch_products(target_branch_id)` - Active products for a branch (cashier use)
- `get_products_with_branches()` - All products with branch availability grid (admin use)
- `toggle_branch_product(target_product_id, target_branch_id)` - Toggle active status
- `get_orders_by_branch(branch_id, start_date, end_date)` - Orders for a branch
- `get_order_details(order_id)` - Full order with items
- `archive_old_orders(months)` - Move old orders to archive tables
- `get_user_role(uid)` / `get_user_branch(uid)` - Profile helpers

## Database Migrations (run in this order)

1. `20250113_create_branches_and_users.sql` - Branches, profiles, RLS, trigger for auto-profile
2. `20250113_create_products.sql` - Old branch-specific products (superseded)
3. `20250113_seed_placeholder_users.sql` - Test users
4. `20250113_create_storage_bucket.sql` - product-images storage bucket
5. `20250114_restructure_products.sql` - Centralized products + branch_products schema
6. `20250114_create_orders_optimized.sql` - Optimized orders + archive tables
7. `20250120_create_password_logs.sql` - Password change audit logs

## Supabase Storage

- **Bucket:** `product-images` (public read, admin-only write)
- File naming: `{timestamp}-{random}.{ext}` (prevents collisions)
- Images accessed via public CDN URLs

## Test Credentials

| Role       | Email                    | Password    |
|------------|--------------------------|-------------|
| cashier    | cashier@kfries.com       | password123 |
| manager    | manager@kfries.com       | password123 |
| admin      | admin@company.com        | password123 |
| superadmin | superadmin@company.com   | password123 |

## Environment Variables

Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

## RLS Policy Summary

- **Cashiers:** View only active products and orders in their own branch
- **Managers:** View all products/orders in their branch; cannot create products
- **Admins:** Full CRUD on products, orders, employees across all branches (not superadmins)
- **Superadmins:** Unrestricted access to all tables and functions

## Payment Methods

Enum: `cash`, `mpesa`

## Product Categories

Fixed enum (enforced at DB level): `Meals`, `Drinks&Juices`, `Specials`

## Order Number Display

Order numbers are BIGINT stored as-is. For customer-facing display, format in app:
```typescript
const display = `ORD-${orderNumber.toString().padStart(8, '0')}`;
// e.g., 1234 -> "ORD-00001234"
```

## Password Reset Flow

- Supabase email auth with 30-minute link expiry
- Redirects to `/reset-password` page
- Audit-logged in `password_change_logs`
- Configure redirect URLs in Supabase Dashboard > Auth > URL Configuration

## Reference Documents

- [SETUP_GUIDE.md](SETUP_GUIDE.md) - Full setup and migration walkthrough
- [DATABASE_SETUP.md](DATABASE_SETUP.md) - Database schema and RLS details
- [DATABASE_RESTRUCTURE_PLAN.md](DATABASE_RESTRUCTURE_PLAN.md) - Products restructure rationale
- [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) - Products restructure implementation
- [IMAGE_UPLOAD_IMPLEMENTATION.md](IMAGE_UPLOAD_IMPLEMENTATION.md) - Image upload details
- [ORDERS_OPTIMIZATION_GUIDE.md](ORDERS_OPTIMIZATION_GUIDE.md) - Orders schema optimizations
- [ORDER_NUMBER_GUIDE.md](ORDER_NUMBER_GUIDE.md) - Order number system analysis
- [PRIMARY_KEY_COMPARISON.md](PRIMARY_KEY_COMPARISON.md) - UUID vs order number PK decision
- [PASSWORD_RESET_GUIDE.md](PASSWORD_RESET_GUIDE.md) - Password reset configuration
- [PRODUCTS_SETUP.md](PRODUCTS_SETUP.md) - Initial products setup guide
