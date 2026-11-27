import {cashScheduleDate} from './cashSchedule';
import {randomUUID} from 'node:crypto';
import {createHttpError} from '../utils/http';
import {retryEditTransaction,editRevision,assertEditRevision} from '../utils/editRevision';
import {normalizeInvoiceDraftContent} from './invoiceDraftStore';
import {assertInvoiceDeletable} from './invoiceDeletion';
import {calculateInvoiceIssueSnapshot} from './invoiceIssueStore';
import {calculateGeneralInvoice,validateGeneralInvoiceCodes,generalInvoiceSource} from './generalInvoice';
import {resolveInvoicePaymentAccount,invoiceBankLinks} from './invoicePaymentAccount';
import {orderInvoiceAccounting} from './invoiceAccounting';
import {buildInvoiceSource} from './invoiceSource';
import {invoiceSettlement,invoiceFamily} from './invoiceSettlement';

export const invoiceEditRevision=(row:any)=>editRevision([row.id,row.status,row.snapshot]);
const fail=(code:string):never=>{throw createHttpError(409,code);};
export async function invoiceReceivedTotals(db:any,orgId:number,id:string){
 return db.$queryRawUnsafe(`SELECT "currencyCode",sum(amount)::text AS amount FROM (
 SELECT p."currencyCode",CASE WHEN p.kind='REFUND' THEN -p.amount ELSE p.amount END AS amount
 FROM "InvoicePayment" p JOIN "Invoice" i ON i.id=p."invoiceId" WHERE i.id=$1 AND i."sellerOrgId"=$2 AND p."voidedAt" IS NULL
 UNION ALL SELECT account."currencyCode",a.amount FROM "BankLedgerEvidenceAllocation" a
 JOIN "BankLedgerEntry" e ON e.id=a."entryId" AND e."orgId"=a."orgId"
 JOIN "BankLedgerAccount" account ON account.id=e."accountId" AND account."orgId"=e."orgId"
 WHERE a."invoiceId"=$1 AND a."orgId"=$2 AND e."voidedAt" IS NULL
 ) receipts GROUP BY "currencyCode" ORDER BY "currencyCode"`,id,orgId);
}
export async function invoiceEditLock(db:any,row:any){
 try{await assertInvoiceDeletable(db,row.sellerOrgId,row.id);}catch(error:any){if(error.status===409)return error.message;throw error;}
 if(row.status!=='ISSUED')return 'INVOICE_EDIT_LOCKED';
 if(await db.changeApprovalRequest.findFirst({where:{orgId:row.sellerOrgId,sourceId:row.id,menu:'INVOICE',status:'PENDING'},select:{id:true}}))return 'CHANGE_ALREADY_PENDING';
 return null;
}

