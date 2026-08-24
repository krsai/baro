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
  PRODUCTION_ANALYSIS: 'PRODUCTION_ANALYSIS',
  WORK_HISTORY: 'WORK_HISTORY',
  OUTSOURCING_RECORD: 'OUTSOURCING_RECORD',
  PAYROLL: 'PAYROLL',
  REVENUE_FORECAST: 'REVENUE_FORECAST',
  REVENUE_ANALYSIS: 'REVENUE_ANALYSIS',
  BUSINESS: 'BUSINESS',
  LINE: 'LINE',
  EMPLOYEE: 'EMPLOYEE',
  EMPLOYEE_SYSTEM: 'EMPLOYEE_SYSTEM',
  SALARY_SYSTEM: 'SALARY_SYSTEM',
  CUSTOMER: 'CUSTOMER',
  OUTSOURCING_PARTNER: 'OUTSOURCING_PARTNER',
  MATERIAL_SUPPLIER: 'MATERIAL_SUPPLIER',
  PERMISSION: 'PERMISSION',
  HOLIDAY: 'HOLIDAY',
  SUBSCRIPTION: 'SUBSCRIPTION',
};

export const ROLE_ACCESS_POLICY_SCHEMA_VERSION = 10;
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
      ACCESS_FEATURE_KEYS.OUTSOURCING_PARTNER,
      ACCESS_FEATURE_KEYS.MATERIAL_SUPPLIER,
      ACCESS_FEATURE_KEYS.STYLE,
      ACCESS_FEATURE_KEYS.ST_REVIEW,
      ACCESS_FEATURE_KEYS.SHIPMENT_REVIEW,
      ACCESS_FEATURE_KEYS.ASSIGNMENT,
      ACCESS_FEATURE_KEYS.PRODUCTION_PLAN,
      ACCESS_FEATURE_KEYS.INVENTORY,
      ACCESS_FEATURE_KEYS.ATTENDANCE,
      ACCESS_FEATURE_KEYS.PRODUCTION_ANALYSIS,
      ACCESS_FEATURE_KEYS.WORK_HISTORY,
      ACCESS_FEATURE_KEYS.OUTSOURCING_RECORD,
      ACCESS_FEATURE_KEYS.LINE,
      ACCESS_FEATURE_KEYS.EMPLOYEE,
      ACCESS_FEATURE_KEYS.CUSTOMER,
    ]),
    [ORG_ROLE_KEYS.ACCOUNTANT]: Object.freeze([
      ACCESS_FEATURE_KEYS.DASHBOARD,
      ACCESS_FEATURE_KEYS.PAYROLL,
      ACCESS_FEATURE_KEYS.REVENUE_FORECAST,
      ACCESS_FEATURE_KEYS.REVENUE_ANALYSIS,
      ACCESS_FEATURE_KEYS.BUSINESS,
      ACCESS_FEATURE_KEYS.LINE,
      ACCESS_FEATURE_KEYS.EMPLOYEE,
      ACCESS_FEATURE_KEYS.HOLIDAY,
    ]),
    [ORG_ROLE_KEYS.WORKER]: Object.freeze([ACCESS_FEATURE_KEYS.DASHBOARD]),
  }),
  [ORG_TYPE_KEYS.BRAND]: Object.freeze({
    [ORG_ROLE_KEYS.ADMIN]: Object.freeze([
      ACCESS_FEATURE_KEYS.DASHBOARD,
      ACCESS_FEATURE_KEYS.ORDER,
      ACCESS_FEATURE_KEYS.OUTSOURCING_PARTNER,
      ACCESS_FEATURE_KEYS.MATERIAL_SUPPLIER,
      ACCESS_FEATURE_KEYS.STYLE,
      ACCESS_FEATURE_KEYS.EMPLOYEE_SYSTEM,
      ACCESS_FEATURE_KEYS.SALARY_SYSTEM,
    ]),
    [ORG_ROLE_KEYS.OPERATOR]: Object.freeze([
      ACCESS_FEATURE_KEYS.DASHBOARD,
      ACCESS_FEATURE_KEYS.ORDER,
      ACCESS_FEATURE_KEYS.OUTSOURCING_PARTNER,
      ACCESS_FEATURE_KEYS.MATERIAL_SUPPLIER,
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

const getPolicySchemaVersion = (value) => {
  const schemaVersion = Number(
    value?.[ROLE_ACCESS_POLICY_SCHEMA_VERSION_KEY] ?? value?.schemaVersion ?? 0
  );
  return Number.isFinite(schemaVersion) ? schemaVersion : 0;
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

const applyLegacyProductionAnalysisDefault = (policy) => {
  POLICY_ORG_TYPES.forEach((orgType) => {
    POLICY_ORG_ROLES.forEach((role) => {
      const features = policy?.[orgType]?.[role];
      if (!Array.isArray(features)) return;
      if (!features.includes(ACCESS_FEATURE_KEYS.WORK_HISTORY)) return;
      if (features.includes(ACCESS_FEATURE_KEYS.PRODUCTION_ANALYSIS)) return;
      const workHistoryIndex = features.indexOf(ACCESS_FEATURE_KEYS.WORK_HISTORY);
      features.splice(
        Math.max(0, workHistoryIndex),
        0,
        ACCESS_FEATURE_KEYS.PRODUCTION_ANALYSIS
      );
    });
  });
};

const applyLegacyOutsourcingRecordDefault = (policy) => {
  POLICY_ORG_TYPES.forEach((orgType) => {
    POLICY_ORG_ROLES.forEach((role) => {
      const features = policy?.[orgType]?.[role];
      if (!Array.isArray(features)) return;
      if (!features.includes(ACCESS_FEATURE_KEYS.WORK_HISTORY)) return;
      if (features.includes(ACCESS_FEATURE_KEYS.OUTSOURCING_RECORD)) return;
      const workHistoryIndex = features.indexOf(ACCESS_FEATURE_KEYS.WORK_HISTORY);
      features.splice(
        workHistoryIndex >= 0 ? workHistoryIndex + 1 : features.length,
        0,
        ACCESS_FEATURE_KEYS.OUTSOURCING_RECORD
      );
    });
  });
};

// 2026-08-20: /business-partner (reused FEATURE_KEYS.ORDER) was split into
// /outsourcing-partner and /material-supplier with dedicated feature keys
// (BusinessPartner merged into Organization - see AGENTS.md). Any role that
// already had ORDER access previously reached the combined business-partner
// screen, so backfill both new keys for those roles to preserve access.
const applyLegacyBusinessPartnerSplitDefault = (policy) => {
  POLICY_ORG_TYPES.forEach((orgType) => {
    POLICY_ORG_ROLES.forEach((role) => {
      const features = policy?.[orgType]?.[role];
      if (!Array.isArray(features)) return;
      if (!features.includes(ACCESS_FEATURE_KEYS.ORDER)) return;
      const orderIndex = features.indexOf(ACCESS_FEATURE_KEYS.ORDER);
      const insertAt = orderIndex >= 0 ? orderIndex + 1 : features.length;
      if (!features.includes(ACCESS_FEATURE_KEYS.OUTSOURCING_PARTNER)) {
        features.splice(insertAt, 0, ACCESS_FEATURE_KEYS.OUTSOURCING_PARTNER);
      }
      if (!features.includes(ACCESS_FEATURE_KEYS.MATERIAL_SUPPLIER)) {
        features.splice(insertAt, 0, ACCESS_FEATURE_KEYS.MATERIAL_SUPPLIER);
      }
    });
  });
};

const applyLegacyRevenueAnalysisDefault = (policy) => {
  POLICY_ORG_TYPES.forEach((orgType) => {
    POLICY_ORG_ROLES.forEach((role) => {
      const features = policy?.[orgType]?.[role];
      if (!Array.isArray(features)) return;
      if (!features.includes(ACCESS_FEATURE_KEYS.BUSINESS)) return;
      if (features.includes(ACCESS_FEATURE_KEYS.REVENUE_ANALYSIS)) return;
      const businessIndex = features.indexOf(ACCESS_FEATURE_KEYS.BUSINESS);
      features.splice(
        Math.max(0, businessIndex),
        0,
        ACCESS_FEATURE_KEYS.REVENUE_ANALYSIS
      );
    });
  });
};

const applyLegacyRevenueForecastSplitDefault = (policy) => {
  POLICY_ORG_TYPES.forEach((orgType) => {
    POLICY_ORG_ROLES.forEach((role) => {
      const features = policy?.[orgType]?.[role];
      if (!Array.isArray(features)) return;
      if (!features.includes(ACCESS_FEATURE_KEYS.REVENUE_ANALYSIS)) return;
      if (features.includes(ACCESS_FEATURE_KEYS.REVENUE_FORECAST)) return;
      const analysisIndex = features.indexOf(ACCESS_FEATURE_KEYS.REVENUE_ANALYSIS);
      features.splice(Math.max(0, analysisIndex), 0, ACCESS_FEATURE_KEYS.REVENUE_FORECAST);
    });
  });
};

const applyLegacyEmployeeLineAccessDefault = (policy) => {
  const operatorFeatures = policy?.[ORG_TYPE_KEYS.MANUFACTURER]?.[ORG_ROLE_KEYS.OPERATOR];
  if (Array.isArray(operatorFeatures) && !operatorFeatures.includes(ACCESS_FEATURE_KEYS.EMPLOYEE)) {
    const lineIndex = operatorFeatures.indexOf(ACCESS_FEATURE_KEYS.LINE);
    operatorFeatures.splice(
      lineIndex >= 0 ? lineIndex + 1 : operatorFeatures.length,
      0,
      ACCESS_FEATURE_KEYS.EMPLOYEE
    );
  }

  const accountantFeatures = policy?.[ORG_TYPE_KEYS.MANUFACTURER]?.[ORG_ROLE_KEYS.ACCOUNTANT];
  if (Array.isArray(accountantFeatures) && !accountantFeatures.includes(ACCESS_FEATURE_KEYS.LINE)) {
    const employeeIndex = accountantFeatures.indexOf(ACCESS_FEATURE_KEYS.EMPLOYEE);
    accountantFeatures.splice(
      employeeIndex >= 0 ? employeeIndex : accountantFeatures.length,
      0,
      ACCESS_FEATURE_KEYS.LINE
    );
  }
};

const applyLegacyEmployeeSystemDefault = (policy) => {
  POLICY_ORG_TYPES.forEach((orgType) => {
    const adminFeatures = policy?.[orgType]?.[ORG_ROLE_KEYS.ADMIN];
    if (!Array.isArray(adminFeatures)) return;
    if (!adminFeatures.includes(ACCESS_FEATURE_KEYS.EMPLOYEE_SYSTEM)) {
      adminFeatures.push(ACCESS_FEATURE_KEYS.EMPLOYEE_SYSTEM);
    }
  });
};
const applyLegacySalarySystemDefault = (policy) => {
  POLICY_ORG_TYPES.forEach((orgType) => {
    const features = policy?.[orgType]?.[ORG_ROLE_KEYS.ADMIN];
    if (Array.isArray(features) && !features.includes(ACCESS_FEATURE_KEYS.SALARY_SYSTEM)) features.push(ACCESS_FEATURE_KEYS.SALARY_SYSTEM);
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

  const sourceSchemaVersion = getPolicySchemaVersion(candidate);
  if (sourceSchemaVersion < 9) {
    applyLegacyDashboardDefault(base);
    applyLegacyProductionAnalysisDefault(base);
    applyLegacyOutsourcingRecordDefault(base);
    applyLegacyBusinessPartnerSplitDefault(base);
    applyLegacyRevenueAnalysisDefault(base);
    applyLegacyEmployeeLineAccessDefault(base);
    applyLegacyEmployeeSystemDefault(base);
    applyLegacySalarySystemDefault(base);
  }
  if (sourceSchemaVersion < 10) {
    applyLegacyRevenueForecastSplitDefault(base);
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
    policy
      ? {
          [ROLE_ACCESS_POLICY_SCHEMA_VERSION_KEY]: ROLE_ACCESS_POLICY_SCHEMA_VERSION,
          ...policy,
        }
      : getDefaultRoleAccessPolicy()
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
