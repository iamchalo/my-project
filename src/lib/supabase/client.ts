import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { useAuth } from '@clerk/nextjs';
import { useMemo } from 'react';

/**
 * Hook: returns a Supabase client that attaches the Clerk JWT as Bearer token
 * on every request so Supabase RLS can verify auth.jwt() ->> 'sub'.
 * Must be called inside a React component.
 */
export function useClerkSupabaseClient() {
  const { getToken } = useAuth();

  return useMemo(
    () =>
      createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: {
            fetch: async (url, options = {}) => {
              const clerkToken = await getToken({ template: 'supabase' });
              const headers = new Headers((options as RequestInit).headers);
              if (clerkToken) headers.set('Authorization', `Bearer ${clerkToken}`);
              return fetch(url, { ...(options as RequestInit), headers });
            },
          },
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        }
      ),
    [getToken]
  );
}

// Backwards-compat alias so existing non-RLS reads don't break during migration
export function createClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