// Save the same document ID. Each successful edit keeps a complete immutable before/after receipt.
export async function updateIssuedInvoice(db:any,orgId:number,employeeId:number,actor:string,id:string,body:any){
 const content:any=normalizeInvoiceDraftContent(body),requestKey=String(body.clientKey||'');
 if(!/^[-\w]{16,100}$/.test(requestKey))fail('INVOICE_EDIT_INVALID');
 if(!cashScheduleDate(content.fields.date))fail('INVOICE_EDIT_INVALID');
 const requestHash=editRevision(body);
 return retryEditTransaction(db,async(tx:any)=>{
  const employee=await tx.employee.findFirst({where:{id:employeeId,orgId,status:'ACTIVE',orgRole:{in:['ADMIN','ACCOUNTANT','OPERATOR']}},select:{id:true}});
  if(!employee)fail('ACTIVE_EMPLOYEE_REQUIRED');
  await tx.$queryRawUnsafe('SELECT id FROM "Organization" WHERE id=$1 FOR UPDATE',orgId);
  await tx.$queryRawUnsafe('SELECT id FROM "Invoice" WHERE id=$1 AND "sellerOrgId"=$2 FOR UPDATE',id,orgId);
  const original=await tx.invoice.findFirst({where:{id,sellerOrgId:orgId},include:{orders:true,lines:true,generalLines:true}});
  if(!original)throw createHttpError(404,'INVOICE_NOT_FOUND');
  const receipts=await tx.$queryRawUnsafe('SELECT * FROM "InvoiceEditEvent" WHERE "orgId"=$1 AND "clientKey"=$2',orgId,requestKey);
  if(receipts.length){if(receipts[0].invoiceId!==id||receipts[0].requestHash!==requestHash)fail('INVOICE_EDIT_RETRY_MISMATCH');return {id,editRevision:invoiceEditRevision(original)};}
  const locked=await invoiceEditLock(tx,original);if(locked)fail(locked);
  assertEditRevision(body.editRevision,invoiceEditRevision(original));
  if(content.buyerOrgId!==original.buyerOrgId||(content.documentKind==='GENERAL')!==(original.documentKind==='GENERAL')||content.fields.number!==original.invoiceNumber)fail('INVOICE_EDIT_SCOPE_CHANGED');
  for(const party of ['seller','buyer'])if(body.fields?.[party]?.address===original.snapshot?.fields?.[party]?.address)content.fields[party].address=original.snapshot.fields[party].address;
  await resolveInvoicePaymentAccount(tx,orgId,content.fields);
  let calculated:any,accounting:any=null;
  if(original.documentKind==='GENERAL'){
   await generalInvoiceSource(tx,orgId,original.buyerOrgId);
   const codes=await validateGeneralInvoiceCodes(tx,orgId,content.lines);
   calculated=calculateGeneralInvoice(content,codes);
  }else{
   if(content.currency!==original.currencyCode||JSON.stringify(content.orders.map((r:any)=>r.orderId).sort())!==JSON.stringify(original.orders.map((r:any)=>r.sourceOrderId).sort()))fail('INVOICE_EDIT_SCOPE_CHANGED');
   const orders=await tx.workOrder.findMany({where:{sellerOrgId:orgId,buyerOrgId:original.buyerOrgId,orderId:{in:content.orders.map((r:any)=>r.orderId)}},include:{workOrderItems:{include:{style:true,color:true}},priorCompletions:{where:{canceledAt:null}},buyerOrg:true,sellerOrg:true}});
   if(orders.length!==content.orders.length)fail('INVOICE_SOURCE_CHANGED');
   for(const order of orders){await tx.$queryRawUnsafe('SELECT id FROM "WorkOrder" WHERE id=$1 FOR UPDATE',order.id);if(content.orders.find((r:any)=>r.orderId===order.orderId)?.sourceUpdatedAt!==order.updatedAt.toISOString())fail('INVOICE_SOURCE_CHANGED');}
   const styleIds=[...new Set(orders.flatMap((r:any)=>r.workOrderItems.map((i:any)=>i.styleId).filter(Boolean)))];
   const relationship=await tx.orgRelationship.findFirst({where:{manufacturerOrgId:orgId,brandOrgId:original.buyerOrgId},include:{salesBucketSetVersion:{include:{entries:true}},salesBucketOverrides:{include:{quantityBucketSetVersion:{include:{entries:true}}}},salesPriceLists:{where:{styleId:{in:styleIds}},include:{currency:true,prices:true}}}});
   const sources=orders.map((order:any)=>({...buildInvoiceSource(order,[],[],relationship),workOrderId:order.id})),contexts:any={};
   for(const source of sources){
    const previous=await tx.invoiceOrder.findMany({where:{sourceOrderId:source.orderId,invoice:{sellerOrgId:orgId,currencyCode:content.currency}},include:{invoice:{include:{credits:true,payments:{where:{voidedAt:null},include:{allocations:{where:{voidedAt:null},select:{invoiceOrderId:true,amount:true}}}},orders:{select:{id:true}}}}}});
    contexts[source.orderId]=invoiceSettlement(previous,invoiceFamily(original));
    if(previous.some((r:any)=>r.invoice.id!==id&&r.invoice.status==='ISSUED'&&r.invoice.sequenceNumber>original.sequenceNumber))fail('INVOICE_REVISION_REVERSE_ORDER_REQUIRED');
   }
   accounting=await orderInvoiceAccounting(tx,orgId,content);
   calculated=calculateInvoiceIssueSnapshot(content,sources,contexts);
   if(accounting)calculated.snapshot.accounting=accounting;
   calculated.orders.forEach((order:any)=>order.installmentNumber=original.orders.find((r:any)=>r.sourceOrderId===order.sourceOrderId).installmentNumber);
  }
  const eventId=randomUUID();
  await tx.$executeRawUnsafe('INSERT INTO "InvoiceEditEvent" (id,"orgId","invoiceId","sourceId","actorId","clientKey","requestHash","beforeSnapshot") VALUES ($1,$2,$3,$3,$4,$5,$6,$7::jsonb)',eventId,orgId,id,employeeId,requestKey,requestHash,JSON.stringify(original));
  await tx.$queryRawUnsafe("SELECT set_config('baro.invoice_edit_event',$1,true)",eventId);
  const updated=await tx.invoice.update({where:{id},data:{...invoiceBankLinks(content.fields),pricingBasis:calculated.pricingBasis,currencyCode:calculated.currencyCode,subtotal:calculated.subtotal,total:calculated.total,receivableAdded:calculated.receivableAdded,transactionCodeId:accounting?.transactionCodeId??null,snapshot:calculated.snapshot}});
  if(original.documentKind==='GENERAL'){
   await tx.invoiceGeneralLine.deleteMany({where:{invoiceId:id,sellerOrgId:orgId,lineKey:{notIn:calculated.lines.map((line:any)=>line.lineKey)}}});
   for(const line of calculated.lines){
    const prior=original.generalLines.find((row:any)=>row.lineKey===line.lineKey);
    if(prior)await tx.invoiceGeneralLine.update({where:{id:prior.id},data:line});
    else await tx.invoiceGeneralLine.create({data:{...line,sellerOrgId:orgId,invoiceId:id}});
   }
  }else{
   await tx.invoiceLine.deleteMany({where:{invoiceId:id,lineKey:{notIn:calculated.lines.map((r:any)=>r.lineKey)}}});
   for(const order of calculated.orders){
    const {adjustmentAmount,vatRate,vatAmount,supplyAmount,...data}=order;
    const existing=original.orders.find((r:any)=>r.sourceOrderId===order.sourceOrderId);
    await tx.invoiceOrder.update({where:{id:existing.id},data});
    for(const {orderId,...line} of calculated.lines.filter((r:any)=>r.orderId===order.sourceOrderId)){
     const prior=original.lines.find((r:any)=>r.lineKey===line.lineKey);
     if(prior)await tx.invoiceLine.update({where:{id:prior.id},data:line});
     else await tx.invoiceLine.create({data:{...line,invoiceId:id,invoiceOrderId:existing.id}});
    }
   }
  }
  const after=await tx.invoice.findUnique({where:{id},include:{orders:true,lines:true,generalLines:true}});
  await tx.$executeRawUnsafe('UPDATE "InvoiceEditEvent" SET "afterSnapshot"=$2::jsonb WHERE id=$1',eventId,JSON.stringify(after));
  return {id,editRevision:invoiceEditRevision(updated)};
 });
}
