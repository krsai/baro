import {createHttpError} from '../utils/http';
// Only reversed, unallocated AR document-balancing rows may be purged with an approved invoice deletion.
export async function assertInvoiceDeletable(db:any,orgId:number,id:string){
 const rows=await db.$queryRawUnsafe(`SELECT
  (EXISTS(SELECT 1 FROM "InvoicePayment" WHERE "invoiceId"=$1) OR
   EXISTS(SELECT 1 FROM "BankLedgerEvidenceAllocation" WHERE "invoiceId"=$1)) AS "paymentLinked",
  EXISTS(SELECT 1 FROM "InvoicePayment" WHERE "invoiceId"=$1) OR
  EXISTS(SELECT 1 FROM "BankLedgerEvidenceAllocation" WHERE "invoiceId"=$1) OR
  EXISTS(SELECT 1 FROM "InvoiceCredit" WHERE "invoiceId"=$1) OR
  NOT baro_invoice_opening_purgeable($1::text,$2::integer) OR
  EXISTS(SELECT 1 FROM "InvoiceFinalLockEvent" WHERE "invoiceId"=$1) OR
  EXISTS(SELECT 1 FROM "WorkOrder" WHERE "invoiceFinalLockInvoiceId"=$1) OR
  EXISTS(SELECT 1 FROM "InvoiceDraft" WHERE "revisionOfInvoiceId"=$1) OR
  EXISTS(SELECT 1 FROM "Invoice" WHERE "sellerOrgId"=$2 AND ("revisionOfInvoiceId"=$1 OR "rootInvoiceId"=$1 OR id=$1 AND ("revisionOfInvoiceId" IS NOT NULL OR "rootInvoiceId" IS NOT NULL))) AS linked`,id,orgId);
 if(rows[0]?.paymentLinked)throw createHttpError(409,'INVOICE_DELETE_PAYMENT_LINKED');
 if(rows[0]?.linked)throw createHttpError(409,'INVOICE_DELETE_LINKED_DATA');
}
