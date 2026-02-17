import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';

const AuthContext = createContext(null);
const DEV_BYPASS_KEY = 'dev_bypass';
const DEV_PROFILE_KEY = 'dev_bypass_profile';
const DEV_PROFILE_LABEL_BY_KEY = {
  SYSTEM_ADMIN: '시스템 관리자',
  MANUFACTURER_ADMIN: '제조사 Admin',
  BRAND_ADMIN: '브랜드 Admin',
};
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

const hasLikelyMojibake = (value) => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return true;
  if (text.includes('?') || text.includes('\uFFFD')) return true;
  // Broken UTF-8/CP949 text often appears as CJK ideographs without Hangul.
  return /[一-龥]/.test(text) && !/[가-힣]/.test(text);
};

const normalizeDevProfile = (profile) => {
  if (!profile || typeof profile !== 'object') return null;

  const next = { ...DEFAULT_DEV_PROFILE, ...profile };
  const fallbackLabel = DEV_PROFILE_LABEL_BY_KEY[next.key] || DEFAULT_DEV_PROFILE.label;
  const hasKnownKey = Boolean(DEV_PROFILE_LABEL_BY_KEY[next.key]);
  const rawLabel = typeof next.label === 'string' ? next.label.trim() : '';
  const hasSuspiciousLabel = hasLikelyMojibake(rawLabel);

  // For known dev profiles, always pin to canonical labels to avoid mojibake from old localStorage.
  next.label = hasKnownKey || hasSuspiciousLabel ? fallbackLabel : rawLabel;
  return next;
};

const loadDevProfile = () => {
  try {
    const raw = localStorage.getItem(DEV_PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return normalizeDevProfile(parsed);
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
    if (!devBypass || !devProfile) return;
    const normalized = normalizeDevProfile(devProfile);
    if (!normalized) return;
    if (JSON.stringify(normalized) === JSON.stringify(devProfile)) return;
    setDevProfile(normalized);
    localStorage.setItem(DEV_PROFILE_KEY, JSON.stringify(normalized));
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
    const nextProfile = normalizeDevProfile(profile) || DEFAULT_DEV_PROFILE;
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

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  return useContext(AuthContext);
};
