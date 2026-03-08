import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { auth } from '@clerk/nextjs/server';

/**
 * Server-side Supabase client authenticated via Clerk JWT.
 * Use in Server Components, Route Handlers, and Server Actions.
 */
export async function createClient() {
  const { getToken } = await auth();
  const clerkToken = await getToken({ template: 'supabase' });

  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: clerkToken ? { Authorization: `Bearer ${clerkToken}` } : {},
      },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}
