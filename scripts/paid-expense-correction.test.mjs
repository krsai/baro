import test from 'node:test';
import {expenseCodeCorrectionInput} from '../frontend/src/utils/ledgerExpenseCodeCorrection.mjs';
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
  const editor=await db.employee.create({data:{orgId:org,name:'Editor',email:'editor@test',orgRole:'ADMIN',gradeId:s.people.lead.gradeId,status:'ACTIVE'}});
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

test('highest admin code correction follows allocated expense FKs for every partial payment and rolls back automatic failures',async()=>{
 const f=await changeApprovalFixture({registration:true}),db=f.db;
 try{
  const s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin;
  const {saveApprovalActionBatch}=require('../backend/dist/services/approvalActions');
  await saveApprovalActionBatch(db,org,actor.id,[{menu:'BANK_LEDGER',operation:'CREATE',settings:{revision:0,drafterScope:{role:'ALL',gradeId:null},registrationStages:[{role:'ADMIN',gradeMatch:'ANY',gradeId:null}]}}]);
  const names={nameKo:'Correction',nameEn:'Correction',nameVi:'Correction'};
  const base=await db.transactionCodeBase.findUnique({where:{id:s.code.baseId}});
  const codes=[];
  for(const prefix of ['OLD','NEW']){
   const next=await db.transactionCodeBase.create({data:{code:prefix,...names,entryMode:'GENERAL',serviceTypeId:base.serviceTypeId,expenseTypeId:base.expenseTypeId}});
   const variant=await db.settingTransactionCodeDefault.create({data:{code:prefix+'E',...names,serviceTypeId:base.serviceTypeId,baseId:next.id,taxTreatmentId:s.code.taxTreatmentId}});
   codes.push(await db.transactionCode.create({data:{code:prefix+'E',...names,ownerOrgId:org,serviceTypeId:s.code.serviceTypeId,baseId:next.id,taxTreatmentId:s.code.taxTreatmentId,systemDefaultId:variant.id}}));
  }
  const doc=await db.$transaction(tx=>registerExpenseRequest(tx,org,actor.id,{partnerOrgId:s.vendor.id,automaticRequestDate:true,clientKey:randomUUID(),items:[{transactionCodeId:s.code.id,currency:'USD',quantity:'1',unitPrice:'100',vatRate:'0',details:{reference:'REF',evidenceFile:'receipt.pdf'}}]}));
  const originals=[];
  for(const amount of ['40','60']){
   const bank={schemaVersion:2,accountingCodeVersion:1,clientKey:randomUUID(),rows:[{entryKind:'BANK',clientKey:randomUUID(),accountId:s.account.id,transactionDate:'2026-11-16',direction:'OUT',amount,purpose:'Partial payment',accountingCodeId:codes[0].id,evidenceType:'EXPENSE',expenseRequestId:doc.id,expenseVersion:doc.version,expenseItems:[{itemId:doc.items[0].id,amount}],counterparty:{kind:'PARTNER',id:s.vendor.id}}]};
   const registered=await requestChangeApproval(db,org,actor.id,{menu:'BANK_LEDGER',operation:'CREATE',sourceKind:'batch',sourceId:bank.clientKey,payload:bank,clientKey:randomUUID()});
   assert.equal(registered.status,'APPROVED');originals.push(await db.bankLedgerEntry.findUnique({where:{orgId_clientKey:{orgId:org,clientKey:bank.rows[0].clientKey}}}));
  }
  const source=await loadExpenseEditorSource(db,org,'request',String(doc.id));
  const payload={...expenseEditorForm(source),clientKey:randomUUID(),items:expenseEditorForm(source).items.map(i=>({...i,transactionCodeId:codes[1].id}))};
  const {ledgerEntryRevision}=require('../backend/dist/services/bankLedgerEdit');
  const input={...expenseCodeCorrectionInput(expenseEditorForm(source),doc.items[0].id,codes[1].id,randomUUID(),{entryId:originals[0].id,revision:ledgerEntryRevision(originals[0])}),reason:'Correct accounting code on linked documents',clientKey:randomUUID()};
  await assert.rejects(requestChangeApproval(db,org,actor.id,{...input,clientKey:randomUUID(),payload:{...input.payload,ledgerCodeOrigin:{...input.payload.ledgerCodeOrigin,revision:'stale'}}}),/CHANGE_SOURCE_CHANGED/);
  await assert.rejects(requestChangeApproval(db,org,actor.id,{...input,clientKey:randomUUID(),payload:{...input.payload,ledgerCodeOrigin:{...input.payload.ledgerCodeOrigin,itemId:'other-item'}}}),/CHANGE_SOURCE_CHANGED/);
  await f.pg.exec(`CREATE FUNCTION reject_auto_replacement() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'AUTO_REPLACEMENT_FAILURE'; END $$; CREATE TRIGGER auto_replacement BEFORE INSERT ON "BankLedgerEntry" FOR EACH ROW EXECUTE FUNCTION reject_auto_replacement();`);
  await assert.rejects(requestChangeApproval(db,org,actor.id,input),/AUTO_REPLACEMENT_FAILURE/);
  assert.equal(await db.changeApprovalRequest.count({where:{clientKey:input.clientKey}}),0);
  assert.equal((await db.expenseRequest.findUnique({where:{id:doc.id}})).version,1);
  assert.equal(await db.bankLedgerEntry.count({where:{orgId:org,voidedAt:null}}),2);
  assert.equal((await db.$queryRawUnsafe('SELECT * FROM "PaidExpenseCorrection"')).length,0);
  await f.pg.exec('DROP TRIGGER auto_replacement ON "BankLedgerEntry"; DROP FUNCTION reject_auto_replacement();');
  const done=await requestChangeApproval(db,org,actor.id,input);
  assert.equal(done.status,'APPROVED');assert.equal(done.policy.autoApproved,true);
  assert.equal(done.result.entryReplacements.length,2);
  const after=await loadExpenseEditorSource(db,org,'request',String(doc.id));
  assert.equal(after.costs[0].id,doc.items[0].id);assert.equal(after.costs[0].transactionCodeId,codes[1].id);assert.equal(after.document.version,2);
  const active=await db.bankLedgerEntry.findMany({where:{orgId:org,voidedAt:null},include:{allocations:true}});
  assert.equal(active.length,2);
  for(const old of originals){
   const next=active.find(e=>e.revisesEntryId===old.id);assert.ok(next);
   assert.equal(next.accountingCodeId,codes[1].id);assert.equal(next.amount.toString(),old.amount.toString());assert.equal(next.accountId,old.accountId);assert.equal(next.transactionDate,old.transactionDate);
   assert.equal(next.allocations[0].expenseItemId,doc.items[0].id);assert.equal(next.allocations[0].requestVersion,2);
   const archived=await db.bankLedgerEntry.findUnique({where:{id:old.id}});assert.ok(archived.voidedAt);assert.equal(archived.accountingCodeId,codes[0].id);
  }
  assert.equal((await requestChangeApproval(db,org,actor.id,input)).id,done.id);
  assert.equal(await db.bankLedgerEntry.count({where:{orgId:org}}),4);
  assert.equal((await db.$queryRawUnsafe('SELECT * FROM "PaidExpenseCorrection"')).length,2);
  // A payment spanning two newly different codes has no unique representative.
  // Reject it atomically rather than silently copying the first item's code.
  const mixed=await db.$transaction(tx=>registerExpenseRequest(tx,org,actor.id,{partnerOrgId:s.vendor.id,automaticRequestDate:true,clientKey:randomUUID(),items:[1,2].map(()=>({transactionCodeId:s.code.id,currency:'USD',quantity:'1',unitPrice:'50',vatRate:'0',details:{reference:'MIX',evidenceFile:'receipt.pdf'}}))}));
  const mixedBank={schemaVersion:2,accountingCodeVersion:1,clientKey:randomUUID(),rows:[{entryKind:'BANK',clientKey:randomUUID(),accountId:s.account.id,transactionDate:'2026-11-16',direction:'OUT',amount:'100',accountingCodeId:s.code.id,evidenceType:'EXPENSE',expenseItems:mixed.items.map(i=>({itemId:i.id,amount:'50'})),counterparty:{kind:'PARTNER',id:s.vendor.id}}]};
  await requestChangeApproval(db,org,actor.id,{menu:'BANK_LEDGER',operation:'CREATE',sourceKind:'batch',sourceId:mixedBank.clientKey,payload:mixedBank,clientKey:randomUUID()});
  const mixedSource=await loadExpenseEditorSource(db,org,'request',String(mixed.id)),mixedForm=expenseEditorForm(mixedSource);
  await assert.rejects(requestChangeApproval(db,org,actor.id,{menu:'EXPENSE',operation:'UPDATE',sourceKind:'request',sourceId:String(mixed.id),reason:'Ambiguous codes',clientKey:randomUUID(),payload:{...mixedForm,clientKey:randomUUID(),items:mixedForm.items.map((i,index)=>({...i,transactionCodeId:codes[index].id}))}}),/PAID_EXPENSE_CORRECTION_COMPLEX/);
  assert.equal((await db.expenseRequest.findUnique({where:{id:mixed.id}})).version,1);
  assert.equal(await db.bankLedgerEntry.count({where:{orgId:org,voidedAt:null}}),3);
  assert.equal((await db.$queryRawUnsafe('SELECT * FROM "PaidExpenseCorrection"')).length,2);
 }finally{await f.close();}
});
