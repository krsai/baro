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
  ORDER: 'ORDER',
  STYLE: 'STYLE',
  ASSIGNMENT: 'ASSIGNMENT',
  PRODUCTION_PLAN: 'PRODUCTION_PLAN',
  CT_REVIEW: 'CT_REVIEW',
  PRODUCTION_RESULT: 'PRODUCTION_RESULT',
  INVENTORY: 'INVENTORY',
  ATTENDANCE: 'ATTENDANCE',
  WORK_HISTORY: 'WORK_HISTORY',
  PAYROLL: 'PAYROLL',
  BUSINESS: 'BUSINESS',
  LINE: 'LINE',
  EMPLOYEE: 'EMPLOYEE',
  CUSTOMER: 'CUSTOMER',
  ATTRIBUTE: 'ATTRIBUTE',
  PERMISSION: 'PERMISSION',
  HOLIDAY: 'HOLIDAY',
  SYSTEM_SETTING: 'SYSTEM_SETTING',
  SYSTEM_ONBOARDING: 'SYSTEM_ONBOARDING',
  PROFILE: 'PROFILE',
};

const MANUFACTURER_FEATURES = new Set([
  FEATURE_KEYS.PROFILE,
  FEATURE_KEYS.ORDER,
  FEATURE_KEYS.STYLE,
  FEATURE_KEYS.ASSIGNMENT,
  FEATURE_KEYS.PRODUCTION_PLAN,
  FEATURE_KEYS.CT_REVIEW,
  FEATURE_KEYS.PRODUCTION_RESULT,
  FEATURE_KEYS.INVENTORY,
  FEATURE_KEYS.ATTENDANCE,
  FEATURE_KEYS.WORK_HISTORY,
  FEATURE_KEYS.PAYROLL,
  FEATURE_KEYS.BUSINESS,
  FEATURE_KEYS.LINE,
  FEATURE_KEYS.EMPLOYEE,
  FEATURE_KEYS.CUSTOMER,
  FEATURE_KEYS.ATTRIBUTE,
  FEATURE_KEYS.PERMISSION,
  FEATURE_KEYS.HOLIDAY,
]);

const BRAND_FEATURES = new Set([
  FEATURE_KEYS.PROFILE,
  FEATURE_KEYS.ORDER,
  FEATURE_KEYS.STYLE,
]);

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

const buildAccessContext = ({
  isAuthenticated,
  devBypass,
  devProfile,
  accessProfile,
}) => {
  if (!isAuthenticated) return null;
  const baseProfile = devBypass ? devProfile : accessProfile;
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
  };
};

