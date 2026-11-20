import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {approvalActionSettings,saveApprovalActionBatch}=require('../backend/dist/services/approvalActions');
const {registerSystemApprovalDefaults}=require('../backend/dist/services/systemApprovalDefaults');
const {resolveExpenseApproval}=require('../backend/dist/services/expenseApproval');
const {requestChangeApproval}=require('../backend/dist/services/changeApprovals');
const {registerExpenseRequest}=require('../backend/dist/services/expenseRequest');
const {approvalState}=require('../backend/dist/services/bankEvidence');
const sql=readFileSync('backend/prisma/migrations/20261120080000_system_approval_defaults/migration.sql','utf8');

test('all ten system policies bootstrap from BARO, preserve originals, resolve company grades and retain explicit empty lines',async()=>{
 const f=await changeApprovalFixture({registration:true});try{
  const {db}=f,s=await seedChangeApproval(db),org=s.company.id;
  assert.equal(org,1);
  await db.organization.update({where:{id:org},data:{name:'BARO GARMENT',type:'MANUFACTURER'}});
  await db.organization.create({data:{id:1845,name:'DEX',type:'SERVICE'}});
  const set=await db.employeeGradeSet.create({data:{orgId:1845,code:'TEST',name:'DEX grades'}});
  const grade=await db.employeeGrade.create({data:{orgId:1845,setId:set.id,code:'CL2',name:'DEX senior',nameKo:'Senior',nameEn:'Senior',nameVi:'Senior',sortOrder:1}});
  const local={version:2,revision:7,drafterRoles:['ACCOUNTANT'],stages:[{role:'ACCOUNTANT',gradeId:s.people.senior.gradeId,gradeMatch:'MINIMUM'}]};
  await db.systemSetting.create({data:{key:'APPROVAL_POLICY:INVENTORY:CREATE:1',value:local}});
  await f.pg.exec(sql);
  assert.equal((await db.systemSetting.findMany({where:{key:{startsWith:'APPROVAL_DEFAULT:'}}})).length,10);
  assert.deepEqual((await db.systemSetting.findUnique({where:{key:'APPROVAL_POLICY:INVENTORY:CREATE:1'}})).value,local);
  const template=(await db.systemSetting.findUnique({where:{key:'APPROVAL_DEFAULT:INVENTORY:CREATE'}})).value;
  assert.deepEqual(template.policy.stages[0].gradeId,{_gradeRef:{setCode:'TEST',code:'CL2'}});
  const target=(await approvalActionSettings(db,1845,'INVENTORY','CREATE')).value;
  assert.equal(target.source,'SYSTEM');assert.equal(target.stages[0].gradeId,grade.id);assert.notEqual(target.stages[0].gradeId,s.people.senior.gradeId);
  const source=(await approvalActionSettings(db,org,'INVENTORY','CREATE')).value;
  await saveApprovalActionBatch(db,org,s.people.admin.id,[{menu:'INVENTORY',operation:'CREATE',settings:{...source,stages:[]}}]);
  assert.deepEqual((await approvalActionSettings(db,org,'INVENTORY','CREATE')).value.stages,[]);
  assert.equal((await approvalActionSettings(db,1845,'INVENTORY','CREATE')).value.source,'SYSTEM');
  await db.systemUser.create({data:{email:'system@example.test',systemRole:'SYSTEM_ADMIN'}});
  const routes=new Map();registerSystemApprovalDefaults({get:(p,h)=>routes.set('GET '+p,h),put:(p,h)=>routes.set('PUT '+p,h)},db,{requireSystemAdmin:async()=>({requesterEmail:'system@example.test'}),requireOrgRole:async()=>({organization:{id:org}}),actorId:()=>s.people.admin.id});
  const current=(await approvalActionSettings(db,org,'INVENTORY','CREATE')).value;
  await routes.get('PUT /approval-action-settings/source')({body:{menu:'INVENTORY',operation:'CREATE',mode:'DEFAULT',revision:current.revision}},{json(){}});
  assert.deepEqual((await approvalActionSettings(db,org,'INVENTORY','CREATE')).value.stages,source.stages);
  assert.deepEqual((await db.systemSetting.findUnique({where:{key:'APPROVAL_POLICY:INVENTORY:CREATE:1'}})).value.stages,[]);
  await f.pg.exec(sql);
  assert.deepEqual((await db.systemSetting.findUnique({where:{key:'APPROVAL_DEFAULT:INVENTORY:CREATE'}})).value,template,'retry never overwrites a captured default');
  const rule={id:'none',name:'No approval',drafterRole:'ALL',currency:'USD',min:'0',max:null,stages:[]};
  const config={version:2,kind:'EXPENSE',revision:1,rules:[rule]};
  const preview=await resolveExpenseApproval(db,org,s.people.junior.id,[{currency:'USD',quantity:'1',unitPrice:'10',vatRate:'0'}],{},true,config);
  assert.equal(preview.policy.noApprovalRequired,true);assert.equal(preview.complete,true);assert.deepEqual(preview.ids,[]);
  const update=routes.get('PUT /system-approval-action-settings/batch'),res={json(){}};
  const change={menu:'INVENTORY',operation:'CREATE',settings:{revision:1,drafterRoles:['ACCOUNTANT'],stages:[]}};
  await assert.rejects(update({body:{changes:[change,{...change,operation:'DELETE',settings:{...change.settings,stages:[{role:'FORGED'}]}}]}},res),/INVALID_APPROVAL_RULE/);
  assert.deepEqual((await db.systemSetting.findUnique({where:{key:'APPROVAL_DEFAULT:INVENTORY:CREATE'}})).value,template,'invalid second menu rolls back first menu and audit');
  await update({body:{changes:[change]}},res);
  await assert.rejects(update({body:{changes:[change]}},res),/APPROVAL_SETTINGS_CHANGED/);
  const nextTarget=(await approvalActionSettings(db,1845,'INVENTORY','CREATE')).value;
  assert.deepEqual(nextTarget.stages,[]);assert.notEqual(nextTarget.revision,target.revision);
  assert.deepEqual((await db.systemSetting.findUnique({where:{key:'APPROVAL_POLICY:INVENTORY:CREATE:1'}})).value.stages,[]);
 }finally{await f.close();}
});

