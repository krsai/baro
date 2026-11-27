import {money4} from './invoiceSettlement';
import type {invoiceBillingCoverage} from './invoiceWorkflow';

// Only posted bank-ledger evidence settles an order. A memo, direct legacy receipt,
// opening-balance adjustment or a company/name match is not that evidence.
export async function loadOrderReceiptSettlement(db:any,orders:any[],coverage:Map<number,ReturnType<typeof invoiceBillingCoverage>>,viewerOrgId?:number){
 const eligible=orders.filter(order=>coverage.get(order.id)?.complete===true&&order.sellerOrgId&&(!viewerOrgId||order.sellerOrgId===viewerOrgId));
 const result=new Map<number,boolean>();
 if(!eligible.length)return result;
 const statements=await db.invoiceOrder.findMany({where:{workOrderId:{in:eligible.map(order=>order.id)},invoice:{status:'ISSUED',sellerOrgId:{in:[...new Set(eligible.map(order=>order.sellerOrgId))]}}},include:{invoice:{select:{id:true,status:true,sellerOrgId:true,buyerOrgId:true,currencyCode:true,receivableAdded:true,rootInvoiceId:true,orders:{select:{id:true,workOrderId:true,sourceOrderId:true}},credits:{where:{voidedAt:null},select:{amount:true}}}}}});
 const invoiceById=new Map<string,any>(),familiesByOrder=new Map<number,Set<string>>();
 const statementsByOrder=new Map<number,any[]>();
 for(const statement of statements){
  const rows=statementsByOrder.get(statement.workOrderId)||[];
  rows.push(statement);statementsByOrder.set(statement.workOrderId,rows);
 }
 for(const order of eligible){
  const families=new Set<string>();
  for(const statement of statementsByOrder.get(order.id)||[]){
   const invoice=statement.invoice;
   if(statement.workOrderId!==order.id||statement.sourceOrderId!==order.orderId||!invoice?.id||invoice.status!=='ISSUED'||invoice.sellerOrgId!==order.sellerOrgId||invoice.buyerOrgId!==order.buyerOrgId)continue;
   families.add(invoice.rootInvoiceId||invoice.id);invoiceById.set(invoice.id,invoice);
  }
  familiesByOrder.set(order.id,families);
 }
 const invoices=[...invoiceById.values()];if(!invoices.length)return result;
 const familyById=new Map<string,string>(invoices.map(invoice=>[invoice.id,invoice.rootInvoiceId||invoice.id]));
 const currentByFamily=new Map<string,any>(invoices.map(invoice=>[invoice.rootInvoiceId||invoice.id,invoice]));
 const revisionRoots=invoices.filter(invoice=>invoice.rootInvoiceId).map(invoice=>invoice.rootInvoiceId);
 if(revisionRoots.length){
  const ancestors=await db.invoice.findMany({where:{sellerOrgId:{in:[...new Set(invoices.map(invoice=>invoice.sellerOrgId))]},OR:[{id:{in:revisionRoots}},{rootInvoiceId:{in:revisionRoots}}]},select:{id:true,rootInvoiceId:true,sellerOrgId:true,buyerOrgId:true,currencyCode:true,orders:{select:{workOrderId:true,sourceOrderId:true}}}});
  for(const ancestor of ancestors){
   const key=ancestor.rootInvoiceId||ancestor.id,current=currentByFamily.get(key);
   if(!current||ancestor.sellerOrgId!==current.sellerOrgId||ancestor.buyerOrgId!==current.buyerOrgId||ancestor.currencyCode!==current.currencyCode)continue;
   // Earlier revision receipts must still be linked to the same actual order set.
   const signature=(rows:any[])=>JSON.stringify(rows.map(row=>[row.workOrderId,row.sourceOrderId]).sort());
   if(signature(ancestor.orders)!==signature(current.orders))continue;
   familyById.set(ancestor.id,key);
  }
 }
 const allocations=await db.bankLedgerEvidenceAllocation.findMany({where:{orgId:{in:[...new Set(invoices.map(invoice=>invoice.sellerOrgId))]},invoiceId:{in:[...familyById.keys()]},entry:{voidedAt:null}},select:{invoiceId:true,orgId:true,amount:true,entry:{select:{orgId:true,voidedAt:true,direction:true,account:{select:{orgId:true,currencyCode:true}}}}}});
 const received=new Map<string,bigint>();
 for(const allocation of allocations){
  const family=familyById.get(allocation.invoiceId),invoice=family&&currentByFamily.get(family),entry=allocation.entry;
  if(!invoice||allocation.orgId!==invoice.sellerOrgId||entry?.orgId!==invoice.sellerOrgId||entry.account?.orgId!==invoice.sellerOrgId||entry.voidedAt||entry.account.currencyCode!==invoice.currencyCode||!['IN','OUT'].includes(entry.direction))continue;
  received.set(family!, (received.get(family!)||0n)+(entry.direction==='OUT'?-1n:1n)*money4(allocation.amount));
 }
 for(const order of eligible){
  const families=familiesByOrder.get(order.id)||new Set<string>();
  let hasReceipt=false,settled=families.size>0;
  const balances=new Map<string,{debt:bigint;paid:bigint}>();
  for(const family of families){
   const invoice=currentByFamily.get(family),paid=received.get(family)||0n;
   const debt=money4(invoice.receivableAdded)-(invoice.credits||[]).reduce((sum:bigint,credit:any)=>sum+money4(credit.amount),0n);
   if(paid>0n)hasReceipt=true;
   // A partly paid multi-order invoice has no order-level allocation FK. Do not
   // divide it by quantities, amounts or names; wait for the whole document.
   if(invoice.orders.length>1){if(paid<(debt>0n?debt:0n))settled=false;}
   else{
    // Cumulative statements may collect an older unpaid balance together with
    // newly incurred debt. All these receipts have the same actual order FK.
    const balance=balances.get(invoice.currencyCode)||{debt:0n,paid:0n};
    balance.debt+=debt>0n?debt:0n;balance.paid+=paid;balances.set(invoice.currencyCode,balance);
   }
  }
  if([...balances.values()].some(balance=>balance.paid<balance.debt))settled=false;
  result.set(order.id,settled&&hasReceipt);
 }
 return result;
}
