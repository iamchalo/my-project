'use server';

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
  userId?: string;
}

export async function createEmployee(data: CreateEmployeeData): Promise<CreateEmployeeResult> {
  try {
    // Check if service role key is set
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('SUPABASE_SERVICE_ROLE_KEY is not set');
      return { success: false, error: 'Server configuration error. Please contact admin.' };
    }

    const supabase = createAdminClient();

    // Create user in Supabase Auth with user metadata
    // The metadata will be used by the trigger to create the profile
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        full_name: data.full_name,
        role: data.role,
        branch_id: data.branch_id,
        phone: data.phone || null,
      },
    });

    if (authError) {
      console.error('Auth error:', authError);
      return { success: false, error: authError.message };
    }

    if (!authData.user) {
      return { success: false, error: 'Failed to create user' };
    }

    // Check if profile was created by trigger
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', authData.user.id)
      .single();

    if (existingProfile) {
      // Profile exists (created by trigger), update it with our data
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          full_name: data.full_name,
          role: data.role,
          branch_id: data.branch_id,
          phone: data.phone || null,
          is_active: true,
        })
        .eq('id', authData.user.id);

      if (updateError) {
        console.error('Profile update error:', updateError);
        return { success: false, error: updateError.message };
      }
    } else {
      // No profile exists, create one
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: authData.user.id,
          email: data.email,
          full_name: data.full_name,
          role: data.role,
          branch_id: data.branch_id,
          phone: data.phone || null,
          is_active: true,
        });

      if (profileError) {
        console.error('Profile insert error:', profileError);
        // Try to clean up the auth user if profile creation fails
        await supabase.auth.admin.deleteUser(authData.user.id);
        return { success: false, error: profileError.message };
      }
    }

    return { success: true, userId: authData.user.id };
  } catch (error: any) {
    console.error('Create employee error:', error);
    return { success: false, error: error.message || 'An unexpected error occurred' };
  }
}
