import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCESS_FEATURE_KEYS,
  getAllowedFeaturesForRole,
  getDefaultRoleAccessPolicy,
  ORG_ROLE_KEYS,
  ORG_TYPE_KEYS,
  sanitizeRoleAccessPolicy,
} from '../frontend/src/utils/roleAccessPolicyCore.mjs';
import { canAccessPath } from '../frontend/src/utils/accessControl.js';

const buildOrgAuthState = ({ orgRole, policy }) => ({
  isAuthenticated: true,
  devBypass: false,
  accessProfile: {
    entryType: 'ORG',
    orgType: ORG_TYPE_KEYS.MANUFACTURER,
    orgRole,
    accessPolicy: policy,
  },
});

test('manufacturer accountant defaults include employee and holiday menus', () => {
  const features = getAllowedFeaturesForRole({
    orgType: ORG_TYPE_KEYS.MANUFACTURER,
    orgRole: ORG_ROLE_KEYS.ACCOUNTANT,
  });

  assert.equal(features.includes(ACCESS_FEATURE_KEYS.EMPLOYEE), true);
  assert.equal(features.includes(ACCESS_FEATURE_KEYS.HOLIDAY), true);
  assert.equal(features.includes(ACCESS_FEATURE_KEYS.ATTENDANCE), false);
});

test('manufacturer operator defaults retain operational menus', () => {
  const features = getAllowedFeaturesForRole({
    orgType: ORG_TYPE_KEYS.MANUFACTURER,
    orgRole: ORG_ROLE_KEYS.OPERATOR,
  });

  assert.equal(features.includes(ACCESS_FEATURE_KEYS.ORDER), true);
  assert.equal(features.includes(ACCESS_FEATURE_KEYS.ASSIGNMENT), true);
  assert.equal(features.includes(ACCESS_FEATURE_KEYS.ATTENDANCE), true);
  assert.equal(features.includes(ACCESS_FEATURE_KEYS.PAYROLL), false);
});

test('saved role policy replaces defaults for the supplied role', () => {
  const policy = getDefaultRoleAccessPolicy();
  policy.MANUFACTURER.ACCOUNTANT = [ACCESS_FEATURE_KEYS.HOLIDAY];
  const sanitized = sanitizeRoleAccessPolicy(policy);

  assert.deepEqual(
    getAllowedFeaturesForRole({
      orgType: ORG_TYPE_KEYS.MANUFACTURER,
      orgRole: ORG_ROLE_KEYS.ACCOUNTANT,
      policy: sanitized,
    }),
    [ACCESS_FEATURE_KEYS.HOLIDAY]
  );
});

test('accountant route access follows the saved employee and holiday switches', () => {
  const policy = getDefaultRoleAccessPolicy();
  policy.MANUFACTURER.ACCOUNTANT = [
    ACCESS_FEATURE_KEYS.EMPLOYEE,
    ACCESS_FEATURE_KEYS.HOLIDAY,
  ];
  const authState = buildOrgAuthState({
    orgRole: ORG_ROLE_KEYS.ACCOUNTANT,
    policy,
  });

  assert.equal(canAccessPath('/employee', authState), true);
  assert.equal(canAccessPath('/holiday', authState), true);
  assert.equal(canAccessPath('/attendance', authState), false);
});

test('operator route access follows the saved operational switches', () => {
  const policy = getDefaultRoleAccessPolicy();
  policy.MANUFACTURER.OPERATOR = [
    ACCESS_FEATURE_KEYS.ORDER,
    ACCESS_FEATURE_KEYS.ATTENDANCE,
  ];
  const authState = buildOrgAuthState({
    orgRole: ORG_ROLE_KEYS.OPERATOR,
    policy,
  });

  assert.equal(canAccessPath('/order', authState), true);
  assert.equal(canAccessPath('/attendance', authState), true);
  assert.equal(canAccessPath('/payroll', authState), false);
});

test('unknown and system-only feature keys are rejected from saved policy', () => {
  const sanitized = sanitizeRoleAccessPolicy({
    MANUFACTURER: {
      ACCOUNTANT: ['employee', 'SUBSCRIPTION', 'UNKNOWN', 'employee'],
    },
  });

  assert.deepEqual(sanitized.MANUFACTURER.ACCOUNTANT, [
    ACCESS_FEATURE_KEYS.EMPLOYEE,
  ]);
});
