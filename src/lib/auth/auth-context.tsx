'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: 'cashier' | 'manager' | 'admin' | 'superadmin';
  branch_id: string | null;
  avatar_url: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null; profile: Profile | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  // useRef instead of useState: refs are mutable and always current inside
  // closures, so the onAuthStateChange callback reads the latest value.
  const skipNextFetchRef = useRef(false);
  const supabase = createClient();

  // Write a login/logout entry to auth_logs (non-fatal — errors are swallowed)
  const writeAuthLog = async (
    userId: string,
    userName: string,
    role: string,
    branchId: string | null,
    action: 'login' | 'logout',
  ) => {
    try {
      let branch: string | null = null;
      if (branchId) {
        const { data: branchData } = await supabase
          .from('branches')
          .select('name')
          .eq('id', branchId)
          .maybeSingle();
        branch = branchData?.name ?? null;
      }
      await supabase.from('auth_logs').insert({ user_id: userId, user_name: userName, role, branch, action });
    } catch (err) {
      console.warn('[auth_logs] Failed to write log:', err);
    }
  };

  // Fetch user profile from database
  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, branch_id, avatar_url, phone, is_active, created_at, updated_at')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Profile fetch error:', error);
        throw error;
      }
      setProfile(data);
    } catch (error) {
      console.error('Error fetching profile:', error);
      setProfile(null);
    }
  };

  // Initialize auth state — use onAuthStateChange as the single source of truth.
  // It fires INITIAL_SESSION immediately on setup with the current session,
  // which correctly handles page refreshes without a separate initAuth() race.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // Skip redundant profile fetch right after signIn() already fetched it.
        // Uses a ref (not state) so the callback always reads the latest value.
        if (skipNextFetchRef.current && event === 'SIGNED_IN') {
          skipNextFetchRef.current = false;
          setLoading(false);
          return;
        }

        // PASSWORD_RECOVERY sessions don't need a profile — the user is only
        // here to set a new password and will be redirected to login afterwards.
        if (event === 'PASSWORD_RECOVERY') {
          if (session?.user) setUser(session.user);
          setLoading(false);
          return;
        }

        if (session?.user) {
          setUser(session.user);
          await fetchProfile(session.user.id);
        } else {
          setUser(null);
          setProfile(null);
        }

        setLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Sign in function
  const signIn = async (email: string, password: string) => {
    try {
      // Don't set global loading here — the login page has its own isSubmitting
      // state. Setting loading=true would flip authLoading, causing the login
      // page to swap the form for skeletons.

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      let userProfile: Profile | null = null;

      if (data.user) {
        setUser(data.user);

        // Fetch profile and store it
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, email, full_name, role, branch_id, avatar_url, phone, is_active, created_at, updated_at')
          .eq('id', data.user.id)
          .single();

        if (profileError) {
          console.error('Profile fetch error in signIn:', profileError);
        } else {
          userProfile = profileData;
          setProfile(profileData);
          // Tell onAuthStateChange to skip its redundant fetch (ref, not state,
          // so the callback always reads the current value).
          skipNextFetchRef.current = true;
          // Fire-and-forget: don't block login on audit logging
          writeAuthLog(data.user.id, profileData.full_name, profileData.role, profileData.branch_id, 'login');
        }
      }

      return { error: null, profile: userProfile };
    } catch (error: any) {
      console.error('Sign in error:', error);
      return { error, profile: null };
    }
  };

  // Sign out function
  const signOut = async () => {
    try {
      setLoading(true);
      // Log before signing out (session is still valid at this point)
      if (user && profile) {
        await writeAuthLog(user.id, profile.full_name, profile.role, profile.branch_id, 'logout');
      }
      await supabase.auth.signOut();
      setUser(null);
      setProfile(null);
      // Clear cached form data on logout
      localStorage.removeItem('salesStockForm');
    } catch (error) {
      console.error('Sign out error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Refresh profile data
  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  const value: AuthContextType = {
    user,
    profile,
    loading,
    signIn,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
