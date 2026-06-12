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
  ORDER: 'ORDER',
  STYLE: 'STYLE',
  ST_REVIEW: 'ST_REVIEW',
  SHIPMENT_REVIEW: 'SHIPMENT_REVIEW',
  ASSIGNMENT: 'ASSIGNMENT',
  PRODUCTION_PLAN: 'PRODUCTION_PLAN',
  PRODUCTION_RESULT: 'PRODUCTION_RESULT',
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
      ACCESS_FEATURE_KEYS.PAYROLL,
      ACCESS_FEATURE_KEYS.PRODUCTION_RESULT,
      ACCESS_FEATURE_KEYS.BUSINESS,
      ACCESS_FEATURE_KEYS.EMPLOYEE,
      ACCESS_FEATURE_KEYS.HOLIDAY,
    ]),
    [ORG_ROLE_KEYS.WORKER]: Object.freeze([]),
  }),
  [ORG_TYPE_KEYS.BRAND]: Object.freeze({
    [ORG_ROLE_KEYS.ADMIN]: Object.freeze([
      ACCESS_FEATURE_KEYS.ORDER,
      ACCESS_FEATURE_KEYS.STYLE,
    ]),
    [ORG_ROLE_KEYS.OPERATOR]: Object.freeze([
      ACCESS_FEATURE_KEYS.ORDER,
      ACCESS_FEATURE_KEYS.STYLE,
    ]),
    [ORG_ROLE_KEYS.ACCOUNTANT]: Object.freeze([]),
    [ORG_ROLE_KEYS.WORKER]: Object.freeze([]),
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

  return base;
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
