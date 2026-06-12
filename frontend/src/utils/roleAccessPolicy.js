import { requestJSON } from './apiClient';
import { sanitizeRoleAccessPolicy } from './roleAccessPolicyCore.mjs';
export {
  ACCESS_FEATURE_KEYS,
  getAllowedFeaturesForRole,
  getDefaultRoleAccessPolicy,
  getPolicyFeatures,
  getPolicyOrgRoles,
  getPolicyOrgTypes,
  ORG_ROLE_KEYS,
  ORG_TYPE_KEYS,
  sanitizeRoleAccessPolicy,
} from './roleAccessPolicyCore.mjs';

export const ACCESS_POLICY_STORAGE_KEY = 'baro:role-access-policy:v1';

export const loadLegacyRoleAccessPolicy = () => {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(ACCESS_POLICY_STORAGE_KEY);
  if (!raw) return null;
  try {
    return sanitizeRoleAccessPolicy(JSON.parse(raw));
  } catch (_error) {
    return null;
  }
};

export const clearLegacyRoleAccessPolicy = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ACCESS_POLICY_STORAGE_KEY);
};

export const fetchRoleAccessPolicy = async () => {
  const response = await requestJSON('/system/access-policy', {
    skipGlobalLoading: true,
    skipCache: true,
  });
  return {
    policy: sanitizeRoleAccessPolicy(response?.policy),
    stored: response?.stored === true,
    updatedAt: response?.updatedAt ?? null,
    updatedBy: response?.updatedBy ?? null,
  };
};

export const saveRoleAccessPolicy = async (policy) => {
  const sanitized = sanitizeRoleAccessPolicy(policy);
  const response = await requestJSON('/system/access-policy', {
    method: 'PUT',
    body: { policy: sanitized },
  });
  const saved = sanitizeRoleAccessPolicy(response?.policy);
  clearLegacyRoleAccessPolicy();
  return saved;
};
