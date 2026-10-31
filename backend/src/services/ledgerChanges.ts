import type {Prisma} from '@prisma/client';
import {createHttpError} from '../utils/http';
import {retryEditTransaction} from '../utils/editRevision';
import {ledgerDate,ledgerMoney,ledgerScale4} from './bankLedger';
import {accountReportToday,shiftReportDate} from './accountOverview';
import {legacyExpenseNumber} from './documentNumber';

const snapshotSelect={id:true,accountId:true,transactionDate:true,direction:true,amount:true,purpose:true,accountingCodeId:true,evidenceType:true,evidenceNumber:true,bankFee:true,writeOffAmount:true,
 account:{select:{entityAccount:{select:{displayName:true}},bankName:true,accountNumber:true,currencyCode:true}},accountingCode:{select:{code:true}},
 settlementLines:{select:{kind:true,amount:true,purpose:true,accountingCodeId:true,accountingCode:{select:{code:true}}}},
 allocations:{select:{invoiceId:true,expenseItemId:true,requestVersion:true,amount:true}},
} satisfies Prisma.BankLedgerEntrySelect;
function snapshot(row:any,references:Map<string,string>){
 const currencyCode=row.account.currencyCode,money=(value:any)=>ledgerMoney(ledgerScale4(value||'0'),currencyCode);
 return {id:row.id,accountId:row.accountId,accountName:row.account.entityAccount?.displayName||[row.account.bankName,row.account.accountNumber].filter(Boolean).join(' / '),currencyCode,
  transactionDate:row.transactionDate,direction:row.direction,amount:money(row.amount),purpose:row.purpose,accountingCodeId:row.accountingCodeId??null,accountingCode:row.accountingCode?.code||'',evidenceType:row.evidenceType,evidenceNumber:row.evidenceNumber,
  bankFee:money(row.bankFee),writeOffAmount:money(row.writeOffAmount),
  settlementLines:row.settlementLines.map((line:any)=>({kind:line.kind,amount:money(line.amount),purpose:line.purpose,accountingCodeId:line.accountingCodeId??null,accountingCode:line.accountingCode?.code||''})),
  allocations:row.allocations.map((allocation:any)=>({invoiceId:allocation.invoiceId??null,expenseItemId:allocation.expenseItemId??null,requestVersion:allocation.requestVersion??null,amount:money(allocation.amount),reference:references.get((allocation.invoiceId?'INV:':'EXP:')+(allocation.invoiceId||allocation.expenseItemId))||null})),
 };
}
const stableRows=(rows:any[])=>JSON.stringify(rows.map(row=>JSON.stringify(row)).sort());
export function ledgerChangedFields(before:any,after:any){
 if(!after)return [];
 const keys=['accountId','currencyCode','transactionDate','direction','amount','accountingCodeId','purpose','evidenceType','evidenceNumber'];
 const changed=keys.filter(key=>before[key]!==after[key]);
 if(before.bankFee!==after.bankFee||before.writeOffAmount!==after.writeOffAmount||stableRows(before.settlementLines)!==stableRows(after.settlementLines))changed.push('settlementLines');
 if(stableRows(before.allocations)!==stableRows(after.allocations))changed.push('allocations');
 return changed;
}
export async function listLedgerChanges(db:any,orgId:number,query:any){
 const today=accountReportToday(),start=ledgerDate(query.start||today.slice(0,7)+'-01'),end=ledgerDate(query.end||today),action=String(query.action||'ALL'),page=Number(query.page||0),pageSize=Number(query.pageSize||20);
 if(start>end||end>today||!['ALL','EDIT','DELETE'].includes(action)||!Number.isSafeInteger(page)||page<0||page>100000||![10,20,50].includes(pageSize))throw createHttpError(400,'LEDGER_INVALID_HISTORY_QUERY');
 const where={orgId,changeAcknowledgement:{is:null},voidedAt:{gte:new Date(start+'T00:00:00+07:00'),lt:new Date(shiftReportDate(end,1)+'T00:00:00+07:00')},
  ...(action==='ALL'?{}:{replacementEntries:action==='EDIT'?{some:{orgId}}:{none:{orgId}}}),
 } satisfies Prisma.BankLedgerEntryWhereInput;
 return retryEditTransaction(db,async(tx:any)=>{
  const total=await tx.bankLedgerEntry.count({where});
  const actualPage=Math.min(page,Math.max(0,Math.ceil(total/pageSize)-1));
  const entries=await tx.bankLedgerEntry.findMany({where,orderBy:[{voidedAt:'desc'},{id:'desc'}],skip:actualPage*pageSize,take:pageSize,
   select:{...snapshotSelect,voidedAt:true,voidedBy:true,voidReason:true,replacementEntries:{where:{orgId},take:1,select:snapshotSelect}},
  });
  const allocations=entries.flatMap((row:any)=>[row,...row.replacementEntries]).flatMap((row:any)=>row.allocations);
  const invoiceIds=[...new Set(allocations.map((row:any)=>row.invoiceId).filter(Boolean))],expenseIds=[...new Set(allocations.map((row:any)=>row.expenseItemId).filter(Boolean))];
  const [invoices,expenses]=await Promise.all([
   invoiceIds.length?tx.invoice.findMany({where:{sellerOrgId:orgId,id:{in:invoiceIds}},select:{id:true,invoiceNumber:true}}):[],
   expenseIds.length?tx.partnerTransactionCost.findMany({where:{orgId,id:{in:expenseIds}},select:{id:true,expenseRequestLine:true,expenseRequest:{select:{id:true,managementNumber:true}}}}):[],
  ]);
  const references=new Map<string,string>([...invoices.map((row:any)=>['INV:'+row.id,row.invoiceNumber]),...expenses.filter((row:any)=>row.expenseRequest).map((row:any)=>['EXP:'+row.id,(row.expenseRequest.managementNumber||legacyExpenseNumber(row.expenseRequest.id))+' / '+row.expenseRequestLine])]);
  return {rows:entries.map((row:any)=>{
   const before=snapshot(row,references),after=row.replacementEntries[0]?snapshot(row.replacementEntries[0],references):null;
   return {id:row.id,action:after?'EDIT':'DELETE',changedAt:row.voidedAt,actor:row.voidedBy||null,reason:after?null:row.voidReason,before,after,changedFields:ledgerChangedFields(before,after)};
  }),total,start,end,action,page:actualPage,pageSize};
 });
}

