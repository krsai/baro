import {Prisma} from '@prisma/client';
import {createHttpError} from '../utils/http';
import {documentOpeningAmount} from './accountingOpening';

// Compare selected outstanding gross amounts, or the selected instalment, before this payment.
// Never compare a partial payment with an unrelated currency or an unselected expense line.
export async function expensePaymentComparison(db:any,orgId:number,body:any,currency:string,excludeEntryId?:string){
 if(body.evidenceType!=='EXPENSE')return null;
 const rows=body.expenseItems;
 if(!Array.isArray(rows)||!rows.length)return null;
 if(rows.some((r:any)=>!r||typeof r.itemId!=='string'||!/^\d+(\.\d{1,4})?$/.test(String(r.amount))))throw createHttpError(400,'LEDGER_INVALID_EVIDENCE');
 const decimal=(v:any)=>new Prisma.Decimal(v);
 const previous=excludeEntryId?await db.bankLedgerEntry.findFirst({where:{id:excludeEntryId,orgId},select:{expenseComparison:true}}):null;
 const baseline=previous?.expenseComparison;
 const sameSource=baseline?.version===1&&(baseline.paymentScheduleId??null)===(body.paymentScheduleId||null)&&baseline.items?.length===rows.length&&rows.every((row:any)=>baseline.items.some((old:any)=>old.itemId===row.itemId));
 const details=[];
 for(const row of rows){
  const cost=await db.partnerTransactionCost.findFirst({where:{id:row.itemId,orgId}});
  if(!cost||cost.currency!==currency)throw createHttpError(400,'LEDGER_INVALID_EVIDENCE');
  if(rows.length===1&&Number(cost.vatRate)>0){const selected=await db.transactionCode.findFirst({where:{id:body.accountingCodeId,ownerOrgId:orgId},select:{taxTreatment:{select:{suffix:true}}}});if(selected?.taxTreatment?.suffix!=='V')throw createHttpError(400,'LEDGER_EXPENSE_VAT_MISMATCH');}
  if(cost.vatRate!=null&&row.vatRate!=null&&!decimal(cost.vatRate).eq(row.vatRate))throw createHttpError(400,'LEDGER_EXPENSE_VAT_MISMATCH');
  const schedule=body.paymentScheduleId?await db.expensePaymentSchedule.findFirst({where:{id:body.paymentScheduleId,orgId,expenseItemId:cost.id,active:true,currency}}):null;
  if(body.paymentScheduleId&&!schedule)throw createHttpError(400,'INVALID_EXPENSE_PAYMENT_SCHEDULE');
  const paid=await db.bankLedgerEvidenceAllocation.findMany({where:{orgId,...(schedule?{paymentScheduleId:schedule.id}:{expenseItemId:cost.id}),entry:{voidedAt:null},...(excludeEntryId?{entryId:{not:excludeEntryId}}:{})}});
  const opening=schedule?0n:await documentOpeningAmount(db,orgId,{expenseItemId:cost.id});
  const expected=sameSource?decimal(baseline.items.find((old:any)=>old.itemId===row.itemId).expected):decimal(schedule?.amount??cost.amount).sub(paid.reduce((sum:any,p:any)=>sum.add(p.amount),decimal(0))).sub(decimal(opening.toString()).div(10000));
  details.push({itemId:cost.id,requestId:cost.expenseRequestId,expected:expected.toString(),actual:decimal(row.amount).toString(),vatRate:cost.vatRate==null?null:String(cost.vatRate)});
 }
 const expected=details.reduce((sum:any,row:any)=>sum.add(row.expected),decimal(0)),actual=details.reduce((sum:any,row:any)=>sum.add(row.actual),decimal(0));
 const differs=details.some(row=>!decimal(row.expected).eq(row.actual));
 const reason=String(body.remark??'').trim();
 if(differs&&!reason)throw createHttpError(400,'LEDGER_EXPENSE_DIFFERENCE_REASON_REQUIRED');
 return {version:1,paymentScheduleId:body.paymentScheduleId||null,currency,expected:expected.toString(),actual:actual.toString(),difference:actual.sub(expected).toString(),differs,reason:differs?reason:'',items:details};
}
