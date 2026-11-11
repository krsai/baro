import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url),{saveInvoiceDraft}=require('../backend/dist/services/invoiceDraftStore'),{issueInvoiceDraft,cancelIssuedInvoice,recordInvoicePayment}=require('../backend/dist/services/invoiceIssueStore'),{previewChangeApproval,requestChangeApproval,decideChangeApproval}=require('../backend/dist/services/changeApprovals');
test('invoice cancellation requires staged approval, real invoice FK, current financial state and preserves issued history',async()=>{
 const f=await changeApprovalFixture({registration:true});try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,actor=s.people.junior.id;
  const make=async()=>{const draft=await saveInvoiceDraft(db,org,'actor',{clientKey:randomUUID(),documentKind:'GENERAL',buyerOrgId:s.vendor.id,orders:[],currency:'USD',fields:{date:'2026-11-11',seller:{name:'Seller'},buyer:{name:'Buyer'}},lines:[{key:randomUUID(),transactionCodeId:s.code.id,description:'Service',unit:'pcs',quantity:'1',unitPrice:'100',vatRate:'0'}]});return issueInvoiceDraft(db,org,'actor',draft.id,draft.revision);};
  const invoice=await make(),input={menu:'INVOICE',operation:'DELETE',sourceKind:'invoice',sourceId:invoice.id,reason:'Wrong invoice',clientKey:randomUUID()};
  await assert.rejects(cancelIssuedInvoice(db,org,'actor',invoice.id,'Direct cancellation'),/CHANGE_APPROVAL_REQUIRED/);
  const routes=new Map();let allowed=false;require('../backend/dist/services/changeApprovals').registerChangeApprovalRoutes({post:(path,fn)=>routes.set(path,fn),get:()=>{}},db,{requireOrgRole:async()=>({organization:s.company,employee:s.people.junior}),actorId:()=>actor,canAccess:async()=>allowed});
  await assert.rejects(routes.get('/change-approval-preview')({body:input},{}),/INVOICE_ACCESS_DENIED/);allowed=true;let response;await routes.get('/change-approval-preview')({body:input},{json:v=>{response=v;}});assert.ok(response.stages.length);
  const p=await previewChangeApproval(db,org,actor,input);const selection=Object.fromEntries(p.preview.stages.map(stage=>[stage.key+'EmployeeId',stage.candidates[0]?.id]));
  const request=await requestChangeApproval(db,org,actor,{...input,selection});assert.equal(request.status,'PENDING');assert.equal(request.invoiceId,invoice.id);assert.equal((await db.invoice.findUnique({where:{id:invoice.id}})).status,'ISSUED');
  assert.equal((await requestChangeApproval(db,org,actor,{...input,selection})).id,request.id);
  await assert.rejects(requestChangeApproval(db,org,actor,{...input,selection,clientKey:randomUUID()}),/CHANGE_ALREADY_PENDING/);
  await assert.rejects(previewChangeApproval(db,s.other.id,actor,input),/ACTIVE_EMPLOYEE_REQUIRED/);
  await assert.rejects(previewChangeApproval(db,org,actor,{...input,sourceId:randomUUID()}),/INVOICE_NOT_FOUND/);
  await assert.rejects(decideChangeApproval(db,org,actor,request.id,{decision:'APPROVED'}),/CHANGE_APPROVER_REQUIRED/);
  for(const stage of request.policy.resolvedStages)await decideChangeApproval(db,org,stage.employeeId,request.id,{decision:'APPROVED'});
  const cancelled=await db.invoice.findUnique({where:{id:invoice.id}});assert.equal(cancelled.status,'CANCELLED');assert.equal(cancelled.cancellationReason,input.reason);assert.deepEqual(cancelled.snapshot,invoice.snapshot);assert.equal(String(cancelled.total),'100');assert.equal(await db.invoiceGeneralLine.count({where:{invoiceId:invoice.id}}),1);
  const review=await require('../backend/dist/services/approvalReview').approvalReviewDetail(db,org,actor,'CHANGE_APPROVAL',request.id);assert.equal(review.before.invoice.id,invoice.id);assert.deepEqual(review.before.invoice.snapshot,invoice.snapshot);
  const last=request.policy.resolvedStages.at(-1).employeeId;assert.equal((await decideChangeApproval(db,org,last,request.id,{decision:'APPROVED'})).status,'APPROVED');
  const paid=await make(),paidInput={...input,sourceId:paid.id,clientKey:randomUUID(),selection};const pending=await requestChangeApproval(db,org,actor,paidInput);
  await recordInvoicePayment(db,org,'actor',paid.id,{clientKey:randomUUID(),amount:'10',receivedAt:'2026-11-11'});
  await assert.rejects(decideChangeApproval(db,org,pending.policy.resolvedStages[0].employeeId,pending.id,{decision:'APPROVED'}),/INVOICE_ACTIVE_PAYMENT|CHANGE_SOURCE_CHANGED/);
  await assert.rejects(previewChangeApproval(db,org,actor,paidInput),/INVOICE_ACTIVE_PAYMENT/);assert.equal((await db.invoice.findUnique({where:{id:paid.id}})).status,'ISSUED');
  const rejected=await make(),rejection=await requestChangeApproval(db,org,actor,{...input,sourceId:rejected.id,selection,clientKey:randomUUID()});await decideChangeApproval(db,org,rejection.policy.resolvedStages[0].employeeId,rejection.id,{decision:'REJECTED',reason:'Keep original'});assert.equal((await db.invoice.findUnique({where:{id:rejected.id}})).status,'ISSUED');
  await f.pg.exec(readFileSync('backend/prisma/migrations/20261111030000_invoice_cancellation_approval/migration.sql','utf8'));
 }finally{await f.close();}
});
