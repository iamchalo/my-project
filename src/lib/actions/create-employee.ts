'use server';

import { clerkClient } from '@clerk/nextjs/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface CreateEmployeeData {
  email: string;
  password: string;
  full_name: string;
  role: 'cashier' | 'manager' | 'admin' | 'superadmin';
  branch_id: string | null;
  phone?: string;
}

interface CreateEmployeeResult {
  success: boolean;
  error?: string;
  userId?: string; // Supabase profile UUID
}

export async function createEmployee(data: CreateEmployeeData): Promise<CreateEmployeeResult> {
  try {
    // 1. Create user in Clerk
    const clerk = await clerkClient();
    const [firstName, ...rest] = data.full_name.trim().split(' ');
    const lastName = rest.join(' ') || undefined;

    let clerkUser;
    try {
      clerkUser = await clerk.users.createUser({
        emailAddress: [data.email],
        password: data.password,
        firstName,
        lastName,
        skipPasswordRequirement: true,
      });
    } catch (clerkErr: any) {
      // If email already exists in Clerk, look up the existing user
      if (clerkErr?.status === 422 && clerkErr?.errors?.[0]?.code === 'form_identifier_exists') {
        const existing = await clerk.users.getUserList({ emailAddress: [data.email] });
        if (!existing.data.length) throw clerkErr;
        clerkUser = existing.data[0];
      } else {
        throw clerkErr;
      }
    }

    // 2. Create profile in Supabase linked to Clerk user
    const supabase = createAdminClient();
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .insert({
        clerk_id: clerkUser.id,
        email: data.email,
        full_name: data.full_name,
        role: data.role,
        branch_id: data.branch_id || null,
        phone: data.phone || null,
        is_active: true,
      })
      .select('id')
      .single();

    if (profileError) {
      // Clean up Clerk user if profile creation fails
      await clerk.users.deleteUser(clerkUser.id);
      return { success: false, error: profileError.message };
    }

    return { success: true, userId: profile.id };
  } catch (error: any) {
    const msg =
      error?.errors?.[0]?.longMessage ??
      error?.errors?.[0]?.message ??
      error.message ??
      'An unexpected error occurred';
    return { success: false, error: msg };
  }
}
