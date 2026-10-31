import {createHttpError} from '../utils/http';
import {retryEditTransaction} from '../utils/editRevision';
import {postLedgerSettlementBatch,ledgerScale4,ledgerMoney} from './bankLedger';
import {legacyExpenseNumber} from './documentNumber';
const fail=(code:string,status=409):never=>{throw createHttpError(status,code);};
export async function readLedgerEdit(db:any,orgId:number,id:string){
 const entry=await db.bankLedgerEntry.findFirst({where:{id,orgId},include:{account:true,purposeCode:true,settlementLines:{include:{purposeCode:true}},allocations:{include:{invoice:{include:{buyer:{select:{name:true}}}},expenseItem:{include:{expenseRequest:{include:{partner:{select:{name:true}}}}}}}}}});
 if(!entry)return fail('LEDGER_ENTRY_NOT_FOUND',404);if(entry.voidedAt)return fail('LEDGER_ENTRY_CHANGED');
 const code=entry.account.currencyCode;
 const other=await db.bankLedgerEvidenceAllocation.findMany({where:{orgId,entryId:{not:id},entry:{voidedAt:null},OR:[{invoiceId:{in:entry.allocations.map((a:any)=>a.invoiceId).filter(Boolean)}},{expenseItemId:{in:entry.allocations.map((a:any)=>a.expenseItemId).filter(Boolean)}}]}});
 let document:any=null;
 if(entry.evidenceType==='INVOICE'){
  const invoice=entry.allocations[0]?.invoice;if(!invoice)return fail('LEDGER_INVALID_EVIDENCE');
  document={id:invoice.id,reference:invoice.invoiceNumber,payee:invoice.buyer?.name||'',amount:ledgerMoney(ledgerScale4(invoice.total),code),remaining:ledgerMoney(ledgerScale4(invoice.total)-other.filter((a:any)=>a.invoiceId===invoice.id).reduce((sum:bigint,a:any)=>sum+ledgerScale4(a.amount),0n),code)};
 }
 if(entry.evidenceType==='EXPENSE'){
  const requests=[...new Map(entry.allocations.filter((a:any)=>a.expenseItem?.expenseRequest).map((a:any)=>[a.expenseItem.expenseRequest.id,a.expenseItem.expenseRequest])).values()] as any[];
  const items=entry.allocations.map((a:any)=>({id:a.expenseItemId,line:a.expenseItem.expenseRequestLine,description:a.expenseItem.description,amount:ledgerMoney(ledgerScale4(a.expenseItem.amount),code),remaining:ledgerMoney(ledgerScale4(a.expenseItem.amount)-other.filter((b:any)=>b.expenseItemId===a.expenseItemId).reduce((sum:bigint,b:any)=>sum+ledgerScale4(b.amount),0n),code)}));
  document={...(requests.length===1?{id:requests[0].id,version:requests[0].version}:{}),reference:requests.length===1?requests[0].managementNumber||legacyExpenseNumber(requests[0].id):entry.evidenceNumber,payee:requests.map(r=>r.partner?.name||'').join(', '),items,amount:ledgerMoney(items.reduce((sum:bigint,item:any)=>sum+ledgerScale4(item.amount),0n),code),remaining:ledgerMoney(items.reduce((sum:bigint,item:any)=>sum+ledgerScale4(item.remaining),0n),code)};
 }
 return {...entry,bankFee:ledgerMoney(ledgerScale4(entry.bankFee||'0'),code),writeOffAmount:ledgerMoney(ledgerScale4(entry.writeOffAmount||'0'),code),amount:ledgerMoney(ledgerScale4(entry.amount),code),document,expenseItems:entry.allocations.filter((a:any)=>a.expenseItemId).map((a:any)=>({itemId:a.expenseItemId,amount:ledgerMoney(ledgerScale4(a.amount),code),label:a.expenseItem.description})),settlementLines:entry.settlementLines.map((line:any)=>({...line,amount:ledgerMoney(ledgerScale4(line.amount),code)}))};
}
export async function replaceLedgerEntry(db:any,orgId:number,actor:string,id:string,body:any){
 if(!Array.isArray(body.rows)||body.rows.filter((r:any)=>r.entryKind==='BANK').length!==1)return fail('LEDGER_INVALID_BATCH',400);
 return retryEditTransaction(db,async(tx:any)=>{
  await tx.$queryRawUnsafe('SELECT id FROM "Organization" WHERE id=$1 FOR UPDATE',orgId);
  await tx.$queryRawUnsafe('SELECT id FROM "BankLedgerEntry" WHERE id=$1 AND "orgId"=$2 FOR UPDATE',id,orgId);
  const old=await tx.bankLedgerEntry.findFirst({where:{id,orgId}});if(!old)return fail('LEDGER_ENTRY_NOT_FOUND',404);
  const receipt=await tx.bankLedgerBatch.findUnique({where:{orgId_clientKey:{orgId,clientKey:body.clientKey}}});
  if(old.voidedAt&&!receipt)return fail('LEDGER_ENTRY_CHANGED');
  if(!old.voidedAt)await tx.bankLedgerEntry.update({where:{id},data:{voidedAt:new Date(),voidedBy:actor,voidReason:'Corrected by replacement'}});
  return postLedgerSettlementBatch(db,orgId,actor,body,tx,id);
 },60000);
}
export async function deleteLedgerEntry(db:any,orgId:number,actor:string,id:string,input:any){
 const reason=typeof input==='string'?input.trim():'';if(!reason||reason.length>1000)return fail('LEDGER_INVALID_INPUT',400);
 return retryEditTransaction(db,async(tx:any)=>{
  await tx.$queryRawUnsafe('SELECT id FROM "BankLedgerEntry" WHERE id=$1 AND "orgId"=$2 FOR UPDATE',id,orgId);
  const row=await tx.bankLedgerEntry.findFirst({where:{id,orgId}});if(!row)return fail('LEDGER_ENTRY_NOT_FOUND',404);
  if(row.voidedAt)return row;
  return tx.bankLedgerEntry.update({where:{id},data:{voidedAt:new Date(),voidedBy:actor,voidReason:reason}});
 });
}
