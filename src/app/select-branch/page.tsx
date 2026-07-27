'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { useClerkSupabaseClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Store } from 'lucide-react';

interface Branch {
  id: string;
  name: string;
  code: string;
}

const ROLE_HOME: Record<string, string> = {
  cashier: '/cashier',
  manager: '/manager',
  admin: '/admin',
  superadmin: '/superadmin',
};

export default function SelectBranchPage() {
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();
  const supabase = useClerkSupabaseClient();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;

    if (!profile) {
      router.replace('/login');
      return;
    }

    if (profile.role !== 'cashier') {
      router.replace(ROLE_HOME[profile.role] ?? '/login');
      return;
    }

    let cancelled = false;

    const loadBranches = async () => {
      const { data, error: rpcError } = await supabase.rpc('get_my_allowed_branches');
      if (cancelled) return;

      if (rpcError || !data) {
        setError('Could not load your branches. Please try signing in again.');
        setLoading(false);
        return;
      }

      if (data.length <= 1) {
        const only = data[0];
        if (only) {
          await supabase.rpc('set_active_branch', { p_branch_id: only.id });
        }
        router.replace('/cashier');
        return;
      }

      setBranches(data);
      setLoading(false);
    };

    loadBranches();
    return () => { cancelled = true; };
  }, [authLoading, profile, router, supabase]);

  const handleSelect = async (branchId: string) => {
    setSwitching(branchId);
    setError(null);
    const { error: rpcError } = await supabase.rpc('set_active_branch', { p_branch_id: branchId });
    if (rpcError) {
      setError('Could not select that branch. Please try again.');
      setSwitching(null);
      return;
    }
    router.replace('/cashier');
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-4">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading your branches...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Store className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">Select Your Branch</CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Choose which branch you&apos;re working at today
          </p>
        </CardHeader>

        <CardContent className="space-y-3">
          {error && (
            <p className="text-sm text-destructive text-center mb-2">{error}</p>
          )}
          {branches.map((branch) => (
            <button
              key={branch.id}
              onClick={() => handleSelect(branch.id)}
              disabled={switching !== null}
              className="w-full flex items-center justify-between px-4 py-3 border rounded-lg text-left hover:bg-accent hover:border-primary transition-colors disabled:opacity-50"
            >
              <div>
                <p className="font-medium">{branch.name}</p>
                <p className="text-xs text-muted-foreground">{branch.code}</p>
              </div>
              {switching === branch.id && <Loader2 className="h-4 w-4 animate-spin" />}
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