test('empty financial approval lines immediately create and delete ledger entries with no decision rows',async()=>{
 const f=await changeApprovalFixture({registration:true});try{
  const {db}=f,s=await seedChangeApproval(db),org=s.company.id;
  const expensePolicy={...s.config,version:2,kind:'EXPENSE',revision:1,rules:[{id:'none',name:'No approval',drafterRole:'ALL',currency:'USD',min:'0',max:null,stages:[]}]};
  await db.systemSetting.update({where:{key:`EXPENSE_APPROVAL_POLICY:${org}`},data:{value:expensePolicy}});
  const expense=await db.$transaction(tx=>registerExpenseRequest(tx,org,s.people.junior.id,{partnerOrgId:s.vendor.id,requestDate:'2026-11-05',clientKey:randomUUID(),items:[{transactionCodeId:s.code.id,currency:'USD',quantity:'1',unitPrice:'10',vatRate:'0',details:{evidenceFile:'fixture.pdf',reference:'EXP-1'}}]}));
  assert.equal((await approvalState(db,org,expense.id)).approved,true);assert.equal(await db.expenseApprovalDecision.count(),0);
  await db.systemSetting.create({data:{key:`APPROVAL_POLICY:BANK_LEDGER:CREATE:${org}`,value:{revision:0,version:2,drafterScope:{role:'ALL',gradeId:null},registrationStages:[],rules:[]}}});
  const key=randomUUID();
  const row={entryKind:'BANK',accountId:s.account.id,clientKey:randomUUID(),transactionDate:'2026-11-05',direction:'IN',amount:'10',purpose:'Receipt',evidenceType:'FILE',evidenceNumber:'R1',accountingCodeId:s.code.id,counterparty:{kind:'PARTNER',id:s.vendor.id}};
  const input={menu:'BANK_LEDGER',operation:'CREATE',sourceKind:'batch',sourceId:key,clientKey:randomUUID(),payload:{schemaVersion:2,accountingCodeVersion:1,clientKey:key,rows:[row]}};
  const created=await requestChangeApproval(db,org,s.people.junior.id,input);
  assert.equal(created.status,'APPROVED');assert.equal(await db.changeApprovalDecision.count(),0);assert.equal(await db.bankLedgerEntry.count(),1);
  assert.equal((await requestChangeApproval(db,org,s.people.junior.id,input)).id,created.id);
  const entry=await db.bankLedgerEntry.findFirstOrThrow();
  await db.systemSetting.create({data:{key:`APPROVAL_POLICY:BANK_LEDGER:DELETE:${org}`,value:{...s.config,version:2,kind:'EXPENSE',revision:1,rules:[{id:'none',name:'No approval',drafterRole:'ALL',currency:'USD',min:'0',max:null,stages:[]}]}}});
  const removed=await requestChangeApproval(db,org,s.people.junior.id,{menu:'BANK_LEDGER',operation:'DELETE',sourceKind:'ledger',sourceId:entry.id,clientKey:randomUUID(),reason:'Duplicate',payload:{}});
  assert.equal(removed.status,'APPROVED');assert.equal(await db.changeApprovalDecision.count(),0);assert.ok((await db.bankLedgerEntry.findUnique({where:{id:entry.id}})).voidedAt);
 }finally{await f.close();}
});
