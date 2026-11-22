import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {getDashboardWidgetPolicy,saveDashboardWidgetPolicy,readDashboardWidgetPolicy,widgetIds,widgetRoles,registerDashboardWidgetPolicyRoutes}=require('../backend/dist/services/dashboardWidgetPolicy');
const {workspaceTopics}=require('../backend/dist/services/workspaceEvents');

test('widget policy uses company ACTIVE roles, revision, idempotent retry and transactional audit',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,admin=s.people.admin.id,accountant=s.people.senior.id;
  const initial=await getDashboardWidgetPolicy(db,org,admin);
  assert.deepEqual(initial.allowed,widgetIds);assert.equal(initial.revision,0);
  const roles={...initial.roles,notifications:['ADMIN'],'work-requests':[]};
  await assert.rejects(saveDashboardWidgetPolicy(db,org,accountant,{revision:0,roles}),/DENIED/);
  await assert.rejects(saveDashboardWidgetPolicy(db,s.other.id,admin,{revision:0,roles}),/DENIED/);
  for(const bad of [{}, {...roles,unknown:[]},{...roles,approvals:['SYSTEM']},{...roles,approvals:['ADMIN','ADMIN']}])await assert.rejects(saveDashboardWidgetPolicy(db,org,admin,{revision:0,roles:bad}),/INVALID/);
  const saved=await saveDashboardWidgetPolicy(db,org,admin,{revision:0,roles});assert.equal(saved.revision,1);
  assert.deepEqual(await saveDashboardWidgetPolicy(db,org,admin,{revision:0,roles}),saved);
  await assert.rejects(saveDashboardWidgetPolicy(db,org,admin,{revision:0,roles:initial.roles}),/CHANGED/);
  const member=await getDashboardWidgetPolicy(db,org,accountant);assert.equal(member.roles,undefined);assert.deepEqual(member.allowed,['suspected-errors','approvals']);
  assert.equal((await readDashboardWidgetPolicy(db,s.other.id)).revision,0);
  assert.equal(await db.systemSetting.count({where:{key:{startsWith:`DASHBOARD_WIDGET_POLICY_AUDIT:${org}:`}}}),1);
  const failing={$transaction:(run,options)=>db.$transaction(tx=>run(new Proxy(tx,{get(target,property){if(property==='systemSetting')return new Proxy(target.systemSetting,{get(model,method){return method==='create'?async()=>{throw Error('AUDIT_FAILED');}:typeof model[method]==='function'?model[method].bind(model):model[method];}});return typeof target[property]==='function'?target[property].bind(target):target[property];}})),options)};
  await assert.rejects(saveDashboardWidgetPolicy(failing,org,admin,{revision:1,roles:initial.roles}),/AUDIT_FAILED/);
  assert.deepEqual(await readDashboardWidgetPolicy(db,org),saved);
  await db.employee.update({where:{id:admin},data:{status:'SUSPENDED'}});
  await assert.rejects(saveDashboardWidgetPolicy(db,org,admin,{revision:1,roles:initial.roles}),/DENIED/);
  await assert.rejects(getDashboardWidgetPolicy(db,org,admin),/DENIED/);
 }finally{await f.close();}
});
test('widget endpoint checks persisted dashboard permission and publishes company metadata',async()=>{
 assert.deepEqual(workspaceTopics('/dashboard/widget-policy'),['accounting-alerts']);
 const routes=new Map(),db={employee:{findFirst:async()=>({id:7,orgRole:'ADMIN'})},systemSetting:{findUnique:async()=>null},partnerClassification:{findUnique:async()=>null}};
 registerDashboardWidgetPolicyRoutes({get:(p,h)=>routes.set('GET '+p,h),put:(p,h)=>routes.set('PUT '+p,h)},db,{requireOrgRole:async(_req,_res,options)=>{assert.equal(options.allowSystemAdmin,false);assert.deepEqual(options.allowedRoles,widgetRoles);return {organization:{id:1,type:'SERVICE'}};},actorId:()=>7,canAccess:async()=>false});
 await assert.rejects(routes.get('GET /dashboard/widget-policy')({query:{orgId:2}},{setHeader(){},json(){assert.fail('denied');}}),/DENIED/);
});
