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
import { canAccessPath,resolveFeatureByPath } from '../frontend/src/utils/accessControl.js';
import {loadSourceBindings} from './helpers/source-bindings.mjs';
import {normalizeOrganizationType} from '../frontend/src/constants/organizationType.js';

const withCurrentPolicyVersion = (policy) => ({
  __schemaVersion: ROLE_ACCESS_POLICY_SCHEMA_VERSION,
  ...policy,
});

test('new SaaS registrations resolve only garment factories and logistics companies',()=>{
 const {resolveOnboardingOrganizationType}=loadSourceBindings('backend/src/index.ts',['ORGANIZATION_TYPE_KEYS','ONBOARDING_ORGANIZATION_TYPE_OPTIONS','ONBOARDING_ORGANIZATION_TYPE_TOKENS','resolveOnboardingOrganizationType']);
 for(const value of ['MANUFACTURER','factory'])assert.equal(resolveOnboardingOrganizationType(value),'MANUFACTURER');
 assert.equal(resolveOnboardingOrganizationType('SERVICE'),'SERVICE');assert.equal(normalizeOrganizationType('SERVICE'),'SERVICE');
 for(const value of ['BRAND','brand','PROCESS_OUTSOURCING','LOGISTICS_PROVIDER','MATERIAL_SUPPLIER'])assert.equal(resolveOnboardingOrganizationType(value),null);
 assert.equal(normalizeOrganizationType('BRAND'),'BRAND','external partner classification remains available');
});

test('profile editor preserves saved logistics and archived brand roles instead of replacing them with defaults',()=>{
 const {toEditablePolicy}=loadSourceBindings('frontend/src/pages/App/system/AccessPolicyBoard.jsx',['toEditablePolicy'],{getDefaultRoleAccessPolicy,ORG_TYPE_KEYS,ROLE_ACCESS_POLICY_SCHEMA_VERSION,ROLE_ACCESS_POLICY_SCHEMA_VERSION_KEY:'__schemaVersion'});
 const original=withCurrentPolicyVersion({MANUFACTURER:{ADMIN:['DASHBOARD']},SERVICE:{ADMIN:['FREIGHT'],OPERATOR:[]},BRAND:{ADMIN:['DASHBOARD']}});
 const editable=toEditablePolicy(original);
 assert.deepEqual(editable.SERVICE.ADMIN,['FREIGHT']);assert.deepEqual(editable.SERVICE.OPERATOR,[]);assert.deepEqual(editable.BRAND.ADMIN,['DASHBOARD']);assert.deepEqual(editable.MANUFACTURER.ADMIN,['DASHBOARD']);
});

