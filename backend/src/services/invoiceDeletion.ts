import {createHttpError} from '../utils/http';
// Voided financial records are history and must never be cascaded away.
export async function assertInvoiceDeletable(db:any,orgId:number,id:string){
 const rows=await db.$queryRawUnsafe(`SELECT
  EXISTS(SELECT 1 FROM "InvoicePayment" WHERE "invoiceId"=$1) OR
  EXISTS(SELECT 1 FROM "BankLedgerEvidenceAllocation" WHERE "invoiceId"=$1) OR
  EXISTS(SELECT 1 FROM "InvoiceCredit" WHERE "invoiceId"=$1) OR
  EXISTS(SELECT 1 FROM "AccountingOpeningItem" WHERE "invoiceId"=$1) OR
  EXISTS(SELECT 1 FROM "InvoiceFinalLockEvent" WHERE "invoiceId"=$1) OR
  EXISTS(SELECT 1 FROM "WorkOrder" WHERE "invoiceFinalLockInvoiceId"=$1) OR
  EXISTS(SELECT 1 FROM "InvoiceDraft" WHERE "revisionOfInvoiceId"=$1) OR
  EXISTS(SELECT 1 FROM "Invoice" WHERE "sellerOrgId"=$2 AND ("revisionOfInvoiceId"=$1 OR "rootInvoiceId"=$1 OR id=$1 AND ("revisionOfInvoiceId" IS NOT NULL OR "rootInvoiceId" IS NOT NULL))) AS linked`,id,orgId);
 if(rows[0]?.linked)throw createHttpError(409,'INVOICE_DELETE_LINKED_DATA');
}
