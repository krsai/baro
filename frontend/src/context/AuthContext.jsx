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
import { clearLoginCompany, findLoginWorkspace, readLoginCompany, rememberLoginCompany } from '../utils/loginCompanySelection.mjs';

const AuthContext = createContext(null);
const WORKSPACE_SELECTION_KEY = 'baro:workspace-selection';
const readWorkspaceSelection = () => {try{return JSON.parse(sessionStorage.getItem(WORKSPACE_SELECTION_KEY) || 'null');}catch{return null;}};

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
  const [workspaceSelection, setWorkspaceSelection] = useState(readWorkspaceSelection);
  const [workspaces, setWorkspaces] = useState([]);
  const [canCreateCompany, setCanCreateCompany] = useState(false);
  const [workspaceReload, setWorkspaceReload] = useState(0);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessError, setAccessError] = useState('');
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
          setAccessError('');
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
        setAccessError('');
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
          setAccessError('');
          setAccessLookupEmail('');
          setAccessProfile(null);
          setAccessLoading(false);
        }
        return;
      }

      if(accessLookupEmail!==normalizedCurrentUserEmail){setWorkspaces([]);setCanCreateCompany(false);}
      setAccessLookupEmail(normalizedCurrentUserEmail);
      setAccessLoading(true);
      setAccessError('');
      let abortTimeoutId = null;
      try {
        accessProfileAbortController = new AbortController();
        abortTimeoutId = setTimeout(() => {
          accessProfileAbortController?.abort();
        }, ACCESS_PROFILE_TIMEOUT_MS);

        const selectedKey=workspaceSelection?.email===normalizedCurrentUserEmail?workspaceSelection.key:null;
        const orgId=selectedKey?.startsWith('org:')?Number(selectedKey.slice(4)):null;
        const options={
          skipGlobalLoading: true,
          skipCache: true,
          signal: accessProfileAbortController.signal,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'x-org-id': orgId ? String(orgId) : '',
          },
        };
        const choices=await requestJSON('/auth/workspaces',options);
        if(cancelled)return;
        setWorkspaces(choices.workspaces || []);setCanCreateCompany(!!choices.canCreateCompany);
        const requestedCompany=readLoginCompany();
        if(requestedCompany){
          const requestedWorkspace=findLoginWorkspace(choices.workspaces || [],requestedCompany);
          if(requestedWorkspace){
            const selection={email:normalizedCurrentUserEmail,key:requestedWorkspace.key};
            sessionStorage.setItem(WORKSPACE_SELECTION_KEY,JSON.stringify(selection));
            clearLoginCompany();setAccessProfile(null);setWorkspaceSelection(selection);return;
          }
          // Never silently enter a previous/default company if the requested
          // company is unavailable to this Google account.
          if(selectedKey){sessionStorage.removeItem(WORKSPACE_SELECTION_KEY);setWorkspaceSelection(null);setAccessProfile(null);return;}
        }
        if(selectedKey && !choices.workspaces.some(row=>row.key===selectedKey)){
          sessionStorage.removeItem(WORKSPACE_SELECTION_KEY);setWorkspaceSelection(null);setAccessProfile(null);return;
        }
        const data=await requestJSON(`/auth/context${orgId?`?orgId=${orgId}`:''}`,options);
        if (cancelled) return;
        if(orgId && (data.entryType!=='ORG' || Number(data.orgId)!==orgId))throw new Error('COMPANY_CONTEXT_MISMATCH');
        if(selectedKey==='system' && (data.entryType!=='SYSTEM' || data.systemRole!=='SYSTEM_ADMIN'))throw new Error('SYSTEM_CONTEXT_MISMATCH');
        setAccessProfile(normalizeAccessProfile(data));
      } catch (_error) {
        if (cancelled) return;
        // Token refreshes commonly happen after the browser has been in the
        // background. A transient context request failure must not discard an
        // already-valid profile, because ProtectedRoute would then unmount the
        // entire workspace and reset every keep-alive tab.
        setAccessProfile((previous) => {
          const previousEmail =
            typeof previous?.email === 'string' ? previous.email.trim().toLowerCase() : '';
          return previousEmail === normalizedCurrentUserEmail ? previous : null;
        });
        setAccessError('Failed to load account access context.');
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
  }, [session?.access_token, user?.email, workspaceSelection, workspaceReload]);

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
      (
        accessLookupEmail !== normalizedCurrentUserEmail ||
        (accessLoading && !effectiveProfile) ||
        (!effectiveProfile && !accessError)
      );
  const requiresWorkspaceSelection=!!user && accessLookupEmail===normalizedCurrentUserEmail && workspaces.length>0 && !(workspaceSelection?.email===normalizedCurrentUserEmail && workspaces.some(row=>row.key===workspaceSelection.key));
  const selectWorkspace=useCallback(key=>{
    if(!workspaces.some(row=>row.key===key))throw new Error('COMPANY_ACCESS_DENIED');
    const selection={email:normalizedCurrentUserEmail,key};
    clearLoginCompany();
    sessionStorage.setItem(WORKSPACE_SELECTION_KEY,JSON.stringify(selection));
    setAccessProfile(null);setAccessLoading(true);setWorkspaceSelection(selection);
  },[workspaces,normalizedCurrentUserEmail]);
  const clearWorkspaceSelection=useCallback(()=>{
    sessionStorage.removeItem(WORKSPACE_SELECTION_KEY);setWorkspaceSelection(null);setAccessProfile(null);setAccessLoading(true);
  },[]);
  const reloadWorkspaces=useCallback(()=>setWorkspaceReload(value=>value+1),[]);
  const hasWorkspaceAccess = !requiresWorkspaceSelection &&
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

  const signInWithGoogle = async (companyKey) => {
    if (!supabase) {
      console.warn('Supabase is not configured.');
      return;
    }

    if(companyKey)rememberLoginCompany(companyKey);
    const redirectTo = resolveAuthCallbackUrl();
    const result=await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        ...(redirectTo ? { redirectTo } : {}),
        queryParams: {
          prompt: 'select_account',
        },
      },
    });
    if(result?.error)throw result.error;
  };

  const signOut = async () => {
    clearLoginCompany();
    sessionStorage.removeItem(WORKSPACE_SELECTION_KEY);setWorkspaceSelection(null);setWorkspaces([]);setCanCreateCompany(false);
    setAccessProfile(null);
    setAccessLoading(false);
    setAccessError('');
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
      accessError,
      loading: loadingState,
      hasWorkspaceAccess,
      workspaces,canCreateCompany,requiresWorkspaceSelection,selectWorkspace,clearWorkspaceSelection,reloadWorkspaces,
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
      accessError,
      effectiveProfile,
      enableDevBypass,
      hasWorkspaceAccess,
      workspaces,canCreateCompany,requiresWorkspaceSelection,selectWorkspace,clearWorkspaceSelection,reloadWorkspaces,
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
