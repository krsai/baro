import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
import {combineInvoiceSources} from '../frontend/src/utils/invoiceDraft.mjs';
const require=createRequire(import.meta.url);
const {saveInvoiceDraft}=require('../backend/dist/services/invoiceDraftStore');
const {issueInvoiceDraft,recordInvoicePayment}=require('../backend/dist/services/invoiceIssueStore');
const {invoiceReceivedTotals,updateIssuedInvoice,invoiceEditRevision,invoiceEditLock}=require('../backend/dist/services/invoiceEdit');
const {requestChangeApproval}=require('../backend/dist/services/changeApprovals');

test('detail save preserves identity, calculates totals, audits edits, rejects stale/cross-company writes and payment-linked edits',async()=>{
 const f=await changeApprovalFixture({registration:true});try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin.id;
  await f.pg.exec(readFileSync('backend/prisma/migrations/20261127040000_invoice_detail_edit/migration.sql','utf8'));
  const content={clientKey:randomUUID(),documentKind:'GENERAL',buyerOrgId:s.vendor.id,orders:[],currency:'USD',fields:{date:'2026-11-27',seller:{name:'Seller'},buyer:{name:'Buyer'},notes:'Original'},lines:[{key:randomUUID(),transactionCodeId:s.code.id,description:'Service',unit:'pcs',quantity:'1',unitPrice:'100',vatRate:'0'}]};
  const draft=await saveInvoiceDraft(db,org,'actor',content),original=await issueInvoiceDraft(db,org,'actor',draft.id,draft.revision);
  const originalLine=await db.invoiceGeneralLine.findFirst({where:{invoiceId:original.id}});
  const input={...content,clientKey:randomUUID(),editRevision:invoiceEditRevision(original),fields:{...content.fields,number:original.invoiceNumber,notes:'Corrected'},lines:[{...content.lines[0],unitPrice:'120'}]};
  assert.equal(await invoiceEditLock(db,original),null);
  await assert.rejects(updateIssuedInvoice(db,s.other.id,actor,'actor',original.id,input),/ACTIVE_EMPLOYEE_REQUIRED/);
  await assert.rejects(updateIssuedInvoice(db,org,s.people.junior.id,'actor',original.id,{...input,editRevision:'stale'}),/STALE_EDIT/);
  await f.pg.exec(`CREATE FUNCTION test_edit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'TEST_EDIT_FAILURE'; END $$; CREATE TRIGGER test_edit_failure BEFORE UPDATE ON "InvoiceGeneralLine" FOR EACH ROW EXECUTE FUNCTION test_edit_failure();`);
  await assert.rejects(updateIssuedInvoice(db,org,actor,'actor',original.id,input),/TEST_EDIT_FAILURE/);
  assert.equal((await db.invoice.findUnique({where:{id:original.id}})).snapshot.fields.notes,'Original');
  assert.equal((await db.$queryRawUnsafe('SELECT count(*)::int AS count FROM "InvoiceEditEvent"'))[0].count,0);
  await f.pg.exec('DROP TRIGGER test_edit_failure ON "InvoiceGeneralLine"; DROP FUNCTION test_edit_failure();');
  const saved=await updateIssuedInvoice(db,org,actor,'actor',original.id,input),row=await db.invoice.findUnique({where:{id:original.id}});
  assert.equal(saved.id,original.id);assert.equal(row.invoiceNumber,original.invoiceNumber);assert.equal(row.status,'ISSUED');assert.equal(String(row.total),'120');assert.equal(row.snapshot.fields.notes,'Corrected');assert.equal(await db.invoice.count(),1);assert.equal((await db.invoiceGeneralLine.findFirst({where:{invoiceId:original.id}})).id,originalLine.id);
  assert.deepEqual(await updateIssuedInvoice(db,org,actor,'actor',original.id,input),saved);
  const receipts=await db.$queryRawUnsafe('SELECT * FROM "InvoiceEditEvent"');assert.equal(receipts.length,1);assert.equal(receipts[0].beforeSnapshot.snapshot.fields.notes,'Original');assert.equal(receipts[0].afterSnapshot.snapshot.fields.notes,'Corrected');
  await assert.rejects(db.$executeRawUnsafe('DELETE FROM "InvoiceEditEvent"'),/INVOICE_EDIT_HISTORY_IMMUTABLE/);
  await assert.rejects(updateIssuedInvoice(db,org,actor,'actor',original.id,{...input,clientKey:randomUUID()}),/STALE_EDIT/);
  // A receipt saved after the form was opened blocks editing even with its latest revision.
  await recordInvoicePayment(db,org,'actor',original.id,{clientKey:randomUUID(),amount:'10',receivedAt:'2026-11-27'});
  assert.equal(Number((await invoiceReceivedTotals(db,org,original.id))[0].amount),10);
  assert.deepEqual(await invoiceReceivedTotals(db,s.other.id,original.id),[]);
  await assert.rejects(updateIssuedInvoice(db,org,actor,'actor',original.id,{...input,clientKey:randomUUID(),editRevision:saved.editRevision}),/INVOICE_DELETE_PAYMENT_LINKED/);
  assert.equal((await db.invoice.findUnique({where:{id:original.id}})).snapshot.fields.notes,'Corrected');
  // Unlinked edited invoices can still follow the existing approved deletion flow; edit history remains.
  const d2=await saveInvoiceDraft(db,org,'actor',{...content,clientKey:randomUUID()}),i2=await issueInvoiceDraft(db,org,'actor',d2.id,d2.revision);
  await updateIssuedInvoice(db,org,actor,'actor',i2.id,{...input,clientKey:randomUUID(),editRevision:invoiceEditRevision(i2),fields:{...input.fields,number:i2.invoiceNumber}});
  await requestChangeApproval(db,org,actor,{menu:'INVOICE',operation:'DELETE',sourceKind:'invoice',sourceId:i2.id,clientKey:randomUUID(),reason:'Incorrect invoice'});
  assert.equal(await db.invoice.findUnique({where:{id:i2.id}}),null);
  const retained=await db.$queryRawUnsafe('SELECT * FROM "InvoiceEditEvent" WHERE "sourceId"=$1',i2.id);assert.equal(retained.length,1);assert.equal(retained[0].invoiceId,null);
  // Order invoices use the same save operation and keep their actual item/order FKs.
  await db.transactionCodeBase.update({where:{id:s.code.baseId},data:{code:'CMT'}});
  const work=await db.workOrder.create({data:{orgId:org,orderId:randomUUID(),orderNumber:'EDIT-ORDER',sellerOrgId:org,buyerOrgId:s.vendor.id,workOrderItems:{create:{totalQuantity:10}}},include:{workOrderItems:true,buyerOrg:true,sellerOrg:true}});
  const source=require('../backend/dist/services/invoiceSource').buildInvoiceSource(work,[],[],null),combined=combineInvoiceSources([JSON.parse(JSON.stringify(source))]);
  const orderInput={clientKey:randomUUID(),buyerOrgId:s.vendor.id,basis:'MANUFACTURING_SERVICE_PRICE',currency:'USD',orders:combined.orders,lines:combined.lines.map(line=>({...line,quantity:'10',unitPriceOverride:'2'})),fields:{date:'2026-11-27',seller:{name:'Seller'},buyer:{name:'Buyer'}},percentages:{},settlements:{}};
  const od=await saveInvoiceDraft(db,org,'actor',orderInput),oi=await issueInvoiceDraft(db,org,'actor',od.id,od.revision),oldOrder=await db.invoiceOrder.findFirst({where:{invoiceId:oi.id}}),oldLine=await db.invoiceLine.findFirst({where:{invoiceId:oi.id}});
  await updateIssuedInvoice(db,org,actor,'actor',oi.id,{...orderInput,clientKey:randomUUID(),editRevision:invoiceEditRevision(oi),fields:{...orderInput.fields,number:oi.invoiceNumber},lines:orderInput.lines.map(line=>({...line,unitPriceOverride:'3'}))});
  assert.equal(String((await db.invoice.findUnique({where:{id:oi.id}})).total),'30');
  assert.equal((await db.invoiceOrder.findFirst({where:{invoiceId:oi.id}})).id,oldOrder.id);assert.equal((await db.invoiceLine.findFirst({where:{invoiceId:oi.id}})).id,oldLine.id);
 }finally{await f.close();}
});
