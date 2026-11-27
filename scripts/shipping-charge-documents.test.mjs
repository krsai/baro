import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {saveFreight}=require('../backend/dist/services/freightOperations');
const {saveShippingCharge,shippingCharges}=require('../backend/dist/services/shippingRequests');
const {shippingChargeSource}=require('../backend/dist/services/shippingChargeDocuments');
const {saveInvoiceDraft,deleteInvoiceDraft}=require('../backend/dist/services/invoiceDraftStore');
const {issueInvoiceDraft}=require('../backend/dist/services/invoiceIssueStore');
const {registerExpenseRequest}=require('../backend/dist/services/expenseRequest');

test('job charges link to native invoice/expense documents atomically, retry safely and preserve source/company scope',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin.id;
  const job=await saveFreight(db,org,actor,'jobs',{clientKey:randomUUID(),customerId:s.vendor.id,mode:'ROAD'});
  await db.$executeRawUnsafe('UPDATE "FreightJob" SET version=version+1,"receiptStatus"=\'ACCEPTED\' WHERE id=$1',job.id);
  const charge=async direction=>{const input={id:randomUUID(),direction,partyId:s.vendor.id,billId:null,description:'Freight Charge',currencyCode:'USD',quantity:'2',unitPrice:'10',amount:'20'};await saveShippingCharge(db,org,actor,job.id,input);return input;};
  const ar=await charge('SALES'),ap=await charge('PURCHASE');
  const source=await shippingChargeSource(db,org,actor,ar.id);assert.equal(source.jobId,job.id);assert.equal(source.partyId,s.vendor.id);assert.equal(source.invoiceDraftId,null);
  await assert.rejects(shippingChargeSource(db,s.other.id,actor,ar.id),/ACTIVE_EMPLOYEE_REQUIRED/);
  const body={clientKey:randomUUID(),documentKind:'GENERAL',shippingChargeId:ar.id,shippingChargeVersion:1,buyerOrgId:s.vendor.id,orders:[],basis:null,currency:'USD',fields:{number:'',date:'2026-11-27',seller:{name:'Seller'},buyer:{name:'Buyer'},shipTo:'',shipmentDate:'',dueDate:'',incoterm:'',paymentTerms:'',bank:'',notes:''},percentages:{},settlements:{},lines:[{key:randomUUID(),transactionCodeId:s.code.id,description:'Freight Charge',unit:'',quantity:'2',unitPrice:'10',vatRate:'0',remark:''}]};
  await assert.rejects(saveInvoiceDraft(db,org,'actor',{...body,shippingChargeVersion:2}),/SHIPPING_CHANGED/);assert.equal(await db.invoiceDraft.count(),0);
  await assert.rejects(saveInvoiceDraft(db,org,'actor',{...body,shippingChargeId:ap.id}),/SHIPPING_CHARGE_DOCUMENT_SCOPE/);assert.equal(await db.invoiceDraft.count(),0);
  const draft=await saveInvoiceDraft(db,org,'actor',body);assert.equal((await saveInvoiceDraft(db,org,'actor',body)).id,draft.id);
  assert.equal((await shippingChargeSource(db,org,actor,ar.id)).invoiceDraftId,draft.id);
  await assert.rejects(saveInvoiceDraft(db,org,'actor',{...body,clientKey:randomUUID()}),/SHIPPING_CHARGE_DOCUMENT_LINKED/);assert.equal(await db.invoiceDraft.count(),1);
  await assert.rejects(saveShippingCharge(db,org,actor,job.id,{...ar,version:1,description:'Changed'}),/SHIPPING_CHARGE_DOCUMENT_LINKED/);
  const invoice=await issueInvoiceDraft(db,org,'actor',draft.id,draft.revision);assert.equal((await shippingChargeSource(db,org,actor,ar.id)).invoiceId,invoice.id);
  const expenseBody={shippingChargeId:ap.id,shippingChargeVersion:1,partnerOrgId:s.vendor.id,automaticRequestDate:true,remark:'Freight Charge',clientKey:randomUUID(),items:[{transactionCodeId:s.code.id,currency:'USD',quantity:'2',unitPrice:'10',vatRate:'0',details:{reference:job.number,evidenceFile:'invoice.pdf'}}]};
  const expense=await db.$transaction(tx=>registerExpenseRequest(tx,org,actor,expenseBody));assert.equal((await db.$transaction(tx=>registerExpenseRequest(tx,org,actor,expenseBody))).id,expense.id);
  assert.equal((await shippingChargeSource(db,org,actor,ap.id)).expenseRequestId,expense.id);
  await assert.rejects(db.$transaction(tx=>registerExpenseRequest(tx,org,actor,{...expenseBody,clientKey:randomUUID()})),/SHIPPING_CHARGE_DOCUMENT_LINKED/);assert.equal(await db.expenseRequest.count(),1);
  const rows=(await shippingCharges(db,org,actor,job.id)).rows;assert.equal(rows.find(row=>row.id===ap.id).expenseRequestId,expense.id);
  assert.equal(await db.bankLedgerEntry.count(),0);
  const sql=readFileSync('backend/prisma/migrations/20261127040000_shipping_charge_financial_links/migration.sql','utf8');await f.pg.exec(sql);await f.pg.exec(sql);
  const ar2=await charge('SALES'),draft2=await saveInvoiceDraft(db,org,'actor',{...body,clientKey:randomUUID(),shippingChargeId:ar2.id});await deleteInvoiceDraft(db,org,draft2.id,draft2.revision);assert.equal((await shippingChargeSource(db,org,actor,ar2.id)).invoiceDraftId,null);
  await saveShippingCharge(db,org,actor,job.id,{...ar2,version:1,description:'Revised Charge'});
  const recreated=await saveInvoiceDraft(db,org,'actor',{...body,clientKey:randomUUID(),shippingChargeId:ar2.id,shippingChargeVersion:2});assert.equal((await shippingChargeSource(db,org,actor,ar2.id)).invoiceDraftId,recreated.id);
  await assert.rejects(db.$executeRawUnsafe('UPDATE "ShippingChargeFinancialLink" SET "orgId"=$1 WHERE "chargeId"=$2',s.other.id,ar.id),/SHIPPING_CHARGE_CHANGED|SHIPPING_CHARGE_LINK_IMMUTABLE/);
  await db.employee.update({where:{id:actor},data:{status:'SUSPENDED'}});await assert.rejects(shippingChargeSource(db,org,actor,ar.id),/ACTIVE_EMPLOYEE_REQUIRED/);
 }finally{await f.close();}
});
