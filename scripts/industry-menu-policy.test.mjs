import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
import {canAccessPath} from '../frontend/src/utils/accessControl.js';
import {getDefaultRoleAccessPolicy} from '../frontend/src/utils/roleAccessPolicyCore.mjs';
const require=createRequire(import.meta.url);
const {readIndustryMenuPolicy,saveIndustryMenuPolicy,companyIndustryMenuFeatures,industryMenuMiddleware,industryMenuApiFeature,registerIndustryMenuRoutes,COMMON_MENU_FEATURES,INDUSTRY_SPECIFIC_FEATURES}=require('../backend/dist/services/industryMenuPolicy.js');

test('common APIs ignore industry masks and still leave authorization to their own role gates',async()=>{
 const gate=industryMenuMiddleware(new Proxy({},{get(){throw Error('industry settings read for common API');}}),()=>{throw Error('industry membership gate called for common API');});
 let calls=0;for(const path of ['/bank-ledger','/bank-ledger/overview','/payroll','/expense-requests','/invoices'])await gate({path},{},()=>calls++);
 assert.equal(calls,5);
 const policy=getDefaultRoleAccessPolicy();policy.__schemaVersion=999;policy.MANUFACTURER.ADMIN=[];
 assert.equal(canAccessPath('/bank-ledger',{isAuthenticated:true,accessProfile:{entryType:'ORG',orgType:'MANUFACTURER',orgRole:'ADMIN',accessPolicy:policy,industryMenuFeatures:[]}}),false);
});

