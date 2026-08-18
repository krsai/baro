import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCESS_FEATURE_KEYS,
  getAllowedFeaturesForRole,
  getDefaultRoleAccessPolicy,
  ORG_ROLE_KEYS,
  ORG_TYPE_KEYS,
  ROLE_ACCESS_POLICY_SCHEMA_VERSION,
  sanitizeRoleAccessPolicy,
} from '../frontend/src/utils/roleAccessPolicyCore.mjs';
import { canAccessPath } from '../frontend/src/utils/accessControl.js';

const withCurrentPolicyVersion = (policy) => ({
  __schemaVersion: ROLE_ACCESS_POLICY_SCHEMA_VERSION,
  ...policy,
});

const buildOrgAuthState = ({ orgRole, policy }) => ({
  isAuthenticated: true,
  devBypass: false,
  accessProfile: {
    entryType: 'ORG',
    orgType: ORG_TYPE_KEYS.MANUFACTURER,
    orgRole,
    accessPolicy: withCurrentPolicyVersion(policy),
  },
});

test('manufacturer accountant defaults include employee, line, and holiday menus', () => {
  const features = getAllowedFeaturesForRole({
    orgType: ORG_TYPE_KEYS.MANUFACTURER,
    orgRole: ORG_ROLE_KEYS.ACCOUNTANT,
  });

  assert.equal(features.includes(ACCESS_FEATURE_KEYS.EMPLOYEE), true);
  assert.equal(features.includes(ACCESS_FEATURE_KEYS.LINE), true);
  assert.equal(features.includes(ACCESS_FEATURE_KEYS.HOLIDAY), true);
  assert.equal(features.includes(ACCESS_FEATURE_KEYS.ATTENDANCE), false);
  assert.equal(features.includes(ACCESS_FEATURE_KEYS.REVENUE_ANALYSIS), true);
  assert.equal(features.includes(ACCESS_FEATURE_KEYS.BUSINESS), true);
});

test('manufacturer operator defaults retain operational menus', () => {
  const features = getAllowedFeaturesForRole({
    orgType: ORG_TYPE_KEYS.MANUFACTURER,
    orgRole: ORG_ROLE_KEYS.OPERATOR,
  });

  assert.equal(features.includes(ACCESS_FEATURE_KEYS.ORDER), true);
  assert.equal(features.includes(ACCESS_FEATURE_KEYS.ASSIGNMENT), true);
  assert.equal(features.includes(ACCESS_FEATURE_KEYS.ATTENDANCE), true);
  assert.equal(features.includes(ACCESS_FEATURE_KEYS.PRODUCTION_ANALYSIS), true);
  assert.equal(features.includes(ACCESS_FEATURE_KEYS.WORK_HISTORY), true);
  assert.equal(features.includes(ACCESS_FEATURE_KEYS.LINE), true);
  assert.equal(features.includes(ACCESS_FEATURE_KEYS.EMPLOYEE), true);
  assert.equal(features.includes(ACCESS_FEATURE_KEYS.PAYROLL), false);
});

test('legacy policies grant manufacturer operators and accountants both employee and line access', () => {
  const sanitized = sanitizeRoleAccessPolicy({
    __schemaVersion: 4,
    MANUFACTURER: {
      OPERATOR: [ACCESS_FEATURE_KEYS.LINE],
      ACCOUNTANT: [ACCESS_FEATURE_KEYS.EMPLOYEE],
    },
  });

  assert.equal(sanitized.MANUFACTURER.OPERATOR.includes(ACCESS_FEATURE_KEYS.LINE), true);
  assert.equal(sanitized.MANUFACTURER.OPERATOR.includes(ACCESS_FEATURE_KEYS.EMPLOYEE), true);
  assert.equal(sanitized.MANUFACTURER.ACCOUNTANT.includes(ACCESS_FEATURE_KEYS.LINE), true);
  assert.equal(sanitized.MANUFACTURER.ACCOUNTANT.includes(ACCESS_FEATURE_KEYS.EMPLOYEE), true);
});

