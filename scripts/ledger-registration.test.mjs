import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {previewChangeApproval,requestChangeApproval,decideChangeApproval}=require('../backend/dist/services/changeApprovals');
const {postLedgerEntry}=require('../backend/dist/services/bankLedger');
const {registerExpenseRequest}=require('../backend/dist/services/expenseRequest');
const {registerExpensePayeeRoutes}=require('../backend/dist/services/expensePayee');
const {previewLedgerRegistration}=require('../backend/dist/services/ledgerRegistration');

test('final approver shortage reports overlap or self-only without bypassing stage, grade or company rules',async()=>{
 const f=await changeApprovalFixture({registration:true});try{
  const db=f.db,s=await seedChangeApproval(db),drafter=s.people.senior;
  const config={registrationStages:[{role:'ACCOUNTANT',gradeMatch:'ANY',gradeId:null},{role:'ACCOUNTANT',gradeMatch:'MINIMUM',gradeId:drafter.gradeId}]};
  const source={items:[{unitPrice:'3553561'}],entry:{account:{currencyCode:'VND'}}};
  const blocked=await previewLedgerRegistration(db,s.company.id,drafter,source,config,{step1EmployeeId:s.people.lead.id});
  assert.equal(blocked.complete,false);assert.equal(blocked.stages[1].unavailableReason,'ALREADY_SELECTED');assert.deepEqual(blocked.stages[1].candidates,[]);assert.equal(blocked.stages[1].minimumGradeId,drafter.gradeId);assert.equal(blocked.stages[1].requiredGrade.id,drafter.gradeId);
  const corrected=await previewLedgerRegistration(db,s.company.id,drafter,source,config,{step1EmployeeId:s.people.junior.id});
  assert.equal(corrected.complete,true);assert.deepEqual(corrected.ids,[s.people.junior.id,s.people.lead.id]);
  assert.equal(corrected.stages[1].candidates.some(p=>p.id===drafter.id||p.id===s.people.admin.id),false,'neither drafter nor an ADMIN qualifies for an ACCOUNTANT stage');
  await db.employee.update({where:{id:s.people.lead.id},data:{status:'SUSPENDED'}});
  const selfOnly=await previewLedgerRegistration(db,s.company.id,drafter,source,config,{step1EmployeeId:s.people.junior.id});assert.equal(selfOnly.complete,false);assert.equal(selfOnly.stages[1].unavailableReason,'DRAFTER_ONLY');
  await db.employee.update({where:{id:drafter.id},data:{orgRole:'OPERATOR'}});
  const none=await previewLedgerRegistration(db,s.company.id,{...drafter,orgRole:'OPERATOR'},source,config,{step1EmployeeId:s.people.junior.id});assert.equal(none.stages[1].unavailableReason,'NO_ELIGIBLE');assert.equal(none.complete,false);
  const missing=await previewLedgerRegistration(db,s.company.id,drafter,source,{registrationStages:[{role:'ACCOUNTANT',gradeMatch:'MINIMUM',gradeId:null}]});assert.equal(missing.stages[0].unavailableReason,'GRADE_NOT_CONFIGURED');assert.equal(missing.complete,false);
 }finally{await f.close();}
});
test('single-account ledger registration uses two independent accounting approvals and preserves source scope',async()=>{
 const f=await changeApprovalFixture({registration:true}),db=f.db;
 try{
  const s=await seedChangeApproval(db),org=s.company.id;
  const bank=(extra={})=>({entryKind:'BANK',accountId:s.account.id,transactionDate:'2026-11-05',direction:'IN',amount:'10',remark:'Received',purpose:'Received',evidenceType:'FILE',evidenceNumber:'Receipt',accountingCodeId:s.code.id,counterparty:{kind:'PARTNER',id:s.vendor.id},clientKey:randomUUID(),...extra});
  const payload={schemaVersion:2,accountingCodeVersion:1,clientKey:randomUUID(),rows:[bank(),bank({amount:'20'})]};
  const input={menu:'BANK_LEDGER',operation:'CREATE',sourceKind:'batch',sourceId:payload.clientKey,payload,clientKey:randomUUID(),selection:{step1EmployeeId:s.people.junior.id,step2EmployeeId:s.people.lead.id}};
  const preview=(await previewChangeApproval(db,org,s.people.admin.id,input)).preview;
  assert.equal((await previewChangeApproval(db,org,s.people.admin.id,{...input,payload:{...payload,rows:[bank({amount:'',counterparty:null})]}})).preview.stages.length,2,'the amount-independent line can be selected before completing details');
  assert.equal(preview.stages.length,2);assert.ok(preview.stages[0].candidates.some(p=>p.id===s.people.junior.id));assert.ok(preview.stages[1].candidates.some(p=>p.id===s.people.senior.id));assert.ok(preview.stages[1].candidates.some(p=>p.id===s.people.lead.id));assert.ok(!preview.stages[1].candidates.some(p=>p.id===s.people.junior.id));
  await assert.rejects(previewChangeApproval(db,org,s.people.admin.id,{...input,payload:{...payload,rows:[bank(),bank({accountId:'foreign'})]}}),/LEDGER_SINGLE_ACCOUNT_REQUIRED/);
  await assert.rejects(postLedgerEntry(db,org,'admin@example.test',s.account.id,bank()),/CHANGE_APPROVAL_REQUIRED/);
  const request=await requestChangeApproval(db,org,s.people.admin.id,input);assert.equal(await db.bankLedgerEntry.count(),0);
  assert.equal((await requestChangeApproval(db,org,s.people.admin.id,input)).id,request.id);
  await assert.rejects(decideChangeApproval(db,org,s.people.lead.id,request.id,{decision:'APPROVED'}),/CHANGE_APPROVER_REQUIRED/);
  await assert.rejects(decideChangeApproval(db,org,s.people.admin.id,request.id,{decision:'APPROVED'}),/CHANGE_APPROVER_REQUIRED/);
  await decideChangeApproval(db,org,s.people.junior.id,request.id,{decision:'APPROVED'});assert.equal(await db.bankLedgerEntry.count(),0);
  const done=await decideChangeApproval(db,org,s.people.lead.id,request.id,{decision:'APPROVED'});assert.equal(done.status,'APPROVED');assert.equal(done.result.entryIds.length,2);assert.equal(await db.bankLedgerEntry.count(),2);
  await decideChangeApproval(db,org,s.people.lead.id,request.id,{decision:'APPROVED'});assert.equal(await db.bankLedgerEntry.count(),2);
  const rejectPayload={...payload,clientKey:randomUUID(),rows:[bank()]};const rejected=await requestChangeApproval(db,org,s.people.admin.id,{...input,clientKey:randomUUID(),sourceId:rejectPayload.clientKey,payload:rejectPayload});await decideChangeApproval(db,org,s.people.junior.id,rejected.id,{decision:'REJECTED',reason:'Wrong receipt'});assert.equal(await db.bankLedgerEntry.count(),2);
  const correction={schemaVersion:2,accountingCodeVersion:1,clientKey:randomUUID(),rows:[bank({amount:'15'})]};
  const edit=await requestChangeApproval(db,org,s.people.junior.id,{menu:'BANK_LEDGER',operation:'UPDATE',sourceKind:'ledger',sourceId:done.result.entryIds[0],payload:correction,clientKey:randomUUID()});
  const corrected=await decideChangeApproval(db,org,s.people.senior.id,edit.id,{decision:'APPROVED'});assert.equal(await db.bankLedgerEntry.count({where:{voidedAt:null}}),2);assert.equal((await db.bankLedgerEntry.findUnique({where:{id:corrected.result.entryIds[0]}})).amount.toString(),'15');
  // A real local company is eligible independently of the obsolete vendor type.
  const baro=await db.organization.create({data:{name:'BARO',type:'BRAND',ownerOrgId:org}});
  await db.organizationBankAccount.create({data:{orgId:org,entityId:baro.id,currencyId:s.currency.id,bankName:'BARO bank',accountNumber:'002',accountHolder:'BARO',createdByEmployeeId:s.people.admin.id,updatedByEmployeeId:s.people.admin.id}});
  const routes=new Map();registerExpensePayeeRoutes({get:(p,h)=>routes.set(p,h),post:()=>{},put:()=>{}},db,{requireOrgRole:async()=>({organization:s.company})});let payees;
  await routes.get('/expense-payees')({query:{}},{json:value=>payees=value});assert.ok(payees.some(p=>p.id===baro.id));
  const document=await db.$transaction(tx=>registerExpenseRequest(tx,org,s.people.junior.id,{partnerOrgId:baro.id,automaticRequestDate:true,clientKey:randomUUID(),items:[{transactionCodeId:s.code.id,currency:'USD',quantity:'1',unitPrice:'10',vatRate:'0',details:{reference:'BARO-1'}}]}));assert.equal(document.partnerOrgId,baro.id);
 }finally{await f.close();}
});