export async function acknowledgeLedgerChange(db:any,orgId:number,employeeId:number,entryId:string){
 if(!Number.isSafeInteger(employeeId)||employeeId<=0)throw createHttpError(403,'LEDGER_CHANGE_ACK_DENIED');
 if(typeof entryId!=='string'||!entryId||entryId.length>100)throw createHttpError(400,'LEDGER_ENTRY_NOT_FOUND');
 return retryEditTransaction(db,async(tx:any)=>{
  const employee=await tx.employee.findFirst({where:{id:employeeId,orgId,status:'ACTIVE',orgRole:{in:['ADMIN','ACCOUNTANT']}},select:{id:true,email:true}});
  if(!employee)throw createHttpError(403,'LEDGER_CHANGE_ACK_DENIED');
  await tx.$queryRawUnsafe('SELECT id FROM "BankLedgerEntry" WHERE id=$1 AND "orgId"=$2 FOR UPDATE',entryId,orgId);
  const entry=await tx.bankLedgerEntry.findFirst({where:{id:entryId,orgId,voidedAt:{not:null}},select:{id:true}});
  if(!entry)throw createHttpError(404,'LEDGER_ENTRY_NOT_FOUND');
  const previous=await tx.ledgerChangeAcknowledgement.findUnique({where:{entryId_orgId:{entryId,orgId}}});
  if(previous)return previous;
  return tx.ledgerChangeAcknowledgement.create({data:{entryId,orgId,employeeId,actorEmail:employee.email||'employee:'+employeeId}});
 });
}
