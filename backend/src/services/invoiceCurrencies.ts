import {Prisma} from '@prisma/client';
import {createHttpError} from '../utils/http';

export const invoiceCurrencyTotals=(invoice:any):any[]=>invoice.snapshot?.currencyTotals||[{currencyCode:invoice.currencyCode,subtotal:String(invoice.subtotal??invoice.total??0),vatAmount:String(invoice.snapshot?.vatAmount??0),total:String(invoice.total??invoice.receivableAdded??0),receivableAdded:String(invoice.receivableAdded??invoice.total??0)}];
export function invoiceCurrencyAmount(invoice:any,currencyCode:string){
 const total=invoiceCurrencyTotals(invoice).find(row=>row.currencyCode===currencyCode);
 if(!total)throw createHttpError(400,'INVOICE_CURRENCY_INVALID');
 return String(total.receivableAdded??total.total);
}
export async function mixedInvoiceRemaining(db:any,orgId:number,invoice:any,currencyCode:string,excludeEntryId?:string){
 const root=invoice.rootInvoiceId||invoice.id;
 const family=await db.invoice.findMany({where:{sellerOrgId:orgId,OR:[{id:root},{rootInvoiceId:root}]},select:{id:true,payments:{where:{voidedAt:null,currencyCode},select:{amount:true,kind:true}}}});
 const allocations=await db.bankLedgerEvidenceAllocation.findMany({where:{orgId,invoiceId:{in:family.map((row:any)=>row.id)},...(excludeEntryId?{entryId:{not:excludeEntryId}}:{}),entry:{voidedAt:null,account:{currencyCode}}},select:{amount:true}});
 const paid=family.flatMap((row:any)=>row.payments).reduce((sum:any,row:any)=>sum.add(new Prisma.Decimal(row.amount).mul(row.kind==='REFUND'?-1:1)),new Prisma.Decimal(0));
 return new Prisma.Decimal(invoiceCurrencyAmount(invoice,currencyCode)).sub(paid).sub(allocations.reduce((sum:any,row:any)=>sum.add(row.amount),new Prisma.Decimal(0))).toString();
}
export function totalGeneralInvoiceCurrencies(lines:any[]){
 const totals=new Map<string,any>();
 for(const line of lines){
  const total=totals.get(line.currencyCode)||{currencyCode:line.currencyCode,subtotal:new Prisma.Decimal(0),vatAmount:new Prisma.Decimal(0),total:new Prisma.Decimal(0)};
  total.subtotal=total.subtotal.add(line.subtotal);total.vatAmount=total.vatAmount.add(line.vatAmount);total.total=total.total.add(line.amount);totals.set(line.currencyCode,total);
 }
 return [...totals.values()].map(row=>({currencyCode:row.currencyCode,subtotal:row.subtotal.toString(),vatAmount:row.vatAmount.toString(),total:row.total.toString(),receivableAdded:row.total.toString()}));
}
