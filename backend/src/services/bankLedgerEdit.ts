import {payrollPayableRemaining} from './payrollPayables';
import {documentOpeningAmount,invoiceOpeningRemaining} from './accountingOpening';
import {expensePaymentScheduleStatus} from './expensePaymentSchedule';
import {entryCounterparty} from './ledgerCounterparty';
import {Prisma} from '@prisma/client';
import {createHash} from 'node:crypto';
export const ledgerEntryRevision=(row:any)=>createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.keys(Prisma.BankLedgerEntryScalarFieldEnum).filter(key=>!['internalTransferSourceId','internalTransferAmount'].includes(key)||row[key]!=null).map(key=>[key,row[key]??null])))).digest('hex');
import {createHttpError} from '../utils/http';
import {retryEditTransaction} from '../utils/editRevision';
import {postLedgerSettlementBatch,ledgerScale4,ledgerMoney} from './bankLedger';
import {legacyExpenseNumber} from './documentNumber';
const fail=(code:string,status=409):never=>{throw createHttpError(status,code);};
export async function voidLedgerPairApproved(tx:any,orgId:number,actor:string,row:any,reason:string){
 // The organization lock also serializes requests opened from opposite legs.
 await tx.$queryRawUnsafe('SELECT id FROM "Organization" WHERE id=$1 FOR UPDATE',orgId);
 const peer=row.internalTransferSourceId?await tx.bankLedgerEntry.findFirst({where:{id:row.internalTransferSourceId,orgId}}):await tx.bankLedgerEntry.findFirst({where:{internalTransferSourceId:row.id,orgId}});
 const voidedAt=new Date();
 for(const entry of [row,peer].filter(Boolean))if(!entry.voidedAt)await tx.bankLedgerEntry.update({where:{id:entry.id},data:{voidedAt,voidedBy:actor,voidReason:reason}});
 return {...row,voidedAt,voidedBy:actor,voidReason:reason};
}
export async function readLedgerEdit(db:any,orgId:number,id:string){
 const codeInclude={base:{include:{expenseType:true}}} satisfies Prisma.TransactionCodeInclude;
 const include={payrollAllocations:{include:{item:{include:{document:true,employee:{select:{name:true}}}}}},openingAllocations:{include:{openingItem:{include:{party:{select:{name:true}},employee:{select:{name:true}}}}}},account:true,accountingCode:{include:codeInclude},settlementLines:{include:{accountingCode:{include:codeInclude}}},allocations:true} satisfies Prisma.BankLedgerEntryInclude;
 const entry=await db.bankLedgerEntry.findFirst({where:{id,orgId},include});
 if(!entry)return fail('LEDGER_ENTRY_NOT_FOUND',404);if(entry.voidedAt)return fail('LEDGER_ENTRY_CHANGED');
 const authorSelect={id:true,name:true,orgRole:true,gradeId:true};
 // Replacement authors are the requesters linked to the superseded entry, not the final approver.
 const change=await db.changeApprovalRequest.findFirst({where:{orgId,menu:'BANK_LEDGER',operation:'UPDATE',status:'APPROVED',OR:[...(entry.revisesEntryId?[{ledgerEntryId:entry.revisesEntryId}]:[]),{result:{path:['entryIds'],array_contains:[entry.id]}}]},select:{requester:{select:authorSelect}}});
 const authors=change?[]:await db.employee.findMany({where:{orgId,email:{equals:entry.createdBy,mode:'insensitive'}},select:authorSelect,take:2});
 const drafter=change?.requester||(authors.length===1?authors[0]:null);
 const code=entry.account.currencyCode;
 const invoiceIds=[...new Set(entry.allocations.map((a:any)=>a.invoiceId).filter(Boolean))];
 const expenseIds=[...new Set(entry.allocations.map((a:any)=>a.expenseItemId).filter(Boolean))];
 const expenseInclude={transactionCode:{include:codeInclude},expenseRequest:{include:{partner:{select:{name:true}},payeeEmployee:{select:{name:true}}}}} satisfies Prisma.PartnerTransactionCostInclude;
 const [invoices,expenses,other]=await Promise.all([
  invoiceIds.length?db.invoice.findMany({where:{sellerOrgId:orgId,id:{in:invoiceIds}},include:{credits:{where:{voidedAt:null}},buyer:{select:{name:true}}}}):[],
  expenseIds.length?db.partnerTransactionCost.findMany({where:{orgId,id:{in:expenseIds}},include:expenseInclude}):[],
  invoiceIds.length||expenseIds.length?db.bankLedgerEvidenceAllocation.findMany({where:{orgId,entryId:{not:id},entry:{voidedAt:null},OR:[{invoiceId:{in:invoiceIds}},{expenseItemId:{in:expenseIds}}]}}):[],
 ]);
 entry.allocations=entry.allocations.map((allocation:any)=>({...allocation,invoice:invoices.find((row:any)=>row.id===allocation.invoiceId)||null,expenseItem:expenses.find((row:any)=>row.id===allocation.expenseItemId)||null}));
 if(entry.allocations.some((allocation:any)=>allocation.invoiceId&&!allocation.invoice||allocation.expenseItemId&&!allocation.expenseItem))return fail('LEDGER_INVALID_EVIDENCE');
 let document:any=null;
 if(entry.evidenceType==='PAYROLL'){
  const item=entry.payrollAllocations[0]?.item;if(!item||item.voidedAt)return fail('PAYROLL_PAYABLE_SOURCE_CHANGED');
  document={id:item.id,reference:item.document.managementNumber+' / '+item.document.month+' / '+item.employee.name,payee:item.employee.name,accountingCodeId:item.document.accountingCodeId,counterparty:{kind:'EMPLOYEE',id:item.employeeId,name:item.employee.name},amount:String(item.amount),remaining:ledgerMoney(await payrollPayableRemaining(db,orgId,item,undefined,id),code)};
 }
 if(entry.evidenceType==='OPENING'){
  const item=entry.openingAllocations[0]?.openingItem;if(!item||item.voidedAt)return fail('OPENING_SOURCE_CHANGED');
  const used=await db.accountingOpeningAllocation.findMany({where:{orgId,openingItemId:item.id,entryId:{not:id},entry:{voidedAt:null}}});
  document={id:item.id,reference:item.reason,payee:item.party?.name||item.employee?.name||'',accountingCodeId:item.accountingCodeId,side:item.side,amount:String(item.amount),remaining:ledgerMoney(ledgerScale4(item.amount)-used.reduce((s:bigint,a:any)=>s+ledgerScale4(a.amount),0n),code)};
 }

 if(entry.evidenceType==='INVOICE'){
  const invoice=entry.allocations[0]?.invoice;if(!invoice)return fail('LEDGER_INVALID_EVIDENCE');
  const historical=await documentOpeningAmount(db,orgId,{invoiceId:invoice.id});
  const available=historical>0n?(await invoiceOpeningRemaining(db,orgId,invoice)).remaining+entry.allocations.filter((a:any)=>a.invoiceId===invoice.id).reduce((sum:bigint,a:any)=>sum+ledgerScale4(a.amount),0n):ledgerScale4(invoice.receivableAdded??invoice.total)-other.filter((a:any)=>a.invoiceId===invoice.id).reduce((sum:bigint,a:any)=>sum+ledgerScale4(a.amount),0n);
  document={id:invoice.id,reference:invoice.invoiceNumber,payee:invoice.buyer?.name||'',amount:ledgerMoney(ledgerScale4(invoice.total),code),remaining:ledgerMoney(available,code)};
 }
 if(entry.evidenceType==='EXPENSE'){
  const requests=[...new Map(entry.allocations.filter((a:any)=>a.expenseItem?.expenseRequest).map((a:any)=>[a.expenseItem.expenseRequest.id,a.expenseItem.expenseRequest])).values()] as any[];
  const items=await Promise.all(entry.allocations.map(async(a:any)=>({id:a.expenseItemId,line:a.expenseItem.expenseRequestLine,description:a.expenseItem.description,accountingCode:a.expenseItem.transactionCode,amount:ledgerMoney(ledgerScale4(a.expenseItem.amount),code),remaining:ledgerMoney(ledgerScale4(a.expenseItem.amount)-await documentOpeningAmount(db,orgId,{expenseItemId:a.expenseItemId})-other.filter((b:any)=>b.expenseItemId===a.expenseItemId).reduce((sum:bigint,b:any)=>sum+ledgerScale4(b.amount),0n),code)})));
  document={...(requests.length===1?{id:requests[0].id,version:requests[0].version}:{}),reference:requests.length===1?requests[0].managementNumber||legacyExpenseNumber(requests[0].id):entry.evidenceNumber,payee:requests.map(r=>r.partner?.name||r.payeeEmployee?.name||'').join(', '),items,amount:ledgerMoney(items.reduce((sum:bigint,item:any)=>sum+ledgerScale4(item.amount),0n),code),remaining:ledgerMoney(items.reduce((sum:bigint,item:any)=>sum+ledgerScale4(item.remaining),0n),code)};
 }
 if(document){document.counterparty=entryCounterparty(entry);if(entry.evidenceType==='EXPENSE'&&document.id)document.paymentSchedule=(await expensePaymentScheduleStatus(db,orgId,document.id,id)).filter((row:any)=>row.currency===code);}
 const peer=entry.internalTransferAmount!=null?await db.bankLedgerEntry.findFirst({where:{orgId,...(entry.internalTransferSourceId?{id:entry.internalTransferSourceId}:{internalTransferSourceId:entry.id})},include:{account:true}}):null;
 return {...entry,drafter,...(peer?{transferAmount:ledgerMoney(ledgerScale4(peer.amount),peer.account.currencyCode),transferCurrencyCode:peer.account.currencyCode}:{}),paymentScheduleId:entry.allocations.find((row:any)=>row.paymentScheduleId)?.paymentScheduleId||'',revision:ledgerEntryRevision(entry),counterparty:entryCounterparty(entry),bankFee:ledgerMoney(ledgerScale4(entry.bankFee||'0'),code),writeOffAmount:ledgerMoney(ledgerScale4(entry.writeOffAmount||'0'),code),amount:ledgerMoney(ledgerScale4(entry.amount),code),document,expenseItems:entry.allocations.filter((a:any)=>a.expenseItemId).map((a:any)=>({itemId:a.expenseItemId,amount:ledgerMoney(ledgerScale4(a.amount),code),label:a.expenseItem.description,line:a.expenseItem.expenseRequestLine,accountingCode:a.expenseItem.transactionCode})),settlementLines:entry.settlementLines.map((line:any)=>({...line,amount:ledgerMoney(ledgerScale4(line.amount),code)}))};
}
export async function replaceLedgerEntry(db:any,orgId:number,actor:string,id:string,body:any){
 if(!Array.isArray(body.rows)||!body.rows.some((r:any)=>r.entryKind==='BANK'))return fail('LEDGER_INVALID_BATCH',400);
 return retryEditTransaction(db,tx=>replaceLedgerEntryApproved(tx,db,orgId,actor,id,body),60000);
}
export async function replaceLedgerEntryApproved(tx:any,db:any,orgId:number,actor:string,id:string,body:any){
  await tx.$queryRawUnsafe('SELECT id FROM "Organization" WHERE id=$1 FOR UPDATE',orgId);
  await tx.$queryRawUnsafe('SELECT id FROM "BankLedgerEntry" WHERE id=$1 AND "orgId"=$2 FOR UPDATE',id,orgId);
  const old=await tx.bankLedgerEntry.findFirst({where:{id,orgId}});if(!old)return fail('LEDGER_ENTRY_NOT_FOUND',404);
  const receipt=await tx.bankLedgerBatch.findUnique({where:{orgId_clientKey:{orgId,clientKey:body.clientKey}}});
  if(old.voidedAt&&!receipt)return fail('LEDGER_ENTRY_CHANGED');
  if(!old.voidedAt)await voidLedgerPairApproved(tx,orgId,actor,old,'Corrected by replacement');
  return postLedgerSettlementBatch(db,orgId,actor,body,tx,id);
}
export async function deleteLedgerEntry(db:any,orgId:number,actor:string,id:string,input:any){
 const reason=typeof input==='string'?input.trim():'';if(!reason||reason.length>1000)return fail('LEDGER_INVALID_INPUT',400);
 return retryEditTransaction(db,async(tx:any)=>{
  await tx.$queryRawUnsafe('SELECT id FROM "Organization" WHERE id=$1 FOR UPDATE',orgId);
  await tx.$queryRawUnsafe('SELECT id FROM "BankLedgerEntry" WHERE id=$1 AND "orgId"=$2 FOR UPDATE',id,orgId);
  const row=await tx.bankLedgerEntry.findFirst({where:{id,orgId}});if(!row)return fail('LEDGER_ENTRY_NOT_FOUND',404);
  if(row.voidedAt)return row;
  return voidLedgerPairApproved(tx,orgId,actor,row,reason);
 });
}
