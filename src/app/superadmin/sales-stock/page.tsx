'use client';
// Superadmin Sales & Stock — same view as admin with full access via RLS.
// Re-exports the admin page; layout role is resolved from profile.role.
export { default } from '@/app/admin/sales-stock/page';
