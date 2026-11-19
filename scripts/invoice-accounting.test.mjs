import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {orderInvoiceAccounting,invoiceEvidenceAccounting}=require('../backend/dist/services/invoiceAccounting');
const {requestChangeApproval,decideChangeApproval,previewChangeApproval}=require('../backend/dist/services/changeApprovals');
const {searchLedgerEvidence}=require('../backend/dist/services/bankLedger');
const {assertInvoiceDeletable}=require('../backend/dist/services/invoiceDeletion');
const {accountingCodeUsage}=require('../backend/dist/services/accountingCodeUsage');

test('CMT uses a company code FK and frozen VAT in partial receipts, waits for approval and blocks deletion with financial history',async()=>{
 const f=await changeApprovalFixture({registration:true});try{
 const db=f.db,s=await seedChangeApproval(db),org=s.company.id;
 await db.transactionCodeBase.update({where:{id:s.code.baseId},data:{code:'CMT',cashDirection:'IN'}});
 const accounting=await orderInvoiceAccounting(db,org,{basis:'MANUFACTURING_SERVICE_PRICE',fields:{}});
 assert.equal(accounting.transactionCodeId,s.code.id);assert.equal(accounting.code,'CMTE');
 await assert.rejects(orderInvoiceAccounting(db,s.other.id,{basis:'MANUFACTURING_SERVICE_PRICE',fields:{}}),/INVOICE_CMT_CODE_UNAVAILABLE/);
 const invoice=await db.invoice.create({data:{sellerOrgId:org,buyerOrgId:s.vendor.id,invoiceNumber:'CMT-TEST',clientKey:randomUUID(),sequenceNumber:1,pricingBasis:'MANUFACTURING_SERVICE_PRICE',transactionCodeId:accounting.transactionCodeId,currencyCode:'USD',subtotal:'100',total:'100',receivableAdded:'100',snapshot:{accounting,fields:{vatTreatment:'E',vatRate:'0'}},issuedBy:'test'}});
 const body={clientKey:randomUUID(),entryKind:'BANK',accountId:s.account.id,transactionDate:'2026-11-11',direction:'IN',amount:'40',evidenceType:'INVOICE',evidenceNumber:invoice.invoiceNumber,accountingCodeId:s.code.id,remark:''};
 const resolved=await invoiceEvidenceAccounting(db,org,{...body,accountingCodeId:999,vatRate:'99'},'USD');
 assert.equal(resolved.accountingCodeId,s.code.id);assert.equal(resolved.vatRate,'0');assert.equal(resolved.subtotal,'40');
 const batchKey=randomUUID(),request=await requestChangeApproval(db,org,s.people.admin.id,{menu:'BANK_LEDGER',operation:'CREATE',sourceKind:'batch',sourceId:batchKey,clientKey:randomUUID(),selection:{step1EmployeeId:s.people.junior.id,step2EmployeeId:s.people.lead.id},payload:{schemaVersion:2,accountingCodeVersion:1,clientKey:batchKey,rows:[body]}});
 assert.equal(await db.bankLedgerEntry.count(),0);
 for(const stage of request.policy.resolvedStages)await decideChangeApproval(db,org,stage.employeeId,request.id,{decision:'APPROVED'});
 const entry=await db.bankLedgerEntry.findFirstOrThrow({where:{clientKey:body.clientKey}});
 assert.equal(entry.accountingCodeId,s.code.id);assert.equal(String(entry.amount),'40');assert.equal(String(entry.subtotal),'40');assert.equal(String(entry.vatRate),'0');
 const allocation=await db.bankLedgerEvidenceAllocation.findFirstOrThrow({where:{entryId:entry.id}});assert.equal(allocation.invoiceId,invoice.id);assert.equal(String(allocation.amount),'40');
 const results=await searchLedgerEvidence(db,org,{type:'INVOICE',currencyCode:'USD',search:'CMT-TEST'});
 assert.equal(results.documents[0].remaining,'60.00');assert.equal(results.documents[0].accountingCodeId,s.code.id);assert.equal(results.documents[0].vatRate,'0');
 await assert.rejects(assertInvoiceDeletable(db,org,invoice.id),/INVOICE_DELETE_LINKED_DATA/);
 await assert.rejects(previewChangeApproval(db,org,s.people.admin.id,{menu:'INVOICE',operation:'DELETE',sourceKind:'invoice',sourceId:invoice.id}),/INVOICE_DELETE_LINKED_DATA/);
 const usage=await accountingCodeUsage(db,[s.code.baseId]);assert.equal(usage.get(s.code.baseId).invoice,1);
 // Even voided evidence keeps its real FK and prevents deletion.
 await f.pg.exec('ALTER TABLE "BankLedgerEntry" DISABLE TRIGGER ALL');
 await db.bankLedgerEntry.update({where:{id:entry.id},data:{voidedAt:new Date(),voidedBy:'test',voidReason:'Test history'}});
 await f.pg.exec('ALTER TABLE "BankLedgerEntry" ENABLE TRIGGER ALL');
 await assert.rejects(assertInvoiceDeletable(db,org,invoice.id),/INVOICE_DELETE_LINKED_DATA/);

 const names={nameKo:'CMT',nameEn:'CMT',nameVi:'CMT'};
 const base=await db.transactionCodeBase.findUniqueOrThrow({where:{id:s.code.baseId}});
 const tax=await db.taxTreatment.create({data:{id:100,code:'VAT',suffix:'V',...names}});
 const variant=await db.settingTransactionCodeDefault.create({data:{code:'CMTV',...names,serviceTypeId:base.serviceTypeId,baseId:base.id,taxTreatmentId:tax.id}});
 const taxableCode=await db.transactionCode.create({data:{ownerOrgId:org,serviceTypeId:s.code.serviceTypeId,code:'CMTV',...names,baseId:base.id,systemDefaultId:variant.id,taxTreatmentId:tax.id}});
 const taxable=await orderInvoiceAccounting(db,org,{basis:'MANUFACTURING_SERVICE_PRICE',fields:{vatTreatment:'V',vatRate:'10'}});
 assert.equal(taxable.code,'CMTV');assert.equal(taxable.transactionCodeId,taxableCode.id);
 const taxedInvoice=await db.invoice.create({data:{sellerOrgId:org,buyerOrgId:s.vendor.id,invoiceNumber:'CMT-VAT',clientKey:randomUUID(),sequenceNumber:2,pricingBasis:'MANUFACTURING_SERVICE_PRICE',transactionCodeId:taxableCode.id,currencyCode:'USD',subtotal:'100',total:'110',receivableAdded:'110',snapshot:{accounting:taxable,fields:{vatTreatment:'V',vatRate:'10'}},issuedBy:'test'}});
 const partial=await invoiceEvidenceAccounting(db,org,{evidenceType:'INVOICE',evidenceNumber:taxedInvoice.invoiceNumber,amount:'55',vatRate:'0'},'USD');
 assert.equal(partial.subtotal,'50');assert.equal(partial.vatAmount,'5');assert.equal(partial.vatRate,'10');
 const {ledgerTaxSnapshot}=require('../backend/dist/services/ledgerVat');assert.equal((await ledgerTaxSnapshot(db,org,partial.accountingCodeId,partial,'USD')).vatAmount,'5');
 const copied=await invoiceEvidenceAccounting(db,s.other.id,{evidenceType:'INVOICE',evidenceNumber:taxedInvoice.invoiceNumber,amount:'55'},'USD');assert.equal(copied.accountingCodeId,undefined);
 await db.transactionCode.update({where:{id:taxableCode.id},data:{isActive:false}});
 await assert.rejects(orderInvoiceAccounting(db,org,{basis:'MANUFACTURING_SERVICE_PRICE',fields:{vatTreatment:'V'}}),/INVOICE_CMT_CODE_UNAVAILABLE/);
 }finally{await f.close();}
});
