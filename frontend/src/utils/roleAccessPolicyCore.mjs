export const ORG_TYPE_KEYS = {
  MANUFACTURER: 'MANUFACTURER',
  BRAND: 'BRAND',
};

export const ORG_ROLE_KEYS = {
  ADMIN: 'ADMIN',
  OPERATOR: 'OPERATOR',
  ACCOUNTANT: 'ACCOUNTANT',
  WORKER: 'WORKER',
};

export const ACCESS_FEATURE_KEYS = {
  DASHBOARD: 'DASHBOARD',
  ORDER: 'ORDER',
  STYLE: 'STYLE',
  ST_REVIEW: 'ST_REVIEW',
  SHIPMENT_REVIEW: 'SHIPMENT_REVIEW',
  ASSIGNMENT: 'ASSIGNMENT',
  PRODUCTION_PLAN: 'PRODUCTION_PLAN',
  INVENTORY: 'INVENTORY',
  ATTENDANCE: 'ATTENDANCE',
  WORK_HISTORY: 'WORK_HISTORY',
  PAYROLL: 'PAYROLL',
  BUSINESS: 'BUSINESS',
  LINE: 'LINE',
  EMPLOYEE: 'EMPLOYEE',
  CUSTOMER: 'CUSTOMER',
  PERMISSION: 'PERMISSION',
  HOLIDAY: 'HOLIDAY',
  SUBSCRIPTION: 'SUBSCRIPTION',
};

export const ROLE_ACCESS_POLICY_SCHEMA_VERSION = 2;
const ROLE_ACCESS_POLICY_SCHEMA_VERSION_KEY = '__schemaVersion';
const POLICY_ORG_TYPES = [ORG_TYPE_KEYS.MANUFACTURER, ORG_TYPE_KEYS.BRAND];
const POLICY_ORG_ROLES = [
  ORG_ROLE_KEYS.ADMIN,
  ORG_ROLE_KEYS.OPERATOR,
  ORG_ROLE_KEYS.ACCOUNTANT,
  ORG_ROLE_KEYS.WORKER,
];
const POLICY_FEATURES = Object.values(ACCESS_FEATURE_KEYS).filter(
  (featureKey) => featureKey !== ACCESS_FEATURE_KEYS.SUBSCRIPTION
);

const DEFAULT_ROLE_ACCESS_POLICY = Object.freeze({
  [ORG_TYPE_KEYS.MANUFACTURER]: Object.freeze({
    [ORG_ROLE_KEYS.ADMIN]: Object.freeze([...POLICY_FEATURES]),
    [ORG_ROLE_KEYS.OPERATOR]: Object.freeze([
      ACCESS_FEATURE_KEYS.DASHBOARD,
      ACCESS_FEATURE_KEYS.ORDER,
      ACCESS_FEATURE_KEYS.STYLE,
      ACCESS_FEATURE_KEYS.ST_REVIEW,
      ACCESS_FEATURE_KEYS.SHIPMENT_REVIEW,
      ACCESS_FEATURE_KEYS.ASSIGNMENT,
      ACCESS_FEATURE_KEYS.PRODUCTION_PLAN,
      ACCESS_FEATURE_KEYS.INVENTORY,
      ACCESS_FEATURE_KEYS.ATTENDANCE,
      ACCESS_FEATURE_KEYS.WORK_HISTORY,
      ACCESS_FEATURE_KEYS.LINE,
      ACCESS_FEATURE_KEYS.CUSTOMER,
    ]),
    [ORG_ROLE_KEYS.ACCOUNTANT]: Object.freeze([
      ACCESS_FEATURE_KEYS.DASHBOARD,
      ACCESS_FEATURE_KEYS.PAYROLL,
      ACCESS_FEATURE_KEYS.BUSINESS,
      ACCESS_FEATURE_KEYS.EMPLOYEE,
      ACCESS_FEATURE_KEYS.HOLIDAY,
    ]),
    [ORG_ROLE_KEYS.WORKER]: Object.freeze([ACCESS_FEATURE_KEYS.DASHBOARD]),
  }),
  [ORG_TYPE_KEYS.BRAND]: Object.freeze({
    [ORG_ROLE_KEYS.ADMIN]: Object.freeze([
      ACCESS_FEATURE_KEYS.DASHBOARD,
      ACCESS_FEATURE_KEYS.ORDER,
      ACCESS_FEATURE_KEYS.STYLE,
    ]),
    [ORG_ROLE_KEYS.OPERATOR]: Object.freeze([
      ACCESS_FEATURE_KEYS.DASHBOARD,
      ACCESS_FEATURE_KEYS.ORDER,
      ACCESS_FEATURE_KEYS.STYLE,
    ]),
    [ORG_ROLE_KEYS.ACCOUNTANT]: Object.freeze([ACCESS_FEATURE_KEYS.DASHBOARD]),
    [ORG_ROLE_KEYS.WORKER]: Object.freeze([ACCESS_FEATURE_KEYS.DASHBOARD]),
  }),
});

