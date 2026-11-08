import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {flexibleApprovalStages}=require('../backend/dist/services/flexibleApprovalStages');
const {requestChangeApproval,decideChangeApproval,listChangeApprovals}=require('../backend/dist/services/changeApprovals');
const {registerExpenseRequest}=require('../backend/dist/services/expenseRequest');
const {approveExpense,approvalState}=require('../backend/dist/services/bankEvidence');
const {approvalReviewDetail,listApprovalReviews}=require('../backend/dist/services/approvalReview');
const {saveApprovalActionBatch}=require('../backend/dist/services/approvalActions');
const {defaultApprovalSettings}=require('../backend/dist/services/expenseApproval');

test('minimum grade candidates, vacancy fallback and final reservation stay inside the active company grade set',async()=>{
 const f=await changeApprovalFixture({registration:true});try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id;
  const stages=[{role:'ACCOUNTANT',gradeId:s.people.senior.gradeId},{role:'ACCOUNTANT',gradeId:s.people.lead.gradeId}];
  const first=await flexibleApprovalStages(db,org,s.people.admin,stages,{},true);
  assert.deepEqual(first.stages[0].candidates.map(p=>p.id),[s.people.senior.id]);assert.equal(first.stages[1].employeeId,s.people.lead.id);
  const extra=await db.employee.create({data:{orgId:org,name:'Responsible replacement',status:'ACTIVE',orgRole:'ACCOUNTANT',gradeId:s.people.lead.gradeId}});
  const higher=await flexibleApprovalStages(db,org,s.people.admin,stages,{},true);assert.ok(higher.stages[0].candidates.some(p=>p.id===extra.id));
  await db.employee.updateMany({where:{id:{in:[s.people.lead.id,extra.id]}},data:{status:'SUSPENDED'}});
  const fallback=await flexibleApprovalStages(db,org,s.people.admin,stages,{},true);assert.equal(fallback.stages.length,1);assert.equal(fallback.stages[0].employeeId,s.people.senior.id);assert.equal(fallback.policy.vacancy.effectiveGradeId,s.people.senior.gradeId);
  await db.employee.update({where:{id:s.people.senior.id},data:{status:'SUSPENDED'}});
  const junior=await flexibleApprovalStages(db,org,s.people.admin,stages,{},true);assert.equal(junior.stages.length,1);assert.equal(junior.stages[0].employeeId,s.people.junior.id);
  const self=await flexibleApprovalStages(db,org,s.people.junior,stages,{},true);assert.equal(self.complete,true);assert.equal(self.policy.exempt,true);assert.equal(self.policy.exemptionReason,'FINAL_DRAFTER');assert.equal(self.stages.length,0);
 }finally{await f.close();}
});

