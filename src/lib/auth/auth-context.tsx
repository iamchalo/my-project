'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useUser, useClerk } from '@clerk/nextjs';
import { useClerkSupabaseClient } from '@/lib/supabase/client';

const SESSION_ID_KEY = 'pos-session-id';

export interface Profile {
  id: string;
  clerk_id: string;
  email: string;
  full_name: string;
  role: 'cashier' | 'manager' | 'admin' | 'superadmin';
  branch_id: string | null;
  active_branch_id: string | null;
  active_branch: { name: string } | null;
  avatar_url: string | null;
  phone: string | null;
  is_active: boolean;
  active_session_id: string | null;
  created_at: string;
  updated_at: string;
}

interface AuthContextType {
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoaded: userLoaded } = useUser();
  const { signOut: clerkSignOut } = useClerk();
  const supabase = useClerkSupabaseClient();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  // Overall loading = Clerk not ready OR profile not yet fetched
  const loading = !userLoaded || profileLoading;

  // ── Auth log (fire-and-forget) ──────────────────────────────────────────
  const writeAuthLog = useCallback(async (
    clerkId: string,
    userName: string,
    role: string,
    branchId: string | null,
    action: 'login' | 'logout',
  ) => {
    try {
      let branch: string | null = null;
      if (branchId) {
        const { data } = await supabase.from('branches').select('name').eq('id', branchId).maybeSingle();
        branch = data?.name ?? null;
      }
      await supabase.from('auth_logs').insert({ user_id: clerkId, user_name: userName, role, branch, action });
    } catch (err) {
      console.warn('[auth_logs] Failed to write log:', err);
    }
  }, [supabase]);

  // ── Profile fetch (keyed on Clerk user ID) ───────────────────────────────
  const fetchProfile = useCallback(async (clerkId: string): Promise<Profile | null> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, clerk_id, email, full_name, role, branch_id, active_branch_id, active_branch:branches!active_branch_id(name), avatar_url, phone, is_active, active_session_id, created_at, updated_at')
      .eq('clerk_id', clerkId)
      .single();

    if (error) {
      console.error('Profile fetch error:', error);
      setProfile(null);
      return null;
    }
    const typedProfile = data as unknown as Profile;
    setProfile(typedProfile);
    return typedProfile;
  }, [supabase]);

  // ── Force sign-out with reason ────────────────────────────────────────────
  const forceSignOut = useCallback((reason: string) => {
    sessionStorage.setItem('pos-session-kicked', reason);
    localStorage.removeItem(SESSION_ID_KEY);
    clerkSignOut().finally(() => { window.location.href = '/login'; });
  }, [clerkSignOut]);

  // ── Session nonce validation ──────────────────────────────────────────────
  const validateSession = useCallback(async (): Promise<boolean> => {
    try {
      const localSessionId = localStorage.getItem(SESSION_ID_KEY);
      if (!localSessionId) {
        forceSignOut('Your session could not be verified. Please sign in again.');
        return false;
      }
      const { data: dbSessionId, error } = await supabase.rpc('get_active_session_id');
      if (error) return true; // network error — don't kick
      if (dbSessionId !== localSessionId) {
        forceSignOut('Your session was ended because your account was signed in from another location.');
        return false;
      }
      return true;
    } catch {
      return true;
    }
  }, [supabase, forceSignOut]);

  // ── React to Clerk user changes ───────────────────────────────────────────
  useEffect(() => {
    if (!userLoaded) return;

    if (!user) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }

    setProfileLoading(true);
    fetchProfile(user.id).then(async (fetchedProfile) => {
      setProfileLoading(false);
      if (!fetchedProfile) return;

      const localSessionId = localStorage.getItem(SESSION_ID_KEY);

      if (!localSessionId) {
        // New login — set a fresh session nonce
        const sessionId = crypto.randomUUID();
        localStorage.setItem(SESSION_ID_KEY, sessionId);
        try { await supabase.rpc('set_active_session', { p_session_id: sessionId }); } catch {}
        writeAuthLog(user.id, fetchedProfile.full_name, fetchedProfile.role, fetchedProfile.branch_id, 'login');
      } else {
        // Page refresh — validate the existing nonce
        try {
          const { data: dbSessionId } = await supabase.rpc('get_active_session_id');
          if (dbSessionId && dbSessionId !== localSessionId) {
            sessionStorage.setItem('pos-session-kicked', 'Your session was ended because your account was signed in from another location.');
            localStorage.removeItem(SESSION_ID_KEY);
            await clerkSignOut();
            setProfile(null);
            window.location.href = '/login';
          }
        } catch {
          // Transient network error — don't kick
        }
      }
    });
  }, [user?.id, userLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Validate session on tab focus ─────────────────────────────────────────
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && user) validateSession();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [user, validateSession]);

  // ── Sign out ──────────────────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    if (user && profile) {
      await writeAuthLog(user.id, profile.full_name, profile.role, profile.branch_id, 'logout');
    }
    try { await supabase.rpc('clear_active_session'); } catch {}
    localStorage.removeItem('salesStockForm');
    localStorage.removeItem(SESSION_ID_KEY);
    await clerkSignOut();
    setProfile(null);
  }, [user, profile, supabase, clerkSignOut, writeAuthLog]);

  // ── Refresh profile ───────────────────────────────────────────────────────
  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id);
  }, [user, fetchProfile]);

  return (
    <AuthContext.Provider value={{ profile, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
