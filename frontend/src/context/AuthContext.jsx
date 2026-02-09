import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [devBypass, setDevBypass] = useState(() => {
    return localStorage.getItem('dev_bypass') === '1';
  });

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

  const signOut = async () => {
    if (!supabase) {
      console.warn('Supabase is not configured.');
      setDevBypass(false);
      localStorage.removeItem('dev_bypass');
      return;
    }
    await supabase.auth.signOut();
    setDevBypass(false);
    localStorage.removeItem('dev_bypass');
  };

  const enableDevBypass = () => {
    setDevBypass(true);
    localStorage.setItem('dev_bypass', '1');
  };

  const value = useMemo(
    () => ({
      session,
      user,
      loading,
      isAuthenticated: !!user || devBypass,
      isSupabaseConfigured,
      signInWithGoogle,
      signOut,
      enableDevBypass,
    }),
    [session, user, loading, devBypass]
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
