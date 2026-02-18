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
  ASSIGNMENT: 'ASSIGNMENT',
  PRODUCTION_PLAN: 'PRODUCTION_PLAN',
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
};

const normalizeUpper = (value) =>
  typeof value === 'string' ? value.trim().toUpperCase() : '';

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

const buildAccessContext = ({ isAuthenticated, devBypass, devProfile }) => {
  if (!isAuthenticated) return null;

  // Until real member-session binding is introduced, keep existing behavior for normal login.
  if (!devBypass) {
    return { allowAll: true, entryType: 'LEGACY' };
  }

  const entryType = normalizeUpper(devProfile?.entryType || 'ORG');
  const systemRole = normalizeUpper(devProfile?.systemRole || 'USER');
  const orgType = normalizeUpper(devProfile?.orgType);
  const orgRole = normalizeUpper(devProfile?.orgRole);

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
    isLineLeader: isLineLeaderActive(devProfile),
  };
};

const canAccessFeatureByContext = (featureKey, context) => {
  if (!featureKey) return true;
  if (!context) return false;
  if (context.allowAll) return true;

  if (context.entryType === 'SYSTEM') {
    return context.systemRole === 'SYSTEM_ADMIN';
  }

  const isOrgMember = hasOrgType(context, ORG_TYPES.MANUFACTURER, ORG_TYPES.BRAND);
  const isManufacturer = hasOrgType(context, ORG_TYPES.MANUFACTURER);

  switch (featureKey) {
    case FEATURE_KEYS.DASHBOARD:
      return (
        isOrgMember &&
        hasOrgRole(
          context,
          ORG_ROLES.ADMIN,
          ORG_ROLES.OPERATOR,
          ORG_ROLES.ACCOUNTANT,
          ORG_ROLES.WORKER
        )
      );
    case FEATURE_KEYS.ORDER:
    case FEATURE_KEYS.STYLE:
      return (
        isOrgMember &&
        hasOrgRole(context, ORG_ROLES.ADMIN, ORG_ROLES.OPERATOR)
      );
    case FEATURE_KEYS.ASSIGNMENT:
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
        hasOrgRole(context, ORG_ROLES.WORKER) &&
        context.isLineLeader === true
      );
    case FEATURE_KEYS.PAYROLL:
      return isManufacturer && hasOrgRole(context, ORG_ROLES.ACCOUNTANT);
    case FEATURE_KEYS.PERMISSION:
      return isManufacturer && hasOrgRole(context, ORG_ROLES.ADMIN);
    case FEATURE_KEYS.SYSTEM_SETTING:
      return false;
    default:
      return false;
  }
};

const resolveFeatureByPath = (pathname) => {
  const path = String(pathname || '').trim();
  if (!path || path === '/') return FEATURE_KEYS.DASHBOARD;
  if (path.startsWith('/order')) return FEATURE_KEYS.ORDER;
  if (path.startsWith('/style')) return FEATURE_KEYS.STYLE;
  if (path.startsWith('/assignment')) return FEATURE_KEYS.ASSIGNMENT;
  if (path.startsWith('/production-plan')) return FEATURE_KEYS.PRODUCTION_PLAN;
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
  return null;
};

export const canAccessPath = (pathname, authState) => {
  const featureKey = resolveFeatureByPath(pathname);
  if (!featureKey) return true;
  const context = buildAccessContext(authState || {});
  return canAccessFeatureByContext(featureKey, context);
};

export const canAccessFeature = (featureKey, authState) => {
  const context = buildAccessContext(authState || {});
  return canAccessFeatureByContext(featureKey, context);
};

export { FEATURE_KEYS, ORG_ROLES, ORG_TYPES };
