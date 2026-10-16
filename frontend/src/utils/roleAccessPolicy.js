import { requestJSON } from './apiClient';
import {
  sanitizeRoleAccessPolicy,
  serializeRoleAccessPolicy,
} from './roleAccessPolicyCore.mjs';
export {
  ACCESS_FEATURE_KEYS,
  getAllowedFeaturesForRole,
  getDefaultRoleAccessPolicy,
  getPolicyFeatures,
  getPolicyOrgRoles,
  getPolicyOrgTypes,
  ORG_ROLE_KEYS,
  ORG_TYPE_KEYS,
  ROLE_ACCESS_POLICY_SCHEMA_VERSION,
  sanitizeRoleAccessPolicy,
} from './roleAccessPolicyCore.mjs';

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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ policy: serializeRoleAccessPolicy(sanitized) }),
  });
  const saved = sanitizeRoleAccessPolicy(response?.policy);
  return saved;
};
