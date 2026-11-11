import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {accountingAlertKinds,listAccountingAlerts,acknowledgeAccountingAlert,registerAccountingAlertRoutes}=require('../backend/dist/services/accountingAlerts');
const {postLedgerEntry}=require('../backend/dist/services/bankLedger');
const {registerExpenseRequest}=require('../backend/dist/services/expenseRequest');
const {saveClassification}=require('../backend/dist/services/partnerClassification');
const permissions={ledger:true,expense:true,invoice:true};
test('direction checks both ways and real multi-industry IDs, never names or unknown classifications',()=>{
 const source={direction:'OUT',code:{base:{cashDirection:'IN',industryLinks:[{systemIndustryId:1},{systemIndustryId:2}]}}};
 assert.deepEqual(accountingAlertKinds(source,{classification:{industryIds:[2]}}),['DIRECTION']);
 assert.deepEqual(accountingAlertKinds({...source,direction:'IN',code:{...source.code,base:{...source.code.base,cashDirection:'OUT'}}},{classification:{industryIds:[3]}}),['DIRECTION','PARTNER_INDUSTRY']);
 assert.deepEqual(accountingAlertKinds({...source,code:{base:{...source.code.base,cashDirection:'BOTH'}}},null),[]);
 assert.deepEqual(accountingAlertKinds(source,{classification:{industryIds:[]}}),['DIRECTION']);
 assert.deepEqual(accountingAlertKinds(source,{linkedCompany:{subscriberOrgId:9},officialClassification:{industryIds:[2]},classification:{industryIds:[3]}}),['DIRECTION']);
 assert.deepEqual(accountingAlertKinds({...source,code:{base:{...source.code.base,expenseType:{code:'FUNDS'}}}},{classification:{industryIds:[3]}}),['DIRECTION']);
});
test('actual company-scoped sources, shared acknowledgement, current-state revisions, immutable ledger and active membership',async()=>{
 const f=await changeApprovalFixture(),db=f.db;try{
  const s=await seedChangeApproval(db),org=s.company.id,base=await db.transactionCodeBase.findUnique({where:{id:s.code.baseId}});
  await db.transactionCodeBase.update({where:{id:base.id},data:{cashDirection:'IN'}});
  const row=await postLedgerEntry(db,org,'admin@example.test',s.account.id,{clientKey:randomUUID(),transactionDate:'2026-11-05',direction:'OUT',amount:'10',remark:'Saved amount',accountingCodeId:s.code.id,evidenceType:'FILE',evidenceNumber:'Reference',counterparty:{kind:'PARTNER',id:s.vendor.id}});
  await db.$transaction(tx=>registerExpenseRequest(tx,org,s.people.admin.id,{partnerOrgId:s.vendor.id,requestDate:'2026-11-05',clientKey:randomUUID(),items:[{transactionCodeId:s.code.id,currency:'USD',quantity:'1',unitPrice:'12',vatRate:'0',details:{reference:'ALERT-TEST',evidenceFile:'stored.pdf'}}]}),{timeout:30000});
  const sourceIndustry=await db.settingServiceDefault.findUnique({where:{id:base.serviceTypeId}}),otherIndustry=await db.settingServiceDefault.create({data:{code:'ALERT_OTHER',nameEn:'Other industry',nameKo:'Other',nameVi:'Other',partnerRoleId:sourceIndustry.partnerRoleId,entryMode:'GENERAL'}});
  await db.$transaction(tx=>saveClassification(tx,org,s.vendor.id,s.people.admin.id,{revision:0,roleIds:[sourceIndustry.partnerRoleId],industryIds:[otherIndustry.id]}));
  const initial=await listAccountingAlerts(db,org,permissions);assert.equal(initial.total,4);assert.ok(initial.rows.some(item=>item.sourceKind==='EXPENSE'&&item.kind==='PARTNER_INDUSTRY'));
  assert.equal((await listAccountingAlerts(db,s.other.id,permissions)).total,0);
  assert.ok((await listAccountingAlerts(db,org,{ledger:true,expense:false})).rows.every(item=>item.sourceKind==='LEDGER'));
  const alert=initial.rows.find(item=>item.sourceId===row.id&&item.kind==='DIRECTION');
  await assert.rejects(acknowledgeAccountingAlert(db,s.other.id,s.people.admin.id,permissions,alert.signature),/ACCESS_DENIED/);
  await acknowledgeAccountingAlert(db,org,s.people.admin.id,permissions,alert.signature);await acknowledgeAccountingAlert(db,org,s.people.senior.id,permissions,alert.signature);
  assert.equal((await listAccountingAlerts(db,org,permissions)).total,3);assert.equal(await db.systemSetting.count({where:{key:{startsWith:'ACCOUNTING_ALERT_ACK:'+org+':'}}}),1);
  await db.transactionCodeBase.update({where:{id:base.id},data:{cashDirection:'BOTH'}});assert.equal((await listAccountingAlerts(db,org,permissions)).total,2);
  await assert.rejects(acknowledgeAccountingAlert(db,org,s.people.admin.id,permissions,alert.signature),/CHANGED/);
  await db.transactionCodeBase.update({where:{id:base.id},data:{cashDirection:'OUT'}});assert.equal((await listAccountingAlerts(db,org,permissions)).total,2);
  await db.transactionCodeBase.update({where:{id:base.id},data:{cashDirection:'IN',industryRevision:{increment:1}}});assert.equal((await listAccountingAlerts(db,org,permissions)).total,4,'a newly changed code basis must reappear even if it returns to an earlier direction');await db.transactionCodeBase.update({where:{id:base.id},data:{cashDirection:'OUT'}});
  await db.$transaction(tx=>saveClassification(tx,org,s.vendor.id,s.people.admin.id,{revision:1,roleIds:[sourceIndustry.partnerRoleId],industryIds:[sourceIndustry.id]}));assert.equal((await listAccountingAlerts(db,org,permissions)).total,0);
  await db.$transaction(tx=>saveClassification(tx,org,s.vendor.id,s.people.admin.id,{revision:2,roleIds:[sourceIndustry.partnerRoleId],industryIds:[otherIndustry.id]}));const changed=await listAccountingAlerts(db,org,permissions);assert.equal(changed.total,2);
  await db.employee.update({where:{id:s.people.admin.id},data:{status:'SUSPENDED'}});await assert.rejects(acknowledgeAccountingAlert(db,org,s.people.admin.id,permissions,changed.rows[0].signature),/ACCESS_DENIED/);
  const retained=await db.bankLedgerEntry.findUnique({where:{id:row.id}});assert.equal(retained.amount.toString(),'10');assert.equal(retained.voidedAt,null);assert.equal(retained.evidenceNumber,'Reference');
  const handlers=new Map(),app={get:(p,h)=>handlers.set('GET '+p,h),post:(p,h)=>handlers.set('POST '+p,h)};
  registerAccountingAlertRoutes(app,db,{requireOrgRole:async()=>({organization:s.company}),actorId:()=>s.people.senior.id,canAccess:async()=>false});let error;try{await handlers.get('GET /dashboard/accounting-alerts')({query:{}},{setHeader(){},json(){assert.fail('denied response must contain no data');}});}catch(value){error=value;}assert.equal(error.status,403);
 }finally{await f.close();}
});
