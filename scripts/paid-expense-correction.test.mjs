import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {registerExpenseRequest}=require('../backend/dist/services/expenseRequest');
const {loadExpenseEditorSource,expenseEditorRevision,expenseEditorForm}=require('../backend/dist/services/expenseRequestEditor');
const {requestChangeApproval,decideChangeApproval}=require('../backend/dist/services/changeApprovals');
const {postLedgerEntry}=require('../backend/dist/services/bankLedger');
test('paid code/evidence edit replaces payment atomically, preserves money/history, rejects financial edits and retries once',async()=>{
 const f=await changeApprovalFixture({registration:true}),db=f.db;
 try{
  const s=await seedChangeApproval(db),org=s.company.id,author=s.people.admin.id;
  // Original approved admin expense; a second administrator submits the correction.
  const editor=await db.employee.create({data:{orgId:org,name:'Editor',email:'editor@test',orgRole:'ADMIN',gradeId:s.people.admin.gradeId,status:'ACTIVE'}});
  const approver=await db.employee.create({data:{orgId:org,name:'Approver',email:'approver@test',orgRole:'ADMIN',gradeId:s.people.admin.gradeId,status:'ACTIVE'}});
  const installment=randomUUID();
  const doc=await db.$transaction(tx=>registerExpenseRequest(tx,org,author,{partnerOrgId:s.vendor.id,requestDate:'2026-11-16',clientKey:randomUUID(),items:[{transactionCodeId:s.code.id,currency:'USD',quantity:'1',unitPrice:'100',vatRate:'0',details:{reference:'REF',evidenceFile:'old.pdf'},paymentSchedule:[{id:installment,label:'Advance',scheduledDate:'2026-11-16',currency:'USD',amount:'40'},{id:randomUUID(),label:'Balance',scheduledDate:'2026-11-20',currency:'USD',amount:'60'}]}]}));
  const source=await loadExpenseEditorSource(db,org,'request',String(doc.id));
  const names={nameKo:'Correction',nameEn:'Correction',nameVi:'Correction'};
  const base=await db.transactionCodeBase.findUnique({where:{id:s.code.baseId}});
  const correctedBase=await db.transactionCodeBase.create({data:{code:'FIX',...names,entryMode:'GENERAL',serviceTypeId:base.serviceTypeId,expenseTypeId:base.expenseTypeId}});
  const variant=await db.settingTransactionCodeDefault.create({data:{code:'FIXE',...names,serviceTypeId:base.serviceTypeId,baseId:correctedBase.id,taxTreatmentId:s.code.taxTreatmentId}});
  const correctedCode=await db.transactionCode.create({data:{code:'FIXE',...names,ownerOrgId:org,serviceTypeId:s.code.serviceTypeId,baseId:correctedBase.id,taxTreatmentId:s.code.taxTreatmentId,systemDefaultId:variant.id}});
  const payload={...expenseEditorForm(source),clientKey:randomUUID(),items:expenseEditorForm(source).items.map(i=>({...i,transactionCodeId:correctedCode.id,details:{...i.details,evidenceFile:'new.pdf'}}))};
  const change=await requestChangeApproval(db,org,editor.id,{menu:'EXPENSE',operation:'UPDATE',sourceKind:'request',sourceId:String(doc.id),reason:'Correct evidence',clientKey:randomUUID(),payload,selection:{changeAdminEmployeeId:approver.id}});
  // Existing pending edits must remain approvable when a payment arrives later.
  // Use the real approved registration flow for the payment.
  const {requestChangeApproval:request}=require('../backend/dist/services/changeApprovals');
  const bank={schemaVersion:2,accountingCodeVersion:1,clientKey:randomUUID(),rows:[{entryKind:'BANK',clientKey:randomUUID(),accountId:s.account.id,transactionDate:'2026-11-16',direction:'OUT',amount:'40',accountingCodeId:s.code.id,evidenceType:'EXPENSE',paymentScheduleId:installment,expenseItems:[{itemId:doc.items[0].id,amount:'40'}],counterparty:{kind:'PARTNER',id:s.vendor.id}}]};
  const registration=await request(db,org,author,{menu:'BANK_LEDGER',operation:'CREATE',sourceKind:'batch',sourceId:bank.clientKey,payload:bank,selection:{step1EmployeeId:s.people.junior.id,step2EmployeeId:s.people.lead.id},clientKey:randomUUID()});
  if(registration.status==='PENDING'){await decideChangeApproval(db,org,s.people.junior.id,registration.id,{decision:'APPROVED'});await decideChangeApproval(db,org,s.people.lead.id,registration.id,{decision:'APPROVED'});}
  const original=await db.bankLedgerEntry.findFirst({where:{orgId:org,voidedAt:null}});assert.ok(original);
  const paid=await loadExpenseEditorSource(db,org,'request',String(doc.id));assert.equal(paid.document.bankReconciled,true);assert.equal(expenseEditorRevision(paid),payload.revision);
  const done=await decideChangeApproval(db,org,approver.id,change.id,{decision:'APPROVED'});assert.equal(done.status,'APPROVED');
  const after=await loadExpenseEditorSource(db,org,'request',String(doc.id));assert.equal(after.document.version,2);assert.equal(after.costs[0].details.evidenceFile,'new.pdf');assert.equal(String(after.costs[0].amount),'100');
  const replacement=await db.bankLedgerEntry.findFirst({where:{orgId:org,voidedAt:null}});assert.equal(replacement.revisesEntryId,original.id);assert.equal(String(replacement.amount),'40');assert.equal(replacement.accountId,original.accountId);assert.equal(replacement.transactionDate,original.transactionDate);assert.equal(replacement.accountingCodeId,correctedCode.id);assert.equal(after.costs[0].transactionCodeId,correctedCode.id);assert.equal((await db.bankLedgerEntry.findUnique({where:{id:original.id}})).accountingCodeId,s.code.id);
  assert.equal((await db.bankLedgerEvidenceAllocation.findFirst({where:{entryId:replacement.id}})).paymentScheduleId,installment);
  assert.ok((await db.bankLedgerEntry.findUnique({where:{id:original.id}})).voidedAt);assert.equal((await db.$queryRawUnsafe('SELECT * FROM "PaidExpenseCorrection"')).length,1);
  assert.equal(replacement.createdBy,editor.email);assert.equal((await db.bankLedgerEntry.findUnique({where:{id:original.id}})).voidedBy,approver.email);
  await decideChangeApproval(db,org,approver.id,change.id,{decision:'APPROVED'});assert.equal(await db.bankLedgerEntry.count({where:{orgId:org}}),2);
  const next={...expenseEditorForm(after),clientKey:randomUUID(),items:expenseEditorForm(after).items.map(i=>({...i,unitPrice:'101'}))};
  await assert.rejects(requestChangeApproval(db,org,editor.id,{menu:'EXPENSE',operation:'UPDATE',sourceKind:'request',sourceId:String(doc.id),reason:'Change amount',clientKey:randomUUID(),payload:next}),/PAID_EXPENSE_CORRECTION_ONLY/);
  await assert.rejects(db.$executeRawUnsafe('DELETE FROM "PaidExpenseCorrection"'),/IMMUTABLE/);
  const retryPayload={...expenseEditorForm(after),clientKey:randomUUID(),items:expenseEditorForm(after).items.map(i=>({...i,details:{...i.details,evidenceFile:'third.pdf'}}))};
  const retry=await requestChangeApproval(db,org,editor.id,{menu:'EXPENSE',operation:'UPDATE',sourceKind:'request',sourceId:String(doc.id),reason:'Correct evidence again',clientKey:randomUUID(),payload:retryPayload,selection:{changeAdminEmployeeId:approver.id}});
  await f.pg.exec(`CREATE FUNCTION reject_test_replacement() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'FORCED_REPLACEMENT_FAILURE'; END $$; CREATE TRIGGER test_replacement BEFORE INSERT ON "BankLedgerEntry" FOR EACH ROW EXECUTE FUNCTION reject_test_replacement();`);
  await assert.rejects(decideChangeApproval(db,org,approver.id,retry.id,{decision:'APPROVED'}),/FORCED_REPLACEMENT_FAILURE/);
  assert.equal((await db.changeApprovalRequest.findUnique({where:{id:retry.id}})).status,'PENDING');assert.equal((await db.expenseRequest.findUnique({where:{id:doc.id}})).version,2);assert.equal((await db.bankLedgerEntry.findUnique({where:{id:replacement.id}})).voidedAt,null);assert.equal((await db.$queryRawUnsafe('SELECT * FROM "PaidExpenseCorrection"')).length,1);
  await f.pg.exec('DROP TRIGGER test_replacement ON "BankLedgerEntry"; DROP FUNCTION reject_test_replacement();');
  await decideChangeApproval(db,org,approver.id,retry.id,{decision:'APPROVED'});assert.equal((await db.expenseRequest.findUnique({where:{id:doc.id}})).version,3);
 }finally{await f.close();}
});