test('freight is independently configurable, defaults to administrators on upgrade and rejects SYSTEM/worker access',()=>{
 assert.equal(resolveFeatureByPath('/freight'),'FREIGHT');
 const legacy=sanitizeRoleAccessPolicy({__schemaVersion:15,SERVICE:{ADMIN:[],OPERATOR:[],ACCOUNTANT:[],WORKER:[]}});
 assert.deepEqual(legacy.SERVICE.ADMIN,['WORK_TIME','FREIGHT']);assert.deepEqual(legacy.SERVICE.OPERATOR,['WORK_TIME']);
 for(const role of ['ADMIN','OPERATOR','ACCOUNTANT','WORKER']){
  const state={isAuthenticated:true,accessProfile:{entryType:'ORG',orgType:'SERVICE',orgRole:role,accessPolicy:withCurrentPolicyVersion({SERVICE:{[role]:['FREIGHT']}})}};
  assert.equal(canAccessPath('/freight',state),role!=='WORKER');
  state.accessProfile.accessPolicy=withCurrentPolicyVersion({SERVICE:{[role]:[]}});assert.equal(canAccessPath('/freight',state),false);
 }
 assert.equal(canAccessPath('/freight',{isAuthenticated:true,accessProfile:{entryType:'SYSTEM',systemRole:'SYSTEM_ADMIN'}}),false);
});
test('account overview has an independent configurable permission and preserves current denials',()=>{
 assert.equal(resolveFeatureByPath('/account-overview'),'ACCOUNT_OVERVIEW');assert.equal(resolveFeatureByPath('/bank-ledger'),'BANK_LEDGER');
 const legacy=sanitizeRoleAccessPolicy({__schemaVersion:14,MANUFACTURER:{ADMIN:[],ACCOUNTANT:['BANK_LEDGER']}});
 assert.deepEqual(legacy.MANUFACTURER.ADMIN,['WORK_TIME','ACCOUNT_OVERVIEW','FREIGHT']);assert.deepEqual(legacy.MANUFACTURER.ACCOUNTANT,['BANK_LEDGER','WORK_TIME']);
 for(const orgType of Object.values(ORG_TYPE_KEYS))for(const orgRole of Object.values(ORG_ROLE_KEYS)){
  assert.equal(getDefaultRoleAccessPolicy()[orgType][orgRole].includes('ACCOUNT_OVERVIEW'),orgRole==='ADMIN');
  const auth={isAuthenticated:true,accessProfile:{entryType:'ORG',orgType,orgRole,accessPolicy:withCurrentPolicyVersion({[orgType]:{[orgRole]:['ACCOUNT_OVERVIEW']}})}};
  assert.equal(canAccessPath('/account-overview',auth),orgType!==ORG_TYPE_KEYS.BRAND);assert.equal(canAccessPath('/bank-ledger',auth),false);
  auth.accessProfile.accessPolicy[orgType][orgRole]=[];assert.equal(canAccessPath('/account-overview',auth),false);
 }
 const admin=buildOrgAuthState({orgRole:'ADMIN',policy:{MANUFACTURER:{ADMIN:['BANK_LEDGER']}}});assert.equal(canAccessPath('/bank-ledger',admin),true);assert.equal(canAccessPath('/account-overview',admin),false);
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

test('unified partners requires one existing partner permission without granting the other categories or business administration',()=>{
  for(const feature of [ACCESS_FEATURE_KEYS.CUSTOMER,ACCESS_FEATURE_KEYS.OUTSOURCING_PARTNER,ACCESS_FEATURE_KEYS.MATERIAL_SUPPLIER]){
    const auth=buildOrgAuthState({orgRole:ORG_ROLE_KEYS.OPERATOR,policy:{MANUFACTURER:{OPERATOR:[feature]}}});
    assert.equal(canAccessPath('/business-partner',auth),true);
    assert.equal(canAccessPath('/business',auth),false);
    for(const [path,key] of [['/customer',ACCESS_FEATURE_KEYS.CUSTOMER],['/outsourcing-partner',ACCESS_FEATURE_KEYS.OUTSOURCING_PARTNER],['/material-supplier',ACCESS_FEATURE_KEYS.MATERIAL_SUPPLIER]])assert.equal(canAccessPath(path,auth),key===feature);
  }
  const none=buildOrgAuthState({orgRole:ORG_ROLE_KEYS.OPERATOR,policy:{MANUFACTURER:{OPERATOR:[]}}});
  assert.equal(canAccessPath('/business-partner',none),false);
  assert.equal(canAccessPath('/business-partner/',none),false);
  assert.equal(canAccessPath('/business-partner',{isAuthenticated:false}),false);
});

test('permission editor retains category feature keys behind the single partners menu',()=>{
 const {buildMenuTree}=loadSourceBindings('frontend/src/pages/App/system/AccessPolicyBoard.jsx',['buildMenuTree'],{resolveFeatureByPath,NON_EDITABLE_FEATURE_KEYS:new Set()});
 const [menu]=buildMenuTree([{label:'Partners',path:'/business-partner',accessChildren:[{label:'Customers',path:'/customer'},{label:'Outsourcing',path:'/outsourcing-partner'},{label:'Suppliers',path:'/material-supplier'}]}]);
 assert.equal(menu.type,'menu');assert.equal(menu.path,'/business-partner');assert.equal(menu.children,undefined);assert.equal(menu.permissionOptions.length,3);
 assert.deepEqual(menu.featureKeys,['CUSTOMER','OUTSOURCING_PARTNER','MATERIAL_SUPPLIER']);
});

test('permission rows preserve navigation hierarchy and keep personal settings as fixed access',()=>{
 const {buildMenuTree,flattenMenuTree}=loadSourceBindings('frontend/src/pages/App/system/AccessPolicyBoard.jsx',['buildMenuTree','flattenMenuTree'],{resolveFeatureByPath,NON_EDITABLE_FEATURE_KEYS:new Set(['PROFILE'])});
 const tree=buildMenuTree([{isParent:true,label:'Organization',children:[{path:'/employee',label:'Employees'},{path:'/business-partner',label:'Partners',accessChildren:[{path:'/customer',label:'Customers'}]}]},{isParent:true,label:'Settings',children:[{path:'/personal-settings',label:'Personal settings'},{path:'/employee-system',label:'Employee structure'}]}]);
 const rows=flattenMenuTree(tree);
 assert.deepEqual(rows.map(row=>row.label),['Organization','Employees','Partners','Settings','Personal settings','Employee structure']);
 assert.deepEqual(rows.map(row=>row.depth),[0,1,1,0,1,1]);
 const personal=rows.find(row=>row.path==='/personal-settings');
 assert.equal(personal.fixedAccess,true);assert.deepEqual(personal.featureKeys,[]);
});

test('manufacturer accountant defaults include employee and holiday menus', () => {
  const features = getAllowedFeaturesForRole({
    orgType: ORG_TYPE_KEYS.MANUFACTURER,
    orgRole: ORG_ROLE_KEYS.ACCOUNTANT,
  });

  assert.equal(features.includes(ACCESS_FEATURE_KEYS.EMPLOYEE), true);
  assert.equal(features.includes('LINE'), false);
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
  assert.equal(features.includes(ACCESS_FEATURE_KEYS.WORK_HISTORY), true);
  assert.equal(features.includes('LINE'), false);
  assert.equal(features.includes(ACCESS_FEATURE_KEYS.EMPLOYEE), true);
  assert.equal(features.includes(ACCESS_FEATURE_KEYS.PAYROLL), false);
});

test('legacy policies grant manufacturer operators and accountants employee access while dropping retired line permissions', () => {
  const sanitized = sanitizeRoleAccessPolicy({
    __schemaVersion: 4,
    MANUFACTURER: {
      OPERATOR: ['LINE'],
      ACCOUNTANT: [ACCESS_FEATURE_KEYS.EMPLOYEE],
    },
  });

  assert.equal(sanitized.MANUFACTURER.OPERATOR.includes('LINE'), false);
  assert.equal(sanitized.MANUFACTURER.OPERATOR.includes(ACCESS_FEATURE_KEYS.EMPLOYEE), true);
  assert.equal(sanitized.MANUFACTURER.ACCOUNTANT.includes('LINE'), false);
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

test('legacy work history policies discard retired production analysis access', () => {
  const sanitized = sanitizeRoleAccessPolicy({
    __schemaVersion: 2,
    MANUFACTURER: {
      OPERATOR: [ACCESS_FEATURE_KEYS.WORK_HISTORY, 'PRODUCTION_ANALYSIS'],
    },
  });

  assert.equal(
    sanitized.MANUFACTURER.OPERATOR.includes(
      'PRODUCTION_ANALYSIS'
    ),
    false
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

test('logistics permission migrates vendor access, while current explicit denials remain denied',()=>{
 const legacy=sanitizeRoleAccessPolicy({__schemaVersion:11,MANUFACTURER:{OPERATOR:['OUTSOURCING_PARTNER'],ACCOUNTANT:[]}});
 assert.ok(legacy.MANUFACTURER.OPERATOR.includes('LOGISTICS_PARTNER'));
 assert.equal(legacy.MANUFACTURER.ACCOUNTANT.includes('LOGISTICS_PARTNER'),false);
 const current=sanitizeRoleAccessPolicy({__schemaVersion:12,MANUFACTURER:{OPERATOR:['OUTSOURCING_PARTNER']}});
 assert.equal(current.MANUFACTURER.OPERATOR.includes('LOGISTICS_PARTNER'),false);
 const auth=buildOrgAuthState({orgRole:ORG_ROLE_KEYS.OPERATOR,policy:{MANUFACTURER:{OPERATOR:['LOGISTICS_PARTNER']}}});
 assert.equal(canAccessPath('/business-partner',auth),true);
 assert.equal(canAccessPath('/logistics-partner',auth),true);
 assert.equal(canAccessPath('/outsourcing-partner',auth),false);
});
