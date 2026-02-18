import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';

const AuthContext = createContext(null);

const DEV_BYPASS_KEY = 'dev_bypass';
const DEV_PROFILE_KEY = 'dev_bypass_profile';

const DEV_PROFILE_LABEL_BY_KEY = {
  SYSTEM_ADMIN: '\uC2DC\uC2A4\uD15C \uAD00\uB9AC\uC790',
  MANUFACTURER_ADMIN: '\uC81C\uC870\uC0AC Admin',
  BRAND_ADMIN: '\uBE0C\uB79C\uB4DC Admin',
  TEST_MANUFACTURER_ADMIN: '\uD14C\uC2A4\uD2B8 \uC218\uC8FC\uC790 \uAD00\uB9AC\uC790',
  TEST_MANUFACTURER_OPERATOR: '\uD14C\uC2A4\uD2B8 \uC218\uC8FC\uC790 \uC6B4\uC601\uC790',
  TEST_MANUFACTURER_ACCOUNTANT: '\uD14C\uC2A4\uD2B8 \uC218\uC8FC\uC790 \uD68C\uACC4\uC0AC',
  TEST_MANUFACTURER_WORKER: '\uD14C\uC2A4\uD2B8 \uC218\uC8FC\uC790 \uC791\uC5C5\uC790(\uB77C\uC778\uC7A5)',
  TEST_BRAND_ADMIN: '\uD14C\uC2A4\uD2B8 \uBC1C\uC8FC\uC790 \uAD00\uB9AC\uC790',
  TEST_BRAND_OPERATOR: '\uD14C\uC2A4\uD2B8 \uBC1C\uC8FC\uC790 \uC6B4\uC601\uC790',
  TEST_BRAND_ACCOUNTANT: '\uD14C\uC2A4\uD2B8 \uBC1C\uC8FC\uC790 \uD68C\uACC4\uC0AC',
  BARO_ADMIN: 'BARO \uAD00\uB9AC\uC790',
  BARO_OPERATOR: 'BARO \uC6B4\uC601\uC790',
  BARO_ACCOUNTANT: 'BARO \uD68C\uACC4\uC0AC',
  BARO_WORKER: 'BARO \uC791\uC5C5\uC790(\uB77C\uC778\uC7A5)',
  DEOSAN_ADMIN: '\uB354\uC0B0 \uAD00\uB9AC\uC790',
  DEOSAN_OPERATOR: '\uB354\uC0B0 \uC6B4\uC601\uC790',
  DEOSAN_ACCOUNTANT: '\uB354\uC0B0 \uD68C\uACC4\uC0AC',
  DEOSAN_WORKER: '\uB354\uC0B0 \uC791\uC5C5\uC790',
};

const DEFAULT_DEV_PROFILE = {
  key: 'TEST_MANUFACTURER_ADMIN',
  label: '\uD14C\uC2A4\uD2B8 \uC218\uC8FC\uC790 \uAD00\uB9AC\uC790',
  entryType: 'ORG',
  systemRole: 'USER',
  orgType: 'MANUFACTURER',
  orgRole: 'ADMIN',
  orgId: null,
  orgName: null,
  employeeName: '\uD14C\uC2A4\uD2B8 \uC218\uC8FC\uC790 \uAD00\uB9AC\uC790 \uD14C\uC2A4\uD2B8',
  email: 'manufacturer-admin@test.local',
  isLineLeader: false,
  lineLeaderStartAt: null,
  lineLeaderEndAt: null,
};

const normalizeCompactLower = (value) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();

const normalizeUpper = (value) =>
  typeof value === 'string' ? value.trim().toUpperCase() : '';

const hasLikelyMojibake = (value) => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return true;
  return text.includes('?') || text.includes('\uFFFD');
};

const isLegacyBaroProfile = (profile) => {
  if (!profile || typeof profile !== 'object') return false;
  if (normalizeUpper(profile.entryType) !== 'ORG') return false;

  const profileKey = normalizeUpper(profile.key);
  if (
    profileKey === 'MANUFACTURER_ADMIN' ||
    profileKey === 'BRAND_ADMIN' ||
    profileKey.startsWith('BARO_') ||
    profileKey.startsWith('DEOSAN_')
  ) {
    return true;
  }

  const orgNameKey = normalizeCompactLower(profile.orgName);
  return orgNameKey === '' || orgNameKey === 'baro' || orgNameKey === '\uB354\uC0B0';
};

const normalizeDevProfile = (profile) => {
  if (!profile || typeof profile !== 'object') return null;

  const next = { ...DEFAULT_DEV_PROFILE, ...profile };
  next.entryType = normalizeUpper(next.entryType || 'ORG');
  next.systemRole = normalizeUpper(next.systemRole || 'USER');
  next.orgType = normalizeUpper(next.orgType);
  next.orgRole = normalizeUpper(next.orgRole);

  const fallbackLabel = DEV_PROFILE_LABEL_BY_KEY[next.key] || DEFAULT_DEV_PROFILE.label;
  const hasKnownKey = Boolean(DEV_PROFILE_LABEL_BY_KEY[next.key]);
  const rawLabel = typeof next.label === 'string' ? next.label.trim() : '';
  next.label = hasKnownKey || hasLikelyMojibake(rawLabel) ? fallbackLabel : rawLabel;

  const parsedOrgId = Number(next.orgId);
  next.orgId = Number.isFinite(parsedOrgId) && parsedOrgId > 0 ? parsedOrgId : null;
  next.orgName = typeof next.orgName === 'string' && next.orgName.trim() ? next.orgName.trim() : null;

  next.isLineLeader = next.isLineLeader === true;
  if (!next.isLineLeader) {
    next.lineLeaderStartAt = null;
    next.lineLeaderEndAt = null;
  }

  // Recover old BARO test profiles that were pinned to duplicate empty org rows.
  if (isLegacyBaroProfile(next)) {
    next.key = DEFAULT_DEV_PROFILE.key;
    next.label = DEFAULT_DEV_PROFILE.label;
    next.orgType = DEFAULT_DEV_PROFILE.orgType;
    next.orgRole = DEFAULT_DEV_PROFILE.orgRole;
    next.email = DEFAULT_DEV_PROFILE.email;
    next.employeeName = DEFAULT_DEV_PROFILE.employeeName;
    next.orgId = null;
    next.orgName = null;
    next.isLineLeader = false;
    next.lineLeaderStartAt = null;
    next.lineLeaderEndAt = null;
  }

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
  const [devBypass, setDevBypass] = useState(() => localStorage.getItem(DEV_BYPASS_KEY) === '1');
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

export const useAuth = () => useContext(AuthContext);
