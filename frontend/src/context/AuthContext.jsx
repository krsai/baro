import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';

const AuthContext = createContext(null);
const DEV_BYPASS_KEY = 'dev_bypass';
const DEV_PROFILE_KEY = 'dev_bypass_profile';
const DEFAULT_DEV_PROFILE = {
  key: 'MANUFACTURER_ADMIN',
  label: '제조사 Admin',
  entryType: 'ORG',
  systemRole: 'USER',
  orgType: 'MANUFACTURER',
  orgRole: 'ADMIN',
  orgId: null,
  orgName: null,
};

const loadDevProfile = () => {
  try {
    const raw = localStorage.getItem(DEV_PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_error) {
    return null;
  }
};

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [devBypass, setDevBypass] = useState(() => {
    return localStorage.getItem(DEV_BYPASS_KEY) === '1';
  });
  const [devProfile, setDevProfile] = useState(() => loadDevProfile());

  useEffect(() => {
    if (!devBypass) return;
    if (devProfile) return;
    setDevProfile(DEFAULT_DEV_PROFILE);
    localStorage.setItem(DEV_PROFILE_KEY, JSON.stringify(DEFAULT_DEV_PROFILE));
  }, [devBypass, devProfile]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return () => {};
    }
    let ignore = false;

    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (ignore) return;
      setSession(data.session ?? null);
      setUser(data.session?.user ?? null);
      setLoading(false);
    };

    loadSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
      setUser(nextSession?.user ?? null);
      setLoading(false);
    });

    return () => {
      ignore = true;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  const signInWithGoogle = async () => {
    if (!supabase) {
      console.warn('Supabase is not configured.');
      return;
    }
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        // Always show the account chooser when multiple Google accounts are signed in.
        queryParams: {
          prompt: 'select_account',
        },
      },
    });
  };

  const clearDevBypass = () => {
    setDevBypass(false);
    setDevProfile(null);
    localStorage.removeItem(DEV_BYPASS_KEY);
    localStorage.removeItem(DEV_PROFILE_KEY);
  };

  const signOut = async () => {
    if (!supabase) {
      console.warn('Supabase is not configured.');
      clearDevBypass();
      return;
    }
    await supabase.auth.signOut();
    clearDevBypass();
  };

  const enableDevBypass = (profile = DEFAULT_DEV_PROFILE) => {
    const nextProfile =
      profile && typeof profile === 'object'
        ? { ...DEFAULT_DEV_PROFILE, ...profile }
        : DEFAULT_DEV_PROFILE;
    setDevBypass(true);
    setDevProfile(nextProfile);
    localStorage.setItem(DEV_BYPASS_KEY, '1');
    localStorage.setItem(DEV_PROFILE_KEY, JSON.stringify(nextProfile));
  };

  const value = useMemo(
    () => ({
      session,
      user,
      devBypass,
      devProfile,
      loading,
      isAuthenticated: !!user || devBypass,
      isSupabaseConfigured,
      signInWithGoogle,
      signOut,
      enableDevBypass,
    }),
    [session, user, devBypass, devProfile, loading]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
};
