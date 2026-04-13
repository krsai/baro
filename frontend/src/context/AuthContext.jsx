import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';
import { buildQueryString, requestJSON, setRequestContext } from '../utils/apiClient';
import {
  canUseWorkspaceForOrganizationSubscriptionStatus,
  normalizeOrganizationSubscriptionStatus,
} from '../constants/organizationAccess';

const AuthContext = createContext(null);

const DEV_BYPASS_KEY = 'dev_bypass';
const DEV_PROFILE_KEY = 'dev_bypass_profile';
const AUTH_SESSION_TIMEOUT_MS = 10_000;
const ACCESS_PROFILE_TIMEOUT_MS = 10_000;

const withTimeout = (promise, timeoutMs, timeoutMessage) =>
  new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      }
    );
  });

const getAuthStorage = () => {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch (_error) {
    return null;
  }
};

const readAuthStorage = (key) => {
  const storage = getAuthStorage();
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch (_error) {
    return null;
  }
};

const writeAuthStorage = (key, value) => {
  const storage = getAuthStorage();
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch (_error) {
    // ignore storage write errors
  }
};

const removeAuthStorage = (key) => {
  const storage = getAuthStorage();
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch (_error) {
    // ignore storage remove errors
  }
};

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

const ORG_ROLE_LABEL_BY_KEY = {
  ADMIN: '\uAD00\uB9AC\uC790',
  OPERATOR: '\uC6B4\uC601\uC790',
  ACCOUNTANT: '\uD68C\uACC4\uC0AC',
  WORKER: '\uC791\uC5C5\uC790',
};

const DEFAULT_DEV_PROFILE = {
  key: 'TEST_MANUFACTURER_ADMIN',
  label: '\uD14C\uC2A4\uD2B8 \uC218\uC8FC\uC790 \uAD00\uB9AC\uC790',
  entryType: 'ORG',
  systemRole: 'USER',
  orgType: 'MANUFACTURER',
  orgRole: 'ADMIN',
  orgId: null,
  orgName: '\uD14C\uC2A4\uD2B8 \uC218\uC8FC\uC790',
  employeeName: '\uAD00\uB9AC\uC790',
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

const buildDynamicDevProfileLabel = (profile) => {
  if (!profile || typeof profile !== 'object') return '';
  if (normalizeUpper(profile.entryType) === 'SYSTEM') {
    return DEV_PROFILE_LABEL_BY_KEY.SYSTEM_ADMIN || '';
  }

  const orgName =
    typeof profile.orgName === 'string' && profile.orgName.trim() ? profile.orgName.trim() : '';
  const orgRole = normalizeUpper(profile.orgRole);
  const baseRoleLabel = ORG_ROLE_LABEL_BY_KEY[orgRole] || '';
  const roleLabel =
    profile.isLineLeader === true && orgRole === 'WORKER'
      ? `${baseRoleLabel}(\uB77C\uC778\uC7A5)`
      : baseRoleLabel;

  if (orgName && roleLabel) return `${orgName} ${roleLabel}`;
  if (orgName) return orgName;
  return roleLabel;
};

const normalizeDevProfile = (profile) => {
  if (!profile || typeof profile !== 'object') return null;

  const next = { ...DEFAULT_DEV_PROFILE, ...profile };
  next.key = normalizeUpper(next.key || DEFAULT_DEV_PROFILE.key);
  next.entryType = normalizeUpper(next.entryType || 'ORG');
  next.systemRole = normalizeUpper(next.systemRole || 'USER');
  next.orgType = normalizeUpper(next.orgType);
  next.orgRole = normalizeUpper(next.orgRole);

  const keyLabel = DEV_PROFILE_LABEL_BY_KEY[next.key] || '';
  const hasKnownKey = Boolean(keyLabel);
  const derivedLabel = buildDynamicDevProfileLabel(next);
  const fallbackLabel = keyLabel || derivedLabel || DEFAULT_DEV_PROFILE.label;
  const rawLabel = typeof next.label === 'string' ? next.label.trim() : '';
  const shouldUseFallbackLabel =
    hasKnownKey ||
    hasLikelyMojibake(rawLabel) ||
    (derivedLabel &&
      normalizeCompactLower(rawLabel) === normalizeCompactLower(DEFAULT_DEV_PROFILE.label));
  next.label = shouldUseFallbackLabel ? fallbackLabel : rawLabel;

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
    next.orgName = DEFAULT_DEV_PROFILE.orgName;
    next.isLineLeader = false;
    next.lineLeaderStartAt = null;
    next.lineLeaderEndAt = null;
  }

  return next;
};