const canAccessFeatureByContext = (featureKey, context) => {
  if (!featureKey) return true;
  if (!context) return false;
  if (context.allowAll) return true;

  if (context.entryType === 'SYSTEM') {
    return (
      context.systemRole === 'SYSTEM_ADMIN' &&
      (featureKey === FEATURE_KEYS.SYSTEM_SETTING ||
        featureKey === FEATURE_KEYS.SYSTEM_ONBOARDING)
    );
  }

  const isOrgMember = hasOrgType(context, ORG_TYPES.MANUFACTURER, ORG_TYPES.BRAND);
  const isManufacturer = hasOrgType(context, ORG_TYPES.MANUFACTURER);
  const isBrand = hasOrgType(context, ORG_TYPES.BRAND);

  // Org admin is the top role within the same org type feature scope.
  if (hasOrgRole(context, ORG_ROLES.ADMIN)) {
    if (isManufacturer) return MANUFACTURER_FEATURES.has(featureKey);
    if (isBrand) return BRAND_FEATURES.has(featureKey);
  }

  switch (featureKey) {
    case FEATURE_KEYS.PROFILE:
      return isOrgMember;
    case FEATURE_KEYS.ORDER:
    case FEATURE_KEYS.STYLE:
      return (
        isOrgMember &&
        hasOrgRole(context, ORG_ROLES.ADMIN, ORG_ROLES.OPERATOR)
      );
    case FEATURE_KEYS.ASSIGNMENT:
    case FEATURE_KEYS.INVENTORY:
    case FEATURE_KEYS.ATTENDANCE:
    case FEATURE_KEYS.WORK_HISTORY:
    case FEATURE_KEYS.BUSINESS:
    case FEATURE_KEYS.LINE:
    case FEATURE_KEYS.EMPLOYEE:
    case FEATURE_KEYS.CUSTOMER:
    case FEATURE_KEYS.ATTRIBUTE:
    case FEATURE_KEYS.HOLIDAY:
      return (
        isManufacturer &&
        hasOrgRole(context, ORG_ROLES.ADMIN, ORG_ROLES.OPERATOR)
      );
    case FEATURE_KEYS.PRODUCTION_PLAN:
      return (
        isManufacturer &&
        (
          hasOrgRole(context, ORG_ROLES.ADMIN) ||
          (hasOrgRole(context, ORG_ROLES.WORKER) && context.isLineLeader === true)
        )
      );
    case FEATURE_KEYS.CT_REVIEW:
      return isManufacturer && hasOrgRole(context, ORG_ROLES.ADMIN, ORG_ROLES.OPERATOR);
    case FEATURE_KEYS.PRODUCTION_RESULT:
      return (
        isManufacturer &&
        hasOrgRole(context, ORG_ROLES.ADMIN, ORG_ROLES.OPERATOR, ORG_ROLES.ACCOUNTANT)
      );
    case FEATURE_KEYS.PAYROLL:
      return (
        isManufacturer &&
        hasOrgRole(context, ORG_ROLES.ADMIN, ORG_ROLES.OPERATOR, ORG_ROLES.ACCOUNTANT)
      );
    case FEATURE_KEYS.PERMISSION:
      return isManufacturer && hasOrgRole(context, ORG_ROLES.ADMIN);
    case FEATURE_KEYS.SYSTEM_SETTING:
    case FEATURE_KEYS.SYSTEM_ONBOARDING:
      return false;
    default:
      return false;
  }
};

const resolveFeatureByPath = (pathname) => {
  const path = normalizePathname(pathname);
  if (path === '/') return null;
  if (path.startsWith('/order')) return FEATURE_KEYS.ORDER;
  if (path.startsWith('/style')) return FEATURE_KEYS.STYLE;
  if (path.startsWith('/assignment')) return FEATURE_KEYS.ASSIGNMENT;
  if (path.startsWith('/production-plan')) return FEATURE_KEYS.PRODUCTION_PLAN;
  if (path.startsWith('/ct-review')) return FEATURE_KEYS.CT_REVIEW;
  if (path.startsWith('/production-result')) return FEATURE_KEYS.PRODUCTION_RESULT;
  if (path.startsWith('/inventory')) return FEATURE_KEYS.INVENTORY;
  if (path.startsWith('/attendance')) return FEATURE_KEYS.ATTENDANCE;
  if (path.startsWith('/work-history')) return FEATURE_KEYS.WORK_HISTORY;
  if (path.startsWith('/payroll')) return FEATURE_KEYS.PAYROLL;
  if (path.startsWith('/business')) return FEATURE_KEYS.BUSINESS;
  if (path.startsWith('/line')) return FEATURE_KEYS.LINE;
  if (path.startsWith('/employee')) return FEATURE_KEYS.EMPLOYEE;
  if (path.startsWith('/customer')) return FEATURE_KEYS.CUSTOMER;
  if (path.startsWith('/attribute')) return FEATURE_KEYS.ATTRIBUTE;
  if (path.startsWith('/permission')) return FEATURE_KEYS.PERMISSION;
  if (path.startsWith('/holiday')) return FEATURE_KEYS.HOLIDAY;
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
  '/order',
  '/style',
  '/assignment',
  '/production-plan',
  '/ct-review',
  '/inventory',
  '/work-history',
  '/attendance',
  '/payroll',
  '/production-result',
  '/business',
  '/line',
  '/employee',
  '/customer',
  '/profile',
  '/attribute',
  '/permission',
  '/holiday',
  '/system-onboarding',
  '/system-setting',
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
