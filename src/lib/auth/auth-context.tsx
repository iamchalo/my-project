'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
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
  const [skipNextFetch, setSkipNextFetch] = useState(false);
  const supabase = createClient();

  // Fetch user profile from database
  const fetchProfile = async (userId: string) => {
    try {
      console.log('Fetching profile for user:', userId);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Profile fetch error:', error);
        throw error;
      }
      console.log('Profile loaded:', data?.role, data?.full_name);
      setProfile(data);
    } catch (error) {
      console.error('Error fetching profile:', error);
      setProfile(null);
    }
  };

  // Initialize auth state
  useEffect(() => {
    const initAuth = async () => {
      try {
        // Get current session
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          setUser(session.user);
          await fetchProfile(session.user.id);
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
      } finally {
        setLoading(false);
      }
    };

    initAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event);

        // Skip profile fetch if we just signed in (already fetched in signIn function)
        if (skipNextFetch && event === 'SIGNED_IN') {
          setSkipNextFetch(false);
          setLoading(false);
          return;
        }

        if (session?.user) {
          setUser(session.user);
          // Only fetch profile if we don't already have it or user changed
          if (!profile || profile.id !== session.user.id) {
            await fetchProfile(session.user.id);
          }
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
      setLoading(true);

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      let userProfile: Profile | null = null;

      if (data.user) {
        setUser(data.user);
        console.log('User signed in:', data.user.id, data.user.email);

        // Fetch profile and store it (removed 100ms delay for better performance)
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .single();

        if (profileError) {
          console.error('Profile fetch error in signIn:', profileError);
          console.error('Error details:', JSON.stringify(profileError));
          console.error('Attempted to fetch profile for user ID:', data.user.id);
        } else {
          userProfile = profileData;
          setProfile(profileData);
          console.log('Profile loaded in signIn:', profileData?.role, profileData?.full_name);
          // Skip next auth state change fetch since we just fetched the profile
          setSkipNextFetch(true);
        }
      }

      return { error: null, profile: userProfile };
    } catch (error: any) {
      console.error('Sign in error:', error);
      return { error, profile: null };
    } finally {
      setLoading(false);
    }
  };

  // Sign out function
  const signOut = async () => {
    try {
      setLoading(true);
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
