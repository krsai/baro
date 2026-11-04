import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {registerExpenseRequest}=require('../backend/dist/services/expenseRequest');
const {requestExpenseDeletion,decideExpenseDeletion,listExpenseDeletions}=require('../backend/dist/services/expenseDeletion');
const {postLedgerEntry}=require('../backend/dist/services/bankLedger');
const {requestChangeApproval,decideChangeApproval,listChangeApprovals}=require('../backend/dist/services/changeApprovals');
test('configured highest active company administrator can approve own legacy deletion; lower administrators and live payments stay blocked',async()=>{
 const f=await changeApprovalFixture(),db=f.db;try{
  const s=await seedChangeApproval(db),orgId=s.company.id,admin=s.people.admin.id;
  const create=actor=>db.$transaction(tx=>registerExpenseRequest(tx,orgId,actor,{partnerOrgId:s.vendor.id,requestDate:'2026-04-02',clientKey:randomUUID(),items:[{transactionCodeId:s.code.id,currency:'USD',quantity:'1',unitPrice:'100',vatRate:'0',details:{reference:'TOP-TEST'}}]}),{timeout:30000});
  const request=(actor,doc)=>requestExpenseDeletion(db,orgId,actor,doc.id,{version:doc.version,clientKey:randomUUID(),reason:'Duplicate'});
  const own=await create(admin),pending=await request(admin,own);
  const listed=await listExpenseDeletions(db,orgId,admin);assert.equal(listed.find(row=>row.id===pending.id).canDecide,true);assert.ok(listed.find(row=>row.id===pending.id).eligibleApprovers.some(person=>person.id===admin));
  await assert.rejects(decideExpenseDeletion(db,s.other.id,admin,pending.id,{decision:'APPROVED'}),/EXPENSE_SOURCE_NOT_FOUND/);
  await decideExpenseDeletion(db,orgId,admin,pending.id,{decision:'APPROVED'});
  const deleted=await db.expenseRequest.findUnique({where:{id:own.id},include:{items:true,audits:{orderBy:{version:'desc'}}}});
  assert.ok(deleted.deletedAt);assert.equal(deleted.items[0].id,own.items[0].id);assert.equal(deleted.items[0].amount.toString(),'100');assert.equal(deleted.audits[0].afterSnapshot.deletion.highestAuthority,true);
  const lower=await db.employee.create({data:{orgId,name:'Lower admin',status:'ACTIVE',orgRole:'ADMIN',gradeId:s.people.lead.gradeId}});
  const lowDoc=await create(lower.id),lowRequest=await request(lower.id,lowDoc);
  await assert.rejects(decideExpenseDeletion(db,orgId,lower.id,lowRequest.id,{decision:'APPROVED'}),/EXPENSE_DELETE_APPROVER_REQUIRED/);
  await db.employee.update({where:{id:admin},data:{status:'SUSPENDED'}});
  await assert.rejects(decideExpenseDeletion(db,orgId,lower.id,lowRequest.id,{decision:'APPROVED'}),/EXPENSE_DELETE_APPROVER_REQUIRED/);
  await db.employee.update({where:{id:admin},data:{status:'ACTIVE'}});
  const paid=await create(admin),paidRequest=await request(admin,paid);
  await postLedgerEntry(db,orgId,'admin@example.test',s.account.id,{clientKey:randomUUID(),transactionDate:'2026-04-02',direction:'OUT',amount:'100',purpose:'Payment',accountingCodeId:s.code.id,evidenceType:'EXPENSE',expenseRequestId:paid.id,expenseVersion:paid.version,expenseItems:[{itemId:paid.items[0].id,amount:'100'}]});
  await assert.rejects(decideExpenseDeletion(db,orgId,admin,paidRequest.id,{decision:'APPROVED'}),/EXPENSE_ALREADY_RECONCILED/);
  assert.equal((await db.expenseRequest.findUnique({where:{id:paid.id}})).deletedAt,null);
  const next=await create(admin),change=await requestChangeApproval(db,orgId,admin,{menu:'EXPENSE',operation:'DELETE',sourceKind:'request',sourceId:String(next.id),version:next.version,payload:{},reason:'Duplicate',clientKey:randomUUID()});
  assert.equal(change.policy.highestSelfDeletion,true);assert.equal(change.policy.resolvedStages[0].employeeId,admin);assert.equal((await listChangeApprovals(db,orgId,admin)).find(row=>row.id===change.id).canDecide,true);
  const unflagged={...change.policy};delete unflagged.highestSelfDeletion;
  await assert.rejects(db.changeApprovalRequest.create({data:{...change,id:randomUUID(),clientKey:randomUUID(),policy:unflagged}}),/CHANGE_INVALID_REQUEST/);
  await decideChangeApproval(db,orgId,admin,change.id,{decision:'APPROVED'});assert.ok((await db.expenseRequest.findUnique({where:{id:next.id}})).deletedAt);
 }finally{await f.close();}
});
