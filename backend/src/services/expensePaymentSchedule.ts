import {Prisma} from '@prisma/client';
import {cashScheduleDate} from './cashSchedule';
import {createHttpError} from '../utils/http';

const invalid=():never=>{throw createHttpError(400,'INVALID_EXPENSE_PAYMENT_SCHEDULE');};
export function normalizeExpensePaymentSchedule(value:any){
 if(value==null)return [];
 if(!Array.isArray(value)||value.length>50||value.length===1)return invalid();
 const ids=new Set();
 return value.map((row:any,index:number)=>{
  if(!row||typeof row!=='object'||typeof row.id!=='string'||!/^[-\w]{8,64}$/.test(row.id)||ids.has(row.id))return invalid();
  ids.add(row.id);
  const label=typeof row.label==='string'?row.label.trim():'';
  if(!label||label.length>100||!['VND','USD','KRW'].includes(row.currency))return invalid();
  const date=cashScheduleDate(row.scheduledDate);if(!date)return invalid();
  if(typeof row.amount!=='string'||!new RegExp(`^\\d{1,16}${row.currency==='USD'?'(\\.\\d{1,2})?':''}$`).test(row.amount)||new Prisma.Decimal(row.amount).lte(0))return invalid();
  return {id:row.id,position:index+1,label,scheduledDate:date,currency:row.currency,amount:new Prisma.Decimal(row.amount).toFixed(row.currency==='USD'?2:0)};
 });
}
export function validateExpensePaymentScheduleTotals(rows:any[],items:any[]){
 if(!rows.length)return;
 for(const expenseItemId of new Set(rows.map(row=>row.expenseItemId))){
  const planned=rows.filter(row=>row.expenseItemId===expenseItemId),item=items.find(item=>item.id===expenseItemId);
  if(!item||planned.length<2||planned.some(row=>row.currency!==item.currency)||!planned.reduce((sum,row)=>sum.add(row.amount),new Prisma.Decimal(0)).eq(item.amount))throw createHttpError(400,'EXPENSE_PAYMENT_SCHEDULE_TOTAL_MISMATCH');
 }
}
export async function replaceExpensePaymentSchedule(tx:any,orgId:number,requestId:number,rows:any[]){
 const items=await tx.partnerTransactionCost.findMany({where:{orgId,expenseRequestId:requestId},select:{id:true,currency:true,amount:true}});
 validateExpensePaymentScheduleTotals(rows,items);
 // Expense edits already lock the request and reject valid bank evidence.
 // Historical/voided bank allocations still retain their original schedule FK.
 await tx.expensePaymentSchedule.updateMany({where:{orgId,requestId,active:true},data:{active:false}});
 for(const row of rows){
  const existing=await tx.expensePaymentSchedule.findUnique({where:{id:row.id}});
  if(existing&&(existing.orgId!==orgId||existing.requestId!==requestId||existing.expenseItemId!==row.expenseItemId))return invalid();
  const data={expenseItemId:row.expenseItemId,position:row.position,label:row.label,scheduledDate:row.scheduledDate,currency:row.currency,amount:row.amount,active:true};
  if(existing){
   const linked=await tx.bankLedgerEvidenceAllocation.findFirst({where:{orgId,paymentScheduleId:row.id}});
   if(linked&&(['label','scheduledDate','currency'].some(key=>String(existing[key])!==String((data as any)[key]))||!new Prisma.Decimal(existing.amount).eq(data.amount)))throw createHttpError(409,'EXPENSE_PAYMENT_SCHEDULE_REFERENCED');
   await tx.expensePaymentSchedule.update({where:{id:row.id},data});
  }else await tx.expensePaymentSchedule.create({data:{id:row.id,orgId,requestId,...data}});
 }
}

export async function expensePaymentScheduleStatus(db:any,orgId:number,requestId:number,excludedEntryId?:string){
 const rows=await db.expensePaymentSchedule.findMany({where:{orgId,requestId,active:true},orderBy:{position:'asc'}});
 const allocations=rows.length?await db.bankLedgerEvidenceAllocation.findMany({where:{orgId,paymentScheduleId:{in:rows.map((row:any)=>row.id)},entry:{voidedAt:null},...(excludedEntryId?{entryId:{not:excludedEntryId}}:{})},include:{entry:{select:{transactionDate:true}}}}):[];
 return rows.map((row:any)=>{
  const paid=allocations.filter((a:any)=>a.paymentScheduleId===row.id).reduce((sum:any,a:any)=>sum.add(a.amount),new Prisma.Decimal(0));
  return {...row,amount:String(row.amount),paid:paid.toString(),remaining:new Prisma.Decimal(row.amount).sub(paid).toString(),payments:allocations.filter((a:any)=>a.paymentScheduleId===row.id).map((a:any)=>({entryId:a.entryId,date:a.entry.transactionDate,amount:String(a.amount)}))};
 });
}