const loadDevProfile = () => {
  try {
    const raw = readAuthStorage(DEV_PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return normalizeDevProfile(parsed);
  } catch (_error) {
    return null;
  }
};

const toPositiveOrgId = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const normalizeSubscription = (subscription) => {
  if (!subscription || typeof subscription !== 'object' || Array.isArray(subscription)) {
    return null;
  }

  return {
    status: normalizeOrganizationSubscriptionStatus(subscription.status),
    serviceContactEmail:
      typeof (subscription.serviceContactEmail ?? subscription.membershipEmail) === 'string'
        ? String(subscription.serviceContactEmail ?? subscription.membershipEmail).trim()
        : '',
    membershipEmail:
      typeof (subscription.serviceContactEmail ?? subscription.membershipEmail) === 'string'
        ? String(subscription.serviceContactEmail ?? subscription.membershipEmail).trim()
        : '',
    billingEmail:
      typeof subscription.billingEmail === 'string' ? subscription.billingEmail.trim() : '',
    trialStartedAt: subscription.trialStartedAt ?? null,
    trialEndsAt: subscription.trialEndsAt ?? null,
    activatedAt: subscription.activatedAt ?? null,
    activeEndsAt: subscription.activeEndsAt ?? null,
    graceEndsAt: subscription.graceEndsAt ?? null,
    suspendedAt: subscription.suspendedAt ?? null,
  };
};

const normalizeAccessProfile = (profile) => {
  if (!profile || typeof profile !== 'object') return null;

  const entryType = normalizeUpper(profile.entryType || 'ORG');
  if (entryType === 'SYSTEM') {
    return {
      entryType: 'SYSTEM',
      systemRole: normalizeUpper(profile.systemRole || 'USER'),
      orgType: null,
      orgRole: null,
      orgId: null,
      orgName: null,
      employeeName: null,
      email: typeof profile.email === 'string' ? profile.email.trim().toLowerCase() : '',
      subscription: normalizeSubscription(profile.subscription),
      systemAdminContactEmail:
        typeof profile.systemAdminContactEmail === 'string'
          ? profile.systemAdminContactEmail.trim().toLowerCase()
          : '',
      label:
        typeof profile.label === 'string' && profile.label.trim()
          ? profile.label.trim()
          : DEV_PROFILE_LABEL_BY_KEY.SYSTEM_ADMIN || '',
    };
  }

  if (entryType === 'ONBOARDING') {
    const email = typeof profile.email === 'string' ? profile.email.trim().toLowerCase() : '';
    const pendingMembershipCountRaw = Number(profile.pendingMembershipCount);
    const pendingMembershipCount =
      Number.isFinite(pendingMembershipCountRaw) && pendingMembershipCountRaw > 0
        ? Math.trunc(pendingMembershipCountRaw)
        : 0;

    const latestRegistrationRequest =
      profile.latestRegistrationRequest &&
      typeof profile.latestRegistrationRequest === 'object' &&
      !Array.isArray(profile.latestRegistrationRequest)
        ? profile.latestRegistrationRequest
        : null;

    return {
      entryType: 'ONBOARDING',
      systemRole: normalizeUpper(profile.systemRole || 'USER'),
      orgType: null,
      orgRole: null,
      orgId: null,
      orgName: null,
      employeeName: null,
      factoryId: null,
      email,
      pendingMembershipCount,
      latestRegistrationRequest,
      onboardingRequired: true,
      systemAdminContactEmail:
        typeof profile.systemAdminContactEmail === 'string'
          ? profile.systemAdminContactEmail.trim().toLowerCase()
          : '',
      label: email || '\uC2E0\uADDC \uACC4\uC815',
    };
  }

  const orgType = normalizeUpper(profile.orgType);
  const orgRole = normalizeUpper(profile.orgRole);
  const orgName =
    typeof profile.orgName === 'string' && profile.orgName.trim() ? profile.orgName.trim() : null;
  const employeeName =
    typeof profile.employeeName === 'string' && profile.employeeName.trim()
      ? profile.employeeName.trim()
      : null;
  const roleLabel = ORG_ROLE_LABEL_BY_KEY[orgRole] || orgRole || '';

  const factoryId =
    typeof profile.factoryId === 'number' && profile.factoryId > 0 ? profile.factoryId : null;
  const subscription = normalizeSubscription(profile.subscription);
  const subscriptionStatus = normalizeOrganizationSubscriptionStatus(subscription?.status);
  const subscriptionBlocked = Boolean(subscriptionStatus) &&
    !canUseWorkspaceForOrganizationSubscriptionStatus(subscriptionStatus);

  return {
    entryType: 'ORG',
    systemRole: normalizeUpper(profile.systemRole || 'USER'),
    orgType,
    orgRole,
    orgId: toPositiveOrgId(profile.orgId),
    orgName,
    employeeName,
    factoryId,
    subscription,
    subscriptionStatus,
    subscriptionBlocked,
    systemAdminContactEmail:
      typeof profile.systemAdminContactEmail === 'string'
        ? profile.systemAdminContactEmail.trim().toLowerCase()
        : '',
    email: typeof profile.email === 'string' ? profile.email.trim().toLowerCase() : '',
    label:
      typeof profile.label === 'string' && profile.label.trim()
        ? profile.label.trim()
        : orgName && roleLabel
          ? `${orgName} ${roleLabel}`
          : orgName || roleLabel,
  };
};

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [devBypass, setDevBypass] = useState(() => readAuthStorage(DEV_BYPASS_KEY) === '1');
  const [devProfile, setDevProfile] = useState(() => loadDevProfile());
  const [accessProfile, setAccessProfile] = useState(null);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessLookupEmail, setAccessLookupEmail] = useState('');
  const [loading, setLoading] = useState(() =>
    isSupabaseConfigured && readAuthStorage(DEV_BYPASS_KEY) !== '1'
  );

  useEffect(() => {
    if (!devBypass) return;
    if (devProfile) return;

    setDevProfile(DEFAULT_DEV_PROFILE);
    writeAuthStorage(DEV_PROFILE_KEY, JSON.stringify(DEFAULT_DEV_PROFILE));
  }, [devBypass, devProfile]);

  useEffect(() => {
    if (!devBypass || !devProfile) return;

    const normalized = normalizeDevProfile(devProfile);
    if (!normalized) return;
    if (JSON.stringify(normalized) === JSON.stringify(devProfile)) return;

    setDevProfile(normalized);
    writeAuthStorage(DEV_PROFILE_KEY, JSON.stringify(normalized));
  }, [devBypass, devProfile]);

  useEffect(() => {
    let cancelled = false;
    let accessProfileAbortController = null;

    const loadAccessProfile = async () => {
      // devBypass mode: use devProfile email to fetch real DB profile as background update
      // Normal mode: use session user email
      const email = devBypass
        ? (typeof devProfile?.email === 'string' ? devProfile.email.trim().toLowerCase() : '')
        : (typeof user?.email === 'string' ? user.email.trim().toLowerCase() : '');

      if (!email) {
        if (!cancelled) {
          setAccessLookupEmail('');
          setAccessProfile(null);
          setAccessLoading(false);
        }
        return;
      }

      setAccessLookupEmail(email);
      setAccessLoading(true);
      let abortTimeoutId = null;
      try {
        accessProfileAbortController = new AbortController();
        abortTimeoutId = setTimeout(() => {
          accessProfileAbortController?.abort();
        }, ACCESS_PROFILE_TIMEOUT_MS);

        const data = await requestJSON(
          `/auth/context${buildQueryString({
            email,
          })}`,
          {
            skipGlobalLoading: true,
            signal: accessProfileAbortController.signal,
          }
        );
        if (cancelled) return;
        setAccessProfile(normalizeAccessProfile(data));
      } catch (_error) {
        if (cancelled) return;
        setAccessProfile(null);
      } finally {
        if (abortTimeoutId !== null) {
          clearTimeout(abortTimeoutId);
        }
        if (!cancelled) {
          setAccessLoading(false);
        }
      }
    };

    loadAccessProfile();
    return () => {
      cancelled = true;
      accessProfileAbortController?.abort();
    };
  }, [devBypass, user?.email, devProfile?.email]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return () => {};
    }

    if (devBypass) {
      setLoading(false);
    } else {
      setLoading(true);
    }

    let ignore = false;

    const loadSession = async () => {
      try {
        const { data, error } = await withTimeout(
          supabase.auth.getSession(),
          AUTH_SESSION_TIMEOUT_MS,
          'Supabase session request timed out'
        );
        if (ignore) return;

        if (error) {
          setSession(null);
          setUser(null);
          return;
        }

        setSession(data.session ?? null);
        setUser(data.session?.user ?? null);
      } catch (_error) {
        if (ignore) return;
        setSession(null);
        setUser(null);
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    loadSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession((prev) => {
        const next = nextSession ?? null;
        if (prev?.access_token === next?.access_token) return prev;
        return next;
      });
      setUser((prev) => {
        const next = nextSession?.user ?? null;
        if (prev?.id === next?.id && prev?.email === next?.email) return prev;
        return next;
      });
      setLoading(false);
    });

    return () => {
      ignore = true;
      listener?.subscription?.unsubscribe();
    };
  }, [devBypass]);

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
    setAccessProfile(null);
    setAccessLoading(false);
    setRequestContext({ userEmail: '', orgId: null });
    removeAuthStorage(DEV_BYPASS_KEY);
    removeAuthStorage(DEV_PROFILE_KEY);
  };

  const signOut = async () => {
    clearDevBypass();
    setSession(null);
    setUser(null);
    setLoading(false);

    if (!supabase) {
      console.warn('Supabase is not configured.');
      return;
    }

    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (error) {
      console.warn('Supabase signOut failed:', error);
    }
  };

  const enableDevBypass = (profile = DEFAULT_DEV_PROFILE) => {
    const nextProfile = normalizeDevProfile(profile) || DEFAULT_DEV_PROFILE;

    setDevBypass(true);
    setDevProfile(nextProfile);
    writeAuthStorage(DEV_BYPASS_KEY, '1');
    writeAuthStorage(DEV_PROFILE_KEY, JSON.stringify(nextProfile));
  };

  const normalizedCurrentUserEmail =
    typeof user?.email === 'string' ? user.email.trim().toLowerCase() : '';
  const normalizedDevProfileEmail =
    typeof devProfile?.email === 'string' ? devProfile.email.trim().toLowerCase() : '';
  const normalizedAccessProfileEmail =
    typeof accessProfile?.email === 'string' ? accessProfile.email.trim().toLowerCase() : '';
  const isAccessProfileForCurrentUser =
    !devBypass &&
    !!normalizedCurrentUserEmail &&
    !!accessProfile &&
    normalizedAccessProfileEmail === normalizedCurrentUserEmail;
  const isAccessProfileForDevBypass =
    devBypass &&
    !!normalizedDevProfileEmail &&
    !!accessProfile &&
    normalizedAccessProfileEmail === normalizedDevProfileEmail;
  const normalizedDevAccessProfile = devBypass ? normalizeAccessProfile(devProfile) : null;

  // In devBypass mode, prefer DB-fetched accessProfile; fall back to hardcoded devProfile.
  // In normal mode, ignore stale accessProfile rows from previous sessions.
  const effectiveProfile = devBypass
    ? (isAccessProfileForDevBypass ? accessProfile : normalizedDevAccessProfile)
    : (isAccessProfileForCurrentUser ? accessProfile : null);
  const activeOrgId = toPositiveOrgId(effectiveProfile?.orgId);
  const activeOrgType = normalizeUpper(effectiveProfile?.orgType);
  const activeOrgRole = normalizeUpper(effectiveProfile?.orgRole);
  const activeFactoryId =
    typeof effectiveProfile?.factoryId === 'number' && effectiveProfile.factoryId > 0
      ? effectiveProfile.factoryId
      : null;

  useEffect(() => {
    const emailFromUser = typeof user?.email === 'string' ? user.email.trim().toLowerCase() : '';
    const emailFromProfile =
      typeof effectiveProfile?.email === 'string'
        ? effectiveProfile.email.trim().toLowerCase()
        : '';
    const userEmailForRequestContext = devBypass
      ? (emailFromProfile || emailFromUser)
      : (emailFromUser || emailFromProfile);

    setRequestContext({
      userEmail: userEmailForRequestContext,
      orgId: activeOrgId,
    });
  }, [activeOrgId, devBypass, effectiveProfile?.email, user?.email]);

  const expectedAccessProfileEmail = devBypass
    ? normalizedDevProfileEmail
    : normalizedCurrentUserEmail;
  const loadingState =
    loading ||
    ((devBypass && !!normalizedDevProfileEmail) ||
      (!devBypass && !!user && isSupabaseConfigured)) &&
      (accessLoading || accessLookupEmail !== expectedAccessProfileEmail);
  const hasWorkspaceAccess =
    (!!(user || devBypass) &&
      !!effectiveProfile &&
      normalizeUpper(effectiveProfile.entryType) !== 'ONBOARDING' &&
      normalizeUpper(effectiveProfile.entryType) !== 'ORG') ||
    (!!(user || devBypass) &&
      !!effectiveProfile &&
      normalizeUpper(effectiveProfile.entryType) === 'ORG' &&
      canUseWorkspaceForOrganizationSubscriptionStatus(effectiveProfile.subscriptionStatus));
  const requiresOnboarding =
    !!(user || devBypass) &&
    !!effectiveProfile &&
    normalizeUpper(effectiveProfile.entryType) === 'ONBOARDING';
  const requiresSubscriptionContact =
    !!(user || devBypass) &&
    !!effectiveProfile &&
    normalizeUpper(effectiveProfile.entryType) === 'ORG' &&
    !canUseWorkspaceForOrganizationSubscriptionStatus(effectiveProfile.subscriptionStatus);

  const updateActiveProfile = useCallback(
    (patch = {}) => {
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return;

      setAccessProfile((prev) => {
        const baseProfile =
          prev && typeof prev === 'object'
            ? prev
            : effectiveProfile && typeof effectiveProfile === 'object'
              ? effectiveProfile
              : null;
        if (!baseProfile) return prev;
        return normalizeAccessProfile({ ...baseProfile, ...patch });
      });

      if (!devBypass) return;

      setDevProfile((prev) => {
        const baseProfile =
          prev && typeof prev === 'object'
            ? prev
            : devProfile && typeof devProfile === 'object'
              ? devProfile
              : null;
        if (!baseProfile) return prev;

        const nextProfile = normalizeDevProfile({ ...baseProfile, ...patch });
        if (nextProfile) {
          writeAuthStorage(DEV_PROFILE_KEY, JSON.stringify(nextProfile));
        }
        return nextProfile;
      });
    },
    [devBypass, devProfile, effectiveProfile]
  );

  const value = useMemo(
    () => ({
      session,
      user,
      devBypass,
      devProfile,
      accessProfile,
      activeOrgId,
      activeOrgType,
      activeOrgRole,
      activeFactoryId,
      activeProfile: effectiveProfile,
      loading: loadingState,
      hasWorkspaceAccess,
      requiresOnboarding,
      requiresSubscriptionContact,
      isAuthenticated: !!user || devBypass,
      isSupabaseConfigured,
      signInWithGoogle,
      signOut,
      enableDevBypass,
      updateActiveProfile,
    }),
    [
      session,
      user,
      devBypass,
      devProfile,
      accessProfile,
      activeOrgId,
      activeOrgType,
      activeOrgRole,
      activeFactoryId,
      effectiveProfile,
      loadingState,
      hasWorkspaceAccess,
      requiresOnboarding,
      requiresSubscriptionContact,
      updateActiveProfile,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