test('saved role policy replaces defaults for the supplied role', () => {
  const policy = getDefaultRoleAccessPolicy();
  policy.MANUFACTURER.ACCOUNTANT = [ACCESS_FEATURE_KEYS.HOLIDAY];
  const sanitized = sanitizeRoleAccessPolicy(withCurrentPolicyVersion(policy));

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

test('production analysis and work history route access are independent', () => {
  const productionOnlyPolicy = getDefaultRoleAccessPolicy();
  productionOnlyPolicy.MANUFACTURER.OPERATOR = [
    ACCESS_FEATURE_KEYS.PRODUCTION_ANALYSIS,
  ];
  const productionOnlyAuthState = buildOrgAuthState({
    orgRole: ORG_ROLE_KEYS.OPERATOR,
    policy: productionOnlyPolicy,
  });

  assert.equal(canAccessPath('/production-analysis', productionOnlyAuthState), true);
  assert.equal(canAccessPath('/work-history', productionOnlyAuthState), false);

  const workHistoryOnlyPolicy = getDefaultRoleAccessPolicy();
  workHistoryOnlyPolicy.MANUFACTURER.OPERATOR = [
    ACCESS_FEATURE_KEYS.WORK_HISTORY,
  ];
  const workHistoryOnlyAuthState = buildOrgAuthState({
    orgRole: ORG_ROLE_KEYS.OPERATOR,
    policy: workHistoryOnlyPolicy,
  });

  assert.equal(canAccessPath('/production-analysis', workHistoryOnlyAuthState), false);
  assert.equal(canAccessPath('/work-history', workHistoryOnlyAuthState), true);
});

test('legacy work history policies keep production analysis access after schema upgrade', () => {
  const sanitized = sanitizeRoleAccessPolicy({
    __schemaVersion: 2,
    MANUFACTURER: {
      OPERATOR: [ACCESS_FEATURE_KEYS.WORK_HISTORY],
    },
  });

  assert.equal(
    sanitized.MANUFACTURER.OPERATOR.includes(
      ACCESS_FEATURE_KEYS.PRODUCTION_ANALYSIS
    ),
    true
  );
  assert.equal(
    sanitized.MANUFACTURER.OPERATOR.includes(ACCESS_FEATURE_KEYS.WORK_HISTORY),
    true
  );
});

test('work history and outsourcing record route access are independent', () => {
  const workHistoryOnlyPolicy = getDefaultRoleAccessPolicy();
  workHistoryOnlyPolicy.MANUFACTURER.OPERATOR = [
    ACCESS_FEATURE_KEYS.WORK_HISTORY,
  ];
  const workHistoryOnlyAuthState = buildOrgAuthState({
    orgRole: ORG_ROLE_KEYS.OPERATOR,
    policy: workHistoryOnlyPolicy,
  });

  assert.equal(canAccessPath('/work-history', workHistoryOnlyAuthState), true);
  assert.equal(canAccessPath('/outsourcing-record', workHistoryOnlyAuthState), false);

  const outsourcingOnlyPolicy = getDefaultRoleAccessPolicy();
  outsourcingOnlyPolicy.MANUFACTURER.OPERATOR = [
    ACCESS_FEATURE_KEYS.OUTSOURCING_RECORD,
  ];
  const outsourcingOnlyAuthState = buildOrgAuthState({
    orgRole: ORG_ROLE_KEYS.OPERATOR,
    policy: outsourcingOnlyPolicy,
  });

  assert.equal(canAccessPath('/work-history', outsourcingOnlyAuthState), false);
  assert.equal(canAccessPath('/outsourcing-record', outsourcingOnlyAuthState), true);
});

test('legacy work history policies gain outsourcing record access after schema upgrade', () => {
  const sanitized = sanitizeRoleAccessPolicy({
    __schemaVersion: 2,
    MANUFACTURER: {
      OPERATOR: [ACCESS_FEATURE_KEYS.WORK_HISTORY],
    },
  });

  assert.equal(
    sanitized.MANUFACTURER.OPERATOR.includes(
      ACCESS_FEATURE_KEYS.OUTSOURCING_RECORD
    ),
    true
  );
  assert.equal(
    sanitized.MANUFACTURER.OPERATOR.includes(ACCESS_FEATURE_KEYS.WORK_HISTORY),
    true
  );
});

test('revenue analysis and business route access are independent', () => {
  const revenueOnlyPolicy = getDefaultRoleAccessPolicy();
  revenueOnlyPolicy.MANUFACTURER.ACCOUNTANT = [
    ACCESS_FEATURE_KEYS.REVENUE_ANALYSIS,
  ];
  const revenueOnlyAuthState = buildOrgAuthState({
    orgRole: ORG_ROLE_KEYS.ACCOUNTANT,
    policy: revenueOnlyPolicy,
  });

  assert.equal(canAccessPath('/revenue-analysis', revenueOnlyAuthState), true);
  assert.equal(canAccessPath('/business', revenueOnlyAuthState), false);

  const businessOnlyPolicy = getDefaultRoleAccessPolicy();
  businessOnlyPolicy.MANUFACTURER.ACCOUNTANT = [
    ACCESS_FEATURE_KEYS.BUSINESS,
  ];
  const businessOnlyAuthState = buildOrgAuthState({
    orgRole: ORG_ROLE_KEYS.ACCOUNTANT,
    policy: businessOnlyPolicy,
  });

  assert.equal(canAccessPath('/revenue-analysis', businessOnlyAuthState), false);
  assert.equal(canAccessPath('/business', businessOnlyAuthState), true);
});

test('legacy business policies keep revenue analysis access after schema upgrade', () => {
  const sanitized = sanitizeRoleAccessPolicy({
    __schemaVersion: 3,
    MANUFACTURER: {
      ACCOUNTANT: [ACCESS_FEATURE_KEYS.BUSINESS],
    },
  });

  assert.equal(
    sanitized.MANUFACTURER.ACCOUNTANT.includes(
      ACCESS_FEATURE_KEYS.REVENUE_ANALYSIS
    ),
    true
  );
  assert.equal(
    sanitized.MANUFACTURER.ACCOUNTANT.includes(ACCESS_FEATURE_KEYS.BUSINESS),
    true
  );
});

test('unknown and system-only feature keys are rejected from saved policy', () => {
  const sanitized = sanitizeRoleAccessPolicy({
    __schemaVersion: ROLE_ACCESS_POLICY_SCHEMA_VERSION,
    MANUFACTURER: {
      ACCOUNTANT: ['employee', 'SUBSCRIPTION', 'UNKNOWN', 'employee'],
    },
  });

  assert.deepEqual(sanitized.MANUFACTURER.ACCOUNTANT, [
    ACCESS_FEATURE_KEYS.EMPLOYEE,
  ]);
});
