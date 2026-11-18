import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
import {LIVE_TOPICS} from '../frontend/src/utils/workspaceLiveEvents.mjs';
const require=createRequire(import.meta.url);
const {getDashboardRecipients,readDashboardRecipients,saveDashboardRecipients,registerDashboardRecipientRoutes}=require('../backend/dist/services/dashboardAlertRecipients');
const {listAccountingAlerts,acknowledgeAccountingAlert,registerAccountingAlertRoutes}=require('../backend/dist/services/accountingAlerts');
const {postLedgerEntry}=require('../backend/dist/services/bankLedger');
const {registerExpenseRequest}=require('../backend/dist/services/expenseRequest');
const {saveClassification}=require('../backend/dist/services/partnerClassification');
const {registerPartnerHandledItemRoutes,saveHandledItems}=require('../backend/dist/services/partnerHandledItems');
const {workspaceTopics}=require('../backend/dist/services/workspaceEvents');
const permissions={ledger:true,expense:true,invoice:false};

test('company recipients enforce actual roles on lists and acknowledgement; revisions, audit, rollback and company boundaries',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,admin=s.people.admin.id,accountant=s.people.senior.id;
  const operator=await db.employee.create({data:{orgId:org,name:'Operations',orgRole:'OPERATOR',status:'ACTIVE',gradeId:s.people.junior.gradeId}});
  assert.deepEqual(await getDashboardRecipients(db,org,admin),{revision:0,handledRoles:['ADMIN','ACCOUNTANT'],uncodedRoles:['ADMIN','ACCOUNTANT']});
  for(const id of [accountant,operator.id]){
   await assert.rejects(getDashboardRecipients(db,org,id),/ADMIN_REQUIRED/);
   await assert.rejects(saveDashboardRecipients(db,org,id,{revision:0,handledRoles:['ADMIN']}),/ADMIN_REQUIRED/);
  }
  await assert.rejects(getDashboardRecipients(db,s.other.id,admin),/ADMIN_REQUIRED/);
  await assert.rejects(saveDashboardRecipients(db,s.other.id,admin,{revision:0,handledRoles:['ADMIN']}),/ADMIN_REQUIRED/);
  await assert.rejects(getDashboardRecipients(db,org,undefined),/ADMIN_REQUIRED/);
  for(const roles of [['ADMIN','ADMIN'],['ADMIN','SYSTEM'],['ADMIN','WORKER']])await assert.rejects(saveDashboardRecipients(db,org,admin,{revision:0,handledRoles:roles}),/INVALID/);
  const base=await db.transactionCodeBase.findUnique({where:{id:s.code.baseId}}),industryId=base.serviceTypeId,industry=await db.settingServiceDefault.findUnique({where:{id:industryId}});
  await db.accountingCodeIndustry.create({data:{baseId:base.id,systemIndustryId:industryId}});
  await db.$transaction(tx=>saveClassification(tx,org,s.vendor.id,admin,{revision:0,roleIds:[industry.partnerRoleId],industryIds:[industryId]}));
  const otherBase=await db.transactionCodeBase.create({data:{code:'OTHER_ITEM',nameEn:'Other item',nameKo:'Other',nameVi:'Other',serviceTypeId:industryId,entryMode:'GENERAL',industryLinks:{create:{systemIndustryId:industryId}}}});
  await db.$transaction(tx=>registerExpenseRequest(tx,org,admin,{partnerOrgId:s.vendor.id,requestDate:'2026-11-18',clientKey:randomUUID(),items:[{transactionCodeId:s.code.id,currency:'USD',quantity:'1',unitPrice:'10',vatRate:'0',details:{reference:'DOC',evidenceFile:'proof.pdf'}}]}));
  const ledger=await postLedgerEntry(db,org,'admin@example.test',s.account.id,{clientKey:randomUUID(),transactionDate:'2026-11-18',direction:'OUT',amount:'10',accountingCodeId:s.code.id,evidenceType:'FILE',evidenceNumber:'DOC',counterparty:{kind:'PARTNER',id:s.vendor.id}});
  const routes=new Map();registerPartnerHandledItemRoutes({get:()=>{},put:(p,h)=>routes.set(p,h)},db,{requireSystemAdmin:async()=>true,requireOrgRole:async()=>({organization:s.company}),actorId:()=>admin});
  await routes.get('/system-setting-defaults/services/:id/handled-items')({params:{id:String(industryId)},body:{enabled:true,revision:0}},{json:()=>{}});
  await db.$transaction(tx=>saveHandledItems(tx,org,s.vendor.id,admin,{revision:0,industries:[{industryId,baseIds:[otherBase.id]}]}));
  await db.transactionCodeBase.update({where:{id:base.id},data:{cashDirection:'IN'}});
  const initial=await listAccountingAlerts(db,org,admin,permissions);assert.equal(initial.total,4);
  await assert.rejects(listAccountingAlerts(db,org,operator.id,permissions),/ACCESS_DENIED/);
  const first=await saveDashboardRecipients(db,org,admin,{revision:0,handledRoles:['OPERATOR','ADMIN']});assert.deepEqual(first,{revision:1,handledRoles:['ADMIN','OPERATOR'],uncodedRoles:['ADMIN','ACCOUNTANT']});
  assert.deepEqual(await saveDashboardRecipients(db,org,admin,{revision:0,handledRoles:['ADMIN','OPERATOR']}),first,'unknown-result retry is idempotent');
  await assert.rejects(saveDashboardRecipients(db,org,admin,{revision:0,handledRoles:['ADMIN']}),/CHANGED/);
  const operations=await listAccountingAlerts(db,org,operator.id,permissions,{kinds:'DIRECTION,PARTNER_HANDLED_ITEM'});assert.equal(operations.total,2);assert.ok(operations.rows.every(row=>row.kind==='PARTNER_HANDLED_ITEM'));
  const finance=await listAccountingAlerts(db,org,accountant,permissions);assert.equal(finance.total,2);assert.ok(finance.rows.every(row=>row.kind==='DIRECTION'));
  await assert.rejects(acknowledgeAccountingAlert(db,org,operator.id,permissions,finance.rows[0].signature),/ACCESS_DENIED/);
  await assert.rejects(acknowledgeAccountingAlert(db,org,accountant,permissions,operations.rows[0].signature),/ACCESS_DENIED/);
  await acknowledgeAccountingAlert(db,org,operator.id,permissions,operations.rows[0].signature);
  assert.equal((await listAccountingAlerts(db,org,operator.id,permissions)).total,1);
  assert.equal((await listAccountingAlerts(db,org,admin,permissions)).total,4,'personal receipts do not hide administrator alerts');
  const handlers=new Map();registerAccountingAlertRoutes({get:(p,h)=>handlers.set('GET '+p,h),post:(p,h)=>handlers.set('POST '+p,h)},db,{requireOrgRole:async()=>({organization:s.company}),actorId:()=>operator.id,canAccess:async scope=>scope.feature==='DASHBOARD'});
  await assert.rejects(handlers.get('GET /dashboard/accounting-alerts')({query:{}},{setHeader(){},json(){assert.fail('no financial data without a source menu');}}),/ACCESS_DENIED/);
  const second=await saveDashboardRecipients(db,org,admin,{revision:1,handledRoles:['ADMIN']});assert.equal(second.revision,2);
  await assert.rejects(acknowledgeAccountingAlert(db,org,operator.id,permissions,operations.rows[1].signature),/ACCESS_DENIED/);
  await assert.rejects(listAccountingAlerts(db,org,operator.id,permissions),/ACCESS_DENIED/);
  assert.deepEqual(await readDashboardRecipients(db,s.other.id),{revision:0,handledRoles:['ADMIN','ACCOUNTANT'],uncodedRoles:['ADMIN','ACCOUNTANT']});
  assert.equal(await db.systemSetting.count({where:{key:{startsWith:`DASHBOARD_ALERT_RECIPIENTS_AUDIT:${org}:`}}}),2);
  const failAudit={$transaction:(run,options)=>db.$transaction(tx=>run(new Proxy(tx,{get(target,property){if(property==='systemSetting')return new Proxy(target.systemSetting,{get(model,method){return method==='create'?async()=>{throw Error('AUDIT_FAILED');}:typeof model[method]==='function'?model[method].bind(model):model[method];}});return typeof target[property]==='function'?target[property].bind(target):target[property];}})),options)};
  await assert.rejects(saveDashboardRecipients(failAudit,org,admin,{revision:2,handledRoles:['ADMIN','ACCOUNTANT']}),/AUDIT_FAILED/);
  assert.deepEqual(await readDashboardRecipients(db,org),second,'audit failure rolls the policy back');
  await saveDashboardRecipients(db,org,admin,{revision:2,handledRoles:['ACCOUNTANT']});
  assert.ok((await listAccountingAlerts(db,org,admin,permissions)).rows.every(row=>row.kind==='DIRECTION'));
  await assert.rejects(acknowledgeAccountingAlert(db,org,admin,permissions,operations.rows[1].signature),/ACCESS_DENIED/);
  const nobody=await saveDashboardRecipients(db,org,admin,{revision:3,handledRoles:[]});
  assert.deepEqual(await readDashboardRecipients(db,org),nobody);
  assert.ok((await listAccountingAlerts(db,org,accountant,permissions)).rows.every(row=>row.kind==='DIRECTION'));
  await db.employee.update({where:{id:admin},data:{status:'SUSPENDED'}});
  await assert.rejects(saveDashboardRecipients(db,org,admin,{revision:2,handledRoles:['ADMIN','ACCOUNTANT']}),/ADMIN_REQUIRED/);
  assert.equal((await db.bankLedgerEntry.findUnique({where:{id:ledger.id}})).amount.toString(),'10');
 }finally{await f.close();}
});

test('recipient endpoints use authenticated company and persisted dashboard permission; changes invalidate only company metadata',async()=>{
 assert.deepEqual(workspaceTopics('/dashboard/alert-recipients'),['accounting-alerts']);
 assert.ok(LIVE_TOPICS.includes('accounting-alerts'));
 const handlers=new Map(),db={employee:{findFirst:async()=>({id:7})},systemSetting:{findUnique:async()=>null},partnerClassification:{findUnique:async()=>null}};
 registerDashboardRecipientRoutes({get:(p,h)=>handlers.set(p,h),put:()=>{}},db,{requireOrgRole:async(_req,_res,options)=>{assert.deepEqual(options,{allowedRoles:['ADMIN'],allowSystemAdmin:false});return {organization:{id:1,type:'SERVICE'}};},actorId:()=>7,canAccess:async()=>false});
 await assert.rejects(handlers.get('/dashboard/alert-recipients')({query:{orgId:2}},{setHeader(){},json(){assert.fail('permission denied');}}),/ADMIN_REQUIRED/);
});
