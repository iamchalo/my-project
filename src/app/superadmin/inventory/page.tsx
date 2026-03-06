'use client';
// Superadmin inventory — identical to admin inventory (same DB access via RLS).
// Re-exports the admin page component; the layout role is resolved internally
// from profile.role, so superadmins see the superadmin sidebar automatically.
export { default } from '@/app/admin/inventory/page';
