import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';
import { requestJSON, setRequestContext } from '../utils/apiClient';
import {
  canUseWorkspaceForOrganizationSubscriptionStatus,
  normalizeOrganizationSubscriptionStatus,
} from '../constants/organizationAccess';
import { sanitizeRoleAccessPolicy } from '../utils/roleAccessPolicy';

const AuthContext = createContext(null);

const AUTH_SESSION_TIMEOUT_MS = 10_000;
const ACCESS_PROFILE_TIMEOUT_MS = 10_000;

const ORG_ROLE_LABEL_BY_KEY = {
  ADMIN: 'Admin',
  OPERATOR: 'Operator',
  ACCOUNTANT: 'Accountant',
  WORKER: 'Worker',
};

const resolveCanonicalOrigin = () => {
  const raw = String(import.meta.env.VITE_CANONICAL_ORIGIN || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw).origin;
  } catch {
    return '';
  }
};

const resolveAuthCallbackUrl = () => {
  const canonicalOrigin = resolveCanonicalOrigin();
  if (canonicalOrigin) return `${canonicalOrigin}/auth/callback`;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/auth/callback`;
  }
  return undefined;
};

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

const normalizeUpper = (value) =>
  typeof value === 'string' ? value.trim().toUpperCase() : '';

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
  const accessPolicy = sanitizeRoleAccessPolicy(profile.accessPolicy);
  const email = typeof profile.email === 'string' ? profile.email.trim().toLowerCase() : '';
  const systemAdminContactEmail =
    typeof profile.systemAdminContactEmail === 'string'
      ? profile.systemAdminContactEmail.trim().toLowerCase()
      : '';

  if (entryType === 'SYSTEM') {
    return {
      entryType: 'SYSTEM',
      systemRole: normalizeUpper(profile.systemRole || 'USER'),
      orgType: null,
      orgRole: null,
      orgId: null,
      orgName: null,
      employeeName: null,
      factoryId: null,
      email,
      subscription: normalizeSubscription(profile.subscription),
      accessPolicy,
      systemAdminContactEmail,
      label:
        typeof profile.label === 'string' && profile.label.trim()
          ? profile.label.trim()
          : 'System Admin',
    };
  }

  if (entryType === 'ONBOARDING') {
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
      accessPolicy,
      systemAdminContactEmail,
      label: email || 'New Account',
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
    accessPolicy,
    subscriptionStatus,
    subscriptionBlocked,
    systemAdminContactEmail,
    email,
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
  const [accessProfile, setAccessProfile] = useState(null);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessLookupEmail, setAccessLookupEmail] = useState('');
  const [loading, setLoading] = useState(() => isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return () => {};
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
          setRequestContext({ accessToken: '', userEmail: '', orgId: null });
          return;
        }

        const nextSession = data.session ?? null;
        setSession(nextSession);
        setUser(nextSession?.user ?? null);
        setRequestContext({
          accessToken: nextSession?.access_token || '',
          userEmail: nextSession?.user?.email || '',
          orgId: null,
        });
      } catch (_error) {
        if (ignore) return;
        setSession(null);
        setUser(null);
        setRequestContext({ accessToken: '', userEmail: '', orgId: null });
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    loadSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      const normalizedSession = nextSession ?? null;
      setSession((prev) => {
        if (prev?.access_token === normalizedSession?.access_token) return prev;
        return normalizedSession;
      });
      setUser((prev) => {
        const nextUser = normalizedSession?.user ?? null;
        if (prev?.id === nextUser?.id && prev?.email === nextUser?.email) return prev;
        return nextUser;
      });
      setRequestContext({
        accessToken: normalizedSession?.access_token || '',
        userEmail: normalizedSession?.user?.email || '',
        orgId: null,
      });
      setLoading(false);
    });

    return () => {
      ignore = true;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let accessProfileAbortController = null;

    const normalizedCurrentUserEmail =
      typeof user?.email === 'string' ? user.email.trim().toLowerCase() : '';
    const accessToken = typeof session?.access_token === 'string' ? session.access_token : '';

    const loadAccessProfile = async () => {
      if (!normalizedCurrentUserEmail || !accessToken) {
        if (!cancelled) {
          setAccessLookupEmail('');
          setAccessProfile(null);
          setAccessLoading(false);
        }
        return;
      }

      setAccessLookupEmail(normalizedCurrentUserEmail);
      setAccessLoading(true);
      let abortTimeoutId = null;
      try {
        accessProfileAbortController = new AbortController();
        abortTimeoutId = setTimeout(() => {
          accessProfileAbortController?.abort();
        }, ACCESS_PROFILE_TIMEOUT_MS);

        const data = await requestJSON('/auth/context', {
          skipGlobalLoading: true,
          skipCache: true,
          signal: accessProfileAbortController.signal,
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
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
  }, [session?.access_token, user?.email]);

  const normalizedCurrentUserEmail =
    typeof user?.email === 'string' ? user.email.trim().toLowerCase() : '';
  const normalizedAccessProfileEmail =
    typeof accessProfile?.email === 'string' ? accessProfile.email.trim().toLowerCase() : '';
  const isAccessProfileForCurrentUser =
    !!normalizedCurrentUserEmail &&
    !!accessProfile &&
    normalizedAccessProfileEmail === normalizedCurrentUserEmail;
  const effectiveProfile = isAccessProfileForCurrentUser ? accessProfile : null;
  const activeOrgId = toPositiveOrgId(effectiveProfile?.orgId);
  const activeOrgType = normalizeUpper(effectiveProfile?.orgType);
  const activeOrgRole = normalizeUpper(effectiveProfile?.orgRole);
  const activeFactoryId =
    typeof effectiveProfile?.factoryId === 'number' && effectiveProfile.factoryId > 0
      ? effectiveProfile.factoryId
      : null;

  useEffect(() => {
    const userEmail = typeof user?.email === 'string' ? user.email.trim().toLowerCase() : '';
    const profileEmail =
      typeof effectiveProfile?.email === 'string'
        ? effectiveProfile.email.trim().toLowerCase()
        : '';

    setRequestContext({
      accessToken: session?.access_token || '',
      userEmail: userEmail || profileEmail,
      orgId: activeOrgId,
    });
  }, [activeOrgId, effectiveProfile?.email, session?.access_token, user?.email]);

  const loadingState =
    loading ||
    (!!user && isSupabaseConfigured) &&
      (accessLoading || accessLookupEmail !== normalizedCurrentUserEmail);
  const hasWorkspaceAccess =
    !!user &&
    !!effectiveProfile &&
    normalizeUpper(effectiveProfile.entryType) !== 'ONBOARDING' &&
    (
      normalizeUpper(effectiveProfile.entryType) !== 'ORG' ||
      canUseWorkspaceForOrganizationSubscriptionStatus(effectiveProfile.subscriptionStatus)
    );
  const requiresOnboarding =
    !!user &&
    !!effectiveProfile &&
    normalizeUpper(effectiveProfile.entryType) === 'ONBOARDING';
  const requiresSubscriptionContact =
    !!user &&
    !!effectiveProfile &&
    normalizeUpper(effectiveProfile.entryType) === 'ORG' &&
    !canUseWorkspaceForOrganizationSubscriptionStatus(effectiveProfile.subscriptionStatus);

  const signInWithGoogle = async () => {
    if (!supabase) {
      console.warn('Supabase is not configured.');
      return;
    }

    const redirectTo = resolveAuthCallbackUrl();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        ...(redirectTo ? { redirectTo } : {}),
        queryParams: {
          prompt: 'select_account',
        },
      },
    });
  };

  const signOut = async () => {
    setAccessProfile(null);
    setAccessLoading(false);
    setAccessLookupEmail('');
    setSession(null);
    setUser(null);
    setLoading(false);
    setRequestContext({ accessToken: '', userEmail: '', orgId: null });

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

  const enableDevBypass = useCallback(() => {
    console.warn('Dev bypass has been removed.');
  }, []);

  const updateActiveProfile = useCallback((patch = {}) => {
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
  }, [effectiveProfile]);

  const value = useMemo(
    () => ({
      session,
      user,
      devBypass: false,
      devProfile: null,
      accessProfile: effectiveProfile,
      activeOrgId,
      activeOrgType,
      activeOrgRole,
      activeFactoryId,
      activeProfile: effectiveProfile,
      loading: loadingState,
      hasWorkspaceAccess,
      requiresOnboarding,
      requiresSubscriptionContact,
      isAuthenticated: !!user,
      isSupabaseConfigured,
      signInWithGoogle,
      signOut,
      enableDevBypass,
      updateActiveProfile,
    }),
    [
      activeFactoryId,
      activeOrgId,
      activeOrgRole,
      activeOrgType,
      effectiveProfile,
      enableDevBypass,
      hasWorkspaceAccess,
      loadingState,
      requiresOnboarding,
      requiresSubscriptionContact,
      session,
      signOut,
      updateActiveProfile,
      user,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
