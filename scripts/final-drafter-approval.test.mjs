import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {saveApprovalActionBatch}=require('../backend/dist/services/approvalActions');
const {previewChangeApproval,requestChangeApproval}=require('../backend/dist/services/changeApprovals');
const {registerExpenseRequest}=require('../backend/dist/services/expenseRequest');
const {approvalState}=require('../backend/dist/services/bankEvidence');
const {defaultApprovalSettings}=require('../backend/dist/services/expenseApproval');
const {loadExpenseEditorSource,expenseEditorRevision}=require('../backend/dist/services/expenseRequestEditor');

test('final drafter auto-approves expenses and ledger once; intermediate-only authority still needs a final approver',async()=>{
 const f=await changeApprovalFixture({registration:true});try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id;
  const stages=[{role:'ACCOUNTANT',gradeId:s.people.senior.gradeId,gradeMatch:'MINIMUM'},{role:'ACCOUNTANT',gradeId:s.people.lead.gradeId,gradeMatch:'MINIMUM'}];
  const settings=kind=>({...defaultApprovalSettings(),version:2,kind,revision:0,stageAuthorityVersion:1,drafterScope:{role:'ALL',gradeId:null},rules:[{id:'all',name:'All amounts',currency:'USD',min:'0',max:null,drafterRole:'ALL',drafterGradeId:null,stages}]});
  await saveApprovalActionBatch(db,org,s.people.admin.id,[{menu:'EXPENSE',operation:'CREATE',settings:settings('EXPENSE')},{menu:'BANK_LEDGER',operation:'CREATE',settings:settings('BANK_LEDGER')}]);
  const expenseBody={partnerOrgId:s.vendor.id,automaticRequestDate:true,clientKey:randomUUID(),items:[{transactionCodeId:s.code.id,currency:'USD',quantity:'1',unitPrice:'10',vatRate:'0',details:{reference:'FINAL-SELF',evidenceFile:'fixture-evidence.pdf'}}]};
  const expense=await db.$transaction(tx=>registerExpenseRequest(tx,org,s.people.lead.id,expenseBody));const state=await approvalState(db,org,expense.id,s.people.lead.id);assert.equal(state.approved,true);assert.equal(state.exempt,true);assert.equal(state.steps.length,0);assert.equal(await db.expenseApprovalDecision.count(),0,'no fabricated manual expense approval');
  const bank={entryKind:'BANK',accountId:s.account.id,transactionDate:'2026-11-06',direction:'IN',amount:'10',remark:'Final drafter',purpose:'Final drafter',evidenceType:'FILE',evidenceNumber:'Receipt',accountingCodeId:s.code.id,counterparty:{kind:'PARTNER',id:s.vendor.id},clientKey:randomUUID()};
  const payload={schemaVersion:2,accountingCodeVersion:1,clientKey:randomUUID(),rows:[bank]},input={menu:'BANK_LEDGER',operation:'CREATE',sourceKind:'batch',sourceId:payload.clientKey,payload,clientKey:randomUUID()};
  assert.equal((await previewChangeApproval(db,org,s.people.lead.id,input)).policy.autoApproved,true);
  assert.equal((await previewChangeApproval(db,org,s.people.senior.id,input)).policy.autoApproved,false);
  const done=await requestChangeApproval(db,org,s.people.lead.id,input);assert.equal(done.status,'APPROVED');assert.equal(done.decidedByEmployeeId,s.people.lead.id);assert.equal(await db.bankLedgerEntry.count(),1);assert.equal(done.policy.autoApproved,true);
  assert.equal((await requestChangeApproval(db,org,s.people.lead.id,input)).id,done.id);assert.equal(await db.bankLedgerEntry.count(),1);assert.equal(await db.changeApprovalDecision.count({where:{requestId:done.id}}),1);
  const source=await loadExpenseEditorSource(db,org,'request',String(expense.id));
  const update={partnerOrgId:s.vendor.id,requestDate:expense.requestDate,revision:expenseEditorRevision(source),version:expense.version,clientKey:randomUUID(),items:[{...expenseBody.items[0],itemId:expense.items[0].id,unitPrice:'12'}]};
  const edited=await requestChangeApproval(db,org,s.people.lead.id,{menu:'EXPENSE',operation:'UPDATE',sourceKind:'request',sourceId:String(expense.id),payload:update,clientKey:randomUUID()});assert.equal(edited.status,'APPROVED');assert.equal((await approvalState(db,org,expense.id,s.people.lead.id)).approved,true);assert.equal(await db.expenseApprovalDecision.count(),0);
 }finally{await f.close();}
});
