import {
  getAllowedFeaturesForRole,
  sanitizeRoleAccessPolicy,
} from './roleAccessPolicyCore.mjs';

const ORG_TYPES = {
  MANUFACTURER: 'MANUFACTURER',
  BRAND: 'BRAND',
};

const ORG_ROLES = {
  ADMIN: 'ADMIN',
  OPERATOR: 'OPERATOR',
  ACCOUNTANT: 'ACCOUNTANT',
  WORKER: 'WORKER',
};

const FEATURE_KEYS = {
  DASHBOARD: 'DASHBOARD',
  ORDER: 'ORDER',
  STYLE: 'STYLE',
  ST_REVIEW: 'ST_REVIEW',
  SHIPMENT_REVIEW: 'SHIPMENT_REVIEW',
  ASSIGNMENT: 'ASSIGNMENT',
  PRODUCTION_PLAN: 'PRODUCTION_PLAN',
  INVENTORY: 'INVENTORY',
  ATTENDANCE: 'ATTENDANCE',
  PRODUCTION_ANALYSIS: 'PRODUCTION_ANALYSIS',
  WORK_HISTORY: 'WORK_HISTORY',
  PAYROLL: 'PAYROLL',
  REVENUE_ANALYSIS: 'REVENUE_ANALYSIS',
  BUSINESS: 'BUSINESS',
  LINE: 'LINE',
  EMPLOYEE: 'EMPLOYEE',
  CUSTOMER: 'CUSTOMER',
  ATTRIBUTE: 'ATTRIBUTE',
  PERMISSION: 'PERMISSION',
  HOLIDAY: 'HOLIDAY',
  SUBSCRIPTION: 'SUBSCRIPTION',
  SYSTEM_SETTING: 'SYSTEM_SETTING',
  SYSTEM_ONBOARDING: 'SYSTEM_ONBOARDING',
  PROFILE: 'PROFILE',
};

const normalizeUpper = (value) =>
  typeof value === 'string' ? value.trim().toUpperCase() : '';

const normalizePathname = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '/';
  const withoutHash = raw.split('#')[0];
  const pathname = withoutHash.split('?')[0];
  return pathname || '/';
};

const toDateOrNull = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const isLineLeaderActive = (profile) => {
  if (!profile || typeof profile !== 'object') return false;
  if (profile.isLineLeader === true) return true;

  const startAt = toDateOrNull(profile.lineLeaderStartAt);
  const endAt = toDateOrNull(profile.lineLeaderEndAt);
  if (!startAt && !endAt) return false;

  const now = new Date();
  if (startAt && now < startAt) return false;
  if (endAt && now > endAt) return false;
  return true;
};

const hasOrgRole = (context, ...roles) =>
  context.entryType === 'ORG' && roles.includes(context.orgRole);

const hasOrgType = (context, ...orgTypes) =>
  context.entryType === 'ORG' && orgTypes.includes(context.orgType);

const resolveFeatureSetForContext = (context) => {
  if (!context || context.entryType !== 'ORG') return new Set();
  return new Set(
    getAllowedFeaturesForRole({
      orgType: context.orgType,
      orgRole: context.orgRole,
      policy: context.accessPolicy,
    })
  );
};

const buildAccessContext = ({
  isAuthenticated,
  devBypass,
  devProfile,
  accessProfile,
}) => {
  if (!isAuthenticated) return null;
  const baseProfile = devBypass ? (accessProfile || devProfile) : accessProfile;
  if (!baseProfile || typeof baseProfile !== 'object') return null;

  const entryType = normalizeUpper(baseProfile?.entryType || 'ORG');
  const systemRole = normalizeUpper(baseProfile?.systemRole || 'USER');
  const orgType = normalizeUpper(baseProfile?.orgType);
  const orgRole = normalizeUpper(baseProfile?.orgRole);

  if (entryType === 'ONBOARDING') {
    return null;
  }

  if (entryType === 'SYSTEM') {
    return {
      allowAll: false,
      entryType: 'SYSTEM',
      systemRole,
    };
  }

  return {
    allowAll: false,
    entryType: 'ORG',
    orgType,
    orgRole,
    isLineLeader: isLineLeaderActive(baseProfile),
    accessPolicy: sanitizeRoleAccessPolicy(baseProfile?.accessPolicy),
  };
};

const canAccessFeatureByContext = (featureKey, context) => {
  if (!featureKey) return true;
  if (!context) return false;
  if (context.allowAll) return true;

  if (context.entryType === 'SYSTEM') {
    return (
      context.systemRole === 'SYSTEM_ADMIN' &&
      (featureKey === FEATURE_KEYS.DASHBOARD ||
        featureKey === FEATURE_KEYS.ATTRIBUTE ||
        featureKey === FEATURE_KEYS.SUBSCRIPTION ||
        featureKey === FEATURE_KEYS.SYSTEM_SETTING ||
        featureKey === FEATURE_KEYS.SYSTEM_ONBOARDING ||
        featureKey === FEATURE_KEYS.EMPLOYEE)
    );
  }

  const isOrgMember = hasOrgType(context, ORG_TYPES.MANUFACTURER, ORG_TYPES.BRAND);
  const featureSet = resolveFeatureSetForContext(context);

  switch (featureKey) {
    case FEATURE_KEYS.PROFILE:
      return isOrgMember;
    case FEATURE_KEYS.SUBSCRIPTION:
    case FEATURE_KEYS.SYSTEM_SETTING:
    case FEATURE_KEYS.SYSTEM_ONBOARDING:
    case FEATURE_KEYS.ATTRIBUTE:
      return false;
    default:
      return isOrgMember && featureSet.has(featureKey);
  }
};