test('subscriber profiles use two explicit company categories and bypass old partner classifications',async()=>{
 let reads=0;
 const db={systemSetting:{findUnique:async()=>({value:{revision:3,industries:{9:['DASHBOARD','BUSINESS','STYLE']},subscribers:{MANUFACTURER:['DASHBOARD','BUSINESS','STYLE'],SERVICE:['DASHBOARD','BUSINESS','FREIGHT']}}})},partnerClassification:{findUnique:async()=>{reads++;throw Error('legacy classification read');}}};
 assert.deepEqual(await companyIndustryMenuFeatures(db,1,'SERVICE'),[...COMMON_MENU_FEATURES,'FREIGHT']);
 assert.deepEqual(await companyIndustryMenuFeatures(db,1,'MANUFACTURER'),[...COMMON_MENU_FEATURES,'STYLE']);
 assert.equal(reads,0);
 for(const subscribers of [{BRAND:['DASHBOARD','BUSINESS']},{SERVICE:['DASHBOARD','BUSINESS','STYLE']},{MANUFACTURER:['DASHBOARD','BUSINESS','FREIGHT']},{SERVICE:['FREIGHT']}])
  await assert.rejects(saveIndustryMenuPolicy(db,{revision:3,industries:{},subscribers},'system@test'),/INVALID_INDUSTRY_MENU_POLICY/);
});
test('client caps menu and direct routes without granting additional role privileges',()=>{
 const state={isAuthenticated:true,accessProfile:{entryType:'ORG',orgType:'MANUFACTURER',orgRole:'ADMIN',accessPolicy:getDefaultRoleAccessPolicy(),industryMenuFeatures:['DASHBOARD','BUSINESS','STYLE']}};
 assert.equal(canAccessPath('/style',state),true);
 for(const path of ['/freight','/freight/jobs/123','/FrEiGhT/jobs/123'])assert.equal(canAccessPath(path,state),false,path);
 for(const path of ['/payroll','/bank-ledger','/account-overview'])assert.equal(canAccessPath(path,state),true,'shared menus use role permissions');
 state.accessProfile.orgRole='WORKER';assert.equal(canAccessPath('/style',state),false,'industry does not grant a worker admin access');
 state.accessProfile.entryType='SYSTEM';state.accessProfile.systemRole='SYSTEM_ADMIN';assert.equal(canAccessPath('/system-setting/industry-menus',state),true);
 assert.equal(canAccessPath('/freight',state),false,'SYSTEM does not get company data');
});
test('real DB: own industry, menu union, revisions, unknown values and retained defaults',async()=>{
 const fixture=await changeApprovalFixture();const {db}=fixture;
 try{
  const seed=await seedChangeApproval(db),orgId=seed.company.id,source=await db.settingServiceDefault.findUnique({where:{code:'CHANGE_TEST'}}),industryId=source.id;
  assert.deepEqual(await readIndustryMenuPolicy(db),{revision:0,industries:{}});
  assert.ok(!(await companyIndustryMenuFeatures(db,orgId,'MANUFACTURER')).includes('FREIGHT'));
  assert.ok((await companyIndustryMenuFeatures(db,orgId,'SERVICE')).includes('FREIGHT'));
  assert.equal(await db.systemSetting.count({where:{key:'INDUSTRY_MENU_POLICY:1'}}),0,'reads never create settings');
  const common=['DASHBOARD','BUSINESS'];
  const saved=await saveIndustryMenuPolicy(db,{revision:0,industries:{[industryId]:[...common,'FREIGHT']}},'system@example.test');assert.equal(saved.revision,1);
  // A local partner classified as a forwarder cannot change the tenant menus.
  await db.partnerClassification.create({data:{orgId,entityId:seed.vendor.id,updatedByEmployeeId:seed.people.admin.id,industries:{create:{systemIndustryId:industryId}}}});
  assert.ok((await companyIndustryMenuFeatures(db,orgId,'MANUFACTURER')).includes('STYLE'));
  await db.partnerClassification.create({data:{orgId,entityId:orgId,updatedByEmployeeId:seed.people.admin.id,industries:{create:{systemIndustryId:industryId}}}});
  assert.deepEqual((await companyIndustryMenuFeatures(db,orgId,'MANUFACTURER')).sort(),[...COMMON_MENU_FEATURES,'FREIGHT'].sort());
  assert.ok((await companyIndustryMenuFeatures(db,seed.other.id,'MANUFACTURER')).includes('STYLE'),'other company isolated');
  await assert.rejects(saveIndustryMenuPolicy(db,{revision:0,industries:{}},'system@example.test'),/INDUSTRY_MENU_POLICY_CHANGED/);
  await assert.rejects(saveIndustryMenuPolicy(db,{revision:1,industries:{[industryId]:[...common,'FAKE']}},'system@example.test'),/INVALID_INDUSTRY_MENU_POLICY/);
  await assert.rejects(saveIndustryMenuPolicy(db,{revision:1,industries:{9999999:common}},'system@example.test'),/INVALID_INDUSTRY_MENU_POLICY/);
  await assert.rejects(saveIndustryMenuPolicy(db,{revision:1,industries:{[industryId]:['FREIGHT']}},'system@example.test'),/INVALID_INDUSTRY_MENU_POLICY/);
  assert.deepEqual(await readIndustryMenuPolicy(db),saved,'failed writes preserve configuration');
  const second=await db.settingServiceDefault.create({data:{code:'GARMENT_MENU_TEST',nameKo:'Garment',nameEn:'Garment',nameVi:'Garment',entryMode:'GENERAL',partnerRoleId:source.partnerRoleId}});
  await saveIndustryMenuPolicy(db,{revision:1,industries:{...saved.industries,[second.id]:[...common,'STYLE']}},'system@example.test');
  await db.partnerClassificationIndustry.create({data:{orgId,entityId:orgId,systemIndustryId:second.id}});
  const union=await companyIndustryMenuFeatures(db,orgId,'MANUFACTURER');assert.ok(union.includes('STYLE')&&union.includes('FREIGHT'));assert.ok(union.includes('PAYROLL'));
  assert.equal(await db.systemSetting.findUnique({where:{key:'INDUSTRY_MENU_POLICY:1'}}).then(row=>row.updatedBy),'system@example.test');
  const current=await readIndustryMenuPolicy(db);
  const profiles=await saveIndustryMenuPolicy(db,{...current,subscribers:{MANUFACTURER:[...common,'STYLE'],SERVICE:[...common,'FREIGHT']}},'system@example.test');
  assert.deepEqual(profiles.industries,current.industries,'old explicit settings remain archived, not silently erased');
  assert.deepEqual(await companyIndustryMenuFeatures(db,orgId,'MANUFACTURER'),[...COMMON_MENU_FEATURES,'STYLE']);
  assert.deepEqual(await companyIndustryMenuFeatures(db,orgId,'SERVICE'),[...COMMON_MENU_FEATURES,'FREIGHT']);
  await assert.rejects(saveIndustryMenuPolicy(db,{...current,subscribers:{SERVICE:common}},'system@example.test'),/INDUSTRY_MENU_POLICY_CHANGED/);
 }finally{await fixture.close();}
});
test('API gate denies blocked data and requires membership, preserving existing role gates',async()=>{
 const db={systemSetting:{findUnique:async()=>({value:{revision:1,industries:{1:['DASHBOARD','BUSINESS','STYLE']}}})},partnerClassification:{findUnique:async()=>({industries:[{systemIndustryId:1}]})}};
 let next=0,status,options;
 const response={status(value){status=value;return this;},json(value){return value;}};
 const middleware=industryMenuMiddleware(db,async(req,res,input)=>{options=input;return {organization:{id:4,type:'MANUFACTURER'}};});
 await middleware({path:'/freight/jobs'},response,()=>next++);assert.equal(status,403);assert.equal(next,0);assert.equal(options.allowSystemAdmin,false);
 await middleware({path:'/styles/123'},response,()=>next++);assert.equal(next,1);
 await middleware({path:'/auth/context'},response,()=>next++);assert.equal(next,2);
 const noMember=industryMenuMiddleware(db,async()=>null);await noMember({path:'/styles'},response,()=>next++);assert.equal(next,2);
 assert.equal(industryMenuApiFeature('/bank-ledger/overview'),'ACCOUNT_OVERVIEW');assert.equal(industryMenuApiFeature('/bank-ledger/entries'),'BANK_LEDGER');
 assert.equal(industryMenuApiFeature('/FrEiGhT/jobs'),'FREIGHT');
 assert.equal(industryMenuApiFeature('/system/industry-menu-policy'),null);
 const routes=new Map();registerIndustryMenuRoutes({get:(path,handler)=>routes.set('GET'+path,handler),put:(path,handler)=>routes.set('PUT'+path,handler)},new Proxy({},{get(){throw Error('DB touched without SYSTEM authorization');}}),{requireSystemAdmin:async()=>null});
 for(const route of routes.values())await route({},response);
});