test('pending ledger and expense retain original slots, accept an eligible vacancy signer and audit both identities',async()=>{
 const f=await changeApprovalFixture({registration:true});try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id;
  const bank={entryKind:'BANK',accountId:s.account.id,transactionDate:'2026-11-05',direction:'IN',amount:'10',remark:'Received',purpose:'Received',evidenceType:'FILE',evidenceNumber:'Receipt',accountingCodeId:s.code.id,counterparty:{kind:'PARTNER',id:s.vendor.id},clientKey:randomUUID()};
  const payload={schemaVersion:2,accountingCodeVersion:1,clientKey:randomUUID(),rows:[bank]};
  const pending=await requestChangeApproval(db,org,s.people.admin.id,{menu:'BANK_LEDGER',operation:'CREATE',sourceKind:'batch',sourceId:payload.clientKey,payload,clientKey:randomUUID(),selection:{step1EmployeeId:s.people.junior.id,step2EmployeeId:s.people.lead.id}});
  await decideChangeApproval(db,org,s.people.junior.id,pending.id,{decision:'APPROVED'});
  await db.employee.update({where:{id:s.people.lead.id},data:{status:'SUSPENDED'}});
  await assert.rejects(db.changeApprovalDecision.create({data:{orgId:org,requestId:pending.id,position:2,employeeId:s.people.lead.id,actingEmployeeId:s.people.junior.id,decision:'APPROVED'}}),/CHANGE_APPROVER_REQUIRED/,'SQL also rejects a lower delegate while a senior remains');
  await assert.rejects(decideChangeApproval(db,org,s.people.junior.id,pending.id,{decision:'APPROVED'}),/CHANGE_APPROVER_REQUIRED/,'a remaining senior prevents downward fallback');
  await db.employee.update({where:{id:s.people.senior.id},data:{status:'SUSPENDED'}});
  assert.equal((await listChangeApprovals(db,org,s.people.junior.id)).find(r=>r.id===pending.id).canDecide,true);
  const today=new Date().toISOString().slice(0,10);
  assert.ok((await listApprovalReviews(db,org,s.people.junior.id,{start:today.slice(0,4)+'-01-01',end:today,status:'ALL'})).rows.some(r=>r.id===pending.id));
  const review=await approvalReviewDetail(db,org,s.people.junior.id,'CHANGE_APPROVAL',pending.id);assert.equal(review.canDecide,true);assert.equal(review.approvalLine[1].person.id,s.people.junior.id);
  const done=await decideChangeApproval(db,org,s.people.junior.id,pending.id,{decision:'APPROVED'});assert.equal(done.status,'APPROVED');assert.deepEqual(done.policy,pending.policy);
  const decisions=await db.changeApprovalDecision.findMany({where:{requestId:pending.id},orderBy:{position:'asc'}});assert.equal(decisions[1].employeeId,s.people.lead.id);assert.equal(decisions[1].actingEmployeeId,s.people.junior.id);assert.equal(decisions[1].delegation.reason,'APPROVER_VACANCY');assert.equal(await db.bankLedgerEntry.count(),1);
  await db.employee.updateMany({where:{id:{in:[s.people.lead.id,s.people.senior.id]}},data:{status:'ACTIVE'}});
  const operator=await db.employee.create({data:{orgId:org,name:'Operator',status:'ACTIVE',orgRole:'OPERATOR',gradeId:s.people.admin.gradeId}});
  const expense=await db.$transaction(tx=>registerExpenseRequest(tx,org,operator.id,{partnerOrgId:s.vendor.id,automaticRequestDate:true,clientKey:randomUUID(),items:[{transactionCodeId:s.code.id,currency:'USD',quantity:'1',unitPrice:'2000',vatRate:'0',details:{evidenceFile:'fixture-evidence.pdf',reference:'EXP-VACANCY'}}],approvalSelection:{seniorEmployeeId:s.people.senior.id,leadEmployeeId:s.people.lead.id}}));
  await approveExpense(db,org,s.people.senior.id,expense.id,1,'APPROVED');await db.employee.update({where:{id:s.people.lead.id},data:{status:'SUSPENDED'}});
  assert.equal((await approvalState(db,org,expense.id,s.people.senior.id)).canApprove,true);
  const approved=await approveExpense(db,org,s.people.senior.id,expense.id,1,'APPROVED');assert.equal(approved.approved,true);
  const actual=await db.expenseApprovalDecision.findFirst({where:{requestId:expense.id,position:2}});assert.equal(actual.employeeId,s.people.lead.id);assert.equal(actual.actingEmployeeId,s.people.senior.id);
  const expenseReview=await approvalReviewDetail(db,org,s.people.senior.id,'EXPENSE_REQUEST',String(expense.id));assert.equal(expenseReview.approvalLine[1].person.id,s.people.senior.id);assert.equal(expenseReview.approvalLine[1].originalPerson.id,s.people.lead.id);
  const saved=await saveApprovalActionBatch(db,org,s.people.admin.id,[{menu:'EXPENSE',operation:'CREATE',settings:{...defaultApprovalSettings(),revision:0,kind:'EXPENSE',stageAuthorityVersion:1,drafterScope:{role:'ALL',gradeId:null},rules:[{id:'all',name:'All amounts',currency:'USD',min:'0',max:null,drafterRole:'ALL',drafterGradeId:null,stages:[{role:'ACCOUNTANT',gradeId:null,gradeMatch:'ANY'},{role:'ACCOUNTANT',gradeId:s.people.lead.gradeId,gradeMatch:'MINIMUM'}]}]}}]);
  assert.equal(saved[0].settings.stageAuthorityVersion,1);assert.equal(saved[0].settings.rules[0].stages[0].gradeMatch,'ANY');
  const fresh=await db.$transaction(tx=>registerExpenseRequest(tx,org,operator.id,{partnerOrgId:s.vendor.id,automaticRequestDate:true,clientKey:randomUUID(),items:[{transactionCodeId:s.code.id,currency:'USD',quantity:'1',unitPrice:'10',vatRate:'0',details:{evidenceFile:'fixture-evidence.pdf',reference:'EXP-NEW-VACANCY'}}]}));
  const freshState=await approvalState(db,org,fresh.id,s.people.senior.id);assert.equal(freshState.steps.length,1);assert.equal(freshState.steps[0].employeeId,s.people.senior.id);assert.equal(freshState.canApprove,true);
 }finally{await f.close();}
});