export const resolveFeatureByPath = (pathname) => {
  const path = normalizePathname(pathname);
  if (path === '/') return null;
  if (path.startsWith('/dashboard')) return FEATURE_KEYS.DASHBOARD;
  if (path.startsWith('/order')) return FEATURE_KEYS.ORDER;
  if (path.startsWith('/style')) return FEATURE_KEYS.STYLE;
  if (path.startsWith('/st-review')) return FEATURE_KEYS.ST_REVIEW;
  if (path.startsWith('/shipment-review')) return FEATURE_KEYS.SHIPMENT_REVIEW;
  if (path.startsWith('/qc-review')) return FEATURE_KEYS.SHIPMENT_REVIEW;
  if (path.startsWith('/assignment')) return FEATURE_KEYS.ASSIGNMENT;
  if (path.startsWith('/production-plan')) return FEATURE_KEYS.PRODUCTION_PLAN;
  if (path.startsWith('/inventory')) return FEATURE_KEYS.INVENTORY;
  if (path.startsWith('/attendance')) return FEATURE_KEYS.ATTENDANCE;
  if (path.startsWith('/production-analysis')) return FEATURE_KEYS.PRODUCTION_ANALYSIS;
  if (path.startsWith('/work-history')) return FEATURE_KEYS.WORK_HISTORY;
  if (path.startsWith('/payroll')) return FEATURE_KEYS.PAYROLL;
  if (path.startsWith('/revenue-analysis')) return FEATURE_KEYS.REVENUE_ANALYSIS;
  if (path.startsWith('/revenue-forecast')) return FEATURE_KEYS.REVENUE_ANALYSIS;
  if (path.startsWith('/business')) return FEATURE_KEYS.BUSINESS;
  if (path.startsWith('/line')) return FEATURE_KEYS.LINE;
  if (path.startsWith('/employee')) return FEATURE_KEYS.EMPLOYEE;
  if (path.startsWith('/customer')) return FEATURE_KEYS.CUSTOMER;
  if (path.startsWith('/attribute')) return FEATURE_KEYS.ATTRIBUTE;
  if (path.startsWith('/permission')) return FEATURE_KEYS.PERMISSION;
  if (path.startsWith('/holiday')) return FEATURE_KEYS.HOLIDAY;
  if (path === '/system-setting' || path === '/system-setting/') return FEATURE_KEYS.SUBSCRIPTION;
  if (path.startsWith('/system-setting')) return FEATURE_KEYS.SYSTEM_SETTING;
  if (path.startsWith('/system-onboarding')) return FEATURE_KEYS.SYSTEM_ONBOARDING;
  if (path.startsWith('/profile')) return FEATURE_KEYS.PROFILE;
  return null;
};

export const canAccessPath = (pathname, authState) => {
  const context = buildAccessContext(authState || {});
  const path = normalizePathname(pathname);
  // The root route is a redirect-only shell. Allow authenticated users to enter it.
  if (path === '/') return Boolean(context);
  const featureKey = resolveFeatureByPath(path);
  if (!featureKey) return true;
  return canAccessFeatureByContext(featureKey, context);
};

export const canAccessFeature = (featureKey, authState) => {
  const context = buildAccessContext(authState || {});
  return canAccessFeatureByContext(featureKey, context);
};

const ACCESS_PATH_PRIORITY = [
  '/workspace',
  '/dashboard',
  '/order',
  '/style',
  '/st-review',
  '/shipment-review',
  '/qc-review',
  '/assignment',
  '/production-plan',
  '/inventory',
  '/work-history',
  '/attendance',
  '/production-analysis',
  '/payroll',
  '/business',
  '/line',
  '/employee',
  '/customer',
  '/profile',
  '/permission',
  '/holiday',
  '/system-onboarding',
  '/system-setting',
  '/attribute',
];

export const resolveFirstAccessiblePath = (authState, options = {}) => {
  const excludedPaths = new Set(
    (Array.isArray(options.excludePaths) ? options.excludePaths : [])
      .map((path) => normalizePathname(path))
      .filter((path) => path !== '/')
  );

  for (const path of ACCESS_PATH_PRIORITY) {
    if (excludedPaths.has(path)) continue;
    if (canAccessPath(path, authState)) return path;
  }
  if (excludedPaths.size > 0) {
    for (const path of ACCESS_PATH_PRIORITY) {
      if (canAccessPath(path, authState)) return path;
    }
  }
  return '/login';
};

export { FEATURE_KEYS, ORG_ROLES, ORG_TYPES };
