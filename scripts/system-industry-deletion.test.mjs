import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {systemIndustryUsageReason} from '../frontend/src/utils/systemIndustryUsage.mjs';
const require=createRequire(import.meta.url);
const {systemIndustryInUse,SYSTEM_INDUSTRY_USAGE_INCLUDE}=require('../backend/dist/services/systemIndustryUsage.js');
const {deleteSetting}=require('../backend/dist/services/codeBaseManagement.js');
const {registerTransactionSettingRoutes}=require('../backend/dist/services/transactionSettingRoutes.js');
const counts=()=>Object.fromEntries(Object.keys(SYSTEM_INDUSTRY_USAGE_INCLUDE._count.select).map(key=>[key,0]));
const localCounts=()=>({transactionCosts:0,transactionCodes:0,partners:0});
test('deletion reason identifies legacy customer links separately from current classification and real local references',()=>{
 for(const [language,expected] of [['ko','기존 고객 유형 연결'],['en','Legacy customer type links'],['vi','Liên kết loại khách hàng cũ']]){
  const reason=systemIndustryUsageReason({_count:{customerIndustries:1,partnerClassifications:0},services:[{_count:{transactionCosts:2}},{_count:{transactionCosts:3}}]},language);
  assert.ok(reason.includes(expected+' (1)'));assert.ok(reason.includes('(5)'));assert.equal(reason.includes('(0)'),false);
 }
 assert.equal(systemIndustryUsageReason({_count:{customerIndustries:0},services:[]}), '');
 const details=systemIndustryUsageReason({_count:{partnerClassifications:2},partnerClassifications:[{orgId:10,entityId:10,classification:{owner:{name:'DEX'},entity:{name:'DEX'}}},{orgId:10,entityId:20,classification:{owner:{name:'DEX'},entity:{name:'BARO'}}}]},'en');
 assert.ok(details.includes('DEX → BARO'));assert.ok(details.includes('(2)'));
});
test('industry usage depends on actual source/local links, not active status, provisioning or metadata overrides',()=>{
 const row={isActive:true,_count:counts(),services:[{isOverridden:true,_count:localCounts()}]};
 assert.equal(systemIndustryInUse(row),false);
 for(const key of Object.keys(row._count)){row._count[key]=1;assert.equal(systemIndustryInUse(row),true,key);row._count[key]=0;}
 for(const key of Object.keys(row.services[0]._count)){row.services[0]._count[key]=1;assert.equal(systemIndustryInUse(row),true,key);row.services[0]._count[key]=0;}
 assert.equal(systemIndustryInUse({}),true);
});
test('industry listing authenticates first and exposes an unused overridden definition as deletable',async()=>{
 const handlers=new Map();let allowed=false,reads=0,result;
 const app=Object.fromEntries(['get','post','put','delete'].map(method=>[method,(path,fn)=>handlers.set(method+path,fn)]));
 const db={$queryRawUnsafe:async()=>[],settingServiceDefault:{findMany:async query=>{reads++;assert.deepEqual(query.include._count,SYSTEM_INDUSTRY_USAGE_INCLUDE._count);assert.ok(query.include.partnerClassifications);return [{id:1,_count:counts(),services:[{isOverridden:true,_count:localCounts()}]},{id:2,_count:{...counts(),partnerClassifications:1},services:[]}];}}};
 registerTransactionSettingRoutes(app,db,{requireSystemAdmin:async()=>allowed});
 const run=()=>handlers.get('get/system-setting-defaults/services')({query:{}},{json(value){result=value;}});
 await run();assert.equal(reads,0);allowed=true;await run();assert.equal(result[0].hasUsageHistory,false);assert.equal(result[1].hasUsageHistory,true);
});

test('company catalogue does not request other companies classification details',async()=>{
 const handlers=new Map(),app=Object.fromEntries(['get','post','put','delete'].map(method=>[method,(path,fn)=>handlers.set(method+path,fn)]));
 const db={settingServiceDefault:{findMany:async query=>{assert.equal(query.include.partnerClassifications,undefined);return [];}}};
 registerTransactionSettingRoutes(app,db,{requireOrgRole:async()=>({organization:{id:1}})});
 await handlers.get('get/system-setting-defaults/services')({query:{catalogue:'1'}},{json:()=>{}});
});
test('deletion removes unused overridden copies but refuses every source/local reference on recheck',async()=>{
 const removed=[];let localUsage=localCounts();const sourceUsage=counts();
 const countModel=key=>({count:async()=>sourceUsage[key]});
 const tx={$queryRawUnsafe:async sql=>sql.includes('WITH linked')?[]:[{id:9}],
 settingServiceDefault:{delete:async()=>removed.push('source')},
 settingTransactionCodeDefault:countModel('codes'),transactionCodeBase:countModel('codeBases'),orgRelationship:countModel('customerIndustries'),industryProductionPolicy:countModel('productionPolicies'),partnerClassificationIndustry:countModel('partnerClassifications'),accountingCodeIndustry:countModel('accountingCodeLinks'),
 outsourcingServiceType:{findMany:async()=>[{id:90,ownerOrgId:1,isOverridden:true}],delete:async()=>removed.push('local')},
 partnerTransactionCost:{count:async()=>localUsage.transactionCosts},transactionCode:{count:async()=>localUsage.transactionCodes},organizationOutsourcingServiceType:{count:async()=>localUsage.partners}};
 for(const key of Object.keys(sourceUsage)){sourceUsage[key]=1;await assert.rejects(deleteSetting(tx,'services',true,9),/SETTING_IN_USE/);sourceUsage[key]=0;}
 for(const key of Object.keys(localUsage)){localUsage[key]=1;await assert.rejects(deleteSetting(tx,'services',true,9),/SETTING_IN_USE/);localUsage[key]=0;}
 assert.deepEqual(removed,[]);await deleteSetting(tx,'services',true,9);assert.deepEqual(removed,['local','source']);
});


test('SYSTEM list drops superseded local counts and names but still protects actual code usage',async()=>{
 const handlers=new Map(),app=Object.fromEntries(['get','post','put','delete'].map(method=>[method,(path,fn)=>handlers.set(method+path,fn)]));
 const stale=[{orgId:1,entityId:11,systemIndustryId:7},{orgId:1,entityId:12,systemIndustryId:7}];let result;
 const db={$queryRawUnsafe:async()=>stale,settingServiceDefault:{findMany:async()=>[{id:7,_count:{...counts(),partnerClassifications:2},partnerClassifications:stale,services:[]},{id:8,_count:{...counts(),codes:1},services:[]}]}};
 registerTransactionSettingRoutes(app,db,{requireSystemAdmin:async()=>true});
 await handlers.get('get/system-setting-defaults/services')({query:{}},{json:value=>result=value});
 assert.equal(result[0].hasUsageHistory,false);assert.equal(result[0]._count.partnerClassifications,0);assert.deepEqual(result[0].partnerClassifications,[]);assert.equal(result[1].hasUsageHistory,true);
});
