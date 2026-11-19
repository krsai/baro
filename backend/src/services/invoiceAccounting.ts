import {Prisma} from '@prisma/client';
import {ACCOUNTING_CODE_INCLUDE,resolveAccountingCode} from './accountingCode';
import {createHttpError} from '../utils/http';
export async function orderInvoiceAccounting(db:any,orgId:number,content:any){
 if(content.basis!=='MANUFACTURING_SERVICE_PRICE')return null;
 const suffix=content.fields?.vatTreatment||'E';
 if(!['E','Z','V'].includes(suffix))throw createHttpError(400,'INVOICE_DRAFT_INVALID');
 const row=resolveAccountingCode(await db.transactionCode.findFirst({where:{ownerOrgId:orgId,isActive:true,base:{code:'CMT',isActive:true},taxTreatment:{suffix}},include:ACCOUNTING_CODE_INCLUDE}));
 if(!row||!['IN','BOTH'].includes(row.cashDirection))throw createHttpError(409,'INVOICE_CMT_CODE_UNAVAILABLE');
 return {transactionCodeId:row.id,code:row.code,codeDescription:row.nameEn||row.nameKo,vatEnabled:row.vatEnabled};
}

// Resolve the live company-scoped FK again during preview and final ledger posting.
export async function invoiceEvidenceAccounting(db:any,orgId:number,body:any,currency:string){
 if(body.evidenceType!=='INVOICE'||!body.evidenceNumber)return body;
 const invoice=await db.invoice.findFirst({where:{sellerOrgId:orgId,invoiceNumber:body.evidenceNumber,status:'ISSUED',currencyCode:currency}});
 if(!invoice?.transactionCodeId)return body; // Never invent a code or VAT for historical invoices.
 const rate=String(invoice.snapshot?.fields?.vatRate??'0');
 if(!/^\d+(\.\d{1,2})?$/.test(rate)||Number(rate)>100)throw createHttpError(409,'LEDGER_INVOICE_NOT_FOUND');
 const result={...body,accountingCodeId:invoice.transactionCodeId};
 if(body.amount!=null&&/^\d+(\.\d{1,4})?$/.test(String(body.amount))){
  const gross=new Prisma.Decimal(body.amount),subtotal=gross.mul(100).div(new Prisma.Decimal(rate).add(100)).toDecimalPlaces(currency==='USD'?2:0,Prisma.Decimal.ROUND_HALF_UP);
  Object.assign(result,{subtotal:subtotal.toString(),vatRate:rate,vatAmount:subtotal.mul(rate).div(100).toDecimalPlaces(currency==='USD'?2:0,Prisma.Decimal.ROUND_HALF_UP).toString()});
 }
 return result;
}
