import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {cashScheduleDate}=require('../backend/dist/services/cashSchedule');
const {normalizeInvoiceDraftContent}=require('../backend/dist/services/invoiceDraftStore');
const {registerExpenseRequest}=require('../backend/dist/services/expenseRequest');
const {loadExpenseEditorSource,expenseEditorRevision,expenseEditorForm}=require('../backend/dist/services/expenseRequestEditor');
const {requestChangeApproval,decideChangeApproval}=require('../backend/dist/services/changeApprovals');

test('scheduled dates reject impossible days, timestamps and guessing',()=>{
 for(const value of [undefined,null,''])assert.equal(cashScheduleDate(value),null);
 for(const value of ['2026-11-30','2028-02-29','0001-01-01'])assert.equal(cashScheduleDate(value),value);
 for(const value of ['2026-02-29','2026-11-31','2026-13-01','0000-01-01','2026-1-01','2026-11-01T00:00:00Z',1,{}])assert.throws(()=>cashScheduleDate(value),/INVALID_CASH_SCHEDULE_DATE/);
 const body={buyerOrgId:8,orders:[{orderId:'o1',sourceUpdatedAt:'2026-11-01T00:00:00Z'}],basis:'MANUFACTURING_SERVICE_PRICE',currency:'USD',lines:[{key:'line',quantity:'1',remark:'',adjustmentReason:'',hsCode:'',origin:''}],fields:{seller:{},buyer:{},dueDate:'2026-11-10',expectedCollectionDate:'2026-11-20'},percentages:{}};
 const content=normalizeInvoiceDraftContent(body);
 assert.equal(content.fields.expectedCollectionDate,'2026-11-20');assert.equal(content.fields.dueDate,'2026-11-10');
 delete body.fields.expectedCollectionDate;assert.equal(normalizeInvoiceDraftContent(body).fields.expectedCollectionDate,undefined);
 body.fields.expectedCollectionDate='2026-02-30';assert.throws(()=>normalizeInvoiceDraftContent(body),/INVALID_CASH_SCHEDULE_DATE/);
});

test('expense schedule survives creation, approved changes and audit without changing payment or drafter',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,actor=s.people.junior.id;
  const item={transactionCodeId:s.code.id,currency:'USD',quantity:'1',unitPrice:'100',vatRate:'0',details:{reference:'SCHEDULE-1'}};
  const body={partnerOrgId:s.vendor.id,requestDate:'2026-04-02',scheduledPaymentDate:'2026-12-10',clientKey:randomUUID(),items:[item]};
  const document=await db.$transaction(tx=>registerExpenseRequest(tx,org,actor,body),{timeout:30000});
  assert.equal(document.scheduledPaymentDate,'2026-12-10');
  assert.equal((await db.$transaction(tx=>registerExpenseRequest(tx,org,actor,body),{timeout:30000})).id,document.id);
  await assert.rejects(db.$transaction(tx=>registerExpenseRequest(tx,org,actor,{...body,scheduledPaymentDate:'2026-12-11'}),{timeout:30000}));
  const source=await loadExpenseEditorSource(db,org,'request',String(document.id));
  assert.equal(expenseEditorForm(source).scheduledPaymentDate,'2026-12-10');
  const editor=await db.employee.create({data:{orgId:org,name:'Editor',orgRole:'ADMIN',gradeId:s.people.admin.gradeId,status:'ACTIVE'}});
  const payload={partnerOrgId:s.vendor.id,scheduledPaymentDate:'2026-12-20',revision:expenseEditorRevision(source),version:document.version,clientKey:randomUUID(),items:[{...item,itemId:document.items[0].id}]};
  const change=await requestChangeApproval(db,org,editor.id,{menu:'EXPENSE',operation:'UPDATE',sourceKind:'request',sourceId:String(document.id),payload,selection:{changeAdminEmployeeId:s.people.admin.id},clientKey:randomUUID()});
  assert.equal((await db.expenseRequest.findUnique({where:{id:document.id}})).scheduledPaymentDate,'2026-12-10');
  await decideChangeApproval(db,org,s.people.admin.id,change.id,{decision:'APPROVED'});
  const saved=await db.expenseRequest.findUnique({where:{id:document.id},include:{items:true}});
  assert.equal(saved.scheduledPaymentDate,'2026-12-20');assert.equal(saved.createdByEmployeeId,actor);assert.equal(saved.items[0].amount.toString(),'100');
  const audit=await db.expenseRequestAudit.findFirst({where:{requestId:saved.id,version:saved.version}});
  assert.equal(audit.beforeSnapshot.document.scheduledPaymentDate,'2026-12-10');assert.equal(audit.afterSnapshot.document.scheduledPaymentDate,'2026-12-20');
  assert.equal(await db.bankLedgerEntry.count(),0);
 }finally{await f.close();}
});