const cloneDeepJson = (value) => JSON.parse(JSON.stringify(value));

const normalizeFeatureKey = (value) => {
  const upper = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return POLICY_FEATURES.includes(upper) ? upper : '';
};

const normalizeRoleKey = (value) => {
  const upper = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return POLICY_ORG_ROLES.includes(upper) ? upper : '';
};

const normalizeOrgTypeKey = (value) => {
  const upper = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return POLICY_ORG_TYPES.includes(upper) ? upper : '';
};

const sanitizeFeatureArray = (value) => {
  const rows = Array.isArray(value) ? value : [];
  return Array.from(
    new Set(rows.map((item) => normalizeFeatureKey(item)).filter(Boolean))
  );
};

const hasPolicySchemaVersion = (value) => {
  const schemaVersion = Number(
    value?.[ROLE_ACCESS_POLICY_SCHEMA_VERSION_KEY] ?? value?.schemaVersion ?? 0
  );
  return (
    Number.isFinite(schemaVersion) &&
    schemaVersion >= ROLE_ACCESS_POLICY_SCHEMA_VERSION
  );
};

const applyLegacyDashboardDefault = (policy) => {
  POLICY_ORG_TYPES.forEach((orgType) => {
    POLICY_ORG_ROLES.forEach((role) => {
      const features = policy?.[orgType]?.[role];
      if (!Array.isArray(features)) return;
      if (features.includes(ACCESS_FEATURE_KEYS.DASHBOARD)) return;
      features.unshift(ACCESS_FEATURE_KEYS.DASHBOARD);
    });
  });
};

export const getDefaultRoleAccessPolicy = () =>
  cloneDeepJson(DEFAULT_ROLE_ACCESS_POLICY);

export const sanitizeRoleAccessPolicy = (candidate) => {
  const base = getDefaultRoleAccessPolicy();
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return base;
  }

  POLICY_ORG_TYPES.forEach((orgType) => {
    const requestedRoles =
      candidate[orgType] &&
      typeof candidate[orgType] === 'object' &&
      !Array.isArray(candidate[orgType])
        ? candidate[orgType]
        : {};
    POLICY_ORG_ROLES.forEach((role) => {
      if (requestedRoles[role] === undefined) return;
      base[orgType][role] = sanitizeFeatureArray(requestedRoles[role]);
    });
  });

  if (!hasPolicySchemaVersion(candidate)) {
    applyLegacyDashboardDefault(base);
  }

  return base;
};

export const serializeRoleAccessPolicy = (policy) => {
  const versionedPolicy = {
    [ROLE_ACCESS_POLICY_SCHEMA_VERSION_KEY]: ROLE_ACCESS_POLICY_SCHEMA_VERSION,
    ...(policy && typeof policy === 'object' && !Array.isArray(policy) ? policy : {}),
  };
  return {
    [ROLE_ACCESS_POLICY_SCHEMA_VERSION_KEY]: ROLE_ACCESS_POLICY_SCHEMA_VERSION,
    ...sanitizeRoleAccessPolicy(versionedPolicy),
  };
};

export const getAllowedFeaturesForRole = ({ orgType, orgRole, policy = null }) => {
  const resolvedPolicy = sanitizeRoleAccessPolicy(
    policy ?? getDefaultRoleAccessPolicy()
  );
  const normalizedOrgType = normalizeOrgTypeKey(orgType);
  const normalizedOrgRole = normalizeRoleKey(orgRole);
  if (!normalizedOrgType || !normalizedOrgRole) return [];
  return sanitizeFeatureArray(
    resolvedPolicy?.[normalizedOrgType]?.[normalizedOrgRole]
  );
};

export const getPolicyOrgTypes = () => [...POLICY_ORG_TYPES];
export const getPolicyOrgRoles = () => [...POLICY_ORG_ROLES];
export const getPolicyFeatures = () => [...POLICY_FEATURES];
